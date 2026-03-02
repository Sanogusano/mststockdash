
DROP FUNCTION IF EXISTS public.reporte_wos_categoria_global(integer, text[]);

CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_global(dias_atras integer, p_location_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(tienda text, location_id text, categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, pct_full_price numeric, pct_rebajado numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
      -- Stock a Full Price: compare_at_price <= price o no tiene compare_at_price
      SUM(CASE 
        WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) <= COALESCE(p.price, 0) 
        THEN inv.available ELSE 0 
      END)::NUMERIC AS stock_full,
      -- Stock Rebajado: compare_at_price > price
      SUM(CASE 
        WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) > COALESCE(p.price, 0) 
        THEN inv.available ELSE 0 
      END)::NUMERIC AS stock_rebajado
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
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
    -- % Full Price (del inventario actual)
    CASE WHEN COALESCE(s.stock_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(s.stock_full, 0) / s.stock_total::NUMERIC) * 100, 1)
    END::NUMERIC,
    -- % Rebajado (del inventario actual)
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
