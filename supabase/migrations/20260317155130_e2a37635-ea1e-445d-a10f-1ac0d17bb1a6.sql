CREATE OR REPLACE FUNCTION public.calcular_proyecciones_y_cumplimiento(p_anio integer, p_mes integer)
RETURNS TABLE(
  nombre text,
  tipo text,
  zona text,
  venta_actual numeric,
  presupuesto_mes numeric,
  dias_transcurridos integer,
  dias_mes integer,
  pct_cumplimiento_general numeric,
  pct_cumplimiento_fecha numeric,
  cierre_conservador numeric,
  cierre_probable numeric,
  cierre_optimista numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inicio_mes  timestamptz;
  v_fin_mes     timestamptz;
  v_ahora       timestamptz;
  v_dias_mes    integer;
  v_dias_trans  integer;
  v_dias_rest   integer;
BEGIN
  -- Límites del mes en zona horaria Colombia
  v_inicio_mes := make_timestamptz(p_anio, p_mes, 1, 0, 0, 0, 'America/Bogota');
  v_fin_mes    := (v_inicio_mes + interval '1 month');
  v_ahora      := now() AT TIME ZONE 'America/Bogota';

  -- Total de días del mes
  v_dias_mes := extract(day from (v_fin_mes AT TIME ZONE 'America/Bogota') - interval '1 day')::integer;

  -- Días transcurridos: si estamos en el mes actual, usar día actual; si no, mes completo
  IF p_anio = extract(year from v_ahora)::integer
     AND p_mes = extract(month from v_ahora)::integer THEN
    v_dias_trans := extract(day from v_ahora)::integer;
  ELSE
    v_dias_trans := v_dias_mes;
  END IF;

  v_dias_rest := v_dias_mes - v_dias_trans;

  RETURN QUERY
  WITH ventas_netas AS (
    SELECT
      o.location_id,
      o.source_name,
      SUM(oi.price * oi.quantity / 1.19) AS venta_neta
    FROM order_items oi
    INNER JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    WHERE o.created_at >= v_inicio_mes
      AND o.created_at <  v_fin_mes
      AND COALESCE(oi.category, '') NOT IN ('BOLSA', 'INSUMO')
    GROUP BY o.location_id, o.source_name
  ),
  -- Clasificar cada venta como tienda o canal
  ventas_clasificadas AS (
    SELECT
      CASE
        WHEN l.location_id IS NOT NULL THEN l.name
        ELSE COALESCE(vn.source_name, 'Otros')
      END AS nombre,
      CASE
        WHEN l.location_id IS NOT NULL THEN 'tienda'
        ELSE 'canal'
      END AS tipo,
      l.zona,
      COALESCE(vn.venta_neta, 0) AS venta_neta
    FROM ventas_netas vn
    LEFT JOIN locations l ON l.location_id = vn.location_id AND l.is_active = true
  ),
  -- Agrupar por nombre/tipo/zona
  ventas_agrupadas AS (
    SELECT
      vc.nombre,
      vc.tipo,
      vc.zona,
      SUM(vc.venta_neta) AS venta_actual
    FROM ventas_clasificadas vc
    GROUP BY vc.nombre, vc.tipo, vc.zona
  ),
  -- Presupuestos
  presupuestos AS (
    SELECT
      pc.nombre_identificador,
      pc.tipo,
      pc.monto
    FROM presupuestos_config pc
    WHERE pc.anio = p_anio AND pc.mes = p_mes
  ),
  -- Combinar ventas con presupuestos
  combinado AS (
    SELECT
      COALESCE(va.nombre, pr.nombre_identificador) AS nombre,
      COALESCE(va.tipo, pr.tipo) AS tipo,
      va.zona,
      COALESCE(va.venta_actual, 0) AS venta_actual,
      COALESCE(pr.monto, 0) AS presupuesto_mes
    FROM ventas_agrupadas va
    FULL OUTER JOIN presupuestos pr
      ON va.nombre = pr.nombre_identificador AND va.tipo = pr.tipo
  )
  SELECT
    c.nombre,
    c.tipo,
    c.zona,
    c.venta_actual,
    c.presupuesto_mes,
    v_dias_trans AS dias_transcurridos,
    v_dias_mes AS dias_mes,
    -- % Cumplimiento General = Venta / Presupuesto Total
    CASE WHEN c.presupuesto_mes > 0
      THEN ROUND((c.venta_actual / c.presupuesto_mes) * 100, 2)
      ELSE 0
    END AS pct_cumplimiento_general,
    -- % Cumplimiento a la Fecha = Venta / (Presupuesto * dias_trans / dias_mes)
    CASE WHEN c.presupuesto_mes > 0 AND v_dias_trans > 0
      THEN ROUND((c.venta_actual / (c.presupuesto_mes * v_dias_trans::numeric / v_dias_mes)) * 100, 2)
      ELSE 0
    END AS pct_cumplimiento_fecha,
    -- Proyecciones basadas en run rate diario sobre días restantes
    CASE WHEN v_dias_trans > 0
      THEN ROUND(c.venta_actual + ((c.venta_actual / v_dias_trans) * 0.85 * v_dias_rest), 0)
      ELSE 0
    END AS cierre_conservador,
    CASE WHEN v_dias_trans > 0
      THEN ROUND(c.venta_actual + ((c.venta_actual / v_dias_trans) * v_dias_rest), 0)
      ELSE 0
    END AS cierre_probable,
    CASE WHEN v_dias_trans > 0
      THEN ROUND(c.venta_actual + ((c.venta_actual / v_dias_trans) * 1.15 * v_dias_rest), 0)
      ELSE 0
    END AS cierre_optimista
  FROM combinado c
  ORDER BY c.tipo, c.zona NULLS LAST, c.nombre;
END;
$$;