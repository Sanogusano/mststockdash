CREATE OR REPLACE FUNCTION public.reporte_pareto_categorias(
  dias_atras integer,
  p_canal text DEFAULT 'pos'::text,
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(categoria text, unidades bigint, ingresos numeric, pct_participacion numeric)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    gran_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
    INTO gran_total
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog c ON oi.sku = c.sku
    JOIN locations l ON o.location_id = l.location_id
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (
          NULLIF(TRIM(p_canal), '') IS NULL OR
          (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
          (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR
          (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
      );

    RETURN QUERY
    SELECT
        UPPER(c.category)::text,
        SUM(oi.quantity)::BIGINT,
        SUM(oi.price * oi.quantity)::NUMERIC,
        CASE
          WHEN gran_total = 0 THEN 0::numeric
          ELSE ROUND((SUM(oi.price * oi.quantity) / gran_total) * 100, 2)
        END::numeric
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog c ON oi.sku = c.sku
    JOIN locations l ON o.location_id = l.location_id
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (
          NULLIF(TRIM(p_canal), '') IS NULL OR
          (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
          (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND (UPPER(l.name) LIKE '%SOPO%' OR UPPER(l.name) LIKE '%UNICO%' OR UPPER(l.name) LIKE '%ÚNICO%')) OR
          (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(l.name) NOT LIKE '%SOPO%' AND UPPER(l.name) NOT LIKE '%UNICO%' AND UPPER(l.name) NOT LIKE '%ÚNICO%')
      )
    GROUP BY UPPER(c.category)
    ORDER BY SUM(oi.price * oi.quantity) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ordenes_base AS (
    SELECT
      o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(oi.is_markdown = true) AS has_rebajas,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
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
  ),
  resumen AS (
    SELECT
      COUNT(*)::bigint AS total_pedidos_calc,
      COALESCE(SUM(und_orden), 0)::bigint AS unidades_vendidas_calc,
      ROUND(COALESCE(SUM(valor_orden), 0), 0)::numeric AS ingresos_netos_calc,
      ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket_promedio_calc,
      ROUND(COALESCE(SUM(und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      COUNT(*) FILTER (WHERE has_rebajas)::numeric AS pedidos_rebajas,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND has_descuento)::numeric AS pedidos_descuento,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND NOT has_descuento)::numeric AS pedidos_full
    FROM ordenes_base
  )
  SELECT
    total_pedidos_calc,
    unidades_vendidas_calc,
    ingresos_netos_calc,
    ticket_promedio_calc,
    upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_kpis_periodo_anterior(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text
)
RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH ordenes_base AS (
    SELECT
      o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(oi.is_markdown = true) AS has_rebajas,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
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
  ),
  resumen AS (
    SELECT
      COUNT(*)::bigint AS total_pedidos_calc,
      COALESCE(SUM(und_orden), 0)::bigint AS unidades_vendidas_calc,
      ROUND(COALESCE(SUM(valor_orden), 0), 0)::numeric AS ingresos_netos_calc,
      ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket_promedio_calc,
      ROUND(COALESCE(SUM(und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      COUNT(*) FILTER (WHERE has_rebajas)::numeric AS pedidos_rebajas,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND has_descuento)::numeric AS pedidos_descuento,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND NOT has_descuento)::numeric AS pedidos_full
    FROM ordenes_base
  )
  SELECT
    total_pedidos_calc,
    unidades_vendidas_calc,
    ingresos_netos_calc,
    ticket_promedio_calc,
    upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reporte_pedidos_por_tipo_venta(
  dias_atras integer,
  p_canal text DEFAULT NULL::text,
  p_location_id text DEFAULT NULL::text,
  p_tipo text DEFAULT 'descuento'::text
)
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
      WHEN oi.is_markdown = true THEN 'Descuento de Producto'
      WHEN COALESCE(oi.manual_discount_amount, 0) > 0 THEN 'Descuento Promocional'
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
      (p_tipo = 'descuento' AND COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false) OR
      (p_tipo = 'full_price' AND COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false) OR
      (p_tipo = 'rebajas' AND oi.is_markdown = true)
    )
  ORDER BY o.created_at DESC
  LIMIT 500;
END;
$function$;