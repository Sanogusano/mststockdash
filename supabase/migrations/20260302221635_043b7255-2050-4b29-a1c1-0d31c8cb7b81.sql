
CREATE OR REPLACE FUNCTION public.stock_insumos_agregado()
RETURNS TABLE(sku TEXT, titulo TEXT, stock_total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH max_snap AS (
    SELECT MAX(snapshot_date) AS d FROM inventory_snapshot
  )
  SELECT pc.sku, MAX(pc.title)::TEXT AS titulo, COALESCE(SUM(i.available), 0)::BIGINT AS stock_total
  FROM inventory_snapshot i
  JOIN max_snap ms ON i.snapshot_date = ms.d
  JOIN product_catalog pc ON i.sku = pc.sku
  WHERE UPPER(COALESCE(pc.category, '')) IN ('BOLSA', 'INSUMOS')
    OR pc.category ILIKE '%bolsa%'
    OR pc.category ILIKE '%insumo%'
  GROUP BY pc.sku;
$$;
