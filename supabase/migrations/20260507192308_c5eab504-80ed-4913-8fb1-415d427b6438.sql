CREATE OR REPLACE FUNCTION public.proyeccion_pagos_addi(
  p_fecha_desde date,
  p_fecha_hasta date
)
RETURNS TABLE (
  fecha_pago_estimada date,
  tipo_venta text,
  transacciones bigint,
  monto_bruto numeric,
  tarifas_estimadas numeric,
  monto_neto_estimado numeric,
  recibido_real numeric,
  esta_recibido boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH proy AS (
    SELECT
      CASE
        WHEN at2.tipo_de_venta = 'Débito (PSE)' THEN (at2.fecha_creacion AT TIME ZONE 'America/Bogota')::date + 1
        WHEN at2.tipo_de_venta = 'Crédito'      THEN (at2.fecha_creacion AT TIME ZONE 'America/Bogota')::date + 30
      END AS fecha_pago_estimada,
      at2.tipo_de_venta,
      at2.shopify_order_id,
      COALESCE(at2.monto, 0) AS monto_bruto
    FROM public.addi_transactions at2
    WHERE at2.estado = 'Exitosa'
      AND at2.tipo_de_venta IN ('Crédito','Débito (PSE)')
      AND at2.fecha_creacion IS NOT NULL
  ),
  agg AS (
    SELECT
      p.fecha_pago_estimada,
      p.tipo_de_venta AS tipo_venta,
      COUNT(*)::bigint AS transacciones,
      SUM(p.monto_bruto) AS monto_bruto,
      ROUND(SUM(p.monto_bruto) * 0.0385) AS tarifas_estimadas,
      ROUND(SUM(p.monto_bruto) * (1 - 0.0385)) AS monto_neto_estimado,
      COALESCE(SUM(
        CASE WHEN al.shopify_order_id IS NOT NULL THEN al.total_a_pagar ELSE 0 END
      ), 0) AS recibido_real,
      bool_or(al.shopify_order_id IS NOT NULL) AS esta_recibido
    FROM proy p
    LEFT JOIN public.addi_liquidaciones al
      ON al.shopify_order_id = p.shopify_order_id
     AND al.estado_pago = 'Pago'
    GROUP BY p.fecha_pago_estimada, p.tipo_de_venta
  )
  SELECT
    fecha_pago_estimada,
    tipo_venta,
    transacciones,
    monto_bruto,
    tarifas_estimadas,
    monto_neto_estimado,
    recibido_real,
    esta_recibido
  FROM agg
  WHERE fecha_pago_estimada BETWEEN p_fecha_desde AND p_fecha_hasta
  ORDER BY fecha_pago_estimada, tipo_venta;
$$;

GRANT EXECUTE ON FUNCTION public.proyeccion_pagos_addi(date, date) TO authenticated;