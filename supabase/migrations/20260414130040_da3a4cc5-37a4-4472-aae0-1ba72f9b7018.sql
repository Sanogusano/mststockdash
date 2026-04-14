
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
    (SELECT 
      COALESCE(
        NULLIF(TRIM(REGEXP_REPLACE(
          CASE 
            WHEN pc2.title ~* '\s(MEN|WOMEN|UNISEX|KIDS)\s' 
            THEN REGEXP_REPLACE(pc2.title, '^.*\s(MEN|WOMEN|UNISEX|KIDS)\s+', '', 'i')
            ELSE REGEXP_REPLACE(pc2.title, '^\S+\s+', '')
          END,
          '\s+\d+(/\w+)?$', '', 'g'
        )), ''),
        pc2.color
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
