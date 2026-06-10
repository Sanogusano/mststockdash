CREATE OR REPLACE FUNCTION public.get_centro_accion_comercial(p_anio integer, p_mes integer)
RETURNS TABLE(nombre text, tipo text, tipo_tienda text, es_digital boolean, presupuesto numeric, venta_mtd numeric, proyeccion_conservadora numeric, crecimiento_mom numeric, crecimiento_yoy numeric, esfuerzo_requerido numeric, ticket_promedio numeric, upt numeric, pct_descuento numeric, tiene_stamp boolean, stamped_at timestamp with time zone, stamp_variacion numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_inicio date;
  v_hoy date;
  v_fin_mes date;
  v_dias_trans int;
  v_dias_rest int;
  v_dias_mes int;
  v_inicio_ant date;
  v_inicio_yoy date;
  v_inicio_ts timestamptz;
  v_fin_ts timestamptz;
  v_inicio_ant_ts timestamptz;
  v_fin_ant_ts timestamptz;
  v_inicio_yoy_ts timestamptz;
  v_fin_yoy_ts timestamptz;
BEGIN
  v_inicio := make_date(p_anio, p_mes, 1);
  v_hoy := (now() AT TIME ZONE 'America/Bogota')::date;
  v_fin_mes := (v_inicio + interval '1 month' - interval '1 day')::date;
  v_dias_mes := EXTRACT(day FROM v_fin_mes)::int;

  IF v_hoy > v_fin_mes THEN v_hoy := v_fin_mes; END IF;
  IF v_hoy < v_inicio THEN v_dias_trans := 0;
  ELSE v_dias_trans := (v_hoy - v_inicio)::int + 1; END IF;
  v_dias_rest := v_dias_mes - v_dias_trans;

  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_inicio_yoy := make_date(p_anio - 1, p_mes, 1);
  v_inicio_ts := make_timestamptz(p_anio, p_mes, 1, 0, 0, 0, 'America/Bogota');
  v_fin_ts := v_inicio_ts + interval '1 month';
  v_inicio_ant_ts := make_timestamptz(EXTRACT(year FROM v_inicio_ant)::int, EXTRACT(month FROM v_inicio_ant)::int, 1, 0, 0, 0, 'America/Bogota');
  v_fin_ant_ts := v_inicio_ant_ts + make_interval(days => GREATEST(v_dias_trans, 0));
  v_inicio_yoy_ts := make_timestamptz(p_anio - 1, p_mes, 1, 0, 0, 0, 'America/Bogota');
  v_fin_yoy_ts := v_inicio_yoy_ts + make_interval(days => GREATEST(v_dias_trans, 0));

  RETURN QUERY
  WITH
  loc_active AS (
    SELECT l.location_id, l.name FROM locations l WHERE l.is_active = true
  ),
  orders_relevant AS (
    SELECT
      o.shopify_order_id,
      (o.created_at AT TIME ZONE 'America/Bogota')::date AS dia,
      CASE
        WHEN o.source_name = 'pos' AND o.location_id <> '71474315479' THEN la.name
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        ELSE 'Tienda Online'
      END AS canal_nombre,
      CASE
        WHEN o.created_at >= v_inicio_ts AND o.created_at < v_fin_ts THEN 'mtd'
        WHEN v_dias_trans > 0 AND o.created_at >= v_inicio_ant_ts AND o.created_at < v_fin_ant_ts THEN 'mom'
        WHEN v_dias_trans > 0 AND o.created_at >= v_inicio_yoy_ts AND o.created_at < v_fin_yoy_ts THEN 'yoy'
      END AS period
    FROM orders o
    LEFT JOIN loc_active la ON la.location_id = o.location_id
    WHERE o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND (
        (o.created_at >= v_inicio_ts AND o.created_at < v_fin_ts)
        OR (v_dias_trans > 0 AND o.created_at >= v_inicio_ant_ts AND o.created_at < v_fin_ant_ts)
        OR (v_dias_trans > 0 AND o.created_at >= v_inicio_yoy_ts AND o.created_at < v_fin_yoy_ts)
      )
  ),
  items_relevant AS (
    SELECT
      o.period,
      o.canal_nombre,
      o.shopify_order_id,
      o.dia,
      oi.quantity::bigint AS q,
      ((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19 AS venta_neta,
      (COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_desc
    FROM orders_relevant o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS')
  ),
  ord_mtd AS (
    SELECT i.canal_nombre, i.shopify_order_id,
      SUM(i.q) AS und_orden,
      SUM(i.venta_neta) AS valor_orden,
      BOOL_OR(i.has_desc) AS has_descuento
    FROM items_relevant i
    WHERE i.period = 'mtd' AND i.canal_nombre IS NOT NULL
    GROUP BY i.canal_nombre, i.shopify_order_id
  ),
  va AS (
    SELECT
      ob.canal_nombre,
      COUNT(*)::bigint AS pedidos,
      COALESCE(SUM(ob.und_orden), 0)::numeric AS unidades,
      COALESCE(SUM(ob.valor_orden), 0)::numeric AS venta,
      ROUND(COALESCE(SUM(ob.valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS t_prom,
      ROUND(COALESCE(SUM(ob.und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      ROUND(COALESCE(COUNT(*) FILTER (WHERE ob.has_descuento)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 0), 1)::numeric AS pct_desc
    FROM ord_mtd ob
    GROUP BY ob.canal_nombre
  ),
  vm AS (
    SELECT i.canal_nombre, SUM(i.venta_neta) AS venta
    FROM items_relevant i
    WHERE i.period = 'mom' AND i.canal_nombre IS NOT NULL
    GROUP BY i.canal_nombre
  ),
  vy AS (
    SELECT i.canal_nombre, SUM(i.venta_neta) AS venta
    FROM items_relevant i
    WHERE i.period = 'yoy' AND i.canal_nombre IS NOT NULL
    GROUP BY i.canal_nombre
  ),
  pres AS (
    SELECT pc.nombre_identificador, pc.tipo AS p_tipo, pc.monto,
      COALESCE(l.tipo_tienda, '') AS l_tipo_tienda,
      CASE WHEN pc.tipo = 'canal' THEN true ELSE false END AS digital
    FROM presupuestos_config pc
    LEFT JOIN locations l ON l.name = pc.nombre_identificador
    WHERE pc.anio = p_anio AND pc.mes = p_mes AND pc.monto > 0
      AND pc.tipo IN ('tienda', 'canal')
  ),
  stmp AS (
    SELECT s.location_name, s.stamped_at AS s_at
    FROM store_action_stamps s WHERE s.active = true
  ),
  stamp_pre_post AS (
    SELECT st.location_name,
      st.s_at,
      COALESCE(SUM(CASE WHEN i.dia < st.s_at::date THEN i.venta_neta END), 0)
        / GREATEST(1, (st.s_at::date - v_inicio)::int) AS avg_pre,
      COALESCE(SUM(CASE WHEN i.dia >= st.s_at::date AND i.dia <= v_hoy THEN i.venta_neta END), 0)
        / GREATEST(1, (v_hoy - st.s_at::date + 1)::int) AS avg_post
    FROM stmp st
    LEFT JOIN items_relevant i
      ON i.period = 'mtd'
     AND i.canal_nombre = st.location_name
     AND i.dia >= v_inicio
     AND i.dia <= v_hoy
    GROUP BY st.location_name, st.s_at
  )
  SELECT
    pr.nombre_identificador,
    pr.p_tipo,
    pr.l_tipo_tienda,
    pr.digital,
    pr.monto,
    COALESCE(v.venta, 0),
    CASE WHEN pr.monto > 0 AND v_dias_trans > 0 THEN
      (COALESCE(v.venta,0) + (COALESCE(v.venta,0) / v_dias_trans * v_dias_rest * 0.85)) / pr.monto
    ELSE 0 END,
    CASE WHEN COALESCE(m.venta,0) > 0 THEN (COALESCE(v.venta,0) - m.venta) / m.venta ELSE 0 END,
    CASE WHEN COALESCE(y.venta,0) > 0 THEN (COALESCE(v.venta,0) - y.venta) / y.venta ELSE 0 END,
    CASE WHEN v_dias_rest > 0 AND v_dias_trans > 0 AND COALESCE(v.venta,0) > 0 THEN
      ((pr.monto - COALESCE(v.venta,0)) / v_dias_rest) / (COALESCE(v.venta,0) / v_dias_trans) - 1
    ELSE 0 END,
    COALESCE(v.t_prom, 0),
    COALESCE(v.upt_calc, 0),
    COALESCE(v.pct_desc, 0) / 100.0,
    COALESCE(st.location_name IS NOT NULL, false),
    st.s_at,
    CASE WHEN sp.avg_pre > 0 THEN (sp.avg_post - sp.avg_pre) / sp.avg_pre ELSE 0 END
  FROM pres pr
  LEFT JOIN va v ON v.canal_nombre = pr.nombre_identificador
  LEFT JOIN vm m ON m.canal_nombre = pr.nombre_identificador
  LEFT JOIN vy y ON y.canal_nombre = pr.nombre_identificador
  LEFT JOIN stmp st ON st.location_name = pr.nombre_identificador
  LEFT JOIN stamp_pre_post sp ON sp.location_name = pr.nombre_identificador;
END;
$function$;