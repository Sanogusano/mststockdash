
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
          AND (NULLIF(TRIM(p_sku_filter), '') IS NULL
               OR pc.sku ILIKE '%' || TRIM(p_sku_filter) || '%'
               OR pc.title ILIKE '%' || TRIM(p_sku_filter) || '%')
        GROUP BY pc.title
    ),
    Ventas AS (
        SELECT p.title AS p,
               SUM(oi.quantity::BIGINT) as uv,
               SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) as uf,
               SUM(CASE WHEN oi.manual_discount_amount::NUMERIC > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) as up
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
        GROUP BY p.title
    ),
    StockT AS (
        SELECT p.title AS p, SUM(inv.available::BIGINT) as st
        FROM inventory_snapshot inv
        JOIN product_catalog p ON inv.sku = p.sku
        WHERE inv.location_id != '71474315479'
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR inv.location_id = p_location_id)
        GROUP BY p.title
    ),
    StockD AS (
        SELECT p.title AS p, SUM(inv.available::BIGINT) as sd
        FROM inventory_snapshot inv
        JOIN product_catalog p ON inv.sku = p.sku
        WHERE inv.location_id = '71474315479'
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR p_location_id = '71474315479')
        GROUP BY p.title
    ),
    BaseUnida AS (
        SELECT FC.f, FC.p, FC.c,
               COALESCE(V.uv, 0) as u_vendidas,
               COALESCE(ST.st, 0) as s_tiendas,
               COALESCE(SD.sd, 0) as s_digital,
               COALESCE(V.uf, 0) as u_full_price,
               COALESCE(V.up, 0) as u_promo
        FROM FiltroCat FC
        LEFT JOIN Ventas V ON FC.p = V.p
        LEFT JOIN StockT ST ON FC.p = ST.p
        LEFT JOIN StockD SD ON FC.p = SD.p
        WHERE (COALESCE(V.uv, 0) > 0 OR COALESCE(ST.st, 0) > 0 OR COALESCE(SD.sd, 0) > 0)
    )
    SELECT B.f, 'Varias Tallas'::TEXT, B.p, B.c,
           B.u_vendidas::BIGINT, B.s_tiendas::BIGINT, B.s_digital::BIGINT,
           CASE WHEN B.u_full_price >= B.u_promo THEN '🏆 Precio Full' ELSE '🧲 Promoción' END::TEXT,
           CASE WHEN (B.u_vendidas + B.s_tiendas + B.s_digital) = 0 THEN 0.0
                ELSE ROUND((B.u_vendidas::NUMERIC / (B.u_vendidas + B.s_tiendas + B.s_digital)::NUMERIC) * 100, 1)
           END::NUMERIC,
           CASE WHEN B.u_vendidas = 0 THEN 0.0
                ELSE ROUND(((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))), 1)
           END::NUMERIC,
           CASE WHEN B.u_vendidas = 0 AND (B.s_tiendas + B.s_digital) > 0 THEN '🔴 ESTANCADO'
                WHEN B.u_vendidas > 0 AND ((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) > 12 THEN '🔴 SOBRESTOCK'
                WHEN B.u_vendidas > 0 AND ((B.s_tiendas + B.s_digital)::NUMERIC / (B.u_vendidas::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) < 4 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 ÓPTIMO'
           END::TEXT
    FROM BaseUnida B
    ORDER BY B.u_vendidas DESC;
END;
$function$;
