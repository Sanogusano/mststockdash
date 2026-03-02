
CREATE OR REPLACE FUNCTION public.stock_general_por_producto()
RETURNS TABLE(product_id TEXT, stock_total BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH max_snap AS (
    SELECT MAX(snapshot_date) AS d FROM inventory_snapshot
  )
  SELECT pc.product_id, COALESCE(SUM(i.available), 0)::BIGINT AS stock_total
  FROM inventory_snapshot i
  JOIN max_snap ms ON i.snapshot_date = ms.d
  JOIN product_catalog pc ON i.sku = pc.sku
  WHERE pc.product_id IS NOT NULL
  GROUP BY pc.product_id;
$$;
