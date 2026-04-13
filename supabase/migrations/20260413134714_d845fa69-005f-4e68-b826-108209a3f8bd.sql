
CREATE OR REPLACE FUNCTION public.actualizar_progreso_incentivo(p_incentivo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inc RECORD;
    v_regla RECORD;
    v_recompensa RECORD;
    v_semanas_mes integer;
    v_ticket_meta numeric;
    v_semana integer;
    v_sem_inicio date;
    v_sem_fin date;
    v_dias_total integer;
    v_dias_por_semana integer;
BEGIN
    SELECT * INTO v_inc FROM incentivos WHERE id = p_incentivo_id;
    SELECT * INTO v_regla FROM incentivo_reglas WHERE incentivo_id = p_incentivo_id LIMIT 1;
    SELECT * INTO v_recompensa FROM incentivo_recompensas WHERE incentivo_id = p_incentivo_id LIMIT 1;

    IF v_inc.id IS NULL OR v_regla.id IS NULL THEN RETURN; END IF;

    IF v_regla.tipo_regla = 'presupuesto_semanal_dual' THEN
        v_semanas_mes := COALESCE((v_regla.parametros->>'semanas_mes')::integer, 4);
        v_ticket_meta := COALESCE((v_regla.parametros->>'ticket_meta')::numeric, 700000);
        v_dias_total := (v_inc.fecha_fin - v_inc.fecha_inicio + 1);
        v_dias_por_semana := GREATEST(v_dias_total / v_semanas_mes, 1);

        -- Delete old liquidaciones for this incentivo to recalculate
        DELETE FROM incentivo_liquidaciones WHERE incentivo_id = p_incentivo_id;

        -- Loop through each week
        FOR v_semana IN 1..v_semanas_mes LOOP
            v_sem_inicio := v_inc.fecha_inicio + ((v_semana - 1) * v_dias_por_semana);
            IF v_semana = v_semanas_mes THEN
                v_sem_fin := v_inc.fecha_fin;
            ELSE
                v_sem_fin := v_inc.fecha_inicio + (v_semana * v_dias_por_semana) - 1;
            END IF;

            INSERT INTO incentivo_liquidaciones (incentivo_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
            WITH ventas_tienda AS (
                SELECT 
                    o.location_id,
                    SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0))/1.19) AS venta_neta,
                    COUNT(DISTINCT o.shopify_order_id) AS transacciones
                FROM order_items oi
                JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
                WHERE o.created_at >= v_sem_inicio::timestamp AT TIME ZONE 'America/Bogota'
                  AND o.created_at < (v_sem_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
                  AND oi.quantity > 0
                GROUP BY o.location_id
            ),
            metas AS (
                SELECT 
                    l.location_id,
                    (pc.monto / v_semanas_mes) AS meta_semanal,
                    ((pc.monto / v_semanas_mes) / v_ticket_meta) AS tx_requeridas
                FROM presupuestos_config pc
                JOIN locations l ON UPPER(TRIM(l.name)) = UPPER(TRIM(pc.nombre_identificador))
                WHERE pc.anio = EXTRACT(year FROM v_inc.fecha_inicio)
                  AND pc.mes = EXTRACT(month FROM v_inc.fecha_inicio)
                  AND pc.tipo = 'tienda' AND pc.monto > 0
            )
            SELECT 
                v_inc.id,
                m.location_id,
                jsonb_build_object(
                    'semana', v_semana,
                    'semana_inicio', v_sem_inicio,
                    'semana_fin', v_sem_fin,
                    'venta_lograda', COALESCE(vt.venta_neta, 0),
                    'meta_semanal', ROUND(m.meta_semanal, 0),
                    'tx_logradas', COALESCE(vt.transacciones, 0),
                    'tx_requeridas', ROUND(m.tx_requeridas, 0)
                ),
                (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas),
                CASE WHEN (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas) 
                     THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM metas m
            LEFT JOIN ventas_tienda vt ON m.location_id = vt.location_id;
        END LOOP;
    END IF;
END;
$$;
