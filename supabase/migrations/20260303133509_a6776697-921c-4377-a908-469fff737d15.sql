
-- Drop existing functions to recreate with new p_zona parameter
DROP FUNCTION IF EXISTS public.reporte_kpis_comerciales(integer, text, text);
DROP FUNCTION IF EXISTS public.reporte_kpis_periodo_anterior(integer, text, text);
DROP FUNCTION IF EXISTS public.reporte_pct_ventas_por_tipo(integer, text, text);
DROP FUNCTION IF EXISTS public.reporte_ejecutivo_productos(integer, text, text, text, integer);

-- 1) reporte_kpis_comerciales + p_zona
CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
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
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
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

-- 2) reporte_kpis_periodo_anterior + p_zona
CREATE OR REPLACE FUNCTION public.reporte_kpis_periodo_anterior(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
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
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) * 2 || ' days')::INTERVAL)
      AND o.created_at < (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
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

-- 3) reporte_pct_ventas_por_tipo + p_zona
CREATE OR REPLACE FUNCTION public.reporte_pct_ventas_por_tipo(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text)
 RETURNS TABLE(pct_full_price numeric, pct_rebajas numeric, pct_desc_promo numeric, ingresos_full_price numeric, ingresos_rebajas numeric, ingresos_desc_promo numeric, ingresos_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH items_clasificados AS (
    SELECT
      oi.price::numeric * oi.quantity::numeric AS ingreso_item,
      CASE
        WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0 THEN 'DESC_PROMO'
        WHEN COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) > oi.price::numeric THEN 'REBAJAS'
        WHEN p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric THEN 'REBAJAS'
        ELSE 'FULL_PRICE'
      END AS tipo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
  ),
  totales AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'FULL_PRICE' THEN ingreso_item ELSE 0 END), 0) AS sum_full,
      COALESCE(SUM(CASE WHEN tipo = 'REBAJAS' THEN ingreso_item ELSE 0 END), 0) AS sum_rebajas,
      COALESCE(SUM(CASE WHEN tipo = 'DESC_PROMO' THEN ingreso_item ELSE 0 END), 0) AS sum_promo,
      COALESCE(SUM(ingreso_item), 0) AS sum_total
    FROM items_clasificados
  )
  SELECT
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_full / sum_total) * 100, 1) END::numeric,
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_rebajas / sum_total) * 100, 1) END::numeric,
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_promo / sum_total) * 100, 1) END::numeric,
    ROUND(sum_full, 0)::numeric, ROUND(sum_rebajas, 0)::numeric, ROUND(sum_promo, 0)::numeric, ROUND(sum_total, 0)::numeric
  FROM totales;
END;
$function$;

-- 4) reporte_ejecutivo_productos + zona_filtro
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, orden text DEFAULT 'TOP'::text, limite integer DEFAULT 20, zona_filtro text DEFAULT NULL::text)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, clasificacion text, unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint, sell_through_pct numeric, wos numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN RAISE EXCEPTION 'dias_atras must be between 1 and 365'; END IF;

  RETURN QUERY
  WITH VentasFiltradas AS (
    SELECT
      p.product_id AS pid,
      MAX(p.image_url) AS img,
      MAX(p.title) AS titulo,
      MAX(p.category) AS cat,
      SUM(oi.quantity)::BIGINT AS und_vendidas,
      SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0
                AND COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) <= oi.price::numeric
                AND NOT (p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric)
           THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0
                AND (
                  COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) > oi.price::numeric
                  OR (p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric)
                )
           THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0
           THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND p.product_id IS NOT NULL
      AND (NULLIF(TRIM(location_filtro), '') IS NULL OR o.location_id = location_filtro)
      AND (NULLIF(TRIM(zona_filtro), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = zona_filtro AND loc.is_active = true))
      AND (
        NULLIF(TRIM(canal_filtro), '') IS NULL OR
        (UPPER(canal_filtro) = 'DIGITAL' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (UPPER(canal_filtro) = 'OUTLET' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (UPPER(canal_filtro) = 'TIENDAS' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479') OR
        (UPPER(canal_filtro) = 'POS' AND o.source_name = 'pos')
      )
    GROUP BY p.product_id
  ),
  StockTotal AS (
    SELECT p.product_id AS pid, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE p.product_id IS NOT NULL
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(location_filtro), '') IS NULL OR inv.location_id = location_filtro)
      AND (NULLIF(TRIM(zona_filtro), '') IS NULL OR inv.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = zona_filtro AND loc.is_active = true))
    GROUP BY p.product_id
  ),
  Combinado AS (
    SELECT
      v.img, v.titulo, v.pid, v.cat,
      v.und_vendidas, v.ingresos,
      COALESCE(st.stock, 0)::BIGINT AS stock,
      v.und_full, v.und_rebajas, v.und_promo,
      CASE WHEN (v.und_vendidas + COALESCE(st.stock, 0)) = 0 THEN 0.0
        ELSE ROUND(v.und_vendidas::NUMERIC / (v.und_vendidas + COALESCE(st.stock, 0))::NUMERIC * 100, 1)
      END AS st_pct,
      CASE WHEN v.und_vendidas = 0 THEN 0.0
        ELSE ROUND(COALESCE(st.stock, 0)::NUMERIC / (v.und_vendidas::NUMERIC / (GREATEST(dias_atras, 1)::NUMERIC / 7.0)), 1)
      END AS wos_val
    FROM VentasFiltradas v
    LEFT JOIN StockTotal st ON v.pid = st.pid
  )
  SELECT
    c.img::TEXT, c.titulo::TEXT, c.pid::TEXT, c.cat::TEXT,
    CASE
      WHEN c.und_full >= c.und_rebajas AND c.und_full >= c.und_promo THEN 'Ganador Full Price'
      WHEN c.und_rebajas >= c.und_full AND c.und_rebajas >= c.und_promo THEN 'Ganador Rebajas'
      ELSE 'Ganador Promo'
    END::TEXT,
    c.und_vendidas,
    ROUND(c.ingresos / NULLIF(c.und_vendidas, 0), 0)::NUMERIC,
    c.stock,
    c.st_pct::NUMERIC,
    c.wos_val::NUMERIC
  FROM Combinado c
  ORDER BY
    CASE WHEN UPPER(COALESCE(orden, 'TOP')) = 'TOP' THEN c.und_vendidas END DESC NULLS LAST,
    CASE WHEN UPPER(COALESCE(orden, 'TOP')) != 'TOP' THEN c.und_vendidas END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(limite, 20), 1);
END;
$function$;
