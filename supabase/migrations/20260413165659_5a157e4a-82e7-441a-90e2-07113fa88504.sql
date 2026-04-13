
-- 1. KPIs del cierre de colección
CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_kpis(
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

-- 2. Pareto por categoría
CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_pareto_categoria(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  categoria text,
  unidades bigint,
  pct_participacion numeric
)
LANGUAGE sql STABLE
AS $$
  WITH skus_filtrados AS (
    SELECT DISTINCT pc.sku, pc.category
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
  ),
  ventas AS (
    SELECT
      COALESCE(sf.category, 'Sin categoría') AS categoria,
      SUM(oi.quantity) FILTER (WHERE oi.quantity > 0) AS unidades
    FROM order_items oi
    JOIN skus_filtrados sf ON oi.sku = sf.sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    WHERE (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal)
      AND (p_zona IS NULL OR l.zona = p_zona)
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
    GROUP BY sf.category
  ),
  total AS (
    SELECT COALESCE(SUM(unidades), 1) AS total FROM ventas
  )
  SELECT
    v.categoria,
    COALESCE(v.unidades, 0)::bigint,
    ROUND(COALESCE(v.unidades, 0)::numeric / t.total * 100, 1)
  FROM ventas v, total t
  WHERE v.unidades > 0
  ORDER BY v.unidades DESC;
$$;

-- 3. Top 5 colores
CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_top_colores(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  color text,
  unidades bigint
)
LANGUAGE sql STABLE
AS $$
  WITH skus_filtrados AS (
    SELECT DISTINCT pc.sku, pc.color
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND pc.color IS NOT NULL AND pc.color <> ''
  ),
  ventas AS (
    SELECT
      sf.color,
      SUM(oi.quantity) FILTER (WHERE oi.quantity > 0) AS unidades
    FROM order_items oi
    JOIN skus_filtrados sf ON oi.sku = sf.sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    WHERE (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal)
      AND (p_zona IS NULL OR l.zona = p_zona)
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
    GROUP BY sf.color
  )
  SELECT v.color, COALESCE(v.unidades, 0)::bigint
  FROM ventas v
  WHERE v.unidades > 0
  ORDER BY v.unidades DESC
  LIMIT 5;
$$;

-- 4. Curva de tallas (vendidas vs stock)
CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_curva_tallas(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  talla text,
  und_vendidas bigint,
  stock_disponible bigint
)
LANGUAGE sql STABLE
AS $$
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
$$;

-- 5. Muro de remanentes (productos con menor sell-through)
CREATE OR REPLACE FUNCTION reporte_cierre_coleccion_remanentes(
  p_coleccion text DEFAULT NULL,
  p_genero text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_zona text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_limite integer DEFAULT 50
)
RETURNS TABLE(
  sku text,
  producto text,
  categoria text,
  genero text,
  foto text,
  und_vendidas bigint,
  stock_actual bigint,
  sell_through_pct numeric,
  precio_prom_venta numeric
)
LANGUAGE sql STABLE
AS $$
  WITH snap AS (
    SELECT snapshot_date FROM inventory_snapshot
    WHERE variant_id IS NOT NULL
    GROUP BY snapshot_date
    HAVING COUNT(DISTINCT variant_id) >= 5000
    ORDER BY snapshot_date DESC LIMIT 1
  ),
  catalogo AS (
    SELECT DISTINCT ON (pc.product_id)
      pc.product_id,
      pc.sku,
      pc.title,
      pc.category,
      pc.target_gender,
      pc.image_url
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
      AND pc.product_id IS NOT NULL
    ORDER BY pc.product_id, pc.sku
  ),
  variantes AS (
    SELECT pc.product_id, pc.sku AS v_sku, pc.variant_id
    FROM product_catalog pc
    WHERE (p_coleccion IS NULL OR pc.collection_season = p_coleccion)
      AND (p_genero IS NULL OR pc.target_gender = p_genero)
  ),
  ventas AS (
    SELECT
      c.product_id,
      COALESCE(SUM(oi.quantity) FILTER (WHERE oi.quantity > 0), 0) AS und_vendidas,
      CASE WHEN SUM(oi.quantity) FILTER (WHERE oi.quantity > 0) > 0
        THEN ROUND(SUM(oi.price * oi.quantity) FILTER (WHERE oi.quantity > 0)::numeric / SUM(oi.quantity) FILTER (WHERE oi.quantity > 0), 0)
        ELSE 0 END AS precio_prom
    FROM catalogo c
    JOIN variantes vr ON vr.product_id = c.product_id
    LEFT JOIN order_items oi ON oi.sku = vr.v_sku
    LEFT JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    LEFT JOIN locations l ON o.location_id = l.location_id
    WHERE (p_canal IS NULL OR
           CASE WHEN o.source_name IN ('pos', 'shopify_draft_order') THEN 'Tiendas' ELSE 'Digital' END = p_canal
           OR oi.shopify_order_id IS NULL)
      AND (p_zona IS NULL OR l.zona = p_zona OR o.location_id IS NULL)
      AND (p_location_id IS NULL OR o.location_id = p_location_id OR oi.shopify_order_id IS NULL)
    GROUP BY c.product_id
  ),
  stock AS (
    SELECT
      c.product_id,
      COALESCE(SUM(inv.available), 0) AS stock_total
    FROM catalogo c
    JOIN variantes vr ON vr.product_id = c.product_id
    JOIN inventory_snapshot inv ON inv.variant_id = vr.variant_id
    CROSS JOIN snap s
    LEFT JOIN locations l ON inv.location_id = l.location_id
    WHERE inv.snapshot_date = s.snapshot_date
      AND (p_location_id IS NULL OR inv.location_id = p_location_id)
      AND (p_zona IS NULL OR l.zona = p_zona)
    GROUP BY c.product_id
  )
  SELECT
    c.sku,
    c.title,
    c.category,
    c.target_gender,
    c.image_url,
    COALESCE(v.und_vendidas, 0)::bigint,
    COALESCE(st.stock_total, 0)::bigint,
    CASE WHEN COALESCE(v.und_vendidas, 0) + COALESCE(st.stock_total, 0) > 0
      THEN ROUND(COALESCE(v.und_vendidas, 0)::numeric / (COALESCE(v.und_vendidas, 0) + COALESCE(st.stock_total, 0)) * 100, 1)
      ELSE 0 END,
    COALESCE(v.precio_prom, 0)
  FROM catalogo c
  LEFT JOIN ventas v ON v.product_id = c.product_id
  LEFT JOIN stock st ON st.product_id = c.product_id
  WHERE COALESCE(st.stock_total, 0) > 0
  ORDER BY
    CASE WHEN COALESCE(v.und_vendidas, 0) + COALESCE(st.stock_total, 0) > 0
      THEN COALESCE(v.und_vendidas, 0)::numeric / (COALESCE(v.und_vendidas, 0) + COALESCE(st.stock_total, 0))
      ELSE 0 END ASC
  LIMIT p_limite;
$$;
