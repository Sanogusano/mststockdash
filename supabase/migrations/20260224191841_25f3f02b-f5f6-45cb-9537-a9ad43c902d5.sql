
-- Fix the cartesian product bug in both functions (o.shopify_order_id = o.shopify_order_id → oi.shopify_order_id = o.shopify_order_id)
-- Also add indexes for performance

-- 1. Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_source_location ON public.orders (source_name, location_id);
CREATE INDEX IF NOT EXISTS idx_order_items_shopify_order_id ON public.order_items (shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON public.order_items (sku);

-- 2. Fix reporte_top_bottom_tiendas
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_tiendas(dias_atras integer)
RETURNS TABLE (tienda text, ventas_totales numeric, unidades bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT l.name::TEXT AS tienda,
           SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0))::NUMERIC AS ventas_totales,
           SUM(oi.quantity::BIGINT)::BIGINT AS unidades
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND o.source_name = 'pos'
      AND o.location_id != '71474315479'
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY l.name
    ORDER BY ventas_totales DESC
    LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_top_bottom_tiendas(int) TO anon, authenticated;

-- 3. Fix reporte_top_bottom_digital
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_digital(dias_atras integer)
RETURNS TABLE (producto text, ventas_totales numeric, unidades bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT p.title::TEXT AS producto,
           SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0))::NUMERIC AS ventas_totales,
           SUM(oi.quantity::BIGINT)::BIGINT AS unidades
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND (o.location_id = '71474315479' OR o.source_name != 'pos')
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.title
    ORDER BY ventas_totales DESC
    LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reporte_top_bottom_digital(int) TO anon, authenticated;
