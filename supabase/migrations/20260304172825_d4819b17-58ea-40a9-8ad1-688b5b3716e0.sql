
CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer)
 RETURNS TABLE(tipo text, tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

    RETURN QUERY
    WITH CategoryMapping AS (
        SELECT pc.sku,
          CASE WHEN UPPER(pc.category) IN ('BOLSA', 'INSUMOS') THEN 'BOLSAS Y EMPAQUES' ELSE 'PRENDAS' END AS tipo_inv
        FROM product_catalog pc
    ),
    VentasPeriodo AS (
        SELECT 
            cm.tipo_inv,
            o.location_id,
            SUM(oi.quantity)::NUMERIC / GREATEST(dias_atras::NUMERIC / 7.0, 1) AS promedio_venta_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN CategoryMapping cm ON oi.sku = cm.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
        GROUP BY cm.tipo_inv, o.location_id
    ),
    StockPorTienda AS (
        SELECT cm.tipo_inv,
               inv.location_id AS loc_id,
               SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv
        JOIN CategoryMapping cm ON inv.sku = cm.sku
        WHERE inv.snapshot_date = v_max_date
        GROUP BY cm.tipo_inv, inv.location_id
    ),
    Tipos AS (SELECT unnest(ARRAY['PRENDAS', 'BOLSAS Y EMPAQUES']) AS tipo_inv)
    SELECT 
        t.tipo_inv::TEXT,
        l.name::TEXT,
        COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_venta_semanal, 0), 1),
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1),
        CASE 
            WHEN t.tipo_inv = 'BOLSAS Y EMPAQUES' THEN
              CASE
                WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '✅ STOCK SUFICIENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 2 THEN '🚨 REORDEN URGENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 4 THEN '⚠️ PLANEAR COMPRA'
                ELSE '✅ STOCK SUFICIENTE'
              END
            ELSE
              CASE 
                WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) > 20 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 8 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 NIVEL ÓPTIMO'
              END
        END::TEXT
    FROM Tipos t
    CROSS JOIN locations l
    LEFT JOIN StockPorTienda s ON l.location_id = s.loc_id AND t.tipo_inv = s.tipo_inv
    LEFT JOIN VentasPeriodo v ON l.location_id = v.location_id AND t.tipo_inv = v.tipo_inv
    WHERE l.is_active = true
      AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.promedio_venta_semanal, 0) > 0)
    ORDER BY t.tipo_inv, COALESCE(s.stock_total, 0) DESC;
END;
$function$;
