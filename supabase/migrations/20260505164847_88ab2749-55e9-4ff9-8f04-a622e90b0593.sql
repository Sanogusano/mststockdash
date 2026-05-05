CREATE OR REPLACE FUNCTION public.reporte_addi_conciliacion(
  p_desde timestamp with time zone,
  p_hasta timestamp with time zone
)
RETURNS TABLE (
  addi_id uuid,
  shopify_order_id text,
  id_orden text,
  canal text,
  tipo_de_venta text,
  monto numeric,
  estado text,
  fecha_creacion timestamp with time zone,
  email_vendedor text,
  nombre_tienda text,
  order_number text,
  fecha_pedido timestamp with time zone,
  monto_shopify numeric,
  location_id text,
  source_name text,
  user_id text,
  payment_token text,
  ns_factura text,
  ns_valor numeric,
  ns_base numeric,
  ns_discrepancia numeric,
  ns_tipo_discrepancia text,
  estado_final text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    at2.id AS addi_id,
    at2.shopify_order_id,
    at2.id_orden,
    at2.canal,
    at2.tipo_de_venta,
    at2.monto,
    at2.estado,
    at2.fecha_creacion,
    at2.email_vendedor,
    at2.nombre_tienda,
    o.order_number,
    o.created_at AS fecha_pedido,
    o.total_price AS monto_shopify,
    o.location_id,
    o.source_name,
    o.user_id,
    o.payment_token,
    nf.numero_factura AS ns_factura,
    nf.valor_facturado AS ns_valor,
    nf.base_gravable AS ns_base,
    nf.discrepancia AS ns_discrepancia,
    nf.tipo_discrepancia AS ns_tipo_discrepancia,
    CASE
      WHEN at2.shopify_order_id IS NULL AND o.order_number IS NULL THEN 'sin_cruce'
      WHEN o.order_number IS NOT NULL AND nf.numero_factura IS NULL THEN 'sin_factura'
      WHEN o.order_number IS NOT NULL
        AND nf.numero_factura IS NOT NULL
        AND nf.tipo_discrepancia = 'sin_discrepancia' THEN 'conciliado'
      WHEN o.order_number IS NOT NULL
        AND nf.numero_factura IS NOT NULL
        AND nf.tipo_discrepancia IN ('mayor_valor', 'menor_valor') THEN 'discrepancia'
      ELSE 'discrepancia'
    END AS estado_final
  FROM public.addi_transactions at2
  LEFT JOIN public.orders o
    ON o.payment_token = at2.id_orden
    OR o.shopify_order_id = at2.shopify_order_id
  LEFT JOIN public.netsuite_facturas nf
    ON nf.shopify_order_number = o.order_number
  WHERE at2.fecha_creacion >= p_desde
    AND at2.fecha_creacion < p_hasta
    AND ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'finanzas'::text, 'gerencia'::text])
  ORDER BY at2.fecha_creacion DESC;
$$;

REVOKE ALL ON FUNCTION public.reporte_addi_conciliacion(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reporte_addi_conciliacion(timestamp with time zone, timestamp with time zone) TO authenticated;