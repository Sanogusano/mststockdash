
DROP FUNCTION IF EXISTS public.reporte_pedidos_por_tipo_venta(integer, text, text, text);

CREATE OR REPLACE FUNCTION public.reporte_pedidos_por_tipo_venta(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_tipo text DEFAULT 'descuento'::text)
 RETURNS TABLE(numero_pedido text, fecha timestamp with time zone, sucursal text, producto text, sku text, cantidad integer, precio numeric, descuento_otorgado numeric, tipo_venta text, compare_at_price numeric, categoria text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        o.order_number::TEXT,
        o.created_at,
        CASE WHEN o.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE l.name END::TEXT,
        p.title::TEXT,
        oi.sku::TEXT,
        oi.quantity::INTEGER,
        oi.price::NUMERIC,
        COALESCE(oi.manual_discount_amount, 0)::NUMERIC,
        CASE
            WHEN COALESCE(oi.manual_discount_amount, 0) > 0 THEN 'Descuento Promocional'
            WHEN oi.is_markdown = true THEN 'Descuento de Producto'
            ELSE 'Full Precio'
        END::TEXT,
        COALESCE(oi.compare_at_price, 0)::NUMERIC,
        COALESCE(UPPER(p.category), 'SIN CATEGORÍA')::TEXT
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
      AND (
          (p_tipo = 'descuento' AND (COALESCE(oi.manual_discount_amount, 0) > 0 OR oi.is_markdown = true)) OR
          (p_tipo = 'full_price' AND COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false)
      )
    ORDER BY o.created_at DESC
    LIMIT 500;
END;
$function$;
