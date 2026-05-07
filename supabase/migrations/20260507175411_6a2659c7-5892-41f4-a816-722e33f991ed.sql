CREATE OR REPLACE FUNCTION public.get_addi_conciliacion_kpis(
  p_mes date,
  p_canal text DEFAULT 'all',
  p_tipo text DEFAULT 'all',
  p_estado text DEFAULT 'all',
  p_discrepancia text DEFAULT 'all'
)
RETURNS TABLE (
  total bigint,
  conciliadas bigint,
  con_discrepancia bigint,
  sin_factura_ns bigint,
  sin_cruce bigint,
  monto_discrepancia numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      at2.canal,
      at2.tipo_de_venta,
      o.order_number,
      nf.numero_factura,
      nf.tipo_discrepancia,
      CASE
        WHEN nf.valor_facturado IS NOT NULL AND o.total_price IS NOT NULL
          THEN ABS(nf.valor_facturado - (o.total_price / 1.19))
        ELSE NULL
      END AS ns_discrepancia,
      CASE
        WHEN o.order_number IS NULL THEN 'sin_cruce'
        WHEN nf.numero_factura IS NULL THEN 'sin_factura'
        WHEN o.total_price IS NULL THEN 'sin_cruce'
        WHEN ABS(nf.valor_facturado - (o.total_price / 1.19)) > 500 THEN 'discrepancia'
        ELSE 'conciliado'
      END AS estado_final
    FROM public.addi_transactions at2
    LEFT JOIN public.orders o
      ON o.payment_token = at2.id_orden
      OR o.shopify_order_id = at2.shopify_order_id
    LEFT JOIN public.netsuite_facturas nf
      ON nf.shopify_order_number = o.order_number
    WHERE at2.fecha_creacion >= date_trunc('month', p_mes)::timestamp with time zone
      AND at2.fecha_creacion < (date_trunc('month', p_mes) + interval '1 month')::timestamp with time zone
      AND ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'finanzas'::text, 'gerencia'::text])
  ), filtrada AS (
    SELECT *
    FROM base
    WHERE (p_canal IS NULL OR p_canal = 'all' OR canal = p_canal)
      AND (p_tipo IS NULL OR p_tipo = 'all' OR tipo_de_venta = p_tipo)
      AND (p_estado IS NULL OR p_estado = 'all' OR estado_final = p_estado)
      AND (
        p_discrepancia IS NULL
        OR p_discrepancia = 'all'
        OR (p_discrepancia = 'sin_discrepancia' AND (tipo_discrepancia IS NULL OR tipo_discrepancia = 'sin_discrepancia'))
        OR (p_discrepancia <> 'sin_discrepancia' AND tipo_discrepancia = p_discrepancia)
      )
  )
  SELECT
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (
      WHERE order_number IS NOT NULL
        AND numero_factura IS NOT NULL
        AND tipo_discrepancia = 'sin_discrepancia'
    )::bigint AS conciliadas,
    COUNT(*) FILTER (
      WHERE tipo_discrepancia IN ('mayor_valor', 'menor_valor')
    )::bigint AS con_discrepancia,
    COUNT(*) FILTER (
      WHERE order_number IS NOT NULL
        AND numero_factura IS NULL
    )::bigint AS sin_factura_ns,
    COUNT(*) FILTER (
      WHERE order_number IS NULL
    )::bigint AS sin_cruce,
    COALESCE(
      SUM(ns_discrepancia) FILTER (
        WHERE tipo_discrepancia IN ('mayor_valor', 'menor_valor')
      ),
      0
    ) AS monto_discrepancia
  FROM filtrada;
$$;

REVOKE ALL ON FUNCTION public.get_addi_conciliacion_kpis(date, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_addi_conciliacion_kpis(date, text, text, text, text) TO authenticated;