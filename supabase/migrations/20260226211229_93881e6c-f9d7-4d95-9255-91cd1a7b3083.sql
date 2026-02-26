
CREATE OR REPLACE FUNCTION reporte_kpis_comerciales(
    dias_atras INT, p_canal TEXT DEFAULT NULL, p_location_id TEXT DEFAULT NULL
) 
RETURNS TABLE (
    total_pedidos BIGINT, unidades_vendidas BIGINT, ingresos_netos NUMERIC, 
    ticket_promedio NUMERIC, upt NUMERIC, pct_pedidos_full_price NUMERIC, pct_pedidos_con_descuento NUMERIC
) 
SECURITY DEFINER SET search_path TO 'public'
AS $$ 
BEGIN 
    RETURN QUERY 
    WITH OrdenesBase AS (
        SELECT 
            o.shopify_order_id, 
            SUM(oi.quantity::BIGINT) as und_orden,
            SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) as valor_orden,
            SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) = 0 AND oi.is_markdown = false THEN oi.quantity::BIGINT ELSE 0 END) as und_full_price,
            SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) > 0 OR oi.is_markdown = true THEN oi.quantity::BIGINT ELSE 0 END) as und_descuento
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) 
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') 
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id) 
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
          ) 
        GROUP BY o.shopify_order_id
    ) 
    SELECT 
        COUNT(shopify_order_id)::BIGINT, COALESCE(SUM(und_orden), 0)::BIGINT, 
        ROUND(COALESCE(SUM(valor_orden), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 0), 0)::NUMERIC, 
        ROUND(COALESCE(SUM(und_orden)::NUMERIC / NULLIF(COUNT(shopify_order_id)::NUMERIC, 0.0), 2), 2)::NUMERIC, 
        ROUND(COALESCE((SUM(und_full_price)::NUMERIC / NULLIF(SUM(und_orden)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC, 
        ROUND(COALESCE((SUM(und_descuento)::NUMERIC / NULLIF(SUM(und_orden)::NUMERIC, 0.0)) * 100, 0), 1)::NUMERIC 
    FROM OrdenesBase; 
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reporte_tipos_venta(dias_atras INT, p_canal TEXT DEFAULT NULL, p_location_id TEXT DEFAULT NULL)
RETURNS TABLE (tipo_venta TEXT, unidades BIGINT, pct_unidades NUMERIC)
SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    WITH Clasificacion AS (
        SELECT 
            CASE 
                WHEN COALESCE(oi.manual_discount_amount::NUMERIC, 0) > 0 THEN 'Descuento Promocional'
                WHEN oi.is_markdown = true THEN 'Descuento de Producto'
                ELSE 'Full Precio'
            END AS clasificacion_venta,
            oi.quantity::BIGINT AS uds
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) 
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') 
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id) 
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
          )
    ), TotalUnidades AS (SELECT SUM(uds) AS total FROM Clasificacion)
    SELECT c.clasificacion_venta::TEXT, SUM(c.uds)::BIGINT AS unidades, ROUND((SUM(c.uds)::NUMERIC / NULLIF((SELECT total FROM TotalUnidades), 0.0)) * 100, 1)::NUMERIC AS pct_unidades
    FROM Clasificacion c GROUP BY c.clasificacion_venta;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION reporte_kpis_comerciales(int, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION reporte_tipos_venta(int, text, text) TO anon, authenticated;
