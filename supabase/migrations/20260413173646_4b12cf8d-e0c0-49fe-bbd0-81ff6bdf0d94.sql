-- 1) Update top colores to return 10
CREATE OR REPLACE FUNCTION public.reporte_cierre_coleccion_top_colores(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(color text, unidades bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap_date date;
BEGIN
  SELECT snapshot_date INTO v_snap_date
  FROM inventory_snapshot
  GROUP BY snapshot_date
  HAVING count(*) >= 5000
  ORDER BY snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    pc.color,
    sum(oi.quantity)::bigint AS unidades
  FROM order_items oi
  JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
  JOIN product_catalog pc ON pc.sku = oi.sku
  WHERE oi.quantity > 0
    AND pc.color IS NOT NULL
    AND (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
    AND (p_genero IS NULL OR pc.target_gender = p_genero)
    AND (p_canal IS NULL OR
         CASE WHEN p_canal = 'Digital' THEN o.source_name IN ('web','shopify_draft_order')
              WHEN p_canal = 'Tiendas' THEN (o.source_name IS NULL OR o.source_name = 'pos')
              ELSE true END)
    AND (p_zona IS NULL OR EXISTS (
      SELECT 1 FROM locations l WHERE l.location_id = o.location_id AND l.zona = p_zona))
    AND (p_location_id IS NULL OR o.location_id = p_location_id)
  GROUP BY pc.color
  ORDER BY unidades DESC
  LIMIT 10;
END;
$$;

-- 2) Ventas por colección: vendidas vs stock
CREATE OR REPLACE FUNCTION public.reporte_cierre_coleccion_ventas_coleccion(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(coleccion text, und_vendidas bigint, stock_disponible bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap_date date;
BEGIN
  SELECT snapshot_date INTO v_snap_date
  FROM inventory_snapshot
  GROUP BY snapshot_date
  HAVING count(*) >= 5000
  ORDER BY snapshot_date DESC
  LIMIT 1;

  RETURN QUERY
  WITH ventas AS (
    SELECT
      COALESCE(pc.collection_season, 'Sin Colección') AS col,
      sum(oi.quantity)::bigint AS vendidas
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE oi.quantity > 0
      AND (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND (p_canal IS NULL OR
           CASE WHEN p_canal = 'Digital' THEN o.source_name IN ('web','shopify_draft_order')
                WHEN p_canal = 'Tiendas' THEN (o.source_name IS NULL OR o.source_name = 'pos')
                ELSE true END)
      AND (p_zona IS NULL OR EXISTS (
        SELECT 1 FROM locations l WHERE l.location_id = o.location_id AND l.zona = p_zona))
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
    GROUP BY col
  ),
  stock AS (
    SELECT
      COALESCE(pc.collection_season, 'Sin Colección') AS col,
      sum(GREATEST(inv.available, 0))::bigint AS disponible
    FROM inventory_snapshot inv
    JOIN product_catalog pc ON pc.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_snap_date
      AND (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      AND (p_zona IS NULL OR EXISTS (
        SELECT 1 FROM locations l WHERE l.location_id = inv.location_id AND l.zona = p_zona))
    GROUP BY col
  )
  SELECT
    COALESCE(v.col, s.col) AS coleccion,
    COALESCE(v.vendidas, 0)::bigint AS und_vendidas,
    COALESCE(s.disponible, 0)::bigint AS stock_disponible
  FROM ventas v
  FULL OUTER JOIN stock s ON v.col = s.col
  ORDER BY und_vendidas DESC;
END;
$$;

-- 3) Categoría × Colección: unidades por categoría desglosadas por colección
CREATE OR REPLACE FUNCTION public.reporte_cierre_coleccion_categoria_coleccion(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(categoria text, coleccion text, unidades bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(pc.category, 'Sin Categoría') AS categoria,
    COALESCE(pc.collection_season, 'Sin Colección') AS coleccion,
    sum(oi.quantity)::bigint AS unidades
  FROM order_items oi
  JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
  JOIN product_catalog pc ON pc.sku = oi.sku
  WHERE oi.quantity > 0
    AND (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
    AND (p_genero IS NULL OR pc.target_gender = p_genero)
    AND (p_canal IS NULL OR
         CASE WHEN p_canal = 'Digital' THEN o.source_name IN ('web','shopify_draft_order')
              WHEN p_canal = 'Tiendas' THEN (o.source_name IS NULL OR o.source_name = 'pos')
              ELSE true END)
    AND (p_zona IS NULL OR EXISTS (
      SELECT 1 FROM locations l WHERE l.location_id = o.location_id AND l.zona = p_zona))
    AND (p_location_id IS NULL OR o.location_id = p_location_id)
  GROUP BY categoria, coleccion
  ORDER BY categoria, unidades DESC;
END;
$$;
