
-- =====================================================
-- FIX: Add upper date boundary support to all RPC functions
-- to prevent "Mes Anterior" from including current month data
-- =====================================================

-- Step 1: Drop old _col_date_boundary and recreate with optional reference date
DROP FUNCTION IF EXISTS public._col_date_boundary(integer);

CREATE OR REPLACE FUNCTION public._col_date_boundary(dias integer, p_referencia date DEFAULT NULL)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT (COALESCE(p_referencia, (NOW() AT TIME ZONE 'America/Bogota')::date) - dias)::timestamp AT TIME ZONE 'America/Bogota';
$function$;

-- Step 2: Create upper boundary helper
CREATE OR REPLACE FUNCTION public._col_upper_boundary(p_hasta date DEFAULT NULL)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE 
    WHEN p_hasta IS NULL THEN 'infinity'::timestamptz
    ELSE (p_hasta + interval '1 day')::timestamp AT TIME ZONE 'America/Bogota'
  END;
$function$;

-- reporte_kpis_comerciales: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_kpis_comerciales(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  WITH ordenes_base AS (
    SELECT o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(oi.is_markdown = true) AS has_rebajas,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY o.shopify_order_id
  ),
  resumen AS (
    SELECT COUNT(*)::bigint AS total_pedidos_calc, COALESCE(SUM(und_orden), 0)::bigint AS unidades_vendidas_calc,
      ROUND(COALESCE(SUM(valor_orden), 0), 0)::numeric AS ingresos_netos_calc,
      ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket_promedio_calc,
      ROUND(COALESCE(SUM(und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      COUNT(*) FILTER (WHERE has_rebajas)::numeric AS pedidos_rebajas,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND has_descuento)::numeric AS pedidos_descuento,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND NOT has_descuento)::numeric AS pedidos_full
    FROM ordenes_base
  )
  SELECT total_pedidos_calc, unidades_vendidas_calc, ingresos_netos_calc, ticket_promedio_calc, upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

-- reporte_kpis_periodo_anterior: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_kpis_periodo_anterior(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(total_pedidos bigint, unidades_vendidas bigint, ingresos_netos numeric, ticket_promedio numeric, upt numeric, pct_pedidos_full_price numeric, pct_pedidos_rebajas numeric, pct_pedidos_con_descuento numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias int := GREATEST(COALESCE(dias_atras, 0), 0);
  v_boundary timestamptz := _col_date_boundary(v_dias, p_hasta);
  v_boundary_ant timestamptz := _col_date_boundary(v_dias * 2, p_hasta);
BEGIN
  RETURN QUERY
  WITH ordenes_base AS (
    SELECT o.shopify_order_id,
      SUM(oi.quantity::bigint) AS und_orden,
      SUM(((oi.price::numeric * oi.quantity::numeric) - COALESCE(oi.manual_discount_amount::numeric, 0)) / 1.19) AS valor_orden,
      BOOL_OR(oi.is_markdown = true) AS has_rebajas,
      BOOL_OR(COALESCE(oi.manual_discount_amount::numeric, 0) > 0) AS has_descuento
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary_ant
      AND o.created_at < v_boundary
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY o.shopify_order_id
  ),
  resumen AS (
    SELECT COUNT(*)::bigint AS total_pedidos_calc, COALESCE(SUM(und_orden), 0)::bigint AS unidades_vendidas_calc,
      ROUND(COALESCE(SUM(valor_orden), 0), 0)::numeric AS ingresos_netos_calc,
      ROUND(COALESCE(SUM(valor_orden) / NULLIF(COUNT(*)::numeric, 0), 0), 0)::numeric AS ticket_promedio_calc,
      ROUND(COALESCE(SUM(und_orden)::numeric / NULLIF(COUNT(*)::numeric, 0), 0), 2)::numeric AS upt_calc,
      COUNT(*) FILTER (WHERE has_rebajas)::numeric AS pedidos_rebajas,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND has_descuento)::numeric AS pedidos_descuento,
      COUNT(*) FILTER (WHERE NOT has_rebajas AND NOT has_descuento)::numeric AS pedidos_full
    FROM ordenes_base
  )
  SELECT total_pedidos_calc, unidades_vendidas_calc, ingresos_netos_calc, ticket_promedio_calc, upt_calc,
    ROUND(COALESCE((pedidos_full / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_rebajas / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric,
    ROUND(COALESCE((pedidos_descuento / NULLIF(total_pedidos_calc::numeric, 0)) * 100, 0), 1)::numeric
  FROM resumen;
END;
$function$;

-- reporte_ranking_tiendas: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_ranking_tiendas(dias_atras integer, p_canal text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tienda text, ventas_totales numeric, unidades_vendidas bigint, ticket_promedio numeric, upt numeric, pct_venta_full_price numeric, inventario_valorado numeric, zona text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    RETURN QUERY
    WITH OrdenesTienda AS (
        SELECT l.name AS nombre_tienda, l.zona AS zona_tienda, o.shopify_order_id, SUM(oi.quantity::BIGINT) AS und_orden,
        SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS valor_orden,
        SUM(CASE WHEN oi.manual_discount_amount::NUMERIC = 0 AND oi.is_markdown = false THEN (((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) ELSE 0 END) AS valor_full_price
        FROM orders o
        JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
        JOIN locations l ON o.location_id = l.location_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= v_boundary
          AND o.created_at < v_upper
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
          )
        GROUP BY l.name, l.zona, o.shopify_order_id
    ), AgrupadoTienda AS (
        SELECT nombre_tienda, zona_tienda, COUNT(shopify_order_id)::BIGINT AS total_transacciones, SUM(und_orden)::BIGINT AS total_unidades, SUM(valor_orden)::NUMERIC AS total_ventas, SUM(valor_full_price)::NUMERIC AS total_ventas_full FROM OrdenesTienda GROUP BY nombre_tienda, zona_tienda
    )
    SELECT a.nombre_tienda::TEXT, ROUND(a.total_ventas, 0)::NUMERIC, a.total_unidades, ROUND(a.total_ventas / NULLIF(a.total_transacciones::NUMERIC, 0.0), 0)::NUMERIC, ROUND(a.total_unidades::NUMERIC / NULLIF(a.total_transacciones::NUMERIC, 0.0), 2)::NUMERIC, ROUND((a.total_ventas_full / NULLIF(a.total_ventas, 0.0)) * 100, 1)::NUMERIC, 0::NUMERIC,
    COALESCE(a.zona_tienda, 'Sin Zona')::TEXT
    FROM AgrupadoTienda a ORDER BY a.total_ventas DESC;
END;
$function$;

-- reporte_ranking_tiendas_anterior: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_ranking_tiendas_anterior(dias_atras integer, p_canal text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tienda text, ventas_totales numeric, unidades_vendidas bigint, ticket_promedio numeric, upt numeric, pct_venta_full_price numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias int := GREATEST(COALESCE(dias_atras, 0), 0);
  v_boundary timestamptz := _col_date_boundary(v_dias, p_hasta);
  v_boundary_ant timestamptz := _col_date_boundary(v_dias * 2, p_hasta);
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
        WHERE o.created_at >= v_boundary_ant
          AND o.created_at < v_boundary
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (
              NULLIF(TRIM(p_canal), '') IS NULL OR
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
          )
        GROUP BY l.name, o.shopify_order_id
    ), AgrupadoTienda AS (
        SELECT nombre_tienda, COUNT(shopify_order_id)::BIGINT AS total_transacciones, SUM(und_orden)::BIGINT AS total_unidades, SUM(valor_orden)::NUMERIC AS total_ventas, SUM(valor_full_price)::NUMERIC AS total_ventas_full FROM OrdenesTienda GROUP BY nombre_tienda
    )
    SELECT a.nombre_tienda::TEXT, ROUND(a.total_ventas, 0)::NUMERIC, a.total_unidades, ROUND(a.total_ventas / NULLIF(a.total_transacciones::NUMERIC, 0.0), 0)::NUMERIC, ROUND(a.total_unidades::NUMERIC / NULLIF(a.total_transacciones::NUMERIC, 0.0), 2)::NUMERIC, ROUND((a.total_ventas_full / NULLIF(a.total_ventas, 0.0)) * 100, 1)::NUMERIC
    FROM AgrupadoTienda a ORDER BY a.total_ventas DESC;
END;
$function$;

-- reporte_ejecutivo_kpis: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_kpis(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(ventas_totales numeric, unidades_totales bigint, ticket_promedio numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 1), 1), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN RAISE EXCEPTION 'dias_atras must be between 1 and 365'; END IF;
  RETURN QUERY
  SELECT
    COALESCE(SUM(oi.price * oi.quantity), 0)::numeric,
    COALESCE(SUM(oi.quantity), 0)::bigint,
    ROUND(COALESCE(SUM(oi.price * oi.quantity), 0) / NULLIF(COUNT(DISTINCT o.shopify_order_id), 0), 0)::numeric
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= v_boundary
    AND o.created_at < v_upper
    AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (canal_filtro IS NULL OR
         (canal_filtro = 'POS' AND o.source_name = 'pos') OR
         (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
    AND (location_filtro IS NULL OR o.location_id = location_filtro);
END;
$function$;

-- reporte_ejecutivo_productos: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, orden text DEFAULT 'TOP'::text, limite integer DEFAULT 20, zona_filtro text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, clasificacion text, unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint, sell_through_pct numeric, wos numeric, coleccion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_max_date date;
  v_boundary timestamptz := _col_date_boundary(dias_atras, p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH VentasFiltradas AS (
    SELECT p.product_id AS pid, MAX(p.image_url) AS img, MAX(p.title) AS titulo,
      MAX(p.category) AS cat, MAX(COALESCE(p.collection_season, '')) AS col_season,
      SUM(oi.quantity)::BIGINT AS und_vendidas, SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric,0)=0 AND COALESCE(NULLIF(oi.compare_at_price::numeric,0),NULLIF(p.compare_at_price::numeric,0),0)<=oi.price::numeric AND NOT(p.price IS NOT NULL AND p.price>0 AND oi.price::numeric<p.price::numeric) THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric,0)=0 AND (COALESCE(NULLIF(oi.compare_at_price::numeric,0),NULLIF(p.compare_at_price::numeric,0),0)>oi.price::numeric OR (p.price IS NOT NULL AND p.price>0 AND oi.price::numeric<p.price::numeric)) THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric,0)>0 THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    JOIN locations l ON o.location_id=l.location_id
    JOIN product_catalog p ON oi.sku=p.sku
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS') AND p.product_id IS NOT NULL
      AND (NULLIF(TRIM(location_filtro),'') IS NULL OR o.location_id=location_filtro)
      AND (NULLIF(TRIM(zona_filtro),'') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona=zona_filtro AND loc.is_active=true))
      AND (NULLIF(TRIM(canal_filtro),'') IS NULL OR
        (UPPER(canal_filtro)='DIGITAL' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
        (UPPER(canal_filtro)='OUTLET' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
        (UPPER(canal_filtro)='TIENDAS' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479') OR
        (UPPER(canal_filtro)='POS' AND o.source_name='pos'))
    GROUP BY p.product_id
  ),
  StockTotal AS (
    SELECT p.product_id AS pid, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv JOIN product_catalog p ON p.variant_id=inv.variant_id
    WHERE inv.snapshot_date=v_max_date AND p.product_id IS NOT NULL AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND (NULLIF(TRIM(location_filtro),'') IS NULL OR inv.location_id=location_filtro)
      AND (NULLIF(TRIM(zona_filtro),'') IS NULL OR inv.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona=zona_filtro AND loc.is_active=true))
    GROUP BY p.product_id
  ),
  Combinado AS (
    SELECT v.img, v.titulo, v.pid, v.cat, v.col_season, v.und_vendidas, v.ingresos,
      COALESCE(st.stock,0)::BIGINT AS stock, v.und_full, v.und_rebajas, v.und_promo,
      CASE WHEN (v.und_vendidas+COALESCE(st.stock,0))=0 THEN 0.0 ELSE ROUND(v.und_vendidas::NUMERIC/(v.und_vendidas+COALESCE(st.stock,0))::NUMERIC*100,1) END AS st_pct,
      CASE WHEN v.und_vendidas=0 THEN 0.0 ELSE ROUND(COALESCE(st.stock,0)::NUMERIC/(v.und_vendidas::NUMERIC/(GREATEST(dias_atras,1)::NUMERIC/7.0)),1) END AS wos_val
    FROM VentasFiltradas v LEFT JOIN StockTotal st ON v.pid=st.pid
  )
  SELECT c.img::TEXT, c.titulo::TEXT, c.pid::TEXT, c.cat::TEXT,
    CASE WHEN c.und_full>=c.und_rebajas AND c.und_full>=c.und_promo THEN 'Ganador Full Price'
         WHEN c.und_rebajas>=c.und_full AND c.und_rebajas>=c.und_promo THEN 'Ganador Rebajas'
         ELSE 'Ganador Promo' END::TEXT,
    c.und_vendidas, ROUND(c.ingresos/NULLIF(c.und_vendidas,0),0)::NUMERIC, c.stock, c.st_pct::NUMERIC, c.wos_val::NUMERIC,
    CASE WHEN COALESCE(NULLIF(TRIM(c.col_season),''),'') = '' THEN 'Otros' ELSE c.col_season END::TEXT
  FROM Combinado c
  ORDER BY CASE WHEN UPPER(COALESCE(orden,'TOP'))='TOP' THEN c.und_vendidas END DESC NULLS LAST,
           CASE WHEN UPPER(COALESCE(orden,'TOP'))!='TOP' THEN c.und_vendidas END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(limite,20),1);
END;
$function$;

-- reporte_pareto_categorias: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_pareto_categorias(dias_atras integer, p_canal text DEFAULT 'pos'::text, p_location_id text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(categoria text, unidades bigint, ingresos numeric, pct_participacion numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    gran_total NUMERIC;
    v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
    v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    SELECT COALESCE(SUM(oi.price * oi.quantity), 0) INTO gran_total
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog c ON oi.sku = c.sku JOIN locations l ON o.location_id = l.location_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'));

    RETURN QUERY
    SELECT UPPER(c.category)::text, SUM(oi.quantity)::BIGINT, SUM(oi.price * oi.quantity)::NUMERIC,
      CASE WHEN gran_total = 0 THEN 0::numeric ELSE ROUND((SUM(oi.price * oi.quantity) / gran_total) * 100, 2) END::numeric
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog c ON oi.sku = c.sku JOIN locations l ON o.location_id = l.location_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
    GROUP BY UPPER(c.category)
    ORDER BY SUM(oi.price * oi.quantity) DESC;
END;
$function$;

-- reporte_pct_ventas_por_tipo: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_pct_ventas_por_tipo(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(pct_full_price numeric, pct_rebajas numeric, pct_desc_promo numeric, ingresos_full_price numeric, ingresos_rebajas numeric, ingresos_desc_promo numeric, ingresos_total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  WITH items_clasificados AS (
    SELECT oi.price::numeric * oi.quantity::numeric AS ingreso_item,
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
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = p_zona AND loc.is_active = true))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
  ),
  totales AS (
    SELECT COALESCE(SUM(CASE WHEN tipo = 'FULL_PRICE' THEN ingreso_item ELSE 0 END), 0) AS sum_full,
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

-- reporte_composicion_coleccion: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_composicion_coleccion(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(coleccion text, unidades bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN COALESCE(NULLIF(TRIM(p.collection_season),''),'')='' THEN 'Otros' ELSE p.collection_season END::TEXT AS col,
    SUM(oi.quantity)::BIGINT AS uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
  JOIN locations l ON o.location_id=l.location_id
  JOIN product_catalog p ON oi.sku=p.sku
  WHERE o.created_at >= v_boundary
    AND o.created_at < v_upper
    AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
    AND (NULLIF(TRIM(p_location_id),'') IS NULL OR o.location_id=p_location_id)
    AND (NULLIF(TRIM(p_zona),'') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona=p_zona AND loc.is_active=true))
    AND (NULLIF(TRIM(p_canal),'') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
  GROUP BY col
  ORDER BY uds DESC;
END;
$function$;

-- reporte_composicion_coleccion_linea: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_composicion_coleccion_linea(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(coleccion text, categoria text, unidades bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN COALESCE(NULLIF(TRIM(p.collection_season),''),'')='' THEN 'Otros' ELSE p.collection_season END::TEXT AS col,
    COALESCE(UPPER(p.category), 'SIN CATEGORÍA')::TEXT AS cat,
    SUM(oi.quantity)::BIGINT AS uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
  JOIN locations l ON o.location_id=l.location_id
  JOIN product_catalog p ON oi.sku=p.sku
  WHERE o.created_at >= v_boundary
    AND o.created_at < v_upper
    AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
    AND (NULLIF(TRIM(p_location_id),'') IS NULL OR o.location_id=p_location_id)
    AND (NULLIF(TRIM(p_zona),'') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona=p_zona AND loc.is_active=true))
    AND (NULLIF(TRIM(p_canal),'') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
  GROUP BY col, cat
  ORDER BY col, uds DESC;
END;
$function$;

-- reporte_desempeño_comercial: add p_hasta
CREATE OR REPLACE FUNCTION public."reporte_desempeño_comercial"(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, producto text, sku text, unidades_vendidas bigint, precio_prom_venta numeric, pct_contribucion numeric, perfil_ejecutivo text, coleccion text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  gran_total_ingresos NUMERIC;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 1), 1), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF dias_atras IS NULL OR dias_atras<1 OR dias_atras>365 THEN RAISE EXCEPTION 'dias_atras must be between 1 and 365'; END IF;

    SELECT SUM(oi.price*oi.quantity) INTO gran_total_ingresos
    FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(oi.category) NOT IN ('BOLSA','INSUMOS');

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT oi.sku,
            SUM(oi.quantity) as und_vendidas,
            SUM(CASE WHEN oi.manual_discount_amount=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount>0 OR oi.is_markdown=true THEN oi.quantity ELSE 0 END) as und_promo,
            SUM(oi.price*oi.quantity) as ingresos_netos
        FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
        WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(oi.category) NOT IN ('BOLSA','INSUMOS')
        GROUP BY oi.sku
    )
    SELECT c.image_url, c.title, v.sku, v.und_vendidas,
        ROUND(v.ingresos_netos/NULLIF(v.und_vendidas,0),0),
        ROUND((v.ingresos_netos/NULLIF(gran_total_ingresos,0))*100,2),
        CASE WHEN v.und_full_price>=v.und_promo AND v.und_vendidas>(dias_atras*0.5) THEN '🏆 Top Performer - Full Price'
             WHEN v.und_promo>v.und_full_price AND v.und_vendidas>(dias_atras*0.5) THEN '🧲 Top Performer - Promoción'
             ELSE '⏳ Rotación Promedio' END,
        CASE WHEN COALESCE(NULLIF(TRIM(c.collection_season),''),'')='' THEN 'Otros' ELSE c.collection_season END::TEXT
    FROM VentasPeriodo v JOIN product_catalog c ON v.sku=c.sku
    ORDER BY v.ingresos_netos DESC;
END;
$function$;

-- reporte_desempeño_por_canal: add p_hasta
CREATE OR REPLACE FUNCTION public."reporte_desempeño_por_canal"(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(canal text, ventas_totales numeric, total_pedidos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
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
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY canal_agrupado;
END;
$function$;

-- reporte_tipos_venta: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_tipos_venta(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tipo_venta text, unidades bigint, pct_unidades numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
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
        FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
        JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= v_boundary
          AND o.created_at < v_upper
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
          AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
          AND (NULLIF(TRIM(p_canal), '') IS NULL OR
              (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
              (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
              (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
    ), TotalUnidades AS (SELECT SUM(uds) AS total FROM Clasificacion)
    SELECT c.clasificacion_venta::TEXT, SUM(c.uds)::BIGINT, ROUND((SUM(c.uds)::NUMERIC / NULLIF((SELECT total FROM TotalUnidades), 0.0)) * 100, 1)::NUMERIC
    FROM Clasificacion c GROUP BY c.clasificacion_venta;
END;
$function$;

-- reporte_pedidos_por_tipo_venta: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_pedidos_por_tipo_venta(dias_atras integer, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_tipo text DEFAULT 'descuento'::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(numero_pedido text, fecha timestamp with time zone, sucursal text, producto text, sku text, cantidad integer, precio numeric, descuento_otorgado numeric, tipo_venta text, compare_at_price numeric, categoria text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  SELECT o.order_number::TEXT, o.created_at,
    CASE WHEN o.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE l.name END::TEXT,
    p.title::TEXT, oi.sku::TEXT, oi.quantity::INTEGER, oi.price::NUMERIC,
    COALESCE(oi.manual_discount_amount, 0)::NUMERIC,
    CASE WHEN oi.is_markdown = true THEN 'Descuento de Producto'
         WHEN COALESCE(oi.manual_discount_amount, 0) > 0 THEN 'Descuento Promocional'
         ELSE 'Full Precio' END::TEXT,
    COALESCE(oi.compare_at_price, 0)::NUMERIC,
    COALESCE(UPPER(p.category), 'SIN CATEGORÍA')::TEXT
  FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
  JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= v_boundary
    AND o.created_at < v_upper
    AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (NULLIF(TRIM(p_location_id), '') IS NULL OR o.location_id = p_location_id)
    AND (NULLIF(TRIM(p_canal), '') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
    AND ((p_tipo = 'descuento' AND COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false) OR
         (p_tipo = 'full_price' AND COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false) OR
         (p_tipo = 'rebajas' AND oi.is_markdown = true))
  ORDER BY o.created_at DESC LIMIT 500;
END;
$function$;

-- reporte_top_bottom_tiendas: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_tiendas(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tienda text, ventas_totales numeric, unidades bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    RETURN QUERY
    SELECT l.name::TEXT, SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0))::NUMERIC,
           SUM(oi.quantity::BIGINT)::BIGINT
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper
      AND o.source_name = 'pos' AND o.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY l.name ORDER BY ventas_totales DESC LIMIT 5;
END;
$function$;

-- reporte_top_bottom_digital: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_top_bottom_digital(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(producto text, ventas_totales numeric, unidades bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    RETURN QUERY
    SELECT p.title::TEXT, SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0))::NUMERIC,
           SUM(oi.quantity::BIGINT)::BIGINT
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper
      AND (o.location_id = '71474315479' OR o.source_name != 'pos') AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.title ORDER BY ventas_totales DESC LIMIT 10;
END;
$function$;

-- reporte_metricas_tienda_individual: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_metricas_tienda_individual(dias_atras integer, p_location_id text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(mejor_dia_semana text, venta_mejor_dia numeric, peor_dia_semana text, venta_peor_dia numeric, venta_promedio_diaria_actual numeric, venta_promedio_diaria_anterior numeric, pedidos_promedio_diario_actual numeric, pedidos_promedio_diario_anterior numeric, unidades_promedio_diario_actual numeric, unidades_promedio_diario_anterior numeric, venta_promedio_semana numeric, venta_promedio_finde numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_boundary_ant timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0) * 2, p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  WITH periodo_actual AS (
    SELECT EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota') AS dow,
      TRIM(TO_CHAR(o.created_at AT TIME ZONE 'America/Bogota', 'Day')) AS dia_nombre,
      SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS venta
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id = p_location_id AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota'), TRIM(TO_CHAR(o.created_at AT TIME ZONE 'America/Bogota', 'Day'))
  ),
  mejor AS (SELECT dia_nombre AS dia, venta FROM periodo_actual ORDER BY venta DESC LIMIT 1),
  peor AS (SELECT dia_nombre AS dia, venta FROM periodo_actual ORDER BY venta ASC LIMIT 1),
  ventas_por_dia AS (
    SELECT (o.created_at AT TIME ZONE 'America/Bogota')::DATE AS fecha,
      EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota') AS dow,
      SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS venta_dia
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id = p_location_id AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY (o.created_at AT TIME ZONE 'America/Bogota')::DATE, EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota')
  ),
  weekday_weekend AS (
    SELECT ROUND(COALESCE(AVG(CASE WHEN dow BETWEEN 1 AND 5 THEN venta_dia END), 0), 0) AS avg_weekday,
      ROUND(COALESCE(AVG(CASE WHEN dow IN (0, 6) THEN venta_dia END), 0), 0) AS avg_weekend
    FROM ventas_por_dia
  ),
  total_actual AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_venta,
      COUNT(DISTINCT o.shopify_order_id)::NUMERIC / NULLIF(dias_atras::NUMERIC, 0) AS avg_pedidos,
      SUM(oi.quantity::NUMERIC) / NULLIF(dias_atras::NUMERIC, 0) AS avg_unidades
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id = p_location_id AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  ),
  total_anterior AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_venta,
      COUNT(DISTINCT o.shopify_order_id)::NUMERIC / NULLIF(dias_atras::NUMERIC, 0) AS avg_pedidos,
      SUM(oi.quantity::NUMERIC) / NULLIF(dias_atras::NUMERIC, 0) AS avg_unidades
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary_ant AND o.created_at < v_boundary
      AND o.location_id = p_location_id AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  )
  SELECT COALESCE(m.dia, 'N/A')::TEXT, ROUND(COALESCE(m.venta, 0), 0)::NUMERIC,
    COALESCE(pe.dia, 'N/A')::TEXT, ROUND(COALESCE(pe.venta, 0), 0)::NUMERIC,
    ROUND(COALESCE(ta.avg_venta, 0), 0)::NUMERIC, ROUND(COALESCE(tp.avg_venta, 0), 0)::NUMERIC,
    ROUND(COALESCE(ta.avg_pedidos, 0), 1)::NUMERIC, ROUND(COALESCE(tp.avg_pedidos, 0), 1)::NUMERIC,
    ROUND(COALESCE(ta.avg_unidades, 0), 1)::NUMERIC, ROUND(COALESCE(tp.avg_unidades, 0), 1)::NUMERIC,
    ww.avg_weekday::NUMERIC, ww.avg_weekend::NUMERIC
  FROM (SELECT 1) x LEFT JOIN mejor m ON true LEFT JOIN peor pe ON true
  LEFT JOIN total_actual ta ON true LEFT JOIN total_anterior tp ON true LEFT JOIN weekday_weekend ww ON true;
END;
$function$;

-- reporte_metricas_zona: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_metricas_zona(dias_atras integer, p_canal text DEFAULT NULL::text, p_zona text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(mejor_dia_semana text, venta_mejor_dia numeric, peor_dia_semana text, venta_peor_dia numeric, venta_promedio_diaria_actual numeric, venta_promedio_diaria_anterior numeric, pedidos_promedio_diario_actual numeric, pedidos_promedio_diario_anterior numeric, unidades_promedio_diario_actual numeric, unidades_promedio_diario_anterior numeric, venta_promedio_semana numeric, venta_promedio_finde numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_boundary_ant timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0) * 2, p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  WITH locs AS (
    SELECT l.location_id FROM locations l
    WHERE l.is_active = true AND l.location_id != '71474315479'
      AND (NULLIF(TRIM(p_zona), '') IS NULL OR l.zona = p_zona)
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%outlet%' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%outlet%' AND LOWER(p_canal) NOT LIKE '%digital%' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET'))
  ),
  periodo_actual AS (
    SELECT EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota') AS dow,
      TRIM(TO_CHAR(o.created_at AT TIME ZONE 'America/Bogota', 'Day')) AS dia_nombre,
      SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS venta
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id IN (SELECT location_id FROM locs)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota'), TRIM(TO_CHAR(o.created_at AT TIME ZONE 'America/Bogota', 'Day'))
  ),
  mejor AS (SELECT dia_nombre AS dia, venta FROM periodo_actual ORDER BY venta DESC LIMIT 1),
  peor AS (SELECT dia_nombre AS dia, venta FROM periodo_actual ORDER BY venta ASC LIMIT 1),
  ventas_por_dia AS (
    SELECT (o.created_at AT TIME ZONE 'America/Bogota')::DATE AS fecha,
      EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota') AS dow,
      SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) AS venta_dia
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id IN (SELECT location_id FROM locs)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY (o.created_at AT TIME ZONE 'America/Bogota')::DATE, EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Bogota')
  ),
  weekday_weekend AS (
    SELECT ROUND(COALESCE(AVG(CASE WHEN dow BETWEEN 1 AND 5 THEN venta_dia END), 0), 0) AS avg_weekday,
      ROUND(COALESCE(AVG(CASE WHEN dow IN (0, 6) THEN venta_dia END), 0), 0) AS avg_weekend
    FROM ventas_por_dia
  ),
  total_actual AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_venta,
      COUNT(DISTINCT o.shopify_order_id)::NUMERIC / NULLIF(dias_atras::NUMERIC, 0) AS avg_pedidos,
      SUM(oi.quantity::NUMERIC) / NULLIF(dias_atras::NUMERIC, 0) AS avg_unidades
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id IN (SELECT location_id FROM locs) AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  ),
  total_anterior AS (
    SELECT SUM(((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) / 1.19) / NULLIF(dias_atras::NUMERIC, 0) AS avg_venta,
      COUNT(DISTINCT o.shopify_order_id)::NUMERIC / NULLIF(dias_atras::NUMERIC, 0) AS avg_pedidos,
      SUM(oi.quantity::NUMERIC) / NULLIF(dias_atras::NUMERIC, 0) AS avg_unidades
    FROM orders o JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary_ant AND o.created_at < v_boundary
      AND o.location_id IN (SELECT location_id FROM locs) AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
  )
  SELECT COALESCE(m.dia, 'N/A')::TEXT, ROUND(COALESCE(m.venta, 0), 0)::NUMERIC,
    COALESCE(pe.dia, 'N/A')::TEXT, ROUND(COALESCE(pe.venta, 0), 0)::NUMERIC,
    ROUND(COALESCE(ta.avg_venta, 0), 0)::NUMERIC, ROUND(COALESCE(tp.avg_venta, 0), 0)::NUMERIC,
    ROUND(COALESCE(ta.avg_pedidos, 0), 1)::NUMERIC, ROUND(COALESCE(tp.avg_pedidos, 0), 1)::NUMERIC,
    ROUND(COALESCE(ta.avg_unidades, 0), 1)::NUMERIC, ROUND(COALESCE(tp.avg_unidades, 0), 1)::NUMERIC,
    ww.avg_weekday::NUMERIC, ww.avg_weekend::NUMERIC
  FROM (SELECT 1) x LEFT JOIN mejor m ON true LEFT JOIN peor pe ON true
  LEFT JOIN total_actual ta ON true LEFT JOIN total_anterior tp ON true LEFT JOIN weekday_weekend ww ON true;
END;
$function$;

-- reporte_comportamiento_producto: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(dias_atras integer, p_sku_filter text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, sku text, producto text, categoria text, und_vendidas bigint, stock_tiendas bigint, stock_digital bigint, clasificacion text, sell_through_pct numeric, wos numeric, estado_salud text, und_full_price bigint, und_rebajas bigint, und_promo bigint, coleccion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    RETURN QUERY
    WITH FiltroCat AS (
        SELECT pc.title AS p, MAX(pc.image_url) AS f, MAX(pc.category) AS c,
               MAX(COALESCE(pc.collection_season, '')) AS col_season
        FROM product_catalog pc
        WHERE UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
          AND (NULLIF(TRIM(p_sku_filter),'') IS NULL OR pc.sku ILIKE '%'||TRIM(p_sku_filter)||'%' OR pc.title ILIKE '%'||TRIM(p_sku_filter)||'%')
        GROUP BY pc.title
    ),
    Ventas AS (
        SELECT p.title AS p, SUM(oi.quantity::BIGINT) as uv,
               SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC,0)=0 AND COALESCE(NULLIF(oi.compare_at_price::NUMERIC,0),NULLIF(p.compare_at_price::NUMERIC,0),0)<=oi.price::NUMERIC AND NOT(p.price IS NOT NULL AND p.price>0 AND oi.price::NUMERIC<p.price::NUMERIC) THEN oi.quantity ELSE 0 END) as uf,
               SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC,0)=0 AND (COALESCE(NULLIF(oi.compare_at_price::NUMERIC,0),NULLIF(p.compare_at_price::NUMERIC,0),0)>oi.price::NUMERIC OR (p.price IS NOT NULL AND p.price>0 AND oi.price::NUMERIC<p.price::NUMERIC)) THEN oi.quantity ELSE 0 END) as ur,
               SUM(CASE WHEN COALESCE(oi.manual_discount_amount::NUMERIC,0)>0 THEN oi.quantity ELSE 0 END) as up
        FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id JOIN product_catalog p ON oi.sku=p.sku
        WHERE o.created_at >= v_boundary
          AND o.created_at < v_upper
          AND (NULLIF(TRIM(p_location_id),'') IS NULL OR o.location_id=p_location_id)
        GROUP BY p.title
    ),
    StockT AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.location_id!='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR inv.location_id=p_location_id) GROUP BY p.title),
    StockD AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.location_id='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR p_location_id='71474315479') GROUP BY p.title),
    BaseUnida AS (
        SELECT FC.f, FC.p, FC.c, FC.col_season, COALESCE(V.uv,0) as u_vendidas, COALESCE(ST.st,0) as s_tiendas, COALESCE(SD.sd,0) as s_digital,
               COALESCE(V.uf,0) as u_full_price, COALESCE(V.ur,0) as u_rebajas, COALESCE(V.up,0) as u_promo
        FROM FiltroCat FC LEFT JOIN Ventas V ON FC.p=V.p LEFT JOIN StockT ST ON FC.p=ST.p LEFT JOIN StockD SD ON FC.p=SD.p
        WHERE (COALESCE(V.uv,0)>0 OR COALESCE(ST.st,0)>0 OR COALESCE(SD.sd,0)>0)
    )
    SELECT B.f, 'Varias Tallas'::TEXT, B.p, B.c, B.u_vendidas::BIGINT, B.s_tiendas::BIGINT, B.s_digital::BIGINT,
           CASE WHEN B.u_full_price>=(B.u_rebajas+B.u_promo) THEN '🟢 Venta Full' ELSE '🔴 Venta con Impulso' END::TEXT,
           CASE WHEN (B.u_vendidas+B.s_tiendas+B.s_digital)=0 THEN 0.0 ELSE ROUND((B.u_vendidas::NUMERIC/(B.u_vendidas+B.s_tiendas+B.s_digital)::NUMERIC)*100,1) END::NUMERIC,
           CASE WHEN B.u_vendidas=0 THEN 0.0 ELSE ROUND(((B.s_tiendas+B.s_digital)::NUMERIC/(B.u_vendidas::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0))),1) END::NUMERIC,
           CASE WHEN B.u_vendidas=0 AND (B.s_tiendas+B.s_digital)>0 THEN '🔴 ESTANCADO'
                WHEN B.u_vendidas>0 AND ((B.s_tiendas+B.s_digital)::NUMERIC/(B.u_vendidas::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0)))>12 THEN '🔴 SOBRESTOCK'
                WHEN B.u_vendidas>0 AND ((B.s_tiendas+B.s_digital)::NUMERIC/(B.u_vendidas::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0)))<4 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 ÓPTIMO' END::TEXT,
           B.u_full_price::BIGINT, B.u_rebajas::BIGINT, B.u_promo::BIGINT,
           CASE WHEN COALESCE(NULLIF(TRIM(B.col_season),''),'')='' THEN 'Otros' ELSE B.col_season END::TEXT
    FROM BaseUnida B ORDER BY B.u_vendidas DESC;
END;
$function$;

-- reporte_desempeno_por_linea: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_desempeno_por_linea(dias_atras integer, p_canal text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(categoria text, stock_tiendas bigint, stock_digital bigint, und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint, pct_participacion numeric, sell_through_pct numeric, wos numeric, estado_salud text, und_full_price bigint, und_rebajas bigint, und_promo bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gran_total_uds NUMERIC;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  SELECT COALESCE(SUM(oi.quantity), 0) INTO gran_total_uds
  FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (NULLIF(TRIM(p_canal), '') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'));

  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT UPPER(p.category) AS cat,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0 AND NOT COALESCE(oi.is_markdown, false) THEN oi.quantity ELSE 0 END)::BIGINT AS uds_full,
      SUM(CASE WHEN COALESCE(oi.is_markdown, false) = true THEN oi.quantity ELSE 0 END)::BIGINT AS uds_reb,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0 AND NOT COALESCE(oi.is_markdown, false) THEN oi.quantity ELSE 0 END)::BIGINT AS uds_prom
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
    GROUP BY UPPER(p.category)
  ),
  StockTiendas AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category)),
  StockDigital AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.location_id = '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category))
  SELECT COALESCE(v.cat, COALESCE(st.cat, sd.cat))::TEXT,
    COALESCE(st.st, 0)::BIGINT, COALESCE(sd.sd, 0)::BIGINT,
    COALESCE(v.uds_tiendas, 0)::BIGINT, COALESCE(v.uds_outlets, 0)::BIGINT, COALESCE(v.uds_digital, 0)::BIGINT, COALESCE(v.uds_total, 0)::BIGINT,
    ROUND(COALESCE(v.uds_total, 0)::NUMERIC / NULLIF(gran_total_uds, 0) * 100, 1)::NUMERIC,
    CASE WHEN (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) = 0 THEN 0.0
      ELSE ROUND(COALESCE(v.uds_total, 0)::NUMERIC / (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC * 100, 1) END::NUMERIC,
    CASE WHEN COALESCE(v.uds_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0)), 1) END::NUMERIC,
    CASE
      WHEN COALESCE(v.uds_total, 0) = 0 AND (COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) > 0 THEN '🔴 ESTANCADO'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) > 12 THEN '🔴 SOBRESTOCK'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) < 4 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 ÓPTIMO' END::TEXT,
    COALESCE(v.uds_full, 0)::BIGINT, COALESCE(v.uds_reb, 0)::BIGINT, COALESCE(v.uds_prom, 0)::BIGINT
  FROM VentasPorCanal v
  FULL OUTER JOIN StockTiendas st ON v.cat = st.cat
  FULL OUTER JOIN StockDigital sd ON COALESCE(v.cat, st.cat) = sd.cat
  WHERE (COALESCE(v.uds_total, 0) > 0 OR COALESCE(st.st, 0) > 0 OR COALESCE(sd.sd, 0) > 0)
  ORDER BY COALESCE(v.uds_total, 0) DESC;
END;
$function$;

-- reporte_detalle_producto_tiendas: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_detalle_producto_tiendas(dias_atras integer, p_producto text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tienda text, und_vendidas bigint, ingresos numeric, stock_actual bigint, pct_full_price numeric, pct_descuento numeric, sell_through_pct numeric, wos numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  RETURN QUERY
  WITH SP AS(SELECT pc.sku FROM product_catalog pc WHERE pc.title=TRIM(p_producto)),
  VP AS(
    SELECT o.location_id as l, SUM(oi.quantity::BIGINT) as uv,
    SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) as ing,
    SUM(CASE WHEN oi.manual_discount_amount::NUMERIC=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC as uf,
    SUM(CASE WHEN oi.manual_discount_amount::NUMERIC>0 OR oi.is_markdown=true THEN oi.quantity ELSE 0 END)::NUMERIC as up
    FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND oi.sku IN(SELECT sku FROM SP)
    GROUP BY o.location_id
  ),
  STK AS(SELECT inv.location_id as l,SUM(inv.available::BIGINT) as sa FROM inventory_snapshot inv WHERE inv.sku IN(SELECT sku FROM SP) GROUP BY inv.location_id)
  SELECT CASE WHEN u.location_id='71474315479' THEN 'Bodega Ecommerce' ELSE u.name END::TEXT,
    COALESCE(VP.uv,0)::BIGINT,COALESCE(VP.ing,0)::NUMERIC,COALESCE(STK.sa,0)::BIGINT,
    CASE WHEN COALESCE(VP.uv,0)=0 THEN 0.0 ELSE ROUND((VP.uf/VP.uv::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN COALESCE(VP.uv,0)=0 THEN 0.0 ELSE ROUND((VP.up/VP.uv::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN(COALESCE(VP.uv,0)+COALESCE(STK.sa,0))=0 THEN 0.0 ELSE ROUND((COALESCE(VP.uv,0)::NUMERIC/(COALESCE(VP.uv,0)+COALESCE(STK.sa,0))::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN COALESCE(VP.uv,0)=0 THEN 0.0 ELSE ROUND(COALESCE(STK.sa,0)::NUMERIC/(VP.uv::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0)),1) END::NUMERIC,
    CASE WHEN COALESCE(VP.uv,0)=0 AND COALESCE(STK.sa,0)>0 THEN '🔴 ESTANCADO'
         WHEN COALESCE(VP.uv,0)>0 AND(COALESCE(STK.sa,0)::NUMERIC/(VP.uv::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0)))>12 THEN '🔴 SOBRESTOCK'
         WHEN COALESCE(VP.uv,0)>0 AND(COALESCE(STK.sa,0)::NUMERIC/(VP.uv::NUMERIC/(GREATEST(COALESCE(dias_atras,1),1)::NUMERIC/7.0)))<4 THEN '🟡 RIESGO AGOTADOS'
         ELSE '🟢 ÓPTIMO' END::TEXT
  FROM locations u LEFT JOIN VP ON u.location_id=VP.l LEFT JOIN STK ON u.location_id=STK.l
  WHERE COALESCE(VP.uv,0)>0 OR COALESCE(STK.sa,0)>0
  ORDER BY COALESCE(VP.uv,0) DESC,COALESCE(STK.sa,0) DESC;
END;
$function$;

-- reporte_detalle_skus_producto: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_detalle_skus_producto(dias_atras integer, p_product_id text, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(sku text, talla text, unidades_vendidas bigint, stock_disponible bigint, precio_prom_venta numeric, sell_through_pct numeric, wos numeric, clasificacion text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 1), 1), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN QUERY
  WITH VentasSku AS (
    SELECT oi.sku AS v_sku, SUM(oi.quantity)::BIGINT AS und_vendidas, SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND p.product_id = p_product_id
      AND (canal_filtro IS NULL OR (canal_filtro = 'POS' AND o.source_name = 'pos') OR (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
      AND (location_filtro IS NULL OR o.location_id = location_filtro)
    GROUP BY oi.sku
  ),
  StockSku AS (
    SELECT inv.sku AS s_sku, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku
    WHERE p.product_id = p_product_id AND (location_filtro IS NULL OR inv.location_id = location_filtro)
    GROUP BY inv.sku
  ),
  AllSkus AS (SELECT DISTINCT p.sku, p.variant_name FROM product_catalog p WHERE p.product_id = p_product_id)
  SELECT a.sku::TEXT, COALESCE(a.variant_name, '')::TEXT, COALESCE(v.und_vendidas, 0)::BIGINT, COALESCE(s.stock, 0)::BIGINT,
    ROUND(COALESCE(v.ingresos, 0) / NULLIF(COALESCE(v.und_vendidas, 0), 0), 0)::NUMERIC,
    CASE WHEN (COALESCE(v.und_vendidas, 0) + COALESCE(s.stock, 0)) = 0 THEN 0.0
      ELSE ROUND(COALESCE(v.und_vendidas, 0)::NUMERIC / (COALESCE(v.und_vendidas, 0) + COALESCE(s.stock, 0))::NUMERIC * 100, 1) END::NUMERIC,
    CASE WHEN COALESCE(v.und_vendidas, 0) = 0 THEN 0.0
      ELSE ROUND(COALESCE(s.stock, 0)::NUMERIC / (COALESCE(v.und_vendidas, 0)::NUMERIC / (GREATEST(dias_atras, 1)::NUMERIC / 7.0)), 1) END::NUMERIC,
    CASE WHEN COALESCE(v.und_full, 0) >= COALESCE(v.und_rebajas, 0) AND COALESCE(v.und_full, 0) >= COALESCE(v.und_promo, 0) THEN 'Full Price'
         WHEN COALESCE(v.und_rebajas, 0) >= COALESCE(v.und_full, 0) AND COALESCE(v.und_rebajas, 0) >= COALESCE(v.und_promo, 0) THEN 'Rebajas'
         ELSE 'Promo' END::TEXT
  FROM AllSkus a LEFT JOIN VentasSku v ON a.sku = v.v_sku LEFT JOIN StockSku s ON a.sku = s.s_sku
  WHERE (COALESCE(v.und_vendidas, 0) > 0 OR COALESCE(s.stock, 0) > 0)
  ORDER BY COALESCE(v.und_vendidas, 0) DESC;
END;
$function$;

-- reporte_productos_por_categoria: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_productos_por_categoria(dias_atras integer, p_categoria text DEFAULT NULL::text, p_canal text DEFAULT NULL::text, p_location_id text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, producto text, product_id text, stock_total bigint, venta_prom_semanal numeric, wos numeric, estado_salud text, und_full_price bigint, und_rebajas bigint, und_promo bigint, und_total bigint, clasificacion text, coleccion text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  fecha_inicio TIMESTAMP WITH TIME ZONE := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
  semanas NUMERIC := GREATEST(dias_atras::NUMERIC/7.0,1);
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH productos AS (
    SELECT DISTINCT pc.product_id AS pid, pc.title, pc.image_url, pc.category, COALESCE(pc.collection_season, '') AS col_season
    FROM product_catalog pc WHERE pc.category=p_categoria AND pc.product_id IS NOT NULL
  ),
  inv AS (
    SELECT pc.product_id AS pid, SUM(COALESCE(i.available,0)) AS stock
    FROM inventory_snapshot i JOIN product_catalog pc ON pc.variant_id=i.variant_id
    WHERE i.snapshot_date=v_max_date AND pc.category=p_categoria AND pc.product_id IS NOT NULL
      AND (p_location_id IS NULL OR i.location_id=p_location_id)
    GROUP BY pc.product_id
  ),
  ventas AS (
    SELECT pc.product_id AS pid,
      SUM(CASE WHEN oi.is_markdown=false AND COALESCE(oi.manual_discount_amount,0)<=0 THEN oi.quantity ELSE 0 END) AS uds_full,
      SUM(CASE WHEN oi.is_markdown=true THEN oi.quantity ELSE 0 END) AS uds_reb,
      SUM(CASE WHEN oi.is_markdown=false AND COALESCE(oi.manual_discount_amount,0)>0 THEN oi.quantity ELSE 0 END) AS uds_promo,
      SUM(oi.quantity) AS uds_total
    FROM order_items oi JOIN orders o ON o.shopify_order_id=oi.shopify_order_id JOIN product_catalog pc ON pc.sku=oi.sku
    WHERE pc.category=p_categoria AND pc.product_id IS NOT NULL AND o.created_at>=fecha_inicio AND o.created_at < v_upper
      AND (p_location_id IS NULL OR oi.location_id=p_location_id)
      AND (p_canal IS NULL OR (p_canal='Digital' AND o.source_name IN ('web','shopify_draft_order')) OR (p_canal='POS' AND o.source_name='pos'))
    GROUP BY pc.product_id
  )
  SELECT COALESCE(p.image_url,'')::TEXT, COALESCE(p.title,'')::TEXT, p.pid::TEXT,
    COALESCE(inv.stock,0)::BIGINT, ROUND(COALESCE(v.uds_total,0)::NUMERIC/semanas,1),
    CASE WHEN COALESCE(v.uds_total,0)=0 THEN 999 ELSE ROUND(COALESCE(inv.stock,0)::NUMERIC/(COALESCE(v.uds_total,0)::NUMERIC/semanas),1) END,
    CASE WHEN COALESCE(v.uds_total,0)=0 AND COALESCE(inv.stock,0)>0 THEN '🔴 SOBRESTOCK CRÍTICO'
         WHEN COALESCE(inv.stock,0)=0 AND COALESCE(v.uds_total,0)>0 THEN '🟡 AGOTADO'
         WHEN COALESCE(inv.stock,0)=0 AND COALESCE(v.uds_total,0)=0 THEN '⚪ SIN DATOS'
         WHEN ROUND(COALESCE(inv.stock,0)::NUMERIC/NULLIF(COALESCE(v.uds_total,0)::NUMERIC/semanas,0),1)>20 THEN '🔴 SOBRESTOCK'
         WHEN ROUND(COALESCE(inv.stock,0)::NUMERIC/NULLIF(COALESCE(v.uds_total,0)::NUMERIC/semanas,0),1)<8 THEN '🟡 RIESGO AGOTADOS'
         ELSE '🟢 NIVEL ÓPTIMO' END::TEXT,
    COALESCE(v.uds_full,0)::BIGINT, COALESCE(v.uds_reb,0)::BIGINT, COALESCE(v.uds_promo,0)::BIGINT,
    COALESCE(v.uds_total,0)::BIGINT,
    CASE WHEN COALESCE(v.uds_full,0)>=COALESCE(v.uds_reb,0) AND COALESCE(v.uds_full,0)>=COALESCE(v.uds_promo,0) THEN 'Full Price'
         WHEN COALESCE(v.uds_reb,0)>=COALESCE(v.uds_full,0) AND COALESCE(v.uds_reb,0)>=COALESCE(v.uds_promo,0) THEN 'Rebajas'
         ELSE 'Promo' END::TEXT,
    CASE WHEN COALESCE(NULLIF(TRIM(p.col_season),''),'')='' THEN 'Otros' ELSE p.col_season END::TEXT
  FROM productos p LEFT JOIN inv ON inv.pid=p.pid LEFT JOIN ventas v ON v.pid=p.pid
  ORDER BY COALESCE(inv.stock,0) DESC;
END;
$function$;

-- reporte_top_productos_global: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_top_productos_global(dias_atras integer, p_canal text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text, p_orden text DEFAULT 'TOP'::text, p_limite integer DEFAULT 50, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint, pct_full_price numeric, pct_rebajas numeric, pct_descuento numeric, clasificacion text, coleccion text, stock_venta_directa bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT p.title AS prod, MAX(p.image_url) AS img, MAX(p.category) AS cat,
      MAX(COALESCE(p.collection_season, '')) AS col_season, MAX(p.product_id) AS pid,
      SUM(CASE WHEN o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id='71474315479' OR o.source_name!='pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount,0)=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_full,
      SUM(CASE WHEN oi.is_markdown=true THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount,0)>0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC AS uds_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    JOIN locations l ON o.location_id=l.location_id
    JOIN product_catalog p ON oi.sku=p.sku
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND (NULLIF(TRIM(p_categoria),'') IS NULL OR UPPER(p.category)=UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal),'') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
    GROUP BY p.title
  ),
  StockDirecta AS (
    SELECT pc.product_id AS pid, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv JOIN product_catalog pc ON pc.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_max_date AND inv.available > 0 AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
    GROUP BY pc.product_id
  )
  SELECT v.img::TEXT, v.prod::TEXT, 'Varias Tallas'::TEXT, UPPER(v.cat)::TEXT,
    v.uds_tiendas, v.uds_outlets, v.uds_digital, v.uds_total,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_full/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_rebajas/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_promo/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_full>=v.uds_rebajas AND v.uds_full>=v.uds_promo THEN 'Ganador Full Price'
         WHEN v.uds_rebajas>=v.uds_full AND v.uds_rebajas>=v.uds_promo THEN 'Ganador Rebajas'
         ELSE 'Ganador Promo' END::TEXT,
    CASE WHEN COALESCE(NULLIF(TRIM(v.col_season),''),'')='' THEN 'Otros' ELSE v.col_season END::TEXT,
    COALESCE(sd.stock, 0)::BIGINT
  FROM VentasPorCanal v LEFT JOIN StockDirecta sd ON v.pid = sd.pid
  ORDER BY CASE WHEN UPPER(COALESCE(p_orden,'TOP'))='TOP' THEN v.uds_total END DESC NULLS LAST,
           CASE WHEN UPPER(COALESCE(p_orden,'TOP'))!='TOP' THEN v.uds_total END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limite,50),1);
END;
$function$;

-- reporte_salud_inventario: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(tipo text, tienda text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_max_date_prendas date;
  v_max_date_insumos date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    v_max_date_prendas := _latest_valid_snapshot_date(5000);
    SELECT MAX(snapshot_date) INTO v_max_date_insumos FROM inventory_snapshot;
    IF v_max_date_insumos IS NULL THEN v_max_date_insumos := v_max_date_prendas; END IF;

    RETURN QUERY
    WITH CategoryMapping AS (
        SELECT pc.variant_id, CASE WHEN UPPER(pc.category) IN ('BOLSA', 'INSUMOS') THEN 'BOLSAS Y EMPAQUES' ELSE 'PRENDAS' END AS tipo_inv
        FROM product_catalog pc WHERE pc.variant_id IS NOT NULL
    ),
    VentasPeriodo AS (
        SELECT cm.tipo_inv, o.location_id, SUM(oi.quantity)::NUMERIC / GREATEST(dias_atras::NUMERIC / 7.0, 1) AS promedio_venta_semanal
        FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog pc ON pc.sku = oi.sku JOIN CategoryMapping cm ON cm.variant_id = pc.variant_id
        WHERE o.created_at >= v_boundary AND o.created_at < v_upper
        GROUP BY cm.tipo_inv, o.location_id
    ),
    StockPorTienda AS (
        SELECT cm.tipo_inv, inv.location_id AS loc_id, SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_prendas AND cm.tipo_inv = 'PRENDAS'
        GROUP BY cm.tipo_inv, inv.location_id
        UNION ALL
        SELECT cm.tipo_inv, inv.location_id AS loc_id, SUM(inv.available)::BIGINT AS stock_total
        FROM inventory_snapshot inv JOIN CategoryMapping cm ON cm.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date_insumos AND cm.tipo_inv = 'BOLSAS Y EMPAQUES'
        GROUP BY cm.tipo_inv, inv.location_id
    ),
    Tipos AS (SELECT unnest(ARRAY['PRENDAS', 'BOLSAS Y EMPAQUES']) AS tipo_inv)
    SELECT t.tipo_inv::TEXT, l.name::TEXT, COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_venta_semanal, 0), 1),
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1),
        CASE
            WHEN t.tipo_inv = 'BOLSAS Y EMPAQUES' THEN
              CASE WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '✅ STOCK SUFICIENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 2 THEN '🚨 REORDEN URGENTE'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 4 THEN '⚠️ PLANEAR COMPRA'
                ELSE '✅ STOCK SUFICIENTE' END
            ELSE
              CASE WHEN COALESCE(v.promedio_venta_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) > 20 THEN '🔴 SOBRESTOCK'
                WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_venta_semanal, 0), 1) < 8 THEN '🟡 RIESGO AGOTADOS'
                ELSE '🟢 NIVEL ÓPTIMO' END
        END::TEXT
    FROM Tipos t CROSS JOIN locations l
    LEFT JOIN StockPorTienda s ON l.location_id = s.loc_id AND t.tipo_inv = s.tipo_inv
    LEFT JOIN VentasPeriodo v ON l.location_id = v.location_id AND t.tipo_inv = v.tipo_inv
    WHERE l.is_active = true AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.promedio_venta_semanal, 0) > 0)
    ORDER BY t.tipo_inv, COALESCE(s.stock_total, 0) DESC;
END;
$function$;

-- reporte_sugerencias_traslado: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_sugerencias_traslado(dias_atras integer, p_hasta date DEFAULT NULL)
 RETURNS TABLE(foto text, producto text, sku text, tienda_origen text, stock_origen numeric, tienda_destino text, ritmo_venta_destino numeric, uds_sugeridas numeric, accion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
    RETURN QUERY
    WITH VentasPorTienda AS (
        SELECT p.title AS producto, oi.sku, o.location_id, MAX(p.image_url) AS foto,
            SUM(oi.quantity::NUMERIC) AS und_vendidas,
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_prom_semanal
        FROM order_items oi JOIN orders o ON o.shopify_order_id = oi.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, oi.sku, o.location_id
    ),
    StockPorTienda AS (
        SELECT p.title AS producto, inv.sku, inv.location_id, SUM(inv.available::NUMERIC) AS stock_total
        FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku
        WHERE inv.snapshot_date = v_max_date AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, inv.sku, inv.location_id
    ),
    WosPorTienda AS (
        SELECT COALESCE(s.producto, v.producto) AS producto, COALESCE(s.sku, v.sku) AS sku,
            COALESCE(s.location_id, v.location_id) AS location_id, COALESCE(v.foto, '') AS foto,
            COALESCE(s.stock_total, 0) AS stock, COALESCE(v.venta_prom_semanal, 0) AS venta_semanal,
            COALESCE(v.venta_prom_semanal, 0) / 7.0 AS consumo_diario,
            CASE WHEN COALESCE(v.venta_prom_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN 999
                 WHEN COALESCE(v.venta_prom_semanal, 0) = 0 THEN 0
                 ELSE ROUND(COALESCE(s.stock_total, 0) / v.venta_prom_semanal, 1) END AS wos
        FROM StockPorTienda s FULL OUTER JOIN VentasPorTienda v ON s.sku = v.sku AND s.location_id = v.location_id
        WHERE COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.venta_prom_semanal, 0) > 0
    ),
    Destinos AS (SELECT w.producto, w.sku, w.location_id, w.foto, w.stock, w.venta_semanal, w.wos, w.consumo_diario AS consumo_diario_dest FROM WosPorTienda w WHERE w.wos > 0 AND w.wos < 4 AND w.venta_semanal > 0),
    Origenes AS (SELECT w.producto, w.sku, w.location_id, w.stock, w.wos, w.consumo_diario, GREATEST(w.stock - CEIL(w.consumo_diario * 60), 0) AS stock_cedible FROM WosPorTienda w WHERE w.wos > 12 AND w.wos < 999 AND w.stock > 3 AND (w.stock - CEIL(w.consumo_diario * 60)) > 0),
    Candidatos AS (
        SELECT d.foto, d.producto, d.sku, ori.location_id AS loc_origen, d.location_id AS loc_destino,
            ori.stock AS stock_origen, ori.stock_cedible, ori.wos AS wos_origen, d.venta_semanal, d.wos AS wos_destino,
            d.consumo_diario_dest, d.stock AS stock_destino,
            LEAST(ori.stock_cedible, GREATEST(CEIL(d.consumo_diario_dest * 56) - d.stock, 1)) AS uds_sugeridas,
            ROW_NUMBER() OVER (PARTITION BY d.sku, d.location_id ORDER BY ori.stock_cedible DESC) AS rn
        FROM Destinos d JOIN Origenes ori ON d.sku = ori.sku AND d.location_id != ori.location_id
    ),
    Unicos AS (SELECT * FROM Candidatos WHERE rn = 1)
    SELECT u.foto, u.producto, u.sku,
        CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END AS tienda_origen,
        u.stock_origen, CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END AS tienda_destino,
        ROUND(u.venta_semanal, 2)::NUMERIC, u.uds_sugeridas::NUMERIC,
        ('🚚 Origen ' || u.wos_origen || ' sem → Destino ' || u.wos_destino || ' sem')::TEXT
    FROM Unicos u JOIN locations ld ON u.loc_destino = ld.location_id JOIN locations lo ON u.loc_origen = lo.location_id
    WHERE u.uds_sugeridas > 0
    ORDER BY u.venta_semanal DESC, u.stock_cedible DESC LIMIT 150;
END;
$function$;

-- reporte_curva_traslados: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_curva_traslados(dias_atras integer DEFAULT 30, p_origen text DEFAULT NULL::text, p_destino text DEFAULT NULL::text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(product_id text, producto text, color text, foto text, talla text, sku text, tienda_destino text, stock_destino bigint, ritmo_venta numeric, uds_sugeridas bigint, tienda_origen text, stock_origen bigint, prioridad numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_days int := GREATEST(COALESCE(dias_atras, 30), 1);
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 30), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT s.snapshot_date, COUNT(DISTINCT s.variant_id) AS cnt FROM inventory_snapshot s GROUP BY s.snapshot_date) sub
  WHERE sub.cnt >= 5000 ORDER BY sub.snapshot_date DESC LIMIT 1;

  RETURN QUERY
  WITH inv AS (
    SELECT i.variant_id AS vid, i.location_id AS loc_id, SUM(i.available)::BIGINT AS stock
    FROM inventory_snapshot i WHERE i.snapshot_date = v_max_date AND i.available > 0 AND i.variant_id IS NOT NULL
    GROUP BY i.variant_id, i.location_id
  ),
  ventas AS (
    SELECT oi.variant_id AS vid, o.location_id AS loc_id, SUM(oi.quantity)::NUMERIC / (v_days::NUMERIC / 7.0) AS vps
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS') AND oi.variant_id IS NOT NULL
    GROUP BY oi.variant_id, o.location_id
  ),
  combined AS (
    SELECT COALESCE(i.vid, v.vid) AS vid, COALESCE(i.loc_id, v.loc_id) AS loc_id,
      COALESCE(i.stock, 0)::BIGINT AS stock, COALESCE(v.vps, 0) AS vps,
      CASE WHEN COALESCE(v.vps, 0) = 0 AND COALESCE(i.stock, 0) > 0 THEN 999.0
           WHEN COALESCE(v.vps, 0) = 0 THEN 0.0
           ELSE ROUND(COALESCE(i.stock, 0)::NUMERIC / v.vps, 1) END AS wos
    FROM inv i FULL OUTER JOIN ventas v ON i.vid = v.vid AND i.loc_id = v.loc_id
    WHERE COALESCE(i.stock, 0) > 0 OR COALESCE(v.vps, 0) > 0
  ),
  var_product AS (SELECT DISTINCT pc2.variant_id AS vid, pc2.product_id AS pid FROM product_catalog pc2 WHERE pc2.variant_id IS NOT NULL AND pc2.product_id IS NOT NULL),
  trigger_variants AS (SELECT c.vid, c.loc_id, vp.pid FROM combined c JOIN var_product vp ON c.vid = vp.vid WHERE c.wos > 0 AND c.wos < 4 AND c.vps > 0),
  product_dest_triggers AS (SELECT DISTINCT tv.pid, tv.loc_id AS dest_loc FROM trigger_variants tv),
  sibling_variants AS (SELECT DISTINCT vp.vid, vp.pid FROM var_product vp WHERE vp.pid IN (SELECT pdt.pid FROM product_dest_triggers pdt)),
  destinos_expanded AS (
    SELECT sv.vid, sv.pid, pdt.dest_loc AS loc_id, COALESCE(c.stock, 0)::BIGINT AS stock, COALESCE(c.vps, 0) AS vps,
      GREATEST(2 - COALESCE(c.stock, 0)::BIGINT, 0)::BIGINT AS need
    FROM sibling_variants sv CROSS JOIN product_dest_triggers pdt JOIN var_product vp2 ON sv.vid = vp2.vid AND sv.pid = pdt.pid
    LEFT JOIN combined c ON sv.vid = c.vid AND pdt.dest_loc = c.loc_id WHERE COALESCE(c.stock, 0) < 2
  ),
  origenes AS (
    SELECT c.vid, c.loc_id, c.stock, c.wos, GREATEST(c.stock - CEIL((c.vps / 7.0) * 60)::BIGINT, 0)::BIGINT AS stock_cedible
    FROM combined c WHERE c.wos > 12 AND c.wos < 999 AND c.stock > 3
  ),
  candidatos AS (
    SELECT d.vid, d.pid, d.loc_id AS dest_loc, d.stock AS stock_dest, d.vps, d.need,
      o2.loc_id AS orig_loc, o2.stock AS stock_orig, o2.stock_cedible,
      LEAST(o2.stock_cedible, d.need)::BIGINT AS uds,
      ROW_NUMBER() OVER (PARTITION BY d.vid, d.loc_id ORDER BY o2.stock_cedible DESC) AS rn
    FROM destinos_expanded d JOIN origenes o2 ON d.vid = o2.vid AND d.loc_id <> o2.loc_id WHERE o2.stock_cedible > 0 AND d.need > 0
  ),
  cat_part AS (
    SELECT UPPER(COALESCE(oi.category, 'SIN CATEGORÍA')) AS cat, SUM(oi.price * oi.quantity)::NUMERIC AS ing
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(COALESCE(oi.category, 'SIN CATEGORÍA'))
  ),
  cat_total AS (SELECT SUM(ing) AS total FROM cat_part),
  cat_pct AS (SELECT cp.cat, ROUND((cp.ing / NULLIF(ct.total, 0)) * 100, 2) AS pct FROM cat_part cp, cat_total ct),
  final AS (
    SELECT pc.product_id, pc.title AS producto, pc.color, pc.image_url AS foto, pc.variant_name AS talla, pc.sku,
      ld.name AS tienda_destino, ca.stock_dest, ROUND(ca.vps, 2) AS ritmo_venta, ca.uds,
      lo.name AS tienda_origen, ca.stock_orig,
      ROUND(COALESCE(cpct.pct, 1) * (1.0 / NULLIF(CASE WHEN ca.vps = 0 THEN 999 ELSE ROUND(ca.stock_dest::NUMERIC / NULLIF(ca.vps / 7.0, 0), 1) END, 0)), 4) AS prioridad
    FROM candidatos ca JOIN product_catalog pc ON ca.vid = pc.variant_id
    JOIN locations ld ON ca.dest_loc = ld.location_id JOIN locations lo ON ca.orig_loc = lo.location_id
    LEFT JOIN cat_pct cpct ON UPPER(COALESCE(pc.category, '')) = cpct.cat
    WHERE ca.rn = 1 AND ca.uds > 0 AND (p_origen IS NULL OR lo.name = p_origen) AND (p_destino IS NULL OR ld.name = p_destino)
  )
  SELECT f.product_id, f.producto, f.color, f.foto, f.talla, f.sku, f.tienda_destino, f.stock_dest, f.ritmo_venta, f.uds, f.tienda_origen, f.stock_orig, f.prioridad
  FROM final f ORDER BY f.product_id, f.tienda_destino, f.prioridad DESC LIMIT 1000;
END;
$function$;

-- reporte_wos_categoria_tienda: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_tienda(dias_atras integer, p_location_id text, p_hasta date DEFAULT NULL)
 RETURNS TABLE(categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_loc_id text;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
    SELECT location_id INTO v_loc_id FROM locations WHERE location_id = p_location_id OR name = p_location_id LIMIT 1;
    SELECT sub.snapshot_date INTO v_max_date
    FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
    WHERE sub.cnt >= 5000 LIMIT 1;
    IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT UPPER(c.category) as cat, SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) as promedio_semanal
        FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog c ON oi.sku = c.sku
        WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND o.location_id = v_loc_id AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    ),
    StockPorCategoria AS (
        SELECT UPPER(c.category) as cat, SUM(inv.available)::BIGINT as stock_total
        FROM inventory_snapshot inv JOIN product_catalog c ON c.variant_id = inv.variant_id
        WHERE inv.snapshot_date = v_max_date AND inv.location_id = v_loc_id AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    )
    SELECT COALESCE(s.cat, v.cat), COALESCE(s.stock_total, 0)::BIGINT, ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
        CASE
            WHEN COALESCE(v.promedio_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO (Sin Venta)'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) > 12 THEN '🔴 SOBRESTOCK'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) < 4 THEN '🟡 RIESGO AGOTADOS'
            ELSE '🟢 NIVEL ÓPTIMO'
        END::TEXT
    FROM StockPorCategoria s FULL OUTER JOIN VentasPeriodo v ON s.cat = v.cat
    ORDER BY COALESCE(s.stock_total, 0) DESC;
END;
$function$;

-- reporte_wos_categoria_global: add p_hasta
CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_global(dias_atras integer, p_location_ids text[] DEFAULT NULL::text[], p_hasta date DEFAULT NULL)
 RETURNS TABLE(tienda text, location_id text, categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, pct_full_price numeric, pct_rebajado numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH VentasPeriodo AS (
    SELECT o.location_id AS loc_id, UPPER(p.category) AS cat,
      SUM(oi.quantity::NUMERIC) AS und_total,
      SUM(oi.quantity::NUMERIC) / NULLIF((GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0), 0) AS promedio_semanal
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= v_boundary AND o.created_at < v_upper AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
    GROUP BY o.location_id, UPPER(p.category)
  ),
  StockPorCategoria AS (
    SELECT inv.location_id AS loc_id, UPPER(p.category) AS cat,
      SUM(inv.available::BIGINT) AS stock_total,
      SUM(CASE WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) <= COALESCE(p.price, 0) THEN inv.available ELSE 0 END)::NUMERIC AS stock_full,
      SUM(CASE WHEN COALESCE(NULLIF(p.compare_at_price, 0), 0) > COALESCE(p.price, 0) THEN inv.available ELSE 0 END)::NUMERIC AS stock_rebajado
    FROM inventory_snapshot inv JOIN product_catalog p ON p.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_max_date AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (p_location_ids IS NULL OR inv.location_id = ANY(p_location_ids)) AND inv.available > 0
    GROUP BY inv.location_id, UPPER(p.category)
  )
  SELECT l.name::TEXT, l.location_id::TEXT, COALESCE(s.cat, v.cat)::TEXT,
    COALESCE(s.stock_total, 0)::BIGINT, ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
    ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
    CASE WHEN COALESCE(s.stock_total, 0) = 0 THEN 0.0 ELSE ROUND((COALESCE(s.stock_full, 0) / s.stock_total::NUMERIC) * 100, 1) END::NUMERIC,
    CASE WHEN COALESCE(s.stock_total, 0) = 0 THEN 0.0 ELSE ROUND((COALESCE(s.stock_rebajado, 0) / s.stock_total::NUMERIC) * 100, 1) END::NUMERIC,
    CASE
      WHEN COALESCE(v.promedio_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO'
      WHEN (COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0)) > 20 THEN '🔴 SOBRESTOCK'
      WHEN (COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0)) < 8 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 NIVEL ÓPTIMO'
    END::TEXT
  FROM StockPorCategoria s FULL OUTER JOIN VentasPeriodo v ON s.loc_id = v.loc_id AND s.cat = v.cat
  JOIN locations l ON COALESCE(s.loc_id, v.loc_id) = l.location_id
  WHERE l.is_active = true AND (COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.und_total, 0) > 0)
  ORDER BY l.name, COALESCE(s.cat, v.cat);
END;
$function$;
