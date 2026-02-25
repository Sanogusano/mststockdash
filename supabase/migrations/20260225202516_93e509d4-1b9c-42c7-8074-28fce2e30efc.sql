
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
            oi.sku,
            o.location_id,
            MAX(p.image_url) AS foto,
            SUM(oi.quantity::NUMERIC) AS und_vendidas,
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_prom_semanal
        FROM order_items oi 
        JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, oi.sku, o.location_id
    ),
    StockPorTienda AS (
        SELECT 
            p.title AS producto,
            inv.sku,
            inv.location_id,
            SUM(inv.available::NUMERIC) AS stock_total
        FROM inventory_snapshot inv
        JOIN product_catalog p ON inv.sku = p.sku
        WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, inv.sku, inv.location_id
    ),
    WosPorTienda AS (
        SELECT
            COALESCE(s.producto, v.producto) AS producto,
            COALESCE(s.sku, v.sku) AS sku,
            COALESCE(s.location_id, v.location_id) AS location_id,
            COALESCE(v.foto, '') AS foto,
            COALESCE(s.stock_total, 0) AS stock,
            COALESCE(v.venta_prom_semanal, 0) AS venta_semanal,
            COALESCE(v.venta_prom_semanal, 0) / 7.0 AS consumo_diario,
            CASE 
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN 999
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 THEN 0
                ELSE ROUND(COALESCE(s.stock_total, 0) / v.venta_prom_semanal, 1)
            END AS wos
        FROM StockPorTienda s
        FULL OUTER JOIN VentasPorTienda v ON s.producto = v.producto AND s.sku = v.sku AND s.location_id = v.location_id
        WHERE COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.und_vendidas, 0) > 0
    ),
    Destinos AS (
        SELECT w.producto, w.sku, w.location_id, w.foto, w.stock, w.venta_semanal, w.wos
        FROM WosPorTienda w
        WHERE w.wos > 0 AND w.wos < 4
          AND w.venta_semanal > 0
    ),
    Origenes AS (
        SELECT w.producto, w.sku, w.location_id, w.stock, w.wos, w.consumo_diario,
               GREATEST(w.stock - CEIL(w.consumo_diario * 60), 0) AS stock_cedible
        FROM WosPorTienda w
        WHERE w.wos > 12
          AND w.stock > 3
          AND (w.stock - CEIL(w.consumo_diario * 60)) > 0
    ),
    Candidatos AS (
        SELECT 
            d.foto,
            d.producto,
            d.sku,
            ori.location_id AS loc_origen,
            d.location_id AS loc_destino,
            ori.stock AS stock_origen,
            ori.stock_cedible,
            ori.wos AS wos_origen,
            d.venta_semanal,
            d.wos AS wos_destino,
            ROW_NUMBER() OVER (PARTITION BY d.sku, d.location_id ORDER BY ori.stock_cedible DESC) AS rn
        FROM Destinos d
        JOIN Origenes ori ON d.sku = ori.sku AND d.location_id != ori.location_id
    ),
    Unicos AS (
        SELECT * FROM Candidatos WHERE rn = 1
    )
    SELECT 
        u.foto,
        u.producto,
        u.sku,
        CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END AS tienda_origen,
        u.stock_origen,
        CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END AS tienda_destino,
        ROUND(u.venta_semanal, 2)::NUMERIC AS ritmo_venta_destino,
        ('🚚 Origen ' || u.wos_origen || ' sem → Destino ' || u.wos_destino || ' sem (cedible: ' || u.stock_cedible || ')')::TEXT AS accion
    FROM Unicos u
    JOIN locations ld ON u.loc_destino = ld.location_id
    JOIN locations lo ON u.loc_origen = lo.location_id
    ORDER BY u.venta_semanal DESC, u.stock_cedible DESC
    LIMIT 150;
END;
$function$;
