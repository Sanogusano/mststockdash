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
    v_operador text;
    v_cp_activa boolean; v_cp_min numeric;
    v_upt_activa boolean; v_upt_min numeric;
    v_fp_activa boolean;  v_fp_min numeric;
    v_tk_activa boolean;  v_tk_min numeric;
    v_monto_bono numeric;
BEGIN
    SELECT * INTO v_inc FROM incentivos WHERE id = p_incentivo_id;
    SELECT * INTO v_regla FROM incentivo_reglas WHERE incentivo_id = p_incentivo_id LIMIT 1;
    SELECT * INTO v_recompensa FROM incentivo_recompensas WHERE incentivo_id = p_incentivo_id LIMIT 1;

    IF v_inc.id IS NULL OR v_regla.id IS NULL THEN RETURN; END IF;

    DELETE FROM incentivo_liquidaciones WHERE incentivo_id = p_incentivo_id;

    IF v_regla.tipo_regla = 'tienda_cumplimiento' THEN
        v_operador   := UPPER(COALESCE(v_regla.parametros->>'operador', 'AND'));
        v_cp_activa  := COALESCE((v_regla.parametros#>>'{condiciones,cumplimiento_presupuesto_pct,activa}')::boolean, false);
        v_cp_min     := COALESCE((v_regla.parametros#>>'{condiciones,cumplimiento_presupuesto_pct,min}')::numeric, 0);
        v_upt_activa := COALESCE((v_regla.parametros#>>'{condiciones,upt,activa}')::boolean, false);
        v_upt_min    := COALESCE((v_regla.parametros#>>'{condiciones,upt,min}')::numeric, 0);
        v_fp_activa  := COALESCE((v_regla.parametros#>>'{condiciones,full_price_pct,activa}')::boolean, false);
        v_fp_min     := COALESCE((v_regla.parametros#>>'{condiciones,full_price_pct,min}')::numeric, 0);
        v_tk_activa  := COALESCE((v_regla.parametros#>>'{condiciones,ticket_promedio,activa}')::boolean, false);
        v_tk_min     := COALESCE((v_regla.parametros#>>'{condiciones,ticket_promedio,min}')::numeric, 0);
        v_monto_bono := COALESCE(v_recompensa.valor, 0);

        INSERT INTO incentivo_liquidaciones
            (incentivo_id, location_id, vendedor_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        WITH items AS (
            SELECT
                o.shopify_order_id,
                o.location_id,
                CASE
                    WHEN o.source_name = 'shopify_draft_order' THEN 'Personal Shopper'
                    WHEN o.location_id = '71474315479' OR o.source_name <> 'pos' THEN 'Tienda Online'
                    WHEN UPPER(COALESCE(l.tipo_tienda,'')) LIKE 'OUTLET%' THEN 'Outlets'
                    ELSE 'Tiendas'
                END AS canal,
                oi.quantity,
                (oi.price * oi.quantity - COALESCE(oi.manual_discount_amount, 0)) / 1.19 AS venta_neta_item,
                CASE
                    WHEN COALESCE(oi.manual_discount_amount, 0) > 0 THEN false
                    WHEN COALESCE(oi.compare_at_price, 0) > oi.price THEN false
                    WHEN COALESCE(pc.compare_at_price, 0) > oi.price THEN false
                    ELSE true
                END AS es_full_price
            FROM order_items oi
            JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            LEFT JOIN locations l ON l.location_id = o.location_id
            LEFT JOIN product_catalog pc ON pc.variant_id = oi.variant_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND o.financial_status IN ('paid', 'partially_paid', 'partially_refunded')
              AND oi.quantity > 0
              AND UPPER(TRIM(COALESCE(NULLIF(oi.category,''), pc.category, ''))) NOT IN ('BOLSA', 'INSUMOS')
        ),
        pedidos AS (
            SELECT
                shopify_order_id, location_id, canal,
                SUM(quantity) AS unidades,
                SUM(venta_neta_item) AS venta_neta,
                SUM(CASE WHEN es_full_price THEN venta_neta_item ELSE 0 END) AS venta_neta_full
            FROM items
            GROUP BY shopify_order_id, location_id, canal
        ),
        agg AS (
            SELECT
                location_id, canal,
                COUNT(*)::numeric AS pedidos,
                SUM(unidades)::numeric AS unidades,
                SUM(venta_neta)::numeric AS venta_neta,
                SUM(venta_neta_full)::numeric AS venta_neta_full
            FROM pedidos
            GROUP BY location_id, canal
        ),
        meses AS (
            SELECT gs::date AS mes_inicio
            FROM generate_series(
                date_trunc('month', v_inc.fecha_inicio),
                date_trunc('month', v_inc.fecha_fin),
                interval '1 month'
            ) gs
        ),
        presup_prorrateado AS (
            SELECT
                l.location_id,
                SUM(
                    pc.monto::numeric *
                    (LEAST(v_inc.fecha_fin,  (m.mes_inicio + interval '1 month - 1 day')::date)
                     - GREATEST(v_inc.fecha_inicio, m.mes_inicio) + 1)::numeric /
                    EXTRACT(day FROM (m.mes_inicio + interval '1 month - 1 day'))::numeric
                ) AS presupuesto
            FROM meses m
            JOIN presupuestos_config pc
              ON pc.tipo = 'tienda'
             AND pc.anio = EXTRACT(year FROM m.mes_inicio)::integer
             AND pc.mes  = EXTRACT(month FROM m.mes_inicio)::integer
             AND COALESCE(pc.monto,0) > 0
            JOIN locations l
              ON UPPER(TRIM(l.name)) = UPPER(TRIM(pc.nombre_identificador))
            GROUP BY l.location_id
        ),
        eval AS (
            SELECT
                a.*,
                CASE WHEN a.pedidos > 0 THEN a.unidades / a.pedidos ELSE 0 END AS upt,
                CASE WHEN a.venta_neta > 0 THEN (a.venta_neta_full / a.venta_neta) * 100 ELSE 0 END AS full_price_pct,
                CASE WHEN a.pedidos > 0 THEN a.venta_neta / a.pedidos ELSE 0 END AS ticket_promedio,
                pp.presupuesto AS presupuesto,
                CASE
                    WHEN a.canal IN ('Tiendas','Outlets') AND COALESCE(pp.presupuesto,0) > 0
                        THEN (a.venta_neta / pp.presupuesto) * 100
                    ELSE NULL
                END AS cumplimiento_presupuesto_pct
            FROM agg a
            LEFT JOIN presup_prorrateado pp ON pp.location_id = a.location_id
        )
        SELECT
            v_inc.id,
            e.location_id,
            CASE
                WHEN e.canal = 'Personal Shopper' THEN 'canal:personal_shopper'
                WHEN e.canal = 'Tienda Online'    THEN 'canal:online'
                ELSE NULL
            END AS vendedor_id,
            jsonb_build_object(
                'canal', e.canal,
                'upt', ROUND(e.upt, 2),
                'full_price_pct', ROUND(e.full_price_pct, 2),
                'ticket_promedio', ROUND(e.ticket_promedio, 0),
                'unidades', e.unidades,
                'pedidos', e.pedidos,
                'venta_neta', ROUND(e.venta_neta, 0),
                'presupuesto', ROUND(COALESCE(e.presupuesto,0), 0),
                'cumplimiento_presupuesto_pct',
                    CASE WHEN e.cumplimiento_presupuesto_pct IS NULL
                         THEN NULL ELSE ROUND(e.cumplimiento_presupuesto_pct, 2) END,
                'operador', v_operador,
                'condiciones_activas', (
                    SELECT jsonb_agg(x) FROM (
                        SELECT unnest(ARRAY[
                            CASE WHEN v_cp_activa  THEN 'cumplimiento_presupuesto_pct' END,
                            CASE WHEN v_upt_activa THEN 'upt' END,
                            CASE WHEN v_fp_activa  THEN 'full_price_pct' END,
                            CASE WHEN v_tk_activa  THEN 'ticket_promedio' END
                        ]) x
                    ) s WHERE x IS NOT NULL
                ),
                'metas', jsonb_build_object(
                    'cumplimiento_presupuesto_pct', v_cp_min,
                    'upt', v_upt_min,
                    'full_price_pct', v_fp_min,
                    'ticket_promedio', v_tk_min
                ),
                'resultados', jsonb_build_object(
                    'cumplimiento_presupuesto_pct',
                        CASE
                            WHEN NOT v_cp_activa THEN NULL
                            WHEN e.cumplimiento_presupuesto_pct IS NULL THEN NULL
                            ELSE (e.cumplimiento_presupuesto_pct >= v_cp_min)
                        END,
                    'upt',              CASE WHEN v_upt_activa THEN (e.upt >= v_upt_min) END,
                    'full_price_pct',   CASE WHEN v_fp_activa  THEN (e.full_price_pct >= v_fp_min) END,
                    'ticket_promedio',  CASE WHEN v_tk_activa  THEN (e.ticket_promedio >= v_tk_min) END
                ),
                'tipo_pago', COALESCE(v_recompensa.tipo_pago,''),
                'parametros_pago', COALESCE(v_recompensa.parametros_pago, '{}'::jsonb)
            ),
            CASE
                WHEN NOT (v_cp_activa OR v_upt_activa OR v_fp_activa OR v_tk_activa) THEN false
                WHEN v_operador = 'OR' THEN
                    (v_cp_activa AND e.cumplimiento_presupuesto_pct IS NOT NULL AND e.cumplimiento_presupuesto_pct >= v_cp_min)
                    OR (v_upt_activa AND e.upt >= v_upt_min)
                    OR (v_fp_activa AND e.full_price_pct >= v_fp_min)
                    OR (v_tk_activa AND e.ticket_promedio >= v_tk_min)
                ELSE
                    (NOT v_cp_activa OR e.cumplimiento_presupuesto_pct IS NULL OR e.cumplimiento_presupuesto_pct >= v_cp_min)
                    AND (NOT v_upt_activa OR e.upt >= v_upt_min)
                    AND (NOT v_fp_activa OR e.full_price_pct >= v_fp_min)
                    AND (NOT v_tk_activa OR e.ticket_promedio >= v_tk_min)
            END AS cumple,
            0::numeric,
            now()
        FROM eval e;

        UPDATE incentivo_liquidaciones
        SET monto_ganado = CASE
            WHEN cumple_meta IS TRUE
                 AND COALESCE(v_recompensa.tipo_pago,'') IN ('monto_fijo','bono_monto') THEN v_monto_bono
            ELSE 0
        END
        WHERE incentivo_id = p_incentivo_id;

        RETURN;
    END IF;

    IF v_regla.tipo_regla = 'presupuesto_semanal_dual' THEN
        v_semanas_mes := COALESCE((v_regla.parametros->>'semanas_mes')::integer, 4);
        v_ticket_meta := COALESCE((v_regla.parametros->>'ticket_meta')::numeric, 700000);
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
                SELECT
                    o.shopify_order_id, o.location_id,
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
                WHERE CASE WHEN v_tipo_ticket = 'minimo_real' THEN valor_neto_pedido >= v_ticket_meta ELSE TRUE END
            ),
            ventas_tienda AS (
                SELECT location_id, SUM(valor_neto_pedido) AS venta_neta, COUNT(*) AS transacciones
                FROM pedidos_filtrados GROUP BY location_id
            ),
            metas AS (
                SELECT l.location_id,
                    ((pc.monto * v_factor_prorrateo) / v_semanas_mes) AS meta_semanal,
                    (((pc.monto * v_factor_prorrateo) / v_semanas_mes) / v_ticket_meta) AS tx_requeridas
                FROM presupuestos_config pc
                JOIN locations l ON UPPER(TRIM(l.name)) = UPPER(TRIM(pc.nombre_identificador))
                WHERE pc.anio = EXTRACT(year FROM v_inc.fecha_inicio)
                  AND pc.mes  = EXTRACT(month FROM v_inc.fecha_inicio)
                  AND pc.tipo = 'tienda' AND pc.monto > 0
            )
            SELECT v_inc.id, m.location_id,
                jsonb_build_object(
                    'semana', v_semana, 'semana_inicio', v_sem_inicio, 'semana_fin', v_sem_fin,
                    'venta_lograda', COALESCE(vt.venta_neta, 0),
                    'meta_semanal', ROUND(m.meta_semanal, 0),
                    'tx_logradas', COALESCE(vt.transacciones, 0),
                    'tx_requeridas', ROUND(m.tx_requeridas, 0),
                    'factor_prorrateo', ROUND(v_factor_prorrateo, 4),
                    'tipo_ticket', v_tipo_ticket, 'ticket_meta', v_ticket_meta
                ),
                (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas),
                CASE WHEN (COALESCE(vt.venta_neta, 0) >= m.meta_semanal AND COALESCE(vt.transacciones, 0) >= m.tx_requeridas)
                     THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
                now()
            FROM metas m LEFT JOIN ventas_tienda vt ON vt.location_id = m.location_id;
        END LOOP;
        RETURN;
    END IF;

    IF v_regla.tipo_regla = 'venta_sku' THEN
        v_skus := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'skus', '[]'::jsonb)));
        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        SELECT v_inc.id, o.user_id, o.location_id,
            jsonb_build_object('unidades_vendidas', SUM(oi.quantity)),
            SUM(oi.quantity) >= v_regla.valor_objetivo,
            CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM order_items oi JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
          AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
          AND oi.sku = ANY(v_skus) AND o.user_id IS NOT NULL
        GROUP BY o.user_id, o.location_id;
        RETURN;
    END IF;

    IF v_regla.tipo_regla = 'venta_categoria' THEN
        v_categorias := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_regla.parametros->'categorias', '[]'::jsonb)));
        INSERT INTO incentivo_liquidaciones (incentivo_id, vendedor_id, location_id, progreso_actual, cumple_meta, monto_ganado, ultima_actualizacion)
        SELECT v_inc.id, o.user_id, o.location_id,
            jsonb_build_object('unidades_vendidas', SUM(oi.quantity)),
            SUM(oi.quantity) >= v_regla.valor_objetivo,
            CASE WHEN SUM(oi.quantity) >= v_regla.valor_objetivo THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM order_items oi JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
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
            SELECT o.shopify_order_id, o.user_id, o.location_id,
                SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0))/1.19) AS valor_neto,
                SUM(oi.quantity) AS unidades
            FROM order_items oi JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
            WHERE o.created_at >= v_inc.fecha_inicio::timestamp AT TIME ZONE 'America/Bogota'
              AND o.created_at < (v_inc.fecha_fin + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
              AND o.user_id IS NOT NULL
            GROUP BY o.shopify_order_id, o.user_id, o.location_id
        ),
        califican AS (
            SELECT * FROM pedidos
            WHERE CASE
                WHEN v_regla.tipo_regla = 'ticket_minimo' THEN valor_neto >= v_ticket_minimo
                WHEN v_regla.tipo_regla = 'upt_minimo'    THEN unidades   >= COALESCE((v_regla.parametros->>'unidades_minimas')::numeric, 0)
                ELSE TRUE
            END
        )
        SELECT v_inc.id, user_id, location_id,
            jsonb_build_object(
                'tx_que_cumplen', COUNT(*),
                'tx_totales', COUNT(*),
                'ticket_minimo', v_ticket_minimo,
                'unidades_minimas', COALESCE((v_regla.parametros->>'unidades_minimas')::numeric, 0)
            ),
            COUNT(*) >= COALESCE((v_regla.parametros->>'meta_transacciones')::numeric, v_regla.valor_objetivo),
            CASE WHEN COUNT(*) >= COALESCE((v_regla.parametros->>'meta_transacciones')::numeric, v_regla.valor_objetivo)
                 THEN COALESCE(v_recompensa.valor, 0) ELSE 0 END,
            now()
        FROM califican
        GROUP BY user_id, location_id;
        RETURN;
    END IF;
END;
$function$;