
-- Drop old function with different return type
DROP FUNCTION IF EXISTS public.reporte_detalle_skus_producto(integer, text, text, text);

-- Recreate with talla column
CREATE OR REPLACE FUNCTION public.reporte_detalle_skus_producto(dias_atras integer, p_product_id text, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text)
 RETURNS TABLE(sku text, talla text, unidades_vendidas bigint, stock_disponible bigint, precio_prom_venta numeric, sell_through_pct numeric, wos numeric, clasificacion text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH VentasSku AS (
    SELECT
      oi.sku AS v_sku,
      SUM(oi.quantity)::BIGINT AS und_vendidas,
      SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND p.product_id = p_product_id
      AND (canal_filtro IS NULL OR
           (canal_filtro = 'POS' AND o.source_name = 'pos') OR
           (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
      AND (location_filtro IS NULL OR o.location_id = location_filtro)
    GROUP BY oi.sku
  ),
  StockSku AS (
    SELECT inv.sku AS s_sku, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE p.product_id = p_product_id
      AND (location_filtro IS NULL OR inv.location_id = location_filtro)
    GROUP BY inv.sku
  ),
  AllSkus AS (
    SELECT DISTINCT p.sku, p.variant_name FROM product_catalog p WHERE p.product_id = p_product_id
  )
  SELECT
    a.sku::TEXT,
    COALESCE(a.variant_name, '')::TEXT,
    COALESCE(v.und_vendidas, 0)::BIGINT,
    COALESCE(s.stock, 0)::BIGINT,
    ROUND(COALESCE(v.ingresos, 0) / NULLIF(COALESCE(v.und_vendidas, 0), 0), 0)::NUMERIC,
    CASE WHEN (COALESCE(v.und_vendidas, 0) + COALESCE(s.stock, 0)) = 0 THEN 0.0
      ELSE ROUND(COALESCE(v.und_vendidas, 0)::NUMERIC / (COALESCE(v.und_vendidas, 0) + COALESCE(s.stock, 0))::NUMERIC * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(v.und_vendidas, 0) = 0 THEN 0.0
      ELSE ROUND(COALESCE(s.stock, 0)::NUMERIC / (COALESCE(v.und_vendidas, 0)::NUMERIC / (GREATEST(dias_atras, 1)::NUMERIC / 7.0)), 1)
    END::NUMERIC,
    CASE
      WHEN COALESCE(v.und_full, 0) >= COALESCE(v.und_rebajas, 0) AND COALESCE(v.und_full, 0) >= COALESCE(v.und_promo, 0) THEN 'Full Price'
      WHEN COALESCE(v.und_rebajas, 0) >= COALESCE(v.und_full, 0) AND COALESCE(v.und_rebajas, 0) >= COALESCE(v.und_promo, 0) THEN 'Rebajas'
      ELSE 'Promo'
    END::TEXT
  FROM AllSkus a
  LEFT JOIN VentasSku v ON a.sku = v.v_sku
  LEFT JOIN StockSku s ON a.sku = s.s_sku
  WHERE (COALESCE(v.und_vendidas, 0) > 0 OR COALESCE(s.stock, 0) > 0)
  ORDER BY COALESCE(v.und_vendidas, 0) DESC;
END;
$$;
