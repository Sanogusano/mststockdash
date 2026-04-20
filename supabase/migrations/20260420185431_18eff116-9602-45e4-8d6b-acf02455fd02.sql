CREATE OR REPLACE FUNCTION public.reporte_ventas_por_vendedor(
  p_anio integer,
  p_mes integer,
  p_location_id text DEFAULT NULL::text,
  p_zona text DEFAULT NULL::text
)
RETURNS TABLE(
  shopify_user_id text,
  nombre_vendedor text,
  rol text,
  tipo_contrato text,
  tienda text,
  total_pedidos bigint,
  unidades_vendidas bigint,
  venta_bruta numeric,
  venta_neta numeric,
  ticket_promedio numeric,
  upt numeric,
  presupuesto numeric,
  pct_cumplimiento numeric,
  pct_full_price numeric,
  pct_rebajas numeric,
  pct_activaciones numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio timestamptz;
  v_fin    timestamptz;
BEGIN
  v_inicio := make_timestamptz(p_anio, p_mes, 1, 0, 0, 0, 'America/Bogota');
  v_fin    := v_inicio + interval '1 month';

  RETURN QUERY
  WITH
  -- Items de los pedidos del periodo (ya filtrados por canal/zona y categorías excluidas)
  items_periodo AS (
    SELECT
      o.user_id                     AS uid,
      o.shopify_order_id            AS oid,
      o.location_id                 AS loc_id,
      oi.quantity::numeric          AS qty,
      oi.price::numeric             AS price,
      COALESCE(oi.manual_discount_amount, 0)::numeric AS desc_manual,
      COALESCE(oi.is_markdown, false) AS is_md,
      COALESCE(oi.compare_at_price, 0)::numeric AS cap,
      ((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount, 0)::numeric) / 1.19 AS valor_neto
    FROM orders o
    JOIN order_items oi  ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_inicio
      AND o.created_at <  v_fin
      AND o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND o.user_id IS NOT NULL
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND (p_zona IS NULL OR o.location_id IN (
        SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true
      ))
  ),
  -- Agregado por pedido para calcular tickets/upt
  ventas_orden AS (
    SELECT
      uid,
      oid,
      MAX(loc_id)              AS loc_id,
      SUM(qty)                 AS und_orden,
      SUM(valor_neto)          AS valor_neto_orden
    FROM items_periodo
    GROUP BY uid, oid
  ),
  -- Resumen de ventas por vendedor
  resumen AS (
    SELECT
      vo.uid,
      COUNT(*)::bigint                                                    AS pedidos,
      COALESCE(SUM(vo.und_orden), 0)::numeric                             AS unidades,
      COALESCE(SUM(vo.valor_neto_orden), 0)::numeric                      AS venta_net,
      ROUND(COALESCE(SUM(vo.valor_neto_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket,
      ROUND(COALESCE(SUM(vo.und_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric        AS upt_val,
      -- Tienda principal del vendedor en el periodo (la que más unidades acumuló)
      (
        SELECT vo2.loc_id
        FROM ventas_orden vo2
        WHERE vo2.uid = vo.uid
        GROUP BY vo2.loc_id
        ORDER BY SUM(vo2.und_orden) DESC NULLS LAST
        LIMIT 1
      )                                                                   AS loc_top
    FROM ventas_orden vo
    GROUP BY vo.uid
  ),
  -- Mix por unidades (full / rebajas / activaciones)
  mix_vendedor AS (
    SELECT
      ip.uid,
      SUM(ip.qty)                                                         AS und_total,
      SUM(CASE
            WHEN ip.is_md OR (ip.cap > 0 AND ip.cap > ip.price) THEN ip.qty
            ELSE 0
          END)                                                            AS und_rebajas,
      SUM(CASE
            WHEN NOT (ip.is_md OR (ip.cap > 0 AND ip.cap > ip.price))
             AND ip.desc_manual > 0 THEN ip.qty
            ELSE 0
          END)                                                            AS und_activaciones,
      SUM(CASE
            WHEN NOT (ip.is_md OR (ip.cap > 0 AND ip.cap > ip.price))
             AND ip.desc_manual = 0 THEN ip.qty
            ELSE 0
          END)                                                            AS und_full
    FROM items_periodo ip
    GROUP BY ip.uid
  ),
  -- Cantidad de vendedores activos por tienda (para repartir presupuesto de tienda)
  vendedores_por_tienda AS (
    SELECT location_id, COUNT(*)::numeric AS n_vendedores
    FROM staff_members
    WHERE is_active = true
      AND location_id IS NOT NULL
      AND rol IN ('vendedor','personal_shopper')
    GROUP BY location_id
  ),
  -- Presupuesto individual por vendedor (match por nombre)
  pres_individual AS (
    SELECT pc.nombre_identificador, pc.monto
    FROM presupuestos_config pc
    WHERE pc.anio = p_anio AND pc.mes = p_mes AND pc.tipo = 'vendedor'
  ),
  -- Presupuesto por tienda
  pres_tienda AS (
    SELECT pc.nombre_identificador, pc.monto
    FROM presupuestos_config pc
    WHERE pc.anio = p_anio AND pc.mes = p_mes AND pc.tipo = 'tienda'
  )
  SELECT
    r.uid::text                                                          AS shopify_user_id,
    COALESCE(sm.nombre, 'Vendedor ' || r.uid)::text                      AS nombre_vendedor,
    COALESCE(sm.rol, 'vendedor')::text                                   AS rol,
    COALESCE(sm.tipo_contrato, 'fijo')::text                             AS tipo_contrato,
    COALESCE(l.name, l_top.name, 'Sin tienda')::text                     AS tienda,
    r.pedidos                                                            AS total_pedidos,
    r.unidades::bigint                                                   AS unidades_vendidas,
    ROUND(r.venta_net * 1.19, 0)::numeric                                AS venta_bruta,
    ROUND(r.venta_net, 0)::numeric                                       AS venta_neta,
    r.ticket                                                             AS ticket_promedio,
    r.upt_val                                                            AS upt,
    -- Presupuesto: individual si existe; si no, presupuesto de tienda / # vendedores
    COALESCE(
      pi.monto,
      CASE
        WHEN pt.monto IS NOT NULL AND COALESCE(vt.n_vendedores, 0) > 0
          THEN ROUND(pt.monto / vt.n_vendedores, 0)
        ELSE 0
      END,
      0
    )::numeric                                                           AS presupuesto,
    -- % Cumplimiento
    CASE
      WHEN COALESCE(
        pi.monto,
        CASE WHEN pt.monto IS NOT NULL AND COALESCE(vt.n_vendedores, 0) > 0
             THEN pt.monto / vt.n_vendedores ELSE 0 END,
        0
      ) > 0
      THEN ROUND(
        (r.venta_net / COALESCE(
          pi.monto,
          pt.monto / NULLIF(vt.n_vendedores, 0),
          1
        )) * 100, 2)
      ELSE 0
    END::numeric                                                         AS pct_cumplimiento,
    -- Mix
    CASE WHEN COALESCE(mx.und_total, 0) > 0
         THEN ROUND((COALESCE(mx.und_full, 0)         / mx.und_total) * 100, 2)
         ELSE 0 END::numeric                                             AS pct_full_price,
    CASE WHEN COALESCE(mx.und_total, 0) > 0
         THEN ROUND((COALESCE(mx.und_rebajas, 0)      / mx.und_total) * 100, 2)
         ELSE 0 END::numeric                                             AS pct_rebajas,
    CASE WHEN COALESCE(mx.und_total, 0) > 0
         THEN ROUND((COALESCE(mx.und_activaciones, 0) / mx.und_total) * 100, 2)
         ELSE 0 END::numeric                                             AS pct_activaciones
  FROM resumen r
  LEFT JOIN staff_members sm   ON sm.shopify_user_id = r.uid
  LEFT JOIN locations l        ON sm.location_id = l.location_id
  LEFT JOIN locations l_top    ON l_top.location_id = r.loc_top
  LEFT JOIN mix_vendedor mx    ON mx.uid = r.uid
  LEFT JOIN pres_individual pi ON pi.nombre_identificador = sm.nombre
  LEFT JOIN locations l_pres   ON l_pres.location_id = COALESCE(sm.location_id, r.loc_top)
  LEFT JOIN pres_tienda pt     ON pt.nombre_identificador = l_pres.name
  LEFT JOIN vendedores_por_tienda vt ON vt.location_id = COALESCE(sm.location_id, r.loc_top)
  ORDER BY r.venta_net DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reporte_ventas_por_vendedor(integer, integer, text, text) TO authenticated, anon;