CREATE OR REPLACE FUNCTION public.reporte_ventas_diarias(
  p_desde date,
  p_hasta date,
  p_canal text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_zona text DEFAULT NULL
)
RETURNS TABLE (
  dia date,
  ordenes bigint,
  ingresos_netos numeric,
  unidades bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (o.created_at AT TIME ZONE 'America/Bogota')::date AS dia,
    COUNT(DISTINCT o.shopify_order_id)::bigint AS ordenes,
    ROUND(SUM(
      ((oi.price * oi.quantity) - COALESCE(oi.manual_discount_amount, 0)) / 1.19
    ))::numeric AS ingresos_netos,
    COALESCE(SUM(oi.quantity), 0)::bigint AS unidades
  FROM public.orders o
  JOIN public.order_items oi ON oi.shopify_order_id = o.shopify_order_id
  JOIN public.product_catalog p ON oi.sku = p.sku
  LEFT JOIN public.locations l ON l.location_id = o.location_id
  WHERE o.financial_status IN ('paid', 'partially_refunded', 'partially_paid')
    AND (o.created_at AT TIME ZONE 'America/Bogota') >= p_desde
    AND (o.created_at AT TIME ZONE 'America/Bogota') < (p_hasta + interval '1 day')
    AND UPPER(COALESCE(p.category, '')) NOT IN ('BOLSA', 'INSUMOS')
    AND (
      p_canal IS NULL OR p_canal = '' OR (
        CASE
          WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
          WHEN o.location_id = '71474315479' OR o.source_name <> 'pos' THEN 'Tienda Online'
          ELSE 'POS'
        END
      ) = p_canal
    )
    AND (p_location_id IS NULL OR p_location_id = '' OR o.location_id = p_location_id)
    AND (p_zona IS NULL OR p_zona = '' OR l.zona = p_zona)
  GROUP BY (o.created_at AT TIME ZONE 'America/Bogota')::date
  ORDER BY dia;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_ventas_diarias(date, date, text, text, text) TO authenticated;