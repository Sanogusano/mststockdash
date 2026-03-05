
CREATE OR REPLACE FUNCTION public.reporte_composicion_coleccion_linea(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text,
  p_zona text DEFAULT NULL::text
)
RETURNS TABLE(coleccion text, categoria text, unidades bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN COALESCE(NULLIF(TRIM(p.collection_season),''),'')='' THEN 'Otros' ELSE p.collection_season END::TEXT AS col,
    COALESCE(UPPER(p.category), 'SIN CATEGORÍA')::TEXT AS cat,
    SUM(oi.quantity)::BIGINT AS uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
  JOIN locations l ON o.location_id=l.location_id
  JOIN product_catalog p ON oi.sku=p.sku
  WHERE o.created_at>=(NOW()-(GREATEST(COALESCE(dias_atras,1),1)||' days')::INTERVAL)
    AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
    AND (NULLIF(TRIM(p_location_id),'') IS NULL OR o.location_id=p_location_id)
    AND (NULLIF(TRIM(p_zona),'') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona=p_zona AND loc.is_active=true))
    AND (NULLIF(TRIM(p_canal),'') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
  GROUP BY col, cat
  ORDER BY col, uds DESC;
END;
$$;
