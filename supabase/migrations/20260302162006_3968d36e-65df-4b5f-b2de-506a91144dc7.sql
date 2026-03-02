
CREATE OR REPLACE FUNCTION public.reporte_pct_ventas_por_tipo(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(
  pct_full_price numeric,
  pct_rebajas numeric,
  pct_desc_promo numeric,
  ingresos_full_price numeric,
  ingresos_rebajas numeric,
  ingresos_desc_promo numeric,
  ingresos_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH items_clasificados AS (
    SELECT
      oi.price::numeric * oi.quantity::numeric AS ingreso_item,
      CASE
        -- Prioridad 1: Descuento Promocional (manual_discount_amount > 0)
        WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0 THEN 'DESC_PROMO'
        -- Prioridad 2: Rebajas (compare_at_price > price, fallback a product_catalog)
        WHEN COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) > oi.price::numeric THEN 'REBAJAS'
        -- Prioridad 3: Full Price
        ELSE 'FULL_PRICE'
      END AS tipo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
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
  ),
  totales AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'FULL_PRICE' THEN ingreso_item ELSE 0 END), 0) AS sum_full,
      COALESCE(SUM(CASE WHEN tipo = 'REBAJAS' THEN ingreso_item ELSE 0 END), 0) AS sum_rebajas,
      COALESCE(SUM(CASE WHEN tipo = 'DESC_PROMO' THEN ingreso_item ELSE 0 END), 0) AS sum_promo,
      COALESCE(SUM(ingreso_item), 0) AS sum_total
    FROM items_clasificados
  )
  SELECT
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_full / sum_total) * 100, 1) END::numeric,
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_rebajas / sum_total) * 100, 1) END::numeric,
    CASE WHEN sum_total = 0 THEN 0 ELSE ROUND((sum_promo / sum_total) * 100, 1) END::numeric,
    ROUND(sum_full, 0)::numeric,
    ROUND(sum_rebajas, 0)::numeric,
    ROUND(sum_promo, 0)::numeric,
    ROUND(sum_total, 0)::numeric
  FROM totales;
END;
$$;
