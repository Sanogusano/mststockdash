CREATE OR REPLACE FUNCTION public.reporte_ventas_por_vendedor(p_anio integer, p_mes integer, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text)
 RETURNS TABLE(shopify_user_id text, nombre_vendedor text, rol text, tipo_contrato text, tienda text, total_pedidos bigint, unidades_vendidas bigint, venta_bruta numeric, venta_neta numeric, ticket_promedio numeric, upt numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio timestamptz;
  v_fin timestamptz;
BEGIN
  v_inicio := make_timestamptz(p_anio, p_mes, 1, 0, 0, 0, 'America/Bogota');
  v_fin := v_inicio + interval '1 month';

  RETURN QUERY
  WITH ventas_vendedor AS (
    SELECT 
      o.user_id AS uid,
      o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_neto
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_inicio 
      AND o.created_at < v_fin
      AND o.financial_status IN ('paid', 'partially_refunded', 'partially_paid')
      AND o.user_id IS NOT NULL
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_id IS NULL OR o.location_id = p_location_id)
      AND (p_zona IS NULL OR o.location_id IN (
        SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true
      ))
    GROUP BY o.user_id, o.shopify_order_id
  ),
  resumen AS (
    SELECT 
      vv.uid,
      COUNT(*)::bigint AS pedidos,
      COALESCE(SUM(vv.und_orden), 0)::bigint AS unidades,
      COALESCE(SUM(vv.valor_neto), 0)::numeric AS venta_net,
      ROUND(COALESCE(SUM(vv.valor_neto) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket,
      ROUND(COALESCE(SUM(vv.und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_val
    FROM ventas_vendedor vv
    GROUP BY vv.uid
  )
  SELECT 
    r.uid::text,
    COALESCE(sm.nombre, 'Vendedor ' || r.uid)::text,
    COALESCE(sm.rol, 'vendedor')::text,
    COALESCE(sm.tipo_contrato, 'fijo')::text,
    COALESCE(l.name, 'Sin tienda')::text,
    r.pedidos,
    r.unidades,
    ROUND(r.venta_net * 1.19, 0)::numeric,
    ROUND(r.venta_net, 0)::numeric,
    r.ticket,
    r.upt_val
  FROM resumen r
  LEFT JOIN staff_members sm ON sm.shopify_user_id = r.uid
  LEFT JOIN locations l ON sm.location_id = l.location_id
  ORDER BY r.venta_net DESC;
END;
$function$;