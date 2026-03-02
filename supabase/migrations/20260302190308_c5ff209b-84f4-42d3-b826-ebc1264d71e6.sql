
CREATE OR REPLACE FUNCTION public.reporte_productos_por_categoria(
  dias_atras INTEGER,
  p_categoria TEXT DEFAULT NULL,
  p_location_id TEXT DEFAULT NULL,
  p_canal TEXT DEFAULT NULL
)
RETURNS TABLE(
  foto TEXT,
  producto TEXT,
  product_id TEXT,
  stock_total BIGINT,
  venta_prom_semanal NUMERIC,
  wos NUMERIC,
  estado_salud TEXT,
  und_full_price BIGINT,
  und_rebajas BIGINT,
  und_promo BIGINT,
  und_total BIGINT,
  clasificacion TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fecha_inicio TIMESTAMP WITH TIME ZONE := now() - (dias_atras || ' days')::INTERVAL;
  semanas NUMERIC := GREATEST(dias_atras::NUMERIC / 7.0, 1);
BEGIN
  RETURN QUERY
  WITH productos AS (
    SELECT DISTINCT pc.product_id AS pid, pc.title, pc.image_url, pc.category
    FROM product_catalog pc
    WHERE pc.category = p_categoria
      AND pc.product_id IS NOT NULL
  ),
  inv AS (
    SELECT pc.product_id AS pid, SUM(COALESCE(i.available, 0)) AS stock
    FROM inventory_snapshot i
    JOIN product_catalog pc ON pc.sku = i.sku
    WHERE pc.category = p_categoria
      AND pc.product_id IS NOT NULL
      AND (p_location_id IS NULL OR i.location_id = p_location_id)
    GROUP BY pc.product_id
  ),
  ventas AS (
    SELECT
      pc.product_id AS pid,
      SUM(CASE WHEN oi.is_markdown = false AND oi.manual_discount_amount <= 0 THEN oi.quantity ELSE 0 END) AS uds_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS uds_reb,
      SUM(CASE WHEN oi.is_markdown = false AND oi.manual_discount_amount > 0 THEN oi.quantity ELSE 0 END) AS uds_promo,
      SUM(oi.quantity) AS uds_total
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE pc.category = p_categoria
      AND pc.product_id IS NOT NULL
      AND o.created_at >= fecha_inicio
      AND (p_location_id IS NULL OR oi.location_id = p_location_id)
      AND (p_canal IS NULL
           OR (p_canal = 'Digital' AND o.source_name IN ('web','shopify_draft_order'))
           OR (p_canal = 'POS' AND o.source_name = 'pos'))
    GROUP BY pc.product_id
  )
  SELECT
    COALESCE(p.image_url, '')::TEXT AS foto,
    COALESCE(p.title, '')::TEXT AS producto,
    p.pid::TEXT AS product_id,
    COALESCE(inv.stock, 0)::BIGINT AS stock_total,
    ROUND(COALESCE(v.uds_total, 0)::NUMERIC / semanas, 1) AS venta_prom_semanal,
    CASE
      WHEN COALESCE(v.uds_total, 0) = 0 THEN 999
      ELSE ROUND(COALESCE(inv.stock, 0)::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / semanas), 1)
    END AS wos,
    CASE
      WHEN COALESCE(v.uds_total, 0) = 0 AND COALESCE(inv.stock, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO'
      WHEN COALESCE(inv.stock, 0) = 0 AND COALESCE(v.uds_total, 0) > 0 THEN '🟡 AGOTADO'
      WHEN COALESCE(inv.stock, 0) = 0 AND COALESCE(v.uds_total, 0) = 0 THEN '⚪ SIN DATOS'
      WHEN ROUND(COALESCE(inv.stock, 0)::NUMERIC / NULLIF(COALESCE(v.uds_total, 0)::NUMERIC / semanas, 0), 1) > 20 THEN '🔴 SOBRESTOCK'
      WHEN ROUND(COALESCE(inv.stock, 0)::NUMERIC / NULLIF(COALESCE(v.uds_total, 0)::NUMERIC / semanas, 0), 1) < 8 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 NIVEL ÓPTIMO'
    END::TEXT AS estado_salud,
    COALESCE(v.uds_full, 0)::BIGINT AS und_full_price,
    COALESCE(v.uds_reb, 0)::BIGINT AS und_rebajas,
    COALESCE(v.uds_promo, 0)::BIGINT AS und_promo,
    COALESCE(v.uds_total, 0)::BIGINT AS und_total,
    CASE
      WHEN COALESCE(v.uds_full, 0) >= COALESCE(v.uds_reb, 0) AND COALESCE(v.uds_full, 0) >= COALESCE(v.uds_promo, 0) THEN 'Full Price'
      WHEN COALESCE(v.uds_reb, 0) >= COALESCE(v.uds_full, 0) AND COALESCE(v.uds_reb, 0) >= COALESCE(v.uds_promo, 0) THEN 'Rebajas'
      ELSE 'Promo'
    END::TEXT AS clasificacion
  FROM productos p
  LEFT JOIN inv ON inv.pid = p.pid
  LEFT JOIN ventas v ON v.pid = p.pid
  ORDER BY COALESCE(inv.stock, 0) DESC;
END;
$$;
