
-- Fix 1: Enable RLS on orders and order_items
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Fix 2: Add auth checks to reporte_top_bottom_tiendas
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_tiendas(dias_atras integer, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(foto text, sku text, categoria text, unidades_vendidas bigint, precio_promedio numeric, stock_disponible bigint, clasificacion text)
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
    WITH VentasTienda AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity)::BIGINT as und_vendidas, 
            SUM(oi.price::NUMERIC * oi.quantity::NUMERIC) as ingresos_totales,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo
        FROM order_items oi 
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND o.source_name = 'pos'
          AND o.location_id != '71474315479'
          AND (p_location_id IS NULL OR p_location_id IN ('all', 'Todas las tiendas', '') OR o.location_id = p_location_id)
        GROUP BY oi.sku
    ),
    StockTienda AS (
        SELECT inv.sku, SUM(inv.available)::BIGINT as total_stock
        FROM inventory_snapshot inv
        WHERE (p_location_id IS NULL OR p_location_id IN ('all', 'Todas las tiendas', '') OR inv.location_id = p_location_id)
        GROUP BY inv.sku
    )
    SELECT 
        c.image_url, v.sku, c.category, v.und_vendidas,
        ROUND((v.ingresos_totales / NULLIF(v.und_vendidas::NUMERIC, 0)), 0)::NUMERIC,
        COALESCE(s.total_stock, 0)::BIGINT,
        CASE WHEN v.und_full_price >= v.und_promo THEN '🏆 Ganador - Precio Full' ELSE '🧲 Ganador - Promoción' END::TEXT
    FROM VentasTienda v 
    JOIN product_catalog c ON v.sku = c.sku 
    LEFT JOIN StockTienda s ON v.sku = s.sku
    WHERE UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS') 
    ORDER BY v.und_vendidas DESC;
END;
$function$;

-- Fix 3: Add auth checks to reporte_top_bottom_digital
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_digital(dias_atras integer)
 RETURNS TABLE(foto text, sku text, categoria text, unidades_vendidas bigint, precio_promedio numeric, stock_disponible bigint, clasificacion text)
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
    WITH VentasDigital AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity)::BIGINT as und_vendidas, 
            SUM(oi.price::NUMERIC * oi.quantity::NUMERIC) as ingresos_totales,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo
        FROM order_items oi 
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND o.source_name != 'pos'
        GROUP BY oi.sku
    ),
    StockGlobal AS (
        SELECT inv.sku, SUM(inv.available)::BIGINT as total_stock
        FROM inventory_snapshot inv
        GROUP BY inv.sku
    )
    SELECT 
        c.image_url, 
        v.sku, 
        c.category, 
        v.und_vendidas,
        ROUND((v.ingresos_totales / NULLIF(v.und_vendidas::NUMERIC, 0)), 0)::NUMERIC,
        COALESCE(s.total_stock, 0)::BIGINT,
        CASE WHEN v.und_full_price >= v.und_promo THEN '🏆 Ganador - Precio Full' ELSE '🧲 Ganador - Promoción' END::TEXT
    FROM VentasDigital v 
    JOIN product_catalog c ON v.sku = c.sku 
    LEFT JOIN StockGlobal s ON v.sku = s.sku
    WHERE UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS') 
    ORDER BY v.und_vendidas DESC;
END;
$function$;

-- Fix 4: Add auth checks to reporte_desempeño_por_canal
CREATE OR REPLACE FUNCTION public."reporte_desempeño_por_canal"(dias_atras integer)
 RETURNS TABLE(canal text, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, sku_top text, sku_peor text)
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
    WITH VentasFiltradas AS (
        SELECT 
            CASE 
                WHEN o.source_name = 'pos' THEN 'Tiendas (POS)'
                ELSE 'Digital (Online/Draft)'
            END as canal_venta,
            oi.sku,
            oi.quantity,
            (oi.price * oi.quantity) as subtotal,
            o.shopify_order_id
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    ),
    MetricasCanal AS (
        SELECT 
            canal_venta,
            SUM(quantity) as total_und,
            SUM(subtotal) as total_ingresos,
            ROUND(SUM(subtotal) / NULLIF(COUNT(DISTINCT shopify_order_id), 0), 0) as avg_ticket
        FROM VentasFiltradas
        GROUP BY canal_venta
    ),
    Rankings AS (
        SELECT 
            canal_venta,
            sku,
            SUM(quantity) as q,
            ROW_NUMBER() OVER(PARTITION BY canal_venta ORDER BY SUM(quantity) DESC) as rank_top,
            ROW_NUMBER() OVER(PARTITION BY canal_venta ORDER BY SUM(quantity) ASC) as rank_bottom
        FROM VentasFiltradas
        GROUP BY canal_venta, sku
    )
    SELECT 
        m.canal_venta,
        m.total_und,
        m.total_ingresos,
        m.avg_ticket,
        (SELECT r.sku FROM Rankings r WHERE r.canal_venta = m.canal_venta AND r.rank_top = 1 LIMIT 1),
        (SELECT r.sku FROM Rankings r WHERE r.canal_venta = m.canal_venta AND r.rank_bottom = 1 LIMIT 1)
    FROM MetricasCanal m;
END;
$function$;

-- Fix 5: Add auth check to reporte_reorden_insumos
CREATE OR REPLACE FUNCTION public.reporte_reorden_insumos()
 RETURNS TABLE(foto text, insumo text, sku text, stock_cedi bigint, consumo_diario_total numeric, dias_autonomia numeric, estado_gestion text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    WITH ConsumoGlobal AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity) / 30.0 as unidades_dia
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - INTERVAL '30 days')
          AND (oi.category ILIKE '%bolsa%' OR oi.category ILIKE '%insumo%')
        GROUP BY oi.sku
    ),
    StockCEDI AS (
        SELECT sku, available as stock
        FROM inventory_snapshot
        WHERE location_id = '71474315479'
    )
    SELECT 
        c.image_url,
        c.title,
        c.sku,
        COALESCE(s.stock, 0)::BIGINT,
        ROUND(COALESCE(v.unidades_dia, 0), 2),
        ROUND(COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0), 1),
        CASE 
            WHEN (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) < 15 THEN '🚨 REORDEN URGENTE'
            WHEN (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) < 30 THEN '⚠️ PLANEAR COMPRA'
            ELSE '✅ STOCK SUFICIENTE'
        END
    FROM product_catalog c
    LEFT JOIN StockCEDI s ON c.sku = s.sku
    LEFT JOIN ConsumoGlobal v ON c.sku = v.sku
    WHERE (c.category ILIKE '%bolsa%' OR c.category ILIKE '%insumo%')
    ORDER BY (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) ASC;
END;
$function$;
