
-- Helper function: find latest snapshot date with >= min_variants efficiently
CREATE OR REPLACE FUNCTION public._latest_valid_snapshot_date(min_variants int DEFAULT 5000)
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_date date;
  v_cnt bigint;
BEGIN
  -- Iterate from most recent date downward, leveraging idx_inv_snapshot_date
  FOR v_date IN 
    SELECT DISTINCT snapshot_date FROM inventory_snapshot ORDER BY snapshot_date DESC LIMIT 10
  LOOP
    SELECT COUNT(DISTINCT variant_id) INTO v_cnt 
    FROM inventory_snapshot 
    WHERE snapshot_date = v_date;
    
    IF v_cnt >= min_variants THEN
      RETURN v_date;
    END IF;
  END LOOP;
  
  -- Fallback: return max date
  SELECT MAX(snapshot_date) INTO v_date FROM inventory_snapshot;
  RETURN v_date;
END;
$$;

-- Optimized reporte_salud_inventario using the helper
CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer)
 RETURNS TABLE(tipo text, tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date_prendas date;
  v_max_date_insumos date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0));
BEGIN
    -- Use optimized helper instead of full table scan
    v_max_date_prendas := _latest_valid_snapshot_date(5000);
    SELECT MAX(snapshot_date) INTO v_max_date_insumos FROM inventory_snapshot;
    IF v_max_date_insumos IS NULL THEN v_max_date_insumos := v_max_date_prendas; END IF;

    RETURN QUERY
    WITH CategoryMapping AS (
        SELECT pc.variant_id, CASE WHEN UPPER(pc.category) IN ('BOLSA', 'INSUMOS') THEN 'BOLSAS Y EMPAQUES' ELSE 'PRENDAS' END AS tipo_inv
        FROM product_catalog pc WHERE pc.variant_id IS NOT NULL
    ),
    VentasPeriodo AS (
        SELECT cm.tipo_inv, o.location_id, SUM(oi.quantity)::NUMERIC / GREATEST(dias_atras::NUMERIC / 7.0, 1) AS promedio_venta_semanal
        FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog pc ON pc.sku = oi.sku JOIN CategoryMapping cm ON cm.variant_id = pc.variant_id
        WHERE o.created_at >= v_boundary
        GROUP BY cm.tipo_inv, o.location_id
    ),
    StockPorTienda AS (
        SELECT cm.tipo_inv, inv.location_id AS loc_id, SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_prendas AND cm.tipo_inv = 'PRENDAS'
        GROUP BY cm.tipo_inv, inv.location_id
        UNION ALL
        SELECT cm.tipo_inv, inv.location_id AS loc_id, SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_insumos AND cm.tipo_inv = 'BOLSAS Y EMPAQUES'
        GROUP BY cm.tipo_inv, inv.location_id
    ),
    Tipos AS (SELECT unnest(ARRAY['PRENDAS', 'BOLSAS Y EMPAQUES']) AS tipo_inv)
    SELECT t.tipo_inv::TEXT, l.name::TEXT, COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_venta_semanal, 0), 1),
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1),
        CASE
            WHEN t.tipo_inv = 'BOLSAS Y EMPAQUES' THEN
              CASE WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '✅ STOCK SUFICIENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 2 THEN '🚨 REORDEN URGENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 4 THEN '⚠️ PLANEAR COMPRA'
                ELSE '✅ STOCK SUFICIENTE' END
            ELSE
              CASE WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) > 20 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 8 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 NIVEL ÓPTIMO' END
        END::TEXT
    FROM Tipos t CROSS JOIN locations l
    LEFT JOIN StockPorTienda s ON l.location_id = s.loc_id AND t.tipo_inv = s.tipo_inv
    LEFT JOIN VentasPeriodo v ON l.location_id = v.location_id AND t.tipo_inv = v.tipo_inv
    WHERE l.is_active = true AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.promedio_venta_semanal, 0) > 0)
    ORDER BY t.tipo_inv, COALESCE(s.stock_total, 0) DESC;
END;
$function$;
