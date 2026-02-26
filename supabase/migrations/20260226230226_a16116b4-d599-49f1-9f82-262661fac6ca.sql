
DROP FUNCTION IF EXISTS public.reporte_pareto_categorias(integer, text);

CREATE OR REPLACE FUNCTION public.reporte_pareto_categorias(dias_atras integer, p_canal text DEFAULT 'pos'::text, p_location_id text DEFAULT NULL::text)
 RETURNS TABLE(categoria text, unidades bigint, ingresos numeric, pct_participacion numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    gran_total NUMERIC;
BEGIN
    SELECT SUM(oi.price * oi.quantity) INTO gran_total
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND ((p_canal = 'pos' AND o.source_name = 'pos') OR (p_canal != 'pos' AND o.source_name != 'pos'))
      AND UPPER(oi.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id);

    RETURN QUERY
    SELECT 
        UPPER(c.category),
        SUM(oi.quantity)::BIGINT,
        SUM(oi.price * oi.quantity)::NUMERIC,
        ROUND((SUM(oi.price * oi.quantity) / NULLIF(gran_total, 0)) * 100, 2)
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog c ON oi.sku = c.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND ((p_canal = 'pos' AND o.source_name = 'pos') OR (p_canal != 'pos' AND o.source_name != 'pos'))
      AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
    GROUP BY UPPER(c.category)
    ORDER BY SUM(oi.price * oi.quantity) DESC;
END;
$function$;
