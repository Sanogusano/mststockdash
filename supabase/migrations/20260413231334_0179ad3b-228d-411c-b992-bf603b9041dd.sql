
-- Recreate top colores with p_categoria filter and color_name extraction
DROP FUNCTION IF EXISTS reporte_cierre_coleccion_top_colores(text, text, text, text, text);

CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_top_colores(
  p_canal text DEFAULT NULL,
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS TABLE(color text, unidades bigint, color_name text)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.color,
    sum(oi.quantity)::bigint AS unidades,
    -- Extract color name: take last word(s) before size info from the most common title
    (SELECT REGEXP_REPLACE(
      REGEXP_REPLACE(pc2.title, '^\S+\s+', ''),  -- remove first word (product name)
      '\s+\d+(/\w+)?$', ''  -- remove trailing sizes
    )
    FROM product_catalog pc2
    WHERE pc2.color = pc.color AND pc2.title IS NOT NULL
    LIMIT 1
    ) AS color_name
  FROM order_items oi
  JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
  JOIN product_catalog pc ON pc.sku = oi.sku
  WHERE oi.quantity > 0
    AND pc.color IS NOT NULL
    AND (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
    AND (p_genero IS NULL OR pc.target_gender = p_genero)
    AND (p_categoria IS NULL OR pc.category = p_categoria)
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

-- Recreate curva tallas with p_categoria filter
DROP FUNCTION IF EXISTS reporte_cierre_coleccion_curva_tallas(text, text, text, text, text);

CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_curva_tallas(
  p_canal text DEFAULT NULL,
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS TABLE(talla text, und_vendidas bigint, stock_disponible bigint)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH snap AS (
    SELECT snapshot_date FROM inventory_snapshot
    WHERE variant_id IS NOT NULL
    GROUP BY snapshot_date
    HAVING COUNT(DISTINCT variant_id) >= 5000
    ORDER BY snapshot_date DESC LIMIT 1
  ),
  skus_filtrados AS (
    SELECT DISTINCT pc.sku, pc.variant_id,
      UPPER(TRIM(COALESCE(
        NULLIF(REGEXP_REPLACE(pc.variant_name, '^.*[/\-]\s*', ''), ''),
        'N/A'
      ))) AS talla
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND (p_categoria IS NULL OR pc.category = p_categoria)
  ),
  ventas AS (
    SELECT
      sf.talla,
      SUM(oi.quantity) FILTER (WHERE oi.quantity > 0) AS und_vendidas
    FROM order_items oi
    JOIN skus_filtrados sf ON oi.sku = sf.sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    WHERE (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal)
      AND (p_zona IS NULL OR l.zona = p_zona)
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
    GROUP BY sf.talla
  ),
  stock AS (
    SELECT
      sf.talla,
      SUM(inv.available) AS stock_disponible
    FROM inventory_snapshot inv
    CROSS JOIN snap s
    JOIN skus_filtrados sf ON inv.variant_id = sf.variant_id
    LEFT JOIN locations l ON inv.location_id = l.location_id
    WHERE inv.snapshot_date = s.snapshot_date
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      AND (p_zona IS NULL OR l.zona = p_zona)
    GROUP BY sf.talla
  )
  SELECT
    COALESCE(v.talla, st.talla) AS talla,
    COALESCE(v.und_vendidas, 0)::bigint,
    COALESCE(st.stock_disponible, 0)::bigint
  FROM ventas v
  FULL OUTER JOIN stock st ON v.talla = st.talla
  ORDER BY COALESCE(v.und_vendidas, 0) + COALESCE(st.stock_disponible, 0) DESC;
END;
$$;
