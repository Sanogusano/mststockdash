
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_tiendas(dias_atras integer, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(foto text, sku text, categoria text, unidades_vendidas bigint, precio_promedio numeric, stock_disponible bigint, clasificacion text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH VentasTienda AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity)::BIGINT as und_vendidas, 
            SUM(oi.price::NUMERIC * oi.quantity::NUMERIC) as ingresos_totales,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo
        FROM order_items oi 
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND o.source_name = 'pos'
          AND o.location_id != '71474315479'
          AND (p_location_id IS NULL OR p_location_id IN ('all', 'Todas las tiendas', '') OR o.location_id = p_location_id)
        GROUP BY oi.sku
    ),
    StockTienda AS (
        SELECT inv.sku, SUM(inv.available)::BIGINT as total_stock
        FROM inventory_snapshot inv
        WHERE (p_location_id IS NULL OR p_location_id IN ('all', 'Todas las tiendas', '') OR inv.location_id = p_location_id)
        GROUP BY inv.sku
    )
    SELECT 
        c.image_url, v.sku, c.category, v.und_vendidas,
        ROUND((v.ingresos_totales / NULLIF(v.und_vendidas::NUMERIC, 0)), 0)::NUMERIC,
        COALESCE(s.total_stock, 0)::BIGINT,
        CASE WHEN v.und_full_price >= v.und_promo THEN '🏆 Ganador - Precio Full' ELSE '🧲 Ganador - Promoción' END::TEXT
    FROM VentasTienda v 
    JOIN product_catalog c ON v.sku = c.sku 
    LEFT JOIN StockTienda s ON v.sku = s.sku
    WHERE UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS') 
    ORDER BY v.und_vendidas DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_top_bottom_digital(dias_atras integer)
 RETURNS TABLE(foto text, sku text, categoria text, unidades_vendidas bigint, precio_promedio numeric, stock_disponible bigint, clasificacion text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH VentasDigital AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity)::BIGINT as und_vendidas, 
            SUM(oi.price::NUMERIC * oi.quantity::NUMERIC) as ingresos_totales,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo
        FROM order_items oi 
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND o.source_name != 'pos'
        GROUP BY oi.sku
    ),
    StockGlobal AS (
        SELECT inv.sku, SUM(inv.available)::BIGINT as total_stock
        FROM inventory_snapshot inv
        GROUP BY inv.sku
    )
    SELECT 
        c.image_url, 
        v.sku, 
        c.category, 
        v.und_vendidas,
        ROUND((v.ingresos_totales / NULLIF(v.und_vendidas::NUMERIC, 0)), 0)::NUMERIC,
        COALESCE(s.total_stock, 0)::BIGINT,
        CASE WHEN v.und_full_price >= v.und_promo THEN '🏆 Ganador - Precio Full' ELSE '🧲 Ganador - Promoción' END::TEXT
    FROM VentasDigital v 
    JOIN product_catalog c ON v.sku = c.sku 
    LEFT JOIN StockGlobal s ON v.sku = s.sku
    WHERE UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS') 
    ORDER BY v.und_vendidas DESC;
END;
$function$;
