CREATE OR REPLACE FUNCTION public.stock_general_por_producto()
RETURNS TABLE(product_id text, stock_total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH snap AS (
    SELECT s.snapshot_date
    FROM (
      SELECT snapshot_date, COUNT(DISTINCT variant_id) AS cnt
      FROM public.inventory_snapshot
      GROUP BY snapshot_date
    ) s
    WHERE s.cnt >= 5000
    ORDER BY s.snapshot_date DESC
    LIMIT 1
  )
  SELECT
    pc.product_id,
    COALESCE(SUM(i.available), 0)::BIGINT AS stock_total
  FROM public.inventory_snapshot i
  JOIN snap ON i.snapshot_date = snap.snapshot_date
  JOIN public.product_catalog pc ON pc.variant_id = i.variant_id
  WHERE pc.product_id IS NOT NULL
    AND i.variant_id IS NOT NULL
    AND COALESCE(i.available, 0) > 0
  GROUP BY pc.product_id;
$$;