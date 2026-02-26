
-- Fix outlet detection: change '%NICO%' to '%UNICO%' in all 3 affected functions

-- 1. reporte_ranking_tiendas
CREATE OR REPLACE FUNCTION public.reporte_ranking_tiendas(dias_atras integer, p_canal text DEFAULT NULL::text)
 RETURNS TABLE(tienda text, ventas_totales numeric, unidades_vendidas bigint, ticket_promedio numeric, upt numeric, pct_venta_full_price numeric, inventario_valorado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH OrdenesTienda AS (
        SELECT l.name AS nombre_tienda, o.shopify_order_id, SUM(oi.quantity::BIGINT) AS und_orden,
        SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS valor_orden,
        SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN (((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) ELSE 0 END) AS valor_full_price
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
          ) 
        GROUP BY l.name, o.shopify_order_id
    ), AgrupadoTienda AS (
        SELECT nombre_tienda, COUNT(shopify_order_id)::BIGINT AS total_transacciones, SUM(und_orden)::BIGINT AS total_unidades, SUM(valor_orden)::NUMERIC AS total_ventas, SUM(valor_full_price)::NUMERIC AS total_ventas_full FROM OrdenesTienda GROUP BY nombre_tienda
    ), StockValorado AS (
        SELECT l.name AS nombre_tienda, SUM(0) AS total_inventario_valorado FROM inventory_snapshot inv JOIN locations l ON inv.location_id = l.location_id JOIN product_catalog p ON inv.sku = p.sku WHERE l.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY l.name
    )
    SELECT a.nombre_tienda::TEXT, ROUND(a.total_ventas, 0)::NUMERIC, a.total_unidades, ROUND(a.total_ventas / NULLIF(a.total_transacciones::NUMERIC, 0.0), 0)::NUMERIC, ROUND(a.total_unidades::NUMERIC / NULLIF(a.total_transacciones::NUMERIC, 0.0), 2)::NUMERIC, ROUND((a.total_ventas_full / NULLIF(a.total_ventas, 0.0)) * 100, 1)::NUMERIC, ROUND(COALESCE(s.total_inventario_valorado, 0), 0)::NUMERIC
    FROM AgrupadoTienda a LEFT JOIN StockValorado s ON a.nombre_tienda = s.nombre_tienda ORDER BY a.total_ventas DESC LIMIT 10;
END;
$function$;

-- 2. reporte_kpis_comerciales
CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_con_descuento numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
BEGIN 
    RETURN QUERY 
    WITH OrdenesBase AS (
        SELECT 
            o.shopify_order_id, 
            SUM(oi.quantity::BIGINT) as und_orden,
            SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) as valor_orden,
            MAX(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN 1 ELSE 0 END) as tiene_descuento
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) 
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') 
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id) 
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
          ) 
        GROUP BY o.shopify_order_id
    ) 
    SELECT 
        COUNT(shopify_order_id)::BIGINT, COALESCE(SUM(und_orden), 0)::BIGINT, 
        ROUND(COALESCE(SUM(valor_orden), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(und_orden)::NUMERIC / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 2), 2)::NUMERIC, 
        ROUND(COALESCE((COUNT(CASE WHEN tiene_descuento = 0 THEN 1 END)::NUMERIC / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC, 
        ROUND(COALESCE((COUNT(CASE WHEN tiene_descuento = 1 THEN 1 END)::NUMERIC / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC 
    FROM OrdenesBase; 
END; 
$function$;

-- 3. reporte_desempeño_por_canal
CREATE OR REPLACE FUNCTION public."reporte_desempeño_por_canal"(dias_atras integer)
 RETURNS TABLE(canal text, ventas_totales numeric, total_pedidos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN 'Digital'
            WHEN UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%' THEN 'Outlets'
            ELSE 'Tiendas Físicas'
        END::TEXT AS canal_agrupado,
        SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19)::NUMERIC AS ventas_totales,
        COUNT(DISTINCT o.shopify_order_id)::BIGINT AS total_pedidos
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY canal_agrupado;
END;
$function$;
