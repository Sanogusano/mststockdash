
CREATE OR REPLACE FUNCTION public.reporte_metricas_tienda_individual(
  dias_atras integer,
  p_location_id text
)
RETURNS TABLE(
  mejor_dia_semana text,
  venta_mejor_dia numeric,
  venta_promedio_diaria_actual numeric,
  venta_promedio_diaria_anterior numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH periodo_actual AS (
    SELECT
      EXTRACT(DOW FROM o.created_at) AS dow,
      TO_CHAR(o.created_at, 'Day') AS dia_nombre,
      SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS venta
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND o.location_id = p_location_id
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY EXTRACT(DOW FROM o.created_at), TO_CHAR(o.created_at, 'Day')
  ),
  mejor AS (
    SELECT TRIM(dia_nombre) AS dia, venta
    FROM periodo_actual
    ORDER BY venta DESC
    LIMIT 1
  ),
  total_actual AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_diaria
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND o.location_id = p_location_id
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  ),
  total_anterior AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_diaria
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras * 2 || ' days')::INTERVAL)
      AND o.created_at < (NOW() - (dias_atras || ' days')::INTERVAL)
      AND o.location_id = p_location_id
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  )
  SELECT
    COALESCE(m.dia, 'N/A')::TEXT,
    ROUND(COALESCE(m.venta, 0), 0)::NUMERIC,
    ROUND(COALESCE(ta.avg_diaria, 0), 0)::NUMERIC,
    ROUND(COALESCE(tp.avg_diaria, 0), 0)::NUMERIC
  FROM (SELECT 1) x
  LEFT JOIN mejor m ON true
  LEFT JOIN total_actual ta ON true
  LEFT JOIN total_anterior tp ON true;
END;
$$;
