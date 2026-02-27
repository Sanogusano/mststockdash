
CREATE OR REPLACE FUNCTION public.reporte_kpis_periodo_anterior(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(
  total_pedidos bigint,
  unidades_vendidas bigint,
  ingresos_netos numeric,
  ticket_promedio numeric,
  upt numeric,
  pct_pedidos_full_price numeric,
  pct_pedidos_rebajas numeric,
  pct_pedidos_con_descuento numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) * 2 || ' days')::INTERVAL)
          AND o.created_at < (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
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
$$;
