
-- 1. reporte_desempeño_por_canal
CREATE OR REPLACE FUNCTION public."reporte_desempeño_por_canal"(dias_atras integer)
RETURNS TABLE(canal text, ventas_totales numeric, total_pedidos bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        CASE 
            WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN 'Digital'
            WHEN UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET' THEN 'Outlets'
            ELSE 'Tiendas Físicas'
        END::TEXT AS canal_agrupado,
        SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19)::NUMERIC AS ventas_totales,
        COUNT(DISTINCT o.shopify_order_id)::BIGINT AS total_pedidos
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY canal_agrupado;
END;
$function$;

-- 2. reporte_kpis_comerciales
CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
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
    total_pedidos_calc, unidades_vendidas_calc, ingresos_netos_calc, ticket_promedio_calc, upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

-- 3. reporte_kpis_periodo_anterior
CREATE OR REPLACE FUNCTION public.reporte_kpis_periodo_anterior(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
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
    total_pedidos_calc, unidades_vendidas_calc, ingresos_netos_calc, ticket_promedio_calc, upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

-- 4. reporte_pareto_categorias
CREATE OR REPLACE FUNCTION public.reporte_pareto_categorias(dias_atras integer, p_canal text DEFAULT 'pos'::text, p_location_id text DEFAULT NULL::text)
RETURNS TABLE(categoria text, unidades bigint, ingresos numeric, pct_participacion numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    gran_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0) INTO gran_total
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      );

    RETURN QUERY
    SELECT UPPER(c.category)::text, SUM(oi.quantity)::BIGINT, SUM(oi.price * oi.quantity)::NUMERIC,
      CASE WHEN gran_total = 0 THEN 0::numeric ELSE ROUND((SUM(oi.price * oi.quantity) / gran_total) * 100, 2) END::numeric
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY UPPER(c.category)
    ORDER BY SUM(oi.price * oi.quantity) DESC;
END;
$function$;

