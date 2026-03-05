
CREATE OR REPLACE FUNCTION public.reporte_composicion_inventario_coleccion(
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(coleccion text, unidades bigint, pct numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH inv AS (
    SELECT
      CASE WHEN COALESCE(NULLIF(TRIM(p.collection_season),''),'')='' THEN 'Otros' ELSE p.collection_season END AS col,
      SUM(i.available)::BIGINT AS uds
    FROM inventory_snapshot i
    JOIN product_catalog p ON p.variant_id = i.variant_id
    WHERE i.snapshot_date = v_max_date
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND i.available > 0
      AND (NULLIF(TRIM(p_location_id),'') IS NULL OR i.location_id = p_location_id)
    GROUP BY col
  ),
  total AS (SELECT SUM(uds) AS t FROM inv)
  SELECT inv.col::TEXT, inv.uds, ROUND((inv.uds::NUMERIC / NULLIF(total.t,0)) * 100, 1)::NUMERIC
  FROM inv, total
  ORDER BY inv.uds DESC;
END;
$$;
