
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

    -------------------------------------------------------------------
    -- TIENDA CUMPLIMIENTO (% Presup / UPT / % Full Price / Ticket Promedio)
    -------------------------------------------------------------------
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
              AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS')
        ),
        pedidos AS (
            SELECT
                shopify_order_id,
                location_id,
                canal,
                SUM(quantity)      AS unidades,
                SUM(venta_neta_item) AS venta_neta,
                SUM(CASE WHEN es_full_price THEN venta_neta_item ELSE 0 END) AS venta_neta_full
            FROM items
            GROUP BY shopify_order_id, location_id, canal
        ),
        agg AS (
            SELECT
                location_id,
                canal,
                COUNT(*)::numeric        AS pedidos,
                SUM(unidades)::numeric   AS unidades,
                SUM(venta_neta)::numeric AS venta_neta,
                SUM(venta_neta_full)::numeric AS venta_neta_full
            FROM agg_placeholder
        )
        -- Reemplazamos agg para usar pedidos (evitamos placeholder abajo)
        SELECT 1 WHERE FALSE;
        RETURN;
    END IF;
    RETURN;
END;
$function$;
