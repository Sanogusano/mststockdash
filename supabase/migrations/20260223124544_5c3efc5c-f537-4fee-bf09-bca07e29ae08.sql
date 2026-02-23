
-- 1. Enable RLS on ALL tables
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_fact ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;

-- 2. Drop old permissive/restrictive policies that allow anonymous access
DROP POLICY IF EXISTS "Permitir lectura anonima" ON public.orders;
DROP POLICY IF EXISTS "Permitir lectura anonima" ON public.order_items;
DROP POLICY IF EXISTS "Permitir lectura anonima" ON public.inventory_snapshot;
DROP POLICY IF EXISTS "Permitir lectura anonima" ON public.product_catalog;
DROP POLICY IF EXISTS "Allow all for service role" ON public.product_catalog;

-- 3. Create authenticated-only SELECT policies for all tables
CREATE POLICY "Authenticated users can read orders"
ON public.orders FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read order_items"
ON public.order_items FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read inventory_snapshot"
ON public.inventory_snapshot FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read product_catalog"
ON public.product_catalog FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Service role full access product_catalog"
ON public.product_catalog FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can read locations"
ON public.locations FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read sales_fact"
ON public.sales_fact FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read shopify_orders"
ON public.shopify_orders FOR SELECT TO authenticated
USING (true);

-- 4. Add auth checks to RPC functions
CREATE OR REPLACE FUNCTION public."reporte_desempeño_comercial"(dias_atras integer)
RETURNS TABLE(foto text, producto text, sku text, unidades_vendidas bigint, precio_prom_venta numeric, pct_contribucion numeric, perfil_ejecutivo text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
    gran_total_ingresos NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
      RAISE EXCEPTION 'dias_atras must be between 1 and 365';
    END IF;

    SELECT SUM(oi.price * oi.quantity) INTO gran_total_ingresos
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS');

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT 
            oi.sku,
            SUM(oi.quantity) as und_vendidas,
            SUM(CASE WHEN oi.manual_discount_amount = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as und_promo,
            SUM(oi.price * oi.quantity) as ingresos_netos
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY oi.sku
    )
    SELECT 
        c.image_url,
        c.title,
        v.sku,
        v.und_vendidas,
        ROUND(v.ingresos_netos / NULLIF(v.und_vendidas, 0), 0),
        ROUND((v.ingresos_netos / NULLIF(gran_total_ingresos, 0)) * 100, 2),
        CASE 
            WHEN v.und_full_price >= v.und_promo AND v.und_vendidas > (dias_atras * 0.5) THEN '🏆 Top Performer - Full Price'
            WHEN v.und_promo > v.und_full_price AND v.und_vendidas > (dias_atras * 0.5) THEN '🧲 Top Performer - Promoción'
            ELSE '⏳ Rotación Promedio'
        END
    FROM VentasPeriodo v
    JOIN product_catalog c ON v.sku = c.sku
    ORDER BY v.ingresos_netos DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer)
RETURNS TABLE(tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
      RAISE EXCEPTION 'dias_atras must be between 1 and 365';
    END IF;

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT 
            o.location_id,
            SUM(oi.quantity) / (dias_atras / 7.0) as promedio_venta_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY o.location_id
    ),
    StockPorTienda AS (
        SELECT location_id, SUM(available) as stock_total
        FROM inventory_snapshot
        GROUP BY location_id
    )
    SELECT 
        l.name,
        COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_venta_semanal, 0), 1),
        ROUND(COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0), 1),
        CASE 
            WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) > 20 THEN '🔴 SOBRESTOCK'
            WHEN (COALESCE(s.stock_total, 0) / NULLIF(v.promedio_venta_semanal, 0)) < 8 THEN '🟡 RIESGO AGOTADOS'
            ELSE '🟢 NIVEL ÓPTIMO'
        END
    FROM locations l
    LEFT JOIN StockPorTienda s ON l.location_id = s.location_id
    LEFT JOIN VentasPeriodo v ON l.location_id = v.location_id
    WHERE l.is_active = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_sugerencias_traslado(dias_atras integer)
RETURNS TABLE(foto text, producto text, sku text, tienda_con_sobrestock text, stock_origen numeric, tienda_necesita text, ritmo_venta_destino numeric, accion text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
            o.location_id,
            oi.sku, 
            SUM(oi.quantity) / (dias_atras / 7.0) as venta_prom_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY o.location_id, oi.sku
    )
    SELECT 
        c.image_url,
        c.title,
        c.sku,
        l_orig.name,
        s_orig.available,
        l_dest.name,
        COALESCE(v_dest.venta_prom_semanal, 0),
        '🚚 RECOMENDACIÓN: Trasladar para nivelar'::TEXT
    FROM product_catalog c
    JOIN inventory_snapshot s_orig ON c.sku = s_orig.sku
    JOIN VentasTienda v_orig ON s_orig.sku = v_orig.sku AND s_orig.location_id = v_orig.location_id
    JOIN locations l_orig ON s_orig.location_id = l_orig.location_id
    JOIN inventory_snapshot s_dest ON c.sku = s_dest.sku AND s_dest.available = 0
    JOIN VentasTienda v_dest ON s_dest.sku = v_dest.sku AND s_dest.location_id = v_dest.location_id
    JOIN locations l_dest ON s_dest.location_id = l_dest.location_id
    WHERE s_orig.available > 10 AND l_orig.location_id != l_dest.location_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_reorden_insumos()
RETURNS TABLE(foto text, insumo text, sku text, stock_cedi bigint, consumo_diario_total numeric, dias_autonomia numeric, estado_gestion text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
          AND UPPER(oi.category) IN ('BOLSA', 'INSUMOS')
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
            WHEN (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) < 15 THEN '🚨 REORDEN URGENTE (<15 días)'
            WHEN (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) < 30 THEN '⚠️ PLANEAR COMPRA (<30 días)'
            ELSE '✅ STOCK SUFICIENTE'
        END
    FROM product_catalog c
    LEFT JOIN StockCEDI s ON c.sku = s.sku
    LEFT JOIN ConsumoGlobal v ON c.sku = v.sku
    WHERE UPPER(c.category) IN ('BOLSA', 'INSUMOS')
    ORDER BY (COALESCE(s.stock, 0) / NULLIF(v.unidades_dia, 0)) ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_productos_trending()
RETURNS TABLE(foto text, producto text, sku text, ventas_semana_actual bigint, ventas_periodo_anterior bigint, crecimiento_pct numeric, alerta_tendencia text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    WITH VentasActual AS (
        SELECT oi.sku, SUM(oi.quantity) as unidades
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - INTERVAL '7 days')
          AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY oi.sku
    ),
    VentasPasadas AS (
        SELECT oi.sku, SUM(oi.quantity) / 3.0 as promedio_semanal_pasado
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - INTERVAL '28 days') 
          AND o.created_at < (NOW() - INTERVAL '7 days')
          AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY oi.sku
    )
    SELECT 
        c.image_url,
        c.title,
        c.sku,
        COALESCE(va.unidades, 0)::BIGINT,
        ROUND(COALESCE(vp.promedio_semanal_pasado, 0), 0)::BIGINT,
        ROUND(((COALESCE(va.unidades, 0) - COALESCE(vp.promedio_semanal_pasado, 0)) / NULLIF(COALESCE(vp.promedio_semanal_pasado, 0), 0)) * 100, 1),
        CASE 
            WHEN (COALESCE(va.unidades, 0) / NULLIF(COALESCE(vp.promedio_semanal_pasado, 0), 0)) > 2 THEN '🔥 EXPLOSIVO (>200%)'
            WHEN (COALESCE(va.unidades, 0) / NULLIF(COALESCE(vp.promedio_semanal_pasado, 0), 0)) > 1.3 THEN '📈 EN ALZA (>30%)'
            ELSE '📊 ESTABLE'
        END
    FROM product_catalog c
    JOIN VentasActual va ON c.sku = va.sku
    LEFT JOIN VentasPasadas vp ON c.sku = vp.sku
    WHERE va.unidades > 5
    ORDER BY (COALESCE(va.unidades, 0) / NULLIF(COALESCE(vp.promedio_semanal_pasado, 0), 0)) DESC;
END;
$function$;
