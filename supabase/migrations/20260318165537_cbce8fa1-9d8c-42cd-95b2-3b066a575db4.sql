
CREATE OR REPLACE FUNCTION public.get_alertas_comerciales(p_anio integer, p_mes integer)
RETURNS TABLE (
  nombre text,
  tipo text,
  es_digital boolean,
  presupuesto numeric,
  venta_mtd numeric,
  pct_proyeccion numeric,
  ticket_promedio_local numeric,
  ticket_promedio_nacional numeric,
  upt_local numeric,
  upt_nacional numeric,
  tendencia_transacciones numeric,
  pct_recompra numeric,
  pct_descuento numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_dias_mes int;
  v_dias_transcurridos int;
  v_today date;
  v_ticket_nacional numeric;
  v_upt_nacional numeric;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Bogota')::date;
  v_month_start := make_date(p_anio, p_mes, 1) AT TIME ZONE 'America/Bogota';
  IF p_mes = 12 THEN
    v_month_end := make_date(p_anio + 1, 1, 1) AT TIME ZONE 'America/Bogota';
  ELSE
    v_month_end := make_date(p_anio, p_mes + 1, 1) AT TIME ZONE 'America/Bogota';
  END IF;

  v_dias_mes := (v_month_end AT TIME ZONE 'America/Bogota')::date - (v_month_start AT TIME ZONE 'America/Bogota')::date;

  IF v_today >= (v_month_start AT TIME ZONE 'America/Bogota')::date
     AND v_today < (v_month_end AT TIME ZONE 'America/Bogota')::date THEN
    v_dias_transcurridos := v_today - (v_month_start AT TIME ZONE 'America/Bogota')::date + 1;
  ELSE
    v_dias_transcurridos := v_dias_mes;
  END IF;

  -- National averages for the month
  SELECT
    COALESCE(
      SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19) /
      NULLIF(COUNT(DISTINCT o.shopify_order_id), 0),
      0
    ),
    COALESCE(
      SUM(oi.quantity)::numeric / NULLIF(COUNT(DISTINCT o.shopify_order_id), 0),
      0
    )
  INTO v_ticket_nacional, v_upt_nacional
  FROM orders o
  JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
  WHERE o.created_at >= v_month_start AND o.created_at < v_month_end
    AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO');

  RETURN QUERY
  WITH config AS (
    SELECT pc.nombre_identificador, pc.tipo, pc.monto
    FROM presupuestos_config pc
    WHERE pc.anio = p_anio AND pc.mes = p_mes
  ),
  loc_map AS (
    SELECT l.location_id, l.name
    FROM locations l WHERE l.is_active = true
  ),
  classified_orders AS (
    SELECT
      o.shopify_order_id,
      o.created_at,
      CASE
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        WHEN o.location_id = '71474315479' OR COALESCE(o.source_name, '') <> 'pos' THEN 'Tienda Online'
        ELSE COALESCE(lm.name, o.location_id)
      END AS config_name,
      CASE
        WHEN o.source_name = 'shopify_draft_order' THEN true
        WHEN o.location_id = '71474315479' OR COALESCE(o.source_name, '') <> 'pos' THEN true
        ELSE false
      END AS is_dig
    FROM orders o
    LEFT JOIN loc_map lm ON lm.location_id = o.location_id
  ),
  mtd_sales AS (
    SELECT
      co.config_name,
      bool_or(co.is_dig) AS is_dig,
      SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19) AS venta_neta,
      SUM(oi.price * oi.quantity) AS venta_bruta,
      SUM(COALESCE(oi.manual_discount_amount, 0)) AS total_descuento,
      COUNT(DISTINCT co.shopify_order_id) AS total_pedidos,
      SUM(oi.quantity) AS total_unidades
    FROM classified_orders co
    JOIN order_items oi ON oi.shopify_order_id = co.shopify_order_id
    WHERE co.created_at >= v_month_start AND co.created_at < v_month_end
      AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO')
    GROUP BY co.config_name
  ),
  trend AS (
    SELECT
      co.config_name,
      COUNT(DISTINCT co.shopify_order_id) FILTER (
        WHERE co.created_at >= (v_today - 6) AT TIME ZONE 'America/Bogota'
          AND co.created_at < (v_today + 1) AT TIME ZONE 'America/Bogota'
      ) AS pedidos_7d,
      COUNT(DISTINCT co.shopify_order_id) FILTER (
        WHERE co.created_at >= (v_today - 13) AT TIME ZONE 'America/Bogota'
          AND co.created_at < (v_today - 6) AT TIME ZONE 'America/Bogota'
      ) AS pedidos_prev_7d
    FROM classified_orders co
    WHERE co.created_at >= (v_today - 13) AT TIME ZONE 'America/Bogota'
      AND co.created_at < (v_today + 1) AT TIME ZONE 'America/Bogota'
    GROUP BY co.config_name
  )
  SELECT
    c.nombre_identificador,
    c.tipo,
    COALESCE(ms.is_dig, c.tipo = 'canal'),
    c.monto,
    COALESCE(ms.venta_neta, 0),
    CASE WHEN c.monto > 0 AND v_dias_transcurridos > 0 THEN
      ((COALESCE(ms.venta_neta, 0) / v_dias_transcurridos) * v_dias_mes / c.monto) * 100
    ELSE 0 END,
    CASE WHEN COALESCE(ms.total_pedidos, 0) > 0 THEN
      ms.venta_neta / ms.total_pedidos
    ELSE 0 END,
    v_ticket_nacional,
    CASE WHEN COALESCE(ms.total_pedidos, 0) > 0 THEN
      ms.total_unidades::numeric / ms.total_pedidos
    ELSE 0 END,
    v_upt_nacional,
    CASE WHEN COALESCE(t.pedidos_prev_7d, 0) > 0 THEN
      ((COALESCE(t.pedidos_7d, 0) - t.pedidos_prev_7d)::numeric / t.pedidos_prev_7d)
    ELSE 0 END,
    0::numeric,
    CASE WHEN COALESCE(ms.venta_bruta, 0) > 0 THEN
      ms.total_descuento / ms.venta_bruta
    ELSE 0 END
  FROM config c
  LEFT JOIN mtd_sales ms ON ms.config_name = c.nombre_identificador
  LEFT JOIN trend t ON t.config_name = c.nombre_identificador;
END;
$$;
