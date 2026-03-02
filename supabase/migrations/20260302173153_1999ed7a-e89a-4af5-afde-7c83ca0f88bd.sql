
DROP FUNCTION IF EXISTS public.reporte_wos_categoria_global(integer, text[]);

CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_global(dias_atras integer, p_location_ids text[] DEFAULT NULL::text[])
 RETURNS TABLE(tienda text, location_id text, categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, pct_full_price numeric, pct_rebajado numeric, pct_promo numeric, estado_salud text)
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
      SUM(oi.quantity::NUMERIC) / NULLIF((GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0), 0) AS promedio_semanal,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END)::NUMERIC AS und_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END)::NUMERIC AS und_rebajado,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END)::NUMERIC AS und_promo
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
      SUM(inv.available::BIGINT) AS stock_total
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_ids IS NULL OR inv.location_id = ANY(p_location_ids))
    GROUP BY inv.location_id, UPPER(p.category)
  )
  SELECT
    l.name::TEXT,
    l.location_id::TEXT,
    COALESCE(s.cat, v.cat)::TEXT,
    COALESCE(s.stock_total, 0)::BIGINT,
    ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
    ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
    CASE WHEN COALESCE(v.und_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(v.und_full, 0) / v.und_total) * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(v.und_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(v.und_rebajado, 0) / v.und_total) * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(v.und_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(v.und_promo, 0) / v.und_total) * 100, 1)
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
