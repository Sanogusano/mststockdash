
CREATE OR REPLACE FUNCTION public.reporte_cierre_coleccion_treemap_colores(
  dias_atras integer DEFAULT 30,
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS TABLE(
  color text,
  color_name text,
  und_vendidas bigint,
  stock_disponible bigint,
  pct_venta numeric,
  pct_inventario numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout TO '30s'
AS $$
  WITH snap AS (
    SELECT snapshot_date FROM inventory_snapshot
    WHERE variant_id IS NOT NULL
    GROUP BY snapshot_date
    HAVING COUNT(DISTINCT variant_id) >= 5000
    ORDER BY snapshot_date DESC LIMIT 1
  ),
  fecha_limite AS (
    SELECT _col_date_boundary(dias_atras) AS desde
  ),
  skus_filtrados AS (
    SELECT DISTINCT pc.sku, pc.variant_id, pc.color, pc.title
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND (p_categoria IS NULL OR pc.category = p_categoria)
      AND COALESCE(pc.category, '') NOT ILIKE '%BOLSA%'
      AND COALESCE(pc.category, '') NOT ILIKE '%INSUMO%'
      AND pc.color IS NOT NULL
  ),
  ventas_por_color AS (
    SELECT
      sf.color,
      MAX(sf.title) AS sample_title,
      COALESCE(SUM(oi.quantity) FILTER (WHERE oi.quantity > 0), 0)::bigint AS und_vendidas
    FROM order_items oi
    JOIN skus_filtrados sf ON oi.sku = sf.sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    CROSS JOIN fecha_limite fl
    WHERE o.created_at >= fl.desde
      AND (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal)
      AND (p_zona IS NULL OR l.zona = p_zona)
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
    GROUP BY sf.color
  ),
  inv_por_color AS (
    SELECT
      sf.color,
      COALESCE(SUM(inv.available), 0)::bigint AS stock_disponible
    FROM inventory_snapshot inv
    CROSS JOIN snap s
    JOIN skus_filtrados sf ON inv.variant_id = sf.variant_id
    LEFT JOIN locations l ON inv.location_id = l.location_id
    WHERE inv.snapshot_date = s.snapshot_date
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      AND (p_zona IS NULL OR l.zona = p_zona)
    GROUP BY sf.color
  ),
  combined AS (
    SELECT
      COALESCE(v.color, i.color) AS color,
      COALESCE(v.sample_title, '') AS sample_title,
      COALESCE(v.und_vendidas, 0)::bigint AS und_vendidas,
      COALESCE(i.stock_disponible, 0)::bigint AS stock_disponible
    FROM ventas_por_color v
    FULL OUTER JOIN inv_por_color i ON v.color = i.color
  ),
  totales AS (
    SELECT
      GREATEST(SUM(und_vendidas), 1) AS total_venta,
      GREATEST(SUM(stock_disponible), 1) AS total_inv
    FROM combined
  )
  SELECT
    c.color,
    c.sample_title AS color_name,
    c.und_vendidas,
    c.stock_disponible,
    ROUND(c.und_vendidas::numeric / t.total_venta * 100, 1) AS pct_venta,
    ROUND(c.stock_disponible::numeric / t.total_inv * 100, 1) AS pct_inventario
  FROM combined c, totales t
  WHERE c.und_vendidas > 0 OR c.stock_disponible > 0
  ORDER BY c.und_vendidas DESC
  LIMIT 30;
$$;
