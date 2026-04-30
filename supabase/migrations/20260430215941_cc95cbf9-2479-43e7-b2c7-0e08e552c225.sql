
CREATE OR REPLACE FUNCTION public.reporte_ventas_por_canal(
  p_desde date,
  p_hasta date
)
RETURNS TABLE(
  canal text,
  ingresos_netos numeric,
  ordenes bigint,
  unidades bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
      WHEN o.location_id = '71474315479'
           OR o.source_name IN ('web','580111') THEN 'Tienda Online'
      ELSE 'POS'
    END AS canal,
    ROUND(SUM(
      ((oi.price * oi.quantity) - COALESCE(oi.manual_discount_amount, 0)) / 1.19
    )) AS ingresos_netos,
    COUNT(DISTINCT o.shopify_order_id) AS ordenes,
    SUM(oi.quantity) AS unidades
  FROM orders o
  JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
  WHERE (o.created_at AT TIME ZONE 'America/Bogota')::date >= p_desde
    AND (o.created_at AT TIME ZONE 'America/Bogota')::date <= p_hasta
    AND o.financial_status IN ('paid','partially_refunded','partially_paid')
    AND COALESCE(oi.category,'') NOT IN ('BOLSA','INSUMOS')
  GROUP BY 1
  ORDER BY 1;
$$;
