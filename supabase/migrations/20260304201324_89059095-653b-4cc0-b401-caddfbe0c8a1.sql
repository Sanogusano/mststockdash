
-- Fix reporte_wos_categoria_tienda: use complete snapshot + variant_id join
CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_tienda(dias_atras integer, p_location_id text)
 RETURNS TABLE(categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_loc_id text;
BEGIN
    -- Find the store
    SELECT location_id INTO v_loc_id FROM locations 
    WHERE location_id = p_location_id OR name = p_location_id LIMIT 1;

    -- Use the most recent complete snapshot (>=5000 variants)
    SELECT sub.snapshot_date INTO v_max_date
    FROM (
      SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt
      FROM inventory_snapshot
      GROUP BY snapshot_date
      ORDER BY snapshot_date DESC
    ) sub
    WHERE sub.cnt >= 5000
    LIMIT 1;

    IF v_max_date IS NULL THEN
      SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
    END IF;

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT 
            UPPER(c.category) as cat, 
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) as promedio_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog c ON oi.sku = c.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND o.location_id = v_loc_id
          AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    ),
    StockPorCategoria AS (
        SELECT 
            UPPER(c.category) as cat, 
            SUM(inv.available)::BIGINT as stock_total
        FROM inventory_snapshot inv
        JOIN product_catalog c ON c.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date
          AND inv.location_id = v_loc_id
          AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    )
    SELECT 
        COALESCE(s.cat, v.cat),
        COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
        CASE 
            WHEN COALESCE(v.promedio_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO (Sin Venta)'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) > 12 THEN '🔴 SOBRESTOCK'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) < 4 THEN '🟡 RIESGO AGOTADOS'
            ELSE '🟢 NIVEL ÓPTIMO'
        END::TEXT
    FROM StockPorCategoria s
    FULL OUTER JOIN VentasPeriodo v ON s.cat = v.cat
    ORDER BY COALESCE(s.stock_total, 0) DESC;
END;
$function$;

-- Fix reporte_wos_categoria_global: use complete snapshot + variant_id join
CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_global(dias_atras integer, p_location_ids text[] DEFAULT NULL)
 RETURNS TABLE(tienda text, location_id text, categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, pct_full_price numeric, pct_rebajado numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
  -- Use the most recent complete snapshot (>=5000 variants)
  SELECT sub.snapshot_date INTO v_max_date
  FROM (
    SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt
    FROM inventory_snapshot
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
  ) sub
  WHERE sub.cnt >= 5000
  LIMIT 1;

  IF v_max_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
  END IF;

  RETURN QUERY
  WITH VentasPeriodo AS (
    SELECT
      o.location_id AS loc_id,
      UPPER(p.category) AS cat,
      SUM(oi.quantity::NUMERIC) AS und_total,
      SUM(oi.quantity::NUMERIC) / NULLIF((GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0), 0) AS promedio_semanal
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
    GROUP BY o.location_id, UPPER(p.category)
  ),
  StockPorCategoria AS (
    SELECT
      inv.location_id AS loc_id,
      UPPER(p.category) AS cat,
      SUM(inv.available::BIGINT) AS stock_total,
      SUM(CASE 
        WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) <= COALESCE(p.price, 0) 
        THEN inv.available ELSE 0 
      END)::NUMERIC AS stock_full,
      SUM(CASE 
        WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) > COALESCE(p.price, 0) 
        THEN inv.available ELSE 0 
      END)::NUMERIC AS stock_rebajado
    FROM inventory_snapshot inv
    JOIN product_catalog p ON p.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_max_date
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_ids IS NULL OR inv.location_id = ANY(p_location_ids))
      AND inv.available > 0
    GROUP BY inv.location_id, UPPER(p.category)
  )
  SELECT
    l.name::TEXT,
    l.location_id::TEXT,
    COALESCE(s.cat, v.cat)::TEXT,
    COALESCE(s.stock_total, 0)::BIGINT,
    ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
    ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
    CASE WHEN COALESCE(s.stock_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(s.stock_full, 0) / s.stock_total::NUMERIC) * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(s.stock_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(s.stock_rebajado, 0) / s.stock_total::NUMERIC) * 100, 1)
    END::NUMERIC,
    CASE
      WHEN COALESCE(v.promedio_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO'
      WHEN (COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0)) > 20 THEN '🔴 SOBRESTOCK'
      WHEN (COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0)) < 8 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 NIVEL ÓPTIMO'
    END::TEXT
  FROM StockPorCategoria s
  FULL OUTER JOIN VentasPeriodo v ON s.loc_id = v.loc_id AND s.cat = v.cat
  JOIN locations l ON COALESCE(s.loc_id, v.loc_id) = l.location_id
  WHERE l.is_active = true
    AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.und_total, 0) > 0)
  ORDER BY l.name, COALESCE(s.cat, v.cat);
END;
$function$;
