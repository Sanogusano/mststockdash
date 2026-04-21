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
    v_dias_mes integer;
    v_factor_prorrateo numeric;
    v_skus text[];
    v_categorias text[];
    v_ticket_minimo numeric;
BEGIN
    SELECT * INTO v_inc FROM incentivos WHERE id = p_incentivo_id;
    SELECT * INTO v_regla FROM incentivo_reglas WHERE incentivo_id = p_incentivo_id LIMIT 1;
    SELECT * INTO v_recompensa FROM incentivo_recompensas WHERE incentivo_id = p_incentivo_id LIMIT 1;

    IF v_inc.id IS NULL OR v_regla.id IS NULL THEN RETURN; END IF;

    DELETE FROM incentivo_liquidaciones WHERE incentivo_id = p_incentivo_id;

    IF v_regla.tipo_regla = 'presupuesto_semanal_dual' THEN
        v_semanas_mes := COALESCE((v_regla.parametros->>'semanas_mes')::integer, 4);
        v_ticket_meta := COALESCE((v_regla.parametros->>'ticket_meta')::numeric, 700000);
        v_dias_total := (v_inc.fecha_fin - v_inc.fecha_inicio + 1);
        v_dias_por_semana := GREATEST(v_dias_total / v_semanas_mes, 1);

        -- Días del mes calendario al que pertenece el incentivo (basado en fecha_inicio)
        v_dias_mes := EXTRACT(day FROM (date_trunc('month', v_inc.fecha_inicio) + interval '1 month - 1 day'))::integer;
        -- Factor de prorrateo: qué porción del mes cubre el incentivo
        v_factor_prorrateo := v_dias_total::numeric / v_dias_mes::numeric;

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
                    -- Prorratea el presupuesto mensual al periodo del incentivo, luego divide por semanas
                    ((pc.monto * v_factor_prorrateo) / v_semanas_mes) AS meta_semanal,
                    (((pc.monto * v_factor_prorrateo) / v_semanas_mes) / v_ticket_meta) AS tx_requeridas
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
                    'tx_requeridas', ROUND(m.tx_requeridas, 0),
                    'factor_prorrateo', ROUND(v_factor_prorrateo, 4)
                ),
                (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas),
                CASE WHEN (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas) 
                     THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM metas m
            LEFT JOIN ventas_tienda vt ON m.location_id = vt.location_id;
        END LOOP;

    ELSIF v_regla.tipo_regla = 'venta_sku' THEN
        SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'skus', '[]'::jsonb))) INTO v_skus;
        IF v_skus IS NULL OR array_length(v_skus, 1) IS NULL THEN RETURN; END IF;

        IF v_inc.alcance = 'asesor' THEN
            INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
            SELECT
                v_inc.id, o.user_id, MAX(o.location_id),
                jsonb_build_object('unidades_vendidas', SUM(oi.quantity), 'meta', v_regla.valor_objetivo, 'skus', to_jsonb(v_skus)),
                (SUM(oi.quantity) >= v_regla.valor_objetivo),
                CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM order_items oi
            JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND oi.quantity > 0 AND oi.sku = ANY(v_skus) AND o.user_id IS NOT NULL
            GROUP BY o.user_id;
        ELSE
            INSERT INTO incentivo_liquidaciones (incentivo_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
            SELECT
                v_inc.id, o.location_id,
                jsonb_build_object('unidades_vendidas', SUM(oi.quantity), 'meta', v_regla.valor_objetivo, 'skus', to_jsonb(v_skus)),
                (SUM(oi.quantity) >= v_regla.valor_objetivo),
                CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM order_items oi
            JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND oi.quantity > 0 AND oi.sku = ANY(v_skus) AND o.location_id IS NOT NULL
            GROUP BY o.location_id;
        END IF;

    ELSIF v_regla.tipo_regla = 'venta_categoria' THEN
        SELECT ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'categorias', '[]'::jsonb))) INTO v_categorias;
        IF v_categorias IS NULL OR array_length(v_categorias, 1) IS NULL THEN RETURN; END IF;

        IF v_inc.alcance = 'asesor' THEN
            INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
            SELECT
                v_inc.id, o.user_id, MAX(o.location_id),
                jsonb_build_object('unidades_vendidas', SUM(oi.quantity), 'meta', v_regla.valor_objetivo, 'categorias', to_jsonb(v_categorias)),
                (SUM(oi.quantity) >= v_regla.valor_objetivo),
                CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM order_items oi
            JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND oi.quantity > 0
              AND UPPER(TRIM(oi.category)) = ANY(SELECT UPPER(TRIM(c)) FROM unnest(v_categorias) c)
              AND o.user_id IS NOT NULL
            GROUP BY o.user_id;
        END IF;

    ELSIF v_regla.tipo_regla IN ('ticket_minimo', 'upt_minimo', 'numero_pedidos') THEN
        v_ticket_minimo := COALESCE((v_regla.parametros->>'ticket_minimo')::numeric, 0);

        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        SELECT
            v_inc.id, o.user_id, MAX(o.location_id),
            jsonb_build_object('transacciones', COUNT(DISTINCT o.shopify_order_id), 'meta', v_regla.valor_objetivo, 'ticket_minimo', v_ticket_minimo),
            (COUNT(DISTINCT o.shopify_order_id) >= v_regla.valor_objetivo),
            CASE WHEN COUNT(DISTINCT o.shopify_order_id) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM orders o
        WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
          AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
          AND o.user_id IS NOT NULL
          AND (v_ticket_minimo = 0 OR o.total_price >= v_ticket_minimo)
        GROUP BY o.user_id;
    END IF;
END;
$$;