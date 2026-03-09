
CREATE OR REPLACE FUNCTION public.stock_insumos_agregado()
RETURNS TABLE(sku TEXT, titulo TEXT, stock_total BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH snap AS (
    SELECT snapshot_date
    FROM inventory_snapshot
    GROUP BY snapshot_date
    HAVING COUNT(DISTINCT variant_id) >= 5000
    ORDER BY snapshot_date DESC
    LIMIT 1
  )
  SELECT pc.sku, MAX(pc.title)::TEXT AS titulo, COALESCE(SUM(i.available), 0)::BIGINT AS stock_total
  FROM inventory_snapshot i
  JOIN snap s ON i.snapshot_date = s.snapshot_date
  JOIN product_catalog pc ON pc.variant_id = i.variant_id
  WHERE (UPPER(COALESCE(pc.category, '')) IN ('BOLSA', 'INSUMOS')
    OR pc.category ILIKE '%bolsa%'
    OR pc.category ILIKE '%insumo%')
    AND i.available > 0
  GROUP BY pc.sku;
$$;