-- 5. reporte_pct_ventas_por_tipo
CREATE OR REPLACE FUNCTION public.reporte_pct_ventas_por_tipo(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
RETURNS TABLE(pct_full_price numeric, pct_rebajas numeric, pct_desc_promo numeric, ingresos_full_price numeric, ingresos_rebajas numeric, ingresos_desc_promo numeric, ingresos_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH items_clasificados AS (
    SELECT
      oi.price::numeric * oi.quantity::numeric AS ingreso_item,
      CASE
        WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0 THEN 'DESC_PROMO'
        WHEN COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) > oi.price::numeric THEN 'REBAJAS'
        WHEN p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric THEN 'REBAJAS'
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
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
    ROUND(sum_full, 0)::numeric, ROUND(sum_rebajas, 0)::numeric, ROUND(sum_promo, 0)::numeric, ROUND(sum_total, 0)::numeric
  FROM totales;
END;
$function$;

-- 6. reporte_pedidos_por_tipo_venta
CREATE OR REPLACE FUNCTION public.reporte_pedidos_por_tipo_venta(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_tipo text DEFAULT 'descuento'::text)
RETURNS TABLE(numero_pedido text, fecha timestamp with time zone, sucursal text, producto text, sku text, cantidad integer, precio numeric, descuento_otorgado numeric, tipo_venta text, compare_at_price numeric, categoria text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.order_number::TEXT, o.created_at,
    CASE WHEN o.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE l.name END::TEXT,
    p.title::TEXT, oi.sku::TEXT, oi.quantity::INTEGER, oi.price::NUMERIC,
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
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
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

-- 7. reporte_ranking_tiendas
CREATE OR REPLACE FUNCTION public.reporte_ranking_tiendas(dias_atras integer, p_canal text DEFAULT NULL::text)
RETURNS TABLE(tienda text, ventas_totales numeric, unidades_vendidas bigint, ticket_promedio numeric, upt numeric, pct_venta_full_price numeric, inventario_valorado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH OrdenesTienda AS (
        SELECT l.name AS nombre_tienda, o.shopify_order_id, SUM(oi.quantity::BIGINT) AS und_orden,
        SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS valor_orden,
        SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN (((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) ELSE 0 END) AS valor_full_price
        FROM orders o 
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id 
        JOIN locations l ON o.location_id = l.location_id 
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL) AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR 
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR 
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
          ) 
        GROUP BY l.name, o.shopify_order_id
    ), AgrupadoTienda AS (
        SELECT nombre_tienda, COUNT(shopify_order_id)::BIGINT AS total_transacciones, SUM(und_orden)::BIGINT AS total_unidades, SUM(valor_orden)::NUMERIC AS total_ventas, SUM(valor_full_price)::NUMERIC AS total_ventas_full FROM OrdenesTienda GROUP BY nombre_tienda
    ), StockValorado AS (
        SELECT l.name AS nombre_tienda, SUM(0) AS total_inventario_valorado FROM inventory_snapshot inv JOIN locations l ON inv.location_id = l.location_id JOIN product_catalog p ON inv.sku = p.sku WHERE l.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY l.name
    )
    SELECT a.nombre_tienda::TEXT, ROUND(a.total_ventas, 0)::NUMERIC, a.total_unidades, ROUND(a.total_ventas / NULLIF(a.total_transacciones::NUMERIC, 0.0), 0)::NUMERIC, ROUND(a.total_unidades::NUMERIC / NULLIF(a.total_transacciones::NUMERIC, 0.0), 2)::NUMERIC, ROUND((a.total_ventas_full / NULLIF(a.total_ventas, 0.0)) * 100, 1)::NUMERIC, ROUND(COALESCE(s.total_inventario_valorado, 0), 0)::NUMERIC
    FROM AgrupadoTienda a LEFT JOIN StockValorado s ON a.nombre_tienda = s.nombre_tienda ORDER BY a.total_ventas DESC;
END;
$function$;

-- 8. reporte_tipos_venta
CREATE OR REPLACE FUNCTION public.reporte_tipos_venta(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text)
RETURNS TABLE(tipo_venta text, unidades bigint, pct_unidades numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR 
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
          )
    ), TotalUnidades AS (SELECT SUM(uds) AS total FROM Clasificacion)
    SELECT c.clasificacion_venta::TEXT, SUM(c.uds)::BIGINT AS unidades, ROUND((SUM(c.uds)::NUMERIC / NULLIF((SELECT total FROM TotalUnidades), 0.0)) * 100, 1)::NUMERIC AS pct_unidades
    FROM Clasificacion c GROUP BY c.clasificacion_venta;
END;
$function$;

-- 9. reporte_top_productos_global
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
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
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
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
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

-- 10. reporte_desempeno_por_linea
CREATE OR REPLACE FUNCTION public.reporte_desempeno_por_linea(dias_atras integer, p_canal text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text)
RETURNS TABLE(categoria text, stock_tiendas bigint, stock_digital bigint, und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint, pct_participacion numeric, sell_through_pct numeric, wos numeric, estado_salud text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  gran_total_uds NUMERIC;
BEGIN
  SELECT COALESCE(SUM(oi.quantity), 0) INTO gran_total_uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN locations l ON o.location_id = l.location_id
  JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
    AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (
      NULLIF(TRIM(p_canal), '') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
    );

  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT
      UPPER(p.category) AS cat,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY UPPER(p.category)
  ),
  StockTiendas AS (
    SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS st
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.location_id != '71474315479'
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  ),
  StockDigital AS (
    SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS sd
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.location_id = '71474315479'
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  )
  SELECT
    COALESCE(v.cat, COALESCE(st.cat, sd.cat))::TEXT,
    COALESCE(st.st, 0)::BIGINT, COALESCE(sd.sd, 0)::BIGINT,
    COALESCE(v.uds_tiendas, 0)::BIGINT, COALESCE(v.uds_outlets, 0)::BIGINT,
    COALESCE(v.uds_digital, 0)::BIGINT, COALESCE(v.uds_total, 0)::BIGINT,
    ROUND(COALESCE(v.uds_total, 0)::NUMERIC / NULLIF(gran_total_uds, 0) * 100, 1)::NUMERIC,
    CASE WHEN (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) = 0 THEN 0.0
      ELSE ROUND(COALESCE(v.uds_total, 0)::NUMERIC / (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(v.uds_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0)), 1)
    END::NUMERIC,
    CASE 
      WHEN COALESCE(v.uds_total, 0) = 0 AND (COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) > 0 THEN '🔴 ESTANCADO'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) > 12 THEN '🔴 SOBRESTOCK'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) < 4 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 ÓPTIMO'
    END::TEXT
  FROM VentasPorCanal v
  FULL OUTER JOIN StockTiendas st ON v.cat = st.cat
  FULL OUTER JOIN StockDigital sd ON COALESCE(v.cat, st.cat) = sd.cat
  WHERE (COALESCE(v.uds_total, 0) > 0 OR COALESCE(st.st, 0) > 0 OR COALESCE(sd.sd, 0) > 0)
  ORDER BY COALESCE(v.uds_total, 0) DESC;
END;
$function$;
