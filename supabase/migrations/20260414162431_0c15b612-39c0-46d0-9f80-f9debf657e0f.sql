CREATE OR REPLACE FUNCTION public.reporte_cierre_coleccion_kpis(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  sell_through_pct numeric,
  calidad_venta_pct numeric,
  ingreso_total numeric,
  stock_remanente bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH snap AS (
    SELECT snapshot_date FROM inventory_snapshot
    WHERE variant_id IS NOT NULL
    GROUP BY snapshot_date
    HAVING COUNT(DISTINCT variant_id) >= 5000
    ORDER BY snapshot_date DESC LIMIT 1
  ),
  skus_filtrados AS (
    SELECT DISTINCT pc.sku, pc.variant_id
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND COALESCE(pc.category, '') NOT ILIKE '%BOLSA%'
      AND COALESCE(pc.category, '') NOT ILIKE '%INSUMO%'
  ),
  ventas AS (
    SELECT
      COALESCE(SUM(oi.quantity) FILTER (WHERE oi.quantity > 0), 0) AS und_vendidas,
      COALESCE(SUM(oi.quantity) FILTER (WHERE oi.quantity > 0 AND COALESCE(oi.is_markdown, false) = false AND COALESCE(oi.manual_discount_amount, 0) = 0), 0) AS und_full_price,
      COALESCE(SUM(oi.price * oi.quantity) FILTER (WHERE oi.quantity > 0), 0) AS ingreso
    FROM order_items oi
    JOIN skus_filtrados sf ON oi.sku = sf.sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    WHERE (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal)
      AND (p_zona IS NULL OR l.zona = p_zona)
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
  ),
  stock AS (
    SELECT COALESCE(SUM(inv.available), 0)::bigint AS stock_total
    FROM inventory_snapshot inv
    CROSS JOIN snap s
    JOIN skus_filtrados sf ON inv.variant_id = sf.variant_id
    LEFT JOIN locations l ON inv.location_id = l.location_id
    WHERE inv.snapshot_date = s.snapshot_date
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      AND (p_zona IS NULL OR l.zona = p_zona)
  )
  SELECT
    CASE WHEN v.und_vendidas + st.stock_total > 0
      THEN ROUND(v.und_vendidas::numeric / (v.und_vendidas + st.stock_total) * 100, 1)
      ELSE 0 END,
    CASE WHEN v.und_vendidas > 0
      THEN ROUND(v.und_full_price::numeric / v.und_vendidas * 100, 1)
      ELSE 0 END,
    v.ingreso,
    st.stock_total
  FROM ventas v, stock st;
$$;