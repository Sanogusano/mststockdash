
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_now timestamptz;
  v_today date;
  v_dias_mes integer;
  v_dias_transcurridos integer;
  v_is_current boolean;
BEGIN
  -- Month boundaries
  v_start := make_date(p_anio, p_mes, 1);
  v_end := (v_start + interval '1 month')::date;
  v_dias_mes := extract(day from (v_end - interval '1 day'))::integer;

  -- Current date in Colombia timezone
  v_now := now() AT TIME ZONE 'America/Bogota';
  v_today := v_now::date;
  v_is_current := (extract(year from v_today) = p_anio AND extract(month from v_today) = p_mes);

  IF v_is_current THEN
    v_dias_transcurridos := extract(day from v_today)::integer;
  ELSE
    v_dias_transcurridos := v_dias_mes;
  END IF;

  RETURN QUERY
  WITH ventas_por_location AS (
    -- Net sales per location: SUM(price * quantity) / 1.19, excluding BOLSA & INSUMO
    SELECT
      o.location_id,
      SUM(oi.price * oi.quantity) / 1.19 AS venta_neta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= v_start::timestamptz
      AND o.created_at < v_end::timestamptz
      AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMO')
    GROUP BY o.location_id
  ),
  -- Map locations to presupuestos_config names
  store_sales AS (
    SELECT
      l.name AS nombre_cfg,
      COALESCE(v.venta_neta, 0) AS venta
    FROM locations l
    LEFT JOIN ventas_por_location v ON v.location_id = l.location_id
    WHERE l.is_active = true
  ),
  -- Channel sales: digital location + non-POS source
  channel_sales AS (
    SELECT
      CASE
        WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
        WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN 'Tienda Online'
        ELSE NULL
      END AS canal,
      SUM(oi.price * oi.quantity) / 1.19 AS venta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= v_start::timestamptz
      AND o.created_at < v_end::timestamptz
      AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMO')
      AND (o.source_name = 'shopify_draft_order' OR o.location_id = '71474315479' OR o.source_name != 'pos')
    GROUP BY canal
  ),
  config_rows AS (
    SELECT
      pc.nombre_identificador,
      pc.tipo AS cfg_tipo,
      pc.monto
    FROM presupuestos_config pc
    WHERE pc.anio = p_anio AND pc.mes = p_mes
  ),
  combined AS (
    -- Tiendas
    SELECT
      cr.nombre_identificador AS c_nombre,
      'tienda'::text AS c_tipo,
      COALESCE(l.zona, 'Sin Zona') AS c_zona,
      COALESCE(ss.venta, 0) AS c_venta,
      cr.monto AS c_presupuesto
    FROM config_rows cr
    LEFT JOIN locations l ON l.name = cr.nombre_identificador AND l.is_active = true
    LEFT JOIN store_sales ss ON ss.nombre_cfg = cr.nombre_identificador
    WHERE cr.cfg_tipo = 'tienda'

    UNION ALL

    -- Canales
    SELECT
      cr.nombre_identificador AS c_nombre,
      'canal'::text AS c_tipo,
      NULL AS c_zona,
      COALESCE(cs.venta, 0) AS c_venta,
      cr.monto AS c_presupuesto
    FROM config_rows cr
    LEFT JOIN channel_sales cs ON cs.canal = cr.nombre_identificador
    WHERE cr.cfg_tipo = 'canal'
  )
  SELECT
    c.c_nombre,
    c.c_tipo,
    c.c_zona,
    round(c.c_venta, 2),
    round(c.c_presupuesto, 2),
    v_dias_transcurridos,
    v_dias_mes,
    CASE WHEN c.c_presupuesto > 0 THEN round((c.c_venta / c.c_presupuesto) * 100, 2) ELSE 0 END,
    CASE WHEN c.c_presupuesto > 0 THEN round((c.c_venta / (c.c_presupuesto / v_dias_mes * v_dias_transcurridos)) * 100, 2) ELSE 0 END,
    -- Conservador: actual + daily_rate * remaining * 0.85
    CASE WHEN v_dias_transcurridos > 0
      THEN round(c.c_venta + (c.c_venta / v_dias_transcurridos) * (v_dias_mes - v_dias_transcurridos) * 0.85, 2)
      ELSE 0 END,
    -- Probable: actual + daily_rate * remaining
    CASE WHEN v_dias_transcurridos > 0
      THEN round(c.c_venta + (c.c_venta / v_dias_transcurridos) * (v_dias_mes - v_dias_transcurridos), 2)
      ELSE 0 END,
    -- Optimista: actual + daily_rate * remaining * 1.15
    CASE WHEN v_dias_transcurridos > 0
      THEN round(c.c_venta + (c.c_venta / v_dias_transcurridos) * (v_dias_mes - v_dias_transcurridos) * 1.15, 2)
      ELSE 0 END
  FROM combined c;
END;
$$;
