CREATE OR REPLACE FUNCTION get_centro_accion_comercial(p_anio int, p_mes int)
RETURNS TABLE(
  nombre text, tipo text, tipo_tienda text, es_digital boolean,
  presupuesto numeric, venta_mtd numeric, proyeccion_conservadora numeric,
  crecimiento_mom numeric, crecimiento_yoy numeric, esfuerzo_requerido numeric,
  ticket_promedio numeric, upt numeric, pct_descuento numeric,
  tiene_stamp boolean, stamped_at timestamptz, stamp_variacion numeric
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
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

  RETURN QUERY
  WITH
  -- Current month: classify by channel, join product_catalog for category (same as reporte_kpis_comerciales)
  ordenes_base AS (
    SELECT
      CASE
        WHEN o.source_name = 'pos' AND o.location_id <> '71474315479' THEN
          (SELECT l.name FROM locations l WHERE l.location_id = o.location_id AND l.is_active = true LIMIT 1)
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        ELSE 'Tienda Online'
      END AS canal_nombre,
      o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_inicio_ts AND o.created_at < v_fin_ts
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY canal_nombre, o.shopify_order_id
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
    FROM ordenes_base ob
    WHERE ob.canal_nombre IS NOT NULL
    GROUP BY ob.canal_nombre
  ),
  -- Previous month (same elapsed days)
  vm_items AS (
    SELECT
      CASE
        WHEN o.source_name = 'pos' AND o.location_id <> '71474315479' THEN
          (SELECT l.name FROM locations l WHERE l.location_id = o.location_id AND l.is_active = true LIMIT 1)
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        ELSE 'Tienda Online'
      END AS canal_nombre,
      (oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19 AS venta_neta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE v_dias_trans > 0
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio_ant AND (v_inicio_ant + v_dias_trans - 1)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  ),
  vm AS (
    SELECT canal_nombre, SUM(venta_neta) AS venta
    FROM vm_items WHERE canal_nombre IS NOT NULL
    GROUP BY canal_nombre
  ),
  -- YoY
  vy_items AS (
    SELECT
      CASE
        WHEN o.source_name = 'pos' AND o.location_id <> '71474315479' THEN
          (SELECT l.name FROM locations l WHERE l.location_id = o.location_id AND l.is_active = true LIMIT 1)
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        ELSE 'Tienda Online'
      END AS canal_nombre,
      (oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19 AS venta_neta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE v_dias_trans > 0
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio_yoy AND (v_inicio_yoy + v_dias_trans - 1)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  ),
  vy AS (
    SELECT canal_nombre, SUM(venta_neta) AS venta
    FROM vy_items WHERE canal_nombre IS NOT NULL
    GROUP BY canal_nombre
  ),
  pres AS (
    SELECT pc.nombre_identificador, pc.tipo AS p_tipo, pc.monto,
      COALESCE(l.tipo_tienda, '') AS l_tipo_tienda,
      CASE WHEN pc.tipo = 'canal' THEN true ELSE false END AS digital
    FROM presupuestos_config pc
    LEFT JOIN locations l ON l.name = pc.nombre_identificador
    WHERE pc.anio = p_anio AND pc.mes = p_mes AND pc.monto > 0
  ),
  stmp AS (
    SELECT s.location_name, s.stamped_at AS s_at
    FROM store_action_stamps s WHERE s.active = true
  ),
  stamp_pre_post AS (
    SELECT st.location_name,
      COALESCE((
        SELECT SUM((oi2.price * oi2.quantity - COALESCE(oi2.manual_discount_amount,0)) / 1.19)
               / GREATEST(1, (st.s_at::date - v_inicio)::int)
        FROM orders o2
        JOIN order_items oi2 ON oi2.shopify_order_id = o2.shopify_order_id
        JOIN product_catalog p2 ON oi2.sku = p2.sku
        WHERE UPPER(p2.category) NOT IN ('BOLSA','INSUMOS')
          AND (CASE
            WHEN st.location_name = 'Personal Shopper' THEN o2.source_name = 'shopify_draft_order'
            WHEN st.location_name = 'Tienda Online' THEN
              (o2.source_name NOT IN ('pos','shopify_draft_order') OR (o2.source_name = 'pos' AND o2.location_id = '71474315479'))
            ELSE o2.source_name = 'pos' AND o2.location_id <> '71474315479'
                 AND o2.location_id = (SELECT l2.location_id FROM locations l2 WHERE l2.name = st.location_name LIMIT 1)
          END)
          AND (o2.created_at AT TIME ZONE 'America/Bogota')::date >= v_inicio
          AND (o2.created_at AT TIME ZONE 'America/Bogota')::date < st.s_at::date
      ), 0) AS avg_pre,
      COALESCE((
        SELECT SUM((oi3.price * oi3.quantity - COALESCE(oi3.manual_discount_amount,0)) / 1.19)
               / GREATEST(1, (v_hoy - st.s_at::date + 1)::int)
        FROM orders o3
        JOIN order_items oi3 ON oi3.shopify_order_id = o3.shopify_order_id
        JOIN product_catalog p3 ON oi3.sku = p3.sku
        WHERE UPPER(p3.category) NOT IN ('BOLSA','INSUMOS')
          AND (CASE
            WHEN st.location_name = 'Personal Shopper' THEN o3.source_name = 'shopify_draft_order'
            WHEN st.location_name = 'Tienda Online' THEN
              (o3.source_name NOT IN ('pos','shopify_draft_order') OR (o3.source_name = 'pos' AND o3.location_id = '71474315479'))
            ELSE o3.source_name = 'pos' AND o3.location_id <> '71474315479'
                 AND o3.location_id = (SELECT l3.location_id FROM locations l3 WHERE l3.name = st.location_name LIMIT 1)
          END)
          AND (o3.created_at AT TIME ZONE 'America/Bogota')::date >= st.s_at::date
          AND (o3.created_at AT TIME ZONE 'America/Bogota')::date <= v_hoy
      ), 0) AS avg_post
    FROM stmp st
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
    COALESCE(v.pct_desc, 0) / 100.0,  -- return as decimal to match frontend fmtPct
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
$$;