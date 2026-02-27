
-- Drop functions with changed return types first
DROP FUNCTION IF EXISTS public.reporte_top_productos_global(integer,text,text,text,integer);
DROP FUNCTION IF EXISTS public.reporte_kpis_comerciales(integer,text,text);

-- 1. Recreate reporte_top_productos_global with 3 percentages + 3 classifications
CREATE OR REPLACE FUNCTION public.reporte_top_productos_global(dias_atras integer, p_canal text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_orden text DEFAULT 'TOP'::text, p_limite integer DEFAULT 50)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint, pct_full_price numeric, pct_rebajas numeric, pct_descuento numeric, clasificacion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT
      p.title AS prod, MAX(p.image_url) AS img, MAX(p.category) AS cat,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%' AND o.location_id != '71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%') THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%'))
    GROUP BY p.title
  )
  SELECT v.img::TEXT, v.prod::TEXT, 'Varias Tallas'::TEXT, UPPER(v.cat)::TEXT,
    v.uds_tiendas, v.uds_outlets, v.uds_digital, v.uds_total,
    CASE WHEN v.uds_total = 0 THEN 0.0 ELSE ROUND((v.uds_full / v.uds_total::NUMERIC) * 100, 1) END::NUMERIC,
    CASE WHEN v.uds_total = 0 THEN 0.0 ELSE ROUND((v.uds_rebajas / v.uds_total::NUMERIC) * 100, 1) END::NUMERIC,
    CASE WHEN v.uds_total = 0 THEN 0.0 ELSE ROUND((v.uds_promo / v.uds_total::NUMERIC) * 100, 1) END::NUMERIC,
    CASE 
      WHEN v.uds_full >= v.uds_rebajas AND v.uds_full >= v.uds_promo THEN '🏆 Ganador Full Price'
      WHEN v.uds_rebajas >= v.uds_full AND v.uds_rebajas >= v.uds_promo THEN '🏷️ Ganador Rebajas'
      ELSE '🧲 Ganador Promo'
    END::TEXT
  FROM VentasPorCanal v
  WHERE v.uds_total > 0
  ORDER BY
    CASE WHEN UPPER(COALESCE(p_orden, 'TOP')) = 'TOP' THEN v.uds_total END DESC NULLS LAST,
    CASE WHEN UPPER(COALESCE(p_orden, 'TOP')) != 'TOP' THEN v.uds_total END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limite, 50), 1);
END;
$function$;

-- 2. Recreate reporte_kpis_comerciales with pct_pedidos_rebajas
CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
BEGIN 
    RETURN QUERY 
    WITH OrdenesBase AS (
        SELECT o.shopify_order_id, 
            SUM(oi.quantity::BIGINT) as und_orden,
            SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) as valor_orden,
            SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) = 0 AND oi.is_markdown = false THEN oi.quantity::BIGINT ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity::BIGINT ELSE 0 END) as und_rebajas,
            SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) > 0 AND oi.is_markdown = false THEN oi.quantity::BIGINT ELSE 0 END) as und_descuento
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) 
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') 
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id) 
          AND (NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%'))
        GROUP BY o.shopify_order_id
    ) 
    SELECT 
        COUNT(shopify_order_id)::BIGINT,
        COALESCE(SUM(und_orden), 0)::BIGINT, 
        ROUND(COALESCE(SUM(valor_orden), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(und_orden)::NUMERIC / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 2), 2)::NUMERIC, 
        ROUND(COALESCE((SUM(und_full_price)::NUMERIC / NULLIF(SUM(und_orden)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC, 
        ROUND(COALESCE((SUM(und_rebajas)::NUMERIC / NULLIF(SUM(und_orden)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC, 
        ROUND(COALESCE((SUM(und_descuento)::NUMERIC / NULLIF(SUM(und_orden)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC 
    FROM OrdenesBase; 
END; 
$function$;

-- 3. Update reporte_ejecutivo_productos: 3-way classification
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, orden text DEFAULT 'TOP'::text, limite integer DEFAULT 20)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, clasificacion text, unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN RAISE EXCEPTION 'dias_atras must be between 1 and 365'; END IF;
  RETURN QUERY
  WITH VentasFiltradas AS (
    SELECT oi.sku AS v_sku, SUM(oi.quantity) AS und_vendidas, SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL) AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (canal_filtro IS NULL OR (canal_filtro = 'POS' AND o.source_name = 'pos') OR (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
      AND (location_filtro IS NULL OR o.location_id = location_filtro)
    GROUP BY oi.sku
  ),
  StockTotal AS (SELECT inv.sku AS s_sku, SUM(inv.available)::bigint AS stock FROM inventory_snapshot inv GROUP BY inv.sku)
  SELECT c.image_url, c.title, v.v_sku, c.category,
    CASE WHEN v.und_full >= v.und_rebajas AND v.und_full >= v.und_promo THEN 'Ganador Full Price'
         WHEN v.und_rebajas >= v.und_full AND v.und_rebajas >= v.und_promo THEN 'Ganador Rebajas'
         ELSE 'Ganador Promo' END,
    v.und_vendidas, ROUND(v.ingresos / NULLIF(v.und_vendidas, 0), 0), COALESCE(st.stock, 0)
  FROM VentasFiltradas v JOIN product_catalog c ON v.v_sku = c.sku LEFT JOIN StockTotal st ON v.v_sku = st.s_sku
  ORDER BY CASE WHEN orden = 'TOP' THEN v.und_vendidas END DESC NULLS LAST, CASE WHEN orden = 'BOTTOM' THEN v.und_vendidas END ASC NULLS LAST
  LIMIT limite;
END;
$function$;

-- 4. Update reporte_comportamiento_producto: 3-way classification
CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(dias_atras integer, p_sku_filter text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(foto text, sku text, producto text, categoria text, und_vendidas bigint, stock_tiendas bigint, stock_digital bigint, clasificacion text, sell_through_pct numeric, wos numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH FiltroCat AS (
        SELECT pc.title AS p, MAX(pc.image_url) AS f, MAX(pc.category) AS c
        FROM product_catalog pc
        WHERE UPPER(pc.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (NULLIF(TRIM(p_sku_filter), '') IS NULL OR pc.sku ILIKE '%' || TRIM(p_sku_filter) || '%' OR pc.title ILIKE '%' || TRIM(p_sku_filter) || '%')
        GROUP BY pc.title
    ),
    Ventas AS (
        SELECT p.title AS p, SUM(oi.quantity::BIGINT) as uv,
               SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as uf,
               SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) as ur,
               SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as up
        FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
        GROUP BY p.title
    ),
    StockT AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.location_id != '71474315479' AND (NULLIF(TRIM(p_location_id), '') IS NULL OR inv.location_id = p_location_id) GROUP BY p.title),
    StockD AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.location_id = '71474315479' AND (NULLIF(TRIM(p_location_id), '') IS NULL OR p_location_id = '71474315479') GROUP BY p.title),
    BaseUnida AS (
        SELECT FC.f, FC.p, FC.c, COALESCE(V.uv, 0) as u_vendidas, COALESCE(ST.st, 0) as s_tiendas, COALESCE(SD.sd, 0) as s_digital,
               COALESCE(V.uf, 0) as u_full_price, COALESCE(V.ur, 0) as u_rebajas, COALESCE(V.up, 0) as u_promo
        FROM FiltroCat FC LEFT JOIN Ventas V ON FC.p = V.p LEFT JOIN StockT ST ON FC.p = ST.p LEFT JOIN StockD SD ON FC.p = SD.p
        WHERE (COALESCE(V.uv, 0) > 0 OR COALESCE(ST.st, 0) > 0 OR COALESCE(SD.sd, 0) > 0)
    )
    SELECT B.f, 'Varias Tallas'::TEXT, B.p, B.c, B.u_vendidas::BIGINT, B.s_tiendas::BIGINT, B.s_digital::BIGINT,
           CASE WHEN B.u_full_price >= B.u_rebajas AND B.u_full_price >= B.u_promo THEN '🏆 Precio Full'
                WHEN B.u_rebajas >= B.u_full_price AND B.u_rebajas >= B.u_promo THEN '🏷️ Rebajas'
                ELSE '🧲 Promoción' END::TEXT,
           CASE WHEN (B.u_vendidas + B.s_tiendas + B.s_digital) = 0 THEN 0.0 ELSE ROUND((B.u_vendidas::NUMERIC / (B.u_vendidas + B.s_tiendas + B.s_digital)::NUMERIC) * 100, 1) END::NUMERIC,
           CASE WHEN B.u_vendidas = 0 THEN 0.0 ELSE ROUND(((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))), 1) END::NUMERIC,
           CASE WHEN B.u_vendidas = 0 AND (B.s_tiendas + B.s_digital) > 0 THEN '🔴 ESTANCADO'
                WHEN B.u_vendidas > 0 AND ((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) > 12 THEN '🔴 SOBRESTOCK'
                WHEN B.u_vendidas > 0 AND ((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) < 4 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 ÓPTIMO' END::TEXT
    FROM BaseUnida B ORDER BY B.u_vendidas DESC;
END;
$function$;
