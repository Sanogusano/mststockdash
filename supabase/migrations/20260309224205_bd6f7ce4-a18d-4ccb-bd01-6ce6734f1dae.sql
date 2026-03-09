
DROP FUNCTION IF EXISTS public.reporte_top_productos_global(integer,text,text,text,integer);

CREATE OR REPLACE FUNCTION public.reporte_top_productos_global(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_categoria text DEFAULT NULL::text,
  p_orden text DEFAULT 'TOP'::text,
  p_limite integer DEFAULT 50
)
RETURNS TABLE(
  foto text, producto text, sku text, categoria text,
  und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint,
  pct_full_price numeric, pct_rebajas numeric, pct_descuento numeric,
  clasificacion text, coleccion text, stock_venta_directa bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (
    SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt
    FROM inventory_snapshot
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
  ) sub
  WHERE sub.cnt >= 5000
  LIMIT 1;

  IF v_max_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
  END IF;

  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT p.title AS prod, MAX(p.image_url) AS img, MAX(p.category) AS cat,
      MAX(COALESCE(p.collection_season, '')) AS col_season,
      MAX(p.product_id) AS pid,
      SUM(CASE WHEN o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id='71474315479' OR o.source_name!='pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount,0)=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_full,
      SUM(CASE WHEN oi.is_markdown=true THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount,0)>0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    JOIN locations l ON o.location_id=l.location_id
    JOIN product_catalog p ON oi.sku=p.sku
    WHERE o.created_at>=(NOW()-(GREATEST(COALESCE(dias_atras,1),1)||' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND (NULLIF(TRIM(p_categoria),'') IS NULL OR UPPER(p.category)=UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal),'') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
    GROUP BY p.title
  ),
  StockDirecta AS (
    SELECT pc.product_id AS pid, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv
    JOIN product_catalog pc ON pc.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_max_date
      AND inv.available > 0
      AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
    GROUP BY pc.product_id
  )
  SELECT v.img::TEXT, v.prod::TEXT, 'Varias Tallas'::TEXT, UPPER(v.cat)::TEXT,
    v.uds_tiendas, v.uds_outlets, v.uds_digital, v.uds_total,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_full/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_rebajas/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_promo/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_full>=v.uds_rebajas AND v.uds_full>=v.uds_promo THEN 'Ganador Full Price'
         WHEN v.uds_rebajas>=v.uds_full AND v.uds_rebajas>=v.uds_promo THEN 'Ganador Rebajas'
         ELSE 'Ganador Promo' END::TEXT,
    CASE WHEN COALESCE(NULLIF(TRIM(v.col_season),''),'')='' THEN 'Otros' ELSE v.col_season END::TEXT,
    COALESCE(sd.stock, 0)::BIGINT
  FROM VentasPorCanal v
  LEFT JOIN StockDirecta sd ON v.pid = sd.pid
  ORDER BY CASE WHEN UPPER(COALESCE(p_orden,'TOP'))='TOP' THEN v.uds_total END DESC NULLS LAST,
           CASE WHEN UPPER(COALESCE(p_orden,'TOP'))!='TOP' THEN v.uds_total END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limite,50),1);
END;
$function$;
