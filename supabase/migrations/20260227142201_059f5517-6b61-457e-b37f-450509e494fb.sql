
CREATE OR REPLACE FUNCTION public.reporte_top_productos_global(
  dias_atras INTEGER,
  p_canal TEXT DEFAULT NULL,
  p_categoria TEXT DEFAULT NULL,
  p_orden TEXT DEFAULT 'TOP',
  p_limite INTEGER DEFAULT 50
)
RETURNS TABLE(
  foto TEXT,
  producto TEXT,
  sku TEXT,
  categoria TEXT,
  und_tiendas BIGINT,
  und_outlets BIGINT,
  und_digital BIGINT,
  und_total BIGINT,
  pct_full_price NUMERIC,
  pct_descuento NUMERIC,
  clasificacion TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT
      p.title AS prod,
      MAX(p.image_url) AS img,
      MAX(p.category) AS cat,
      SUM(CASE 
        WHEN o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%' AND o.location_id != '71474315479'
        THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE 
        WHEN o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')
        THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE 
        WHEN o.location_id = '71474315479' OR o.source_name != 'pos'
        THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_full,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_desc
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
      )
    GROUP BY p.title
  )
  SELECT
    v.img::TEXT,
    v.prod::TEXT,
    'Varias Tallas'::TEXT,
    UPPER(v.cat)::TEXT,
    v.uds_tiendas,
    v.uds_outlets,
    v.uds_digital,
    v.uds_total,
    CASE WHEN v.uds_total = 0 THEN 0.0
      ELSE ROUND((v.uds_full / v.uds_total::NUMERIC) * 100, 1)
    END::NUMERIC,
    CASE WHEN v.uds_total = 0 THEN 0.0
      ELSE ROUND((v.uds_desc / v.uds_total::NUMERIC) * 100, 1)
    END::NUMERIC,
    CASE WHEN v.uds_full >= v.uds_desc THEN '🏆 Ganador Full Price' ELSE '🧲 Ganador Promo' END::TEXT
  FROM VentasPorCanal v
  WHERE v.uds_total > 0
  ORDER BY
    CASE WHEN UPPER(COALESCE(p_orden, 'TOP')) = 'TOP' THEN v.uds_total END DESC NULLS LAST,
    CASE WHEN UPPER(COALESCE(p_orden, 'TOP')) != 'TOP' THEN v.uds_total END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limite, 50), 1);
END;
$function$;
