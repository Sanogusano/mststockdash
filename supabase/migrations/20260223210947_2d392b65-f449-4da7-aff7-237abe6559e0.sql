CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(dias_atras integer, p_sku_filter text DEFAULT NULL::text)
 RETURNS TABLE(foto text, sku text, producto text, categoria text, und_vendidas bigint, stock_tiendas bigint, stock_digital bigint, clasificacion text, sell_through_pct numeric, wos numeric, estado_salud text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
      RAISE EXCEPTION 'dias_atras must be between 1 and 365';
    END IF;

    RETURN QUERY
    WITH Ventas AS (
        SELECT 
            oi.sku,
            SUM(oi.quantity::BIGINT) as und_vendidas,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND (p_sku_filter IS NULL OR oi.sku ILIKE '%' || p_sku_filter || '%')
        GROUP BY oi.sku
    ),
    StockT AS (
        SELECT inv.sku, SUM(inv.available::BIGINT) as stock_t
        FROM inventory_snapshot inv
        WHERE inv.location_id != '71474315479'
          AND (p_sku_filter IS NULL OR inv.sku ILIKE '%' || p_sku_filter || '%')
        GROUP BY inv.sku
    ),
    StockD AS (
        SELECT inv.sku, SUM(inv.available::BIGINT) as stock_d
        FROM inventory_snapshot inv
        WHERE inv.location_id = '71474315479'
          AND (p_sku_filter IS NULL OR inv.sku ILIKE '%' || p_sku_filter || '%')
        GROUP BY inv.sku
    ),
    BaseUnida AS (
        SELECT 
            p.sku, p.title as producto, p.category as categoria, p.image_url as foto,
            COALESCE(v.und_vendidas, 0) as und_vendidas,
            COALESCE(st.stock_t, 0) as stock_tiendas,
            COALESCE(sd.stock_d, 0) as stock_digital,
            COALESCE(v.und_full_price, 0) as und_full_price,
            COALESCE(v.und_promo, 0) as und_promo
        FROM product_catalog p
        LEFT JOIN Ventas v ON p.sku = v.sku
        LEFT JOIN StockT st ON p.sku = st.sku
        LEFT JOIN StockD sd ON p.sku = sd.sku
        WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (p_sku_filter IS NULL OR p.sku ILIKE '%' || p_sku_filter || '%')
          AND (COALESCE(v.und_vendidas, 0) > 0 OR COALESCE(st.stock_t, 0) > 0 OR COALESCE(sd.stock_d, 0) > 0)
    )
    SELECT 
        b.foto, b.sku, b.producto, b.categoria,
        b.und_vendidas::BIGINT,
        b.stock_tiendas::BIGINT,
        b.stock_digital::BIGINT,
        CASE WHEN b.und_full_price >= b.und_promo THEN '🏆 Precio Full' ELSE '🧲 Promoción' END::TEXT AS clasificacion,
        ROUND((b.und_vendidas::NUMERIC / NULLIF((b.und_vendidas + b.stock_tiendas + b.stock_digital)::NUMERIC, 0.0)) * 100, 1)::NUMERIC AS sell_through_pct,
        ROUND((b.stock_tiendas + b.stock_digital)::NUMERIC / NULLIF(b.und_vendidas::NUMERIC / (dias_atras::NUMERIC / 7.0), 0.001), 1)::NUMERIC AS wos,
        CASE 
            WHEN b.und_vendidas = 0 AND (b.stock_tiendas + b.stock_digital) > 0 THEN '🔴 ESTANCADO (Sin Venta)'
            WHEN ((b.stock_tiendas + b.stock_digital)::NUMERIC / NULLIF(b.und_vendidas::NUMERIC / (dias_atras::NUMERIC / 7.0), 0.001)) > 12 THEN '🔴 SOBRESTOCK'
            WHEN ((b.stock_tiendas + b.stock_digital)::NUMERIC / NULLIF(b.und_vendidas::NUMERIC / (dias_atras::NUMERIC / 7.0), 0.001)) < 4 THEN '🟡 RIESGO AGOTADOS'
            ELSE '🟢 NIVEL ÓPTIMO'
        END::TEXT AS estado_salud
    FROM BaseUnida b
    ORDER BY b.und_vendidas DESC
    LIMIT 200;
END;
$function$;