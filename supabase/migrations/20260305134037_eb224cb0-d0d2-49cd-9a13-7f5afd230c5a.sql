
-- Fix reporte_salud_inventario: avoid expensive JOIN for insumos date, just use MAX(snapshot_date)
CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer)
 RETURNS TABLE(tipo text, tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date_prendas date;
  v_max_date_insumos date;
BEGIN
    -- For PRENDAS: use the most recent complete snapshot (>=5000 distinct variants)
    SELECT sub.snapshot_date INTO v_max_date_prendas
    FROM (
      SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt
      FROM inventory_snapshot
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
    ) sub
    WHERE sub.cnt >= 5000
    LIMIT 1;

    IF v_max_date_prendas IS NULL THEN
      SELECT MAX(snapshot_date) INTO v_max_date_prendas FROM inventory_snapshot;
    END IF;

    -- For INSUMOS: use the absolute most recent snapshot (insumos are always loaded)
    SELECT MAX(snapshot_date) INTO v_max_date_insumos FROM inventory_snapshot;
    IF v_max_date_insumos IS NULL THEN
      v_max_date_insumos := v_max_date_prendas;
    END IF;

    RETURN QUERY
    WITH CategoryMapping AS (
        SELECT pc.variant_id,
          CASE WHEN UPPER(pc.category) IN ('BOLSA', 'INSUMOS') THEN 'BOLSAS Y EMPAQUES' ELSE 'PRENDAS' END AS tipo_inv
        FROM product_catalog pc
        WHERE pc.variant_id IS NOT NULL
    ),
    VentasPeriodo AS (
        SELECT 
            cm.tipo_inv,
            o.location_id,
            SUM(oi.quantity)::NUMERIC / GREATEST(dias_atras::NUMERIC / 7.0, 1) AS promedio_venta_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog pc ON pc.sku = oi.sku
        JOIN CategoryMapping cm ON cm.variant_id = pc.variant_id
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
        GROUP BY cm.tipo_inv, o.location_id
    ),
    StockPorTienda AS (
        -- PRENDAS stock from complete snapshot
        SELECT cm.tipo_inv,
               inv.location_id AS loc_id,
               SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv
        JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_prendas
          AND cm.tipo_inv = 'PRENDAS'
        GROUP BY cm.tipo_inv, inv.location_id
        
        UNION ALL
        
        -- INSUMOS stock from most recent snapshot
        SELECT cm.tipo_inv,
               inv.location_id AS loc_id,
               SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv
        JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_insumos
          AND cm.tipo_inv = 'BOLSAS Y EMPAQUES'
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
