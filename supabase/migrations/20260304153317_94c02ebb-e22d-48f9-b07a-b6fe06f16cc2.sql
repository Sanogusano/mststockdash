
CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer)
 RETURNS TABLE(tipo text, tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
      RAISE EXCEPTION 'dias_atras must be between 1 and 365';
    END IF;

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
            SUM(oi.quantity) / (dias_atras / 7.0) as promedio_venta_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN CategoryMapping cm ON oi.sku = cm.sku
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
        GROUP BY cm.tipo_inv, o.location_id
    ),
    StockPorTienda AS (
        SELECT cm.tipo_inv,
               REGEXP_REPLACE(inv.location_id, '^gid://shopify/Location/', '') AS loc_id,
               SUM(inv.available)::BIGINT as stock_total
        FROM inventory_snapshot inv
        JOIN CategoryMapping cm ON inv.sku = cm.sku
        WHERE inv.snapshot_date = v_max_date
        GROUP BY cm.tipo_inv, REGEXP_REPLACE(inv.location_id, '^gid://shopify/Location/', '')
    ),
    Tipos AS (SELECT unnest(ARRAY['PRENDAS', 'BOLSAS Y EMPAQUES']) AS tipo_inv)
    SELECT 
        t.tipo_inv::TEXT,
        l.name::TEXT,
        COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_venta_semanal, 0), 1),
        ROUND(COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0), 1),
        CASE 
            WHEN t.tipo_inv = 'BOLSAS Y EMPAQUES' THEN
              CASE
                WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '✅ STOCK SUFICIENTE'
                WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) < 2 THEN '🚨 REORDEN URGENTE'
                WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) < 4 THEN '⚠️ PLANEAR COMPRA'
                ELSE '✅ STOCK SUFICIENTE'
              END
            ELSE
              CASE 
                WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) > 20 THEN '🔴 SOBRESTOCK'
                WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) < 8 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 NIVEL ÓPTIMO'
              END
        END
    FROM Tipos t
    CROSS JOIN locations l
    LEFT JOIN StockPorTienda s ON l.location_id = s.loc_id AND t.tipo_inv = s.tipo_inv
    LEFT JOIN VentasPeriodo v ON l.location_id = v.location_id AND t.tipo_inv = v.tipo_inv
    WHERE l.is_active = true
      AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.promedio_venta_semanal, 0) > 0);
END;
$function$;
