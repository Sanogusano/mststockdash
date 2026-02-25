
CREATE OR REPLACE FUNCTION public.reporte_sugerencias_traslado(dias_atras integer)
 RETURNS TABLE(foto text, producto text, sku text, tienda_origen text, stock_origen numeric, tienda_destino text, ritmo_venta_destino numeric, accion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH VentasPorTienda AS (
        SELECT 
            p.title AS producto,
            o.location_id,
            MAX(p.image_url) AS foto,
            SUM(oi.quantity::NUMERIC) AS und_vendidas,
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_prom_semanal
        FROM order_items oi 
        JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, o.location_id
    ),
    StockPorTienda AS (
        SELECT 
            p.title AS producto,
            inv.location_id,
            SUM(inv.available::NUMERIC) AS stock_total
        FROM inventory_snapshot inv
        JOIN product_catalog p ON inv.sku = p.sku
        WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, inv.location_id
    ),
    WosPorTienda AS (
        SELECT
            COALESCE(s.producto, v.producto) AS producto,
            COALESCE(s.location_id, v.location_id) AS location_id,
            COALESCE(v.foto, '') AS foto,
            COALESCE(s.stock_total, 0) AS stock,
            COALESCE(v.venta_prom_semanal, 0) AS venta_semanal,
            CASE 
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN 999
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 THEN 0
                ELSE ROUND(COALESCE(s.stock_total, 0) / v.venta_prom_semanal, 1)
            END AS wos
        FROM StockPorTienda s
        FULL OUTER JOIN VentasPorTienda v ON s.producto = v.producto AND s.location_id = v.location_id
        WHERE COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.und_vendidas, 0) > 0
    ),
    -- Tiendas con RIESGO DE AGOTADOS (WOS < 4 y tienen ventas)
    Destinos AS (
        SELECT w.producto, w.location_id, w.foto, w.stock, w.venta_semanal, w.wos
        FROM WosPorTienda w
        WHERE w.wos > 0 AND w.wos < 4
          AND w.venta_semanal > 0
    ),
    -- Tiendas con SOBRESTOCK (WOS > 12)
    Origenes AS (
        SELECT w.producto, w.location_id, w.stock, w.wos
        FROM WosPorTienda w
        WHERE w.wos > 12
          AND w.stock > 3
    )
    SELECT 
        d.foto,
        d.producto,
        'Varias Tallas'::TEXT AS sku,
        CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END AS tienda_origen,
        ori.stock AS stock_origen,
        CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END AS tienda_destino,
        ROUND(d.venta_semanal, 2)::NUMERIC AS ritmo_venta_destino,
        ('🚚 Trasladar (Origen ' || ori.wos || ' sem → Destino ' || d.wos || ' sem)')::TEXT AS accion
    FROM Destinos d
    JOIN Origenes ori ON d.producto = ori.producto AND d.location_id != ori.location_id
    JOIN locations ld ON d.location_id = ld.location_id
    JOIN locations lo ON ori.location_id = lo.location_id
    ORDER BY d.venta_semanal DESC, ori.stock DESC
    LIMIT 150;
END;
$function$;
