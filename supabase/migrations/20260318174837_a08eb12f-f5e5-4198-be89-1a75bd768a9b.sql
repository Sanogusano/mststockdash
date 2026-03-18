
-- 1. Create store_action_stamps table
CREATE TABLE IF NOT EXISTS store_action_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  stamped_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE store_action_stamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura autenticados" ON store_action_stamps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Inserción autenticados" ON store_action_stamps
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Actualización autenticados" ON store_action_stamps
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 2. Create RPC get_centro_accion_comercial
CREATE OR REPLACE FUNCTION get_centro_accion_comercial(p_anio int, p_mes int)
RETURNS TABLE(
  nombre text,
  tipo text,
  tipo_tienda text,
  es_digital boolean,
  presupuesto numeric,
  venta_mtd numeric,
  proyeccion_conservadora numeric,
  crecimiento_mom numeric,
  crecimiento_yoy numeric,
  esfuerzo_requerido numeric,
  ticket_promedio numeric,
  upt numeric,
  pct_descuento numeric,
  tiene_stamp boolean,
  stamped_at timestamptz,
  stamp_variacion numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
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
BEGIN
  v_inicio := make_date(p_anio, p_mes, 1);
  v_hoy := (now() AT TIME ZONE 'America/Bogota')::date;
  v_fin_mes := (v_inicio + interval '1 month' - interval '1 day')::date;
  v_dias_mes := EXTRACT(day FROM v_fin_mes)::int;

  IF v_hoy > v_fin_mes THEN v_hoy := v_fin_mes; END IF;
  IF v_hoy < v_inicio THEN
    v_dias_trans := 0;
  ELSE
    v_dias_trans := (v_hoy - v_inicio)::int + 1;
  END IF;
  v_dias_rest := v_dias_mes - v_dias_trans;

  v_inicio_ant := (v_inicio - interval '1 month')::date;
  v_inicio_yoy := make_date(p_anio - 1, p_mes, 1);

  RETURN QUERY
  WITH pres AS (
    SELECT
      pc.nombre_identificador,
      pc.tipo AS p_tipo,
      pc.monto,
      l.location_id AS loc_id,
      COALESCE(l.tipo_tienda, pc.tipo) AS l_tipo_tienda,
      CASE WHEN l.location_id IS NULL
           OR pc.tipo ILIKE '%online%'
           OR pc.tipo ILIKE '%personal%'
      THEN true ELSE false END AS digital
    FROM presupuestos_config pc
    LEFT JOIN locations l ON l.name = pc.nombre_identificador
    WHERE pc.anio = p_anio AND pc.mes = p_mes AND pc.monto > 0
  ),
  -- Current month sales per location
  va AS (
    SELECT
      o.location_id AS loc_id,
      SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19) AS venta,
      SUM(oi.price * oi.quantity / 1.19) AS bruta,
      SUM(COALESCE(oi.manual_discount_amount, 0) / 1.19) AS desc_total,
      COUNT(DISTINCT o.shopify_order_id) AS pedidos,
      SUM(oi.quantity) AS unidades
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio AND v_hoy
      AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO')
    GROUP BY o.location_id
  ),
  -- Previous month sales (same elapsed days)
  vm AS (
    SELECT
      o.location_id AS loc_id,
      SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19) AS venta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE v_dias_trans > 0
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN v_inicio_ant AND (v_inicio_ant + v_dias_trans - 1)
      AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO')
    GROUP BY o.location_id
  ),
  -- Same month last year (same elapsed days)
  vy AS (
    SELECT
      o.location_id AS loc_id,
      SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19) AS venta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE v_dias_trans > 0
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date
          BETWEEN v_inicio_yoy AND (v_inicio_yoy + v_dias_trans - 1)
      AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO')
    GROUP BY o.location_id
  ),
  -- Active stamps
  stmp AS (
    SELECT s.location_name, s.stamped_at AS s_at, s.active,
           l.location_id AS loc_id
    FROM store_action_stamps s
    LEFT JOIN locations l ON l.name = s.location_name
    WHERE s.active = true
  ),
  -- Post-stamp metrics
  sm AS (
    SELECT
      st2.location_name,
      st2.loc_id,
      COALESCE(
        (SELECT SUM((oi2.price * oi2.quantity - COALESCE(oi2.manual_discount_amount,0)) / 1.19)
            / GREATEST(1, (st2.s_at::date - v_inicio)::int)
         FROM orders o2
         JOIN order_items oi2 ON oi2.shopify_order_id = o2.shopify_order_id
         WHERE o2.location_id = st2.loc_id
           AND (o2.created_at AT TIME ZONE 'America/Bogota')::date >= v_inicio
           AND (o2.created_at AT TIME ZONE 'America/Bogota')::date < st2.s_at::date
           AND COALESCE(oi2.category,'') NOT IN ('BOLSA','INSUMO')
        ), 0
      ) AS avg_pre,
      COALESCE(
        (SELECT SUM((oi3.price * oi3.quantity - COALESCE(oi3.manual_discount_amount,0)) / 1.19)
            / GREATEST(1, (v_hoy - st2.s_at::date + 1)::int)
         FROM orders o3
         JOIN order_items oi3 ON oi3.shopify_order_id = o3.shopify_order_id
         WHERE o3.location_id = st2.loc_id
           AND (o3.created_at AT TIME ZONE 'America/Bogota')::date >= st2.s_at::date
           AND (o3.created_at AT TIME ZONE 'America/Bogota')::date <= v_hoy
           AND COALESCE(oi3.category,'') NOT IN ('BOLSA','INSUMO')
        ), 0
      ) AS avg_post
    FROM stmp st2
    WHERE st2.loc_id IS NOT NULL
  )
  SELECT
    p.nombre_identificador,
    p.p_tipo,
    p.l_tipo_tienda,
    p.digital,
    p.monto,
    COALESCE(v.venta, 0),
    CASE WHEN p.monto > 0 AND v_dias_trans > 0 THEN
      (COALESCE(v.venta,0) + (COALESCE(v.venta,0) / v_dias_trans * v_dias_rest)) / p.monto
    ELSE 0 END,
    CASE WHEN COALESCE(m.venta,0) > 0 THEN
      (COALESCE(v.venta,0) - m.venta) / m.venta
    ELSE 0 END,
    CASE WHEN COALESCE(y.venta,0) > 0 THEN
      (COALESCE(v.venta,0) - y.venta) / y.venta
    ELSE 0 END,
    CASE WHEN v_dias_rest > 0 AND v_dias_trans > 0 AND COALESCE(v.venta,0) > 0 THEN
      ((p.monto - COALESCE(v.venta,0)) / v_dias_rest) / (COALESCE(v.venta,0) / v_dias_trans) - 1
    ELSE 0 END,
    CASE WHEN COALESCE(v.pedidos,0) > 0 THEN
      COALESCE(v.venta,0) / v.pedidos
    ELSE 0 END,
    CASE WHEN COALESCE(v.pedidos,0) > 0 THEN
      COALESCE(v.unidades,0)::numeric / v.pedidos
    ELSE 0 END,
    CASE WHEN COALESCE(v.bruta,0) > 0 THEN
      COALESCE(v.desc_total,0) / v.bruta
    ELSE 0 END,
    COALESCE(st.active, false),
    st.s_at,
    CASE WHEN sm2.avg_pre > 0 THEN
      (sm2.avg_post - sm2.avg_pre) / sm2.avg_pre
    ELSE 0 END
  FROM pres p
  LEFT JOIN va v ON v.loc_id = p.loc_id
  LEFT JOIN vm m ON m.loc_id = p.loc_id
  LEFT JOIN vy y ON y.loc_id = p.loc_id
  LEFT JOIN stmp st ON st.location_name = p.nombre_identificador
  LEFT JOIN sm sm2 ON sm2.location_name = p.nombre_identificador;
END;
$$;
