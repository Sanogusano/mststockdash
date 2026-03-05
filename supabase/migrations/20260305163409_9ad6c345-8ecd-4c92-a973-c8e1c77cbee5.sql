
CREATE OR REPLACE FUNCTION public.reporte_kpis_por_rango(
  p_desde date,
  p_hasta date,
  p_canal text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_zona text DEFAULT NULL
)
RETURNS TABLE(
  total_pedidos bigint,
  unidades_vendidas bigint,
  ingresos_netos numeric,
  ticket_promedio numeric,
  upt numeric,
  pct_pedidos_full_price numeric,
  pct_pedidos_rebajas numeric,
  pct_pedidos_con_descuento numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ordenes_base AS (
    SELECT
      o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(oi.is_markdown = true) AS has_rebajas,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= p_desde::timestamp
      AND o.created_at < (p_hasta + interval '1 day')::timestamp
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY o.shopify_order_id
  ),
  resumen AS (
    SELECT
      COUNT(*)::bigint AS total_pedidos_calc,
      COALESCE(SUM(und_orden), 0)::bigint AS unidades_vendidas_calc,
      ROUND(COALESCE(SUM(valor_orden), 0), 0)::numeric AS ingresos_netos_calc,
      ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket_promedio_calc,
      ROUND(COALESCE(SUM(und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      COUNT(*) FILTER (WHERE has_rebajas)::numeric AS pedidos_rebajas,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND has_descuento)::numeric AS pedidos_descuento,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND NOT has_descuento)::numeric AS pedidos_full
    FROM ordenes_base
  )
  SELECT
    total_pedidos_calc, unidades_vendidas_calc, ingresos_netos_calc, ticket_promedio_calc, upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;
