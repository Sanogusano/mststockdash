CREATE OR REPLACE FUNCTION public.actualizar_progreso_incentivo(p_incentivo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_inc RECORD;
    v_regla RECORD;
    v_recompensa RECORD;
    v_semanas_mes integer;
    v_ticket_meta numeric;
    v_tipo_ticket text;
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
        -- Default 'minimo_real' (nueva lógica). Acepta 'promedio_esperado' para modo anterior.
        v_tipo_ticket := COALESCE(v_regla.parametros->>'tipo_ticket', 'minimo_real');
        v_dias_total := (v_inc.fecha_fin - v_inc.fecha_inicio + 1);
        v_dias_por_semana := GREATEST(v_dias_total / v_semanas_mes, 1);

        v_dias_mes := EXTRACT(day FROM (date_trunc('month', v_inc.fecha_inicio) + interval '1 month - 1 day'))::integer;
        v_factor_prorrateo := v_dias_total::numeric / v_dias_mes::numeric;

        FOR v_semana IN 1..v_semanas_mes LOOP
            v_sem_inicio := v_inc.fecha_inicio + ((v_semana - 1) * v_dias_por_semana);
            IF v_semana = v_semanas_mes THEN
                v_sem_fin := v_inc.fecha_fin;
            ELSE
                v_sem_fin := v_inc.fecha_inicio + (v_semana * v_dias_por_semana) - 1;
            END IF;

            INSERT INTO incentivo_liquidaciones (incentivo_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
            WITH pedidos_periodo AS (
                -- Calcula valor neto por pedido para poder filtrar por ticket si aplica
                SELECT 
                    o.shopify_order_id,
                    o.location_id,
                    SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0))/1.19) AS valor_neto_pedido
                FROM order_items oi
                JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
                WHERE o.created_at >= v_sem_inicio::timestamp AT TIME ZONE 'America/Bogota'
                  AND o.created_at < (v_sem_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
                  AND oi.quantity > 0
                GROUP BY o.shopify_order_id, o.location_id
            ),
            pedidos_filtrados AS (
                SELECT * FROM pedidos_periodo
                WHERE 
                    CASE 
                        WHEN v_tipo_ticket = 'minimo_real' THEN valor_neto_pedido >= v_ticket_meta
                        ELSE TRUE
                    END
            ),
            ventas_tienda AS (
                SELECT 
                    location_id,
                    SUM(valor_neto_pedido) AS venta_neta,
                    COUNT(*) AS transacciones
                FROM pedidos_filtrados
                GROUP BY location_id
            ),
            metas AS (
                SELECT 
                    l.location_id,
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
                    'factor_prorrateo', ROUND(v_factor_prorrateo, 4),
                    'tipo_ticket', v_tipo_ticket,
                    'ticket_meta', v_ticket_meta
                ),
                (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas),
                CASE WHEN (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas) 
                     THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM metas m
            LEFT JOIN ventas_tienda vt ON vt.location_id = m.location_id;
        END LOOP;

        RETURN;
    END IF;

    -- Resto de tipos de regla: delegar al comportamiento original llamando al cuerpo previo
    -- (Mantener intacto: copia de la lógica existente para los demás tipos)
    IF v_regla.tipo_regla = 'venta_sku' THEN
        v_skus := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'skus', '[]'::jsonb)));
        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        SELECT 
            v_inc.id,
            o.user_id,
            o.location_id,
            jsonb_build_object('unidades_vendidas', SUM(oi.quantity)),
            SUM(oi.quantity) >= v_regla.valor_objetivo,
            CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM order_items oi
        JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
          AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
          AND oi.sku = ANY(v_skus)
          AND o.user_id IS NOT NULL
        GROUP BY o.user_id, o.location_id;
        RETURN;
    END IF;

    IF v_regla.tipo_regla = 'venta_categoria' THEN
        v_categorias := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'categorias', '[]'::jsonb)));
        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        SELECT 
            v_inc.id,
            o.user_id,
            o.location_id,
            jsonb_build_object('unidades_vendidas', SUM(oi.quantity)),
            SUM(oi.quantity) >= v_regla.valor_objetivo,
            CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM order_items oi
        JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
          AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
          AND UPPER(oi.category) = ANY(SELECT UPPER(unnest(v_categorias)))
          AND o.user_id IS NOT NULL
        GROUP BY o.user_id, o.location_id;
        RETURN;
    END IF;

    IF v_regla.tipo_regla IN ('ticket_minimo', 'upt_minimo', 'numero_pedidos') THEN
        v_ticket_minimo := COALESCE((v_regla.parametros->>'valor_ticket_minimo')::numeric,
                                     (v_regla.parametros->>'ticket_promedio_minimo')::numeric, 0);
        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        WITH pedidos AS (
            SELECT 
                o.shopify_order_id, o.user_id, o.location_id,
                SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0))/1.19) AS valor_neto,
                SUM(oi.quantity) AS unidades
            FROM order_items oi
            JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND o.user_id IS NOT NULL
            GROUP BY o.shopify_order_id, o.user_id, o.location_id
        ),
        califican AS (
            SELECT * FROM pedidos
            WHERE 
                CASE v_regla.tipo_regla
                    WHEN 'ticket_minimo' THEN valor_neto >= v_ticket_minimo
                    WHEN 'upt_minimo' THEN unidades >= COALESCE((v_regla.parametros->>'unidades_minimas')::numeric, 0)
                    WHEN 'numero_pedidos' THEN valor_neto >= v_ticket_minimo
                    ELSE FALSE
                END
        )
        SELECT 
            v_inc.id, user_id, location_id,
            jsonb_build_object('pedidos_calificados', COUNT(*), 'venta_total', SUM(valor_neto)),
            COUNT(*) >= v_regla.valor_objetivo,
            CASE WHEN COUNT(*) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM califican
        GROUP BY user_id, location_id;
        RETURN;
    END IF;
END;
$function$;