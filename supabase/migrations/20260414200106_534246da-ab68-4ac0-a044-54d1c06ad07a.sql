
-- ============================================================
-- FIX: reporte_comportamiento_producto (OLD overload, no p_hasta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(
  dias_atras integer,
  p_sku_filter text DEFAULT NULL,
  p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  foto text, sku text, producto text, categoria text,
  und_vendidas bigint, stock_tiendas bigint, stock_digital bigint,
  clasificacion text, sell_through_pct numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint, coleccion text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0));
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

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
      AND (NULLIF(TRIM(p_location_id),'') IS NULL OR o.location_id=p_location_id)
    GROUP BY p.title
  ),
  StockT AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id!='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR inv.location_id=p_location_id) GROUP BY p.title),
  StockD AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR p_location_id='71474315479') GROUP BY p.title),
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

-- ============================================================
-- FIX: reporte_comportamiento_producto (p_hasta overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(
  dias_atras integer,
  p_sku_filter text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(
  foto text, sku text, producto text, categoria text,
  und_vendidas bigint, stock_tiendas bigint, stock_digital bigint,
  clasificacion text, sell_through_pct numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint, coleccion text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

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
  StockT AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id!='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR inv.location_id=p_location_id) GROUP BY p.title),
  StockD AS (SELECT p.title AS p, SUM(inv.available::BIGINT) as sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku=p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id='71474315479' AND (NULLIF(TRIM(p_location_id),'') IS NULL OR p_location_id='71474315479') GROUP BY p.title),
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

-- ============================================================
-- FIX: reporte_desempeno_por_linea (OLD overload, no p_hasta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_desempeno_por_linea(
  dias_atras integer,
  p_canal text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS TABLE(
  categoria text, stock_tiendas bigint, stock_digital bigint,
  und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint,
  pct_participacion numeric, sell_through_pct numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  gran_total_uds NUMERIC;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0));
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  SELECT COALESCE(SUM(oi.quantity), 0) INTO gran_total_uds
  FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN locations l ON o.location_id = l.location_id JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= v_boundary AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
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
    WHERE o.created_at >= v_boundary AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479'))
    GROUP BY UPPER(p.category)
  ),
  StockTiendas AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category)),
  StockDigital AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id = '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category))
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

-- ============================================================
-- FIX: reporte_desempeno_por_linea (p_hasta overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_desempeno_por_linea(
  dias_atras integer,
  p_canal text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(
  categoria text, stock_tiendas bigint, stock_digital bigint,
  und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint,
  pct_participacion numeric, sell_through_pct numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  gran_total_uds NUMERIC;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

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
  StockTiendas AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS st FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id != '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category)),
  StockDigital AS (SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS sd FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku WHERE inv.snapshot_date = v_max_date AND inv.location_id = '71474315479' AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS') GROUP BY UPPER(p.category))
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

-- ============================================================
-- FIX: reporte_detalle_producto_tiendas (OLD overload, no p_hasta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_detalle_producto_tiendas(
  dias_atras integer,
  p_producto text
)
RETURNS TABLE(
  tienda text, und_vendidas bigint, ingresos numeric, stock_actual bigint,
  pct_full_price numeric, pct_descuento numeric,
  sell_through_pct numeric, wos numeric, estado_salud text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0));
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH SP AS(SELECT pc.sku FROM product_catalog pc WHERE pc.title=TRIM(p_producto)),
  VP AS(
    SELECT o.location_id as l, SUM(oi.quantity::BIGINT) as uv,
    SUM((oi.price::NUMERIC * oi.quantity::NUMERIC) - COALESCE(oi.manual_discount_amount::NUMERIC, 0)) as ing,
    SUM(CASE WHEN oi.manual_discount_amount::NUMERIC=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END)::NUMERIC as uf,
    SUM(CASE WHEN oi.manual_discount_amount::NUMERIC>0 OR oi.is_markdown=true THEN oi.quantity ELSE 0 END)::NUMERIC as up
    FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    WHERE o.created_at >= v_boundary AND oi.sku IN(SELECT sku FROM SP)
    GROUP BY o.location_id
  ),
  STK AS(SELECT inv.location_id as l,SUM(inv.available::BIGINT) as sa FROM inventory_snapshot inv WHERE inv.snapshot_date = v_max_date AND inv.sku IN(SELECT sku FROM SP) GROUP BY inv.location_id)
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

-- ============================================================
-- FIX: reporte_detalle_producto_tiendas (p_hasta overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_detalle_producto_tiendas(
  dias_atras integer,
  p_producto text,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(
  tienda text, und_vendidas bigint, ingresos numeric, stock_actual bigint,
  pct_full_price numeric, pct_descuento numeric,
  sell_through_pct numeric, wos numeric, estado_salud text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
  v_max_date date;
BEGIN
  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

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
  STK AS(SELECT inv.location_id as l,SUM(inv.available::BIGINT) as sa FROM inventory_snapshot inv WHERE inv.snapshot_date = v_max_date AND inv.sku IN(SELECT sku FROM SP) GROUP BY inv.location_id)
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

-- ============================================================
-- FIX: reporte_detalle_skus_producto (OLD overload, no p_hasta)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_detalle_skus_producto(
  dias_atras integer,
  p_product_id text,
  canal_filtro text DEFAULT NULL,
  location_filtro text DEFAULT NULL
)
RETURNS TABLE(
  sku text, talla text, unidades_vendidas bigint, stock_disponible bigint,
  precio_prom_venta numeric, sell_through_pct numeric, wos numeric, clasificacion text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_max_date date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

  RETURN QUERY
  WITH VentasSku AS (
    SELECT oi.sku AS v_sku, SUM(oi.quantity)::BIGINT AS und_vendidas, SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount, 0) > 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi JOIN orders o ON oi.shopify_order_id = o.shopify_order_id JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= _col_date_boundary(dias_atras)
      AND p.product_id = p_product_id
      AND (canal_filtro IS NULL OR (canal_filtro = 'POS' AND o.source_name = 'pos') OR (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
      AND (location_filtro IS NULL OR o.location_id = location_filtro)
    GROUP BY oi.sku
  ),
  StockSku AS (
    SELECT inv.sku AS s_sku, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.snapshot_date = v_max_date
      AND p.product_id = p_product_id AND (location_filtro IS NULL OR inv.location_id = location_filtro)
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

-- ============================================================
-- FIX: reporte_detalle_skus_producto (p_hasta overload)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reporte_detalle_skus_producto(
  dias_atras integer,
  p_product_id text,
  canal_filtro text DEFAULT NULL,
  location_filtro text DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE(
  sku text, talla text, unidades_vendidas bigint, stock_disponible bigint,
  precio_prom_venta numeric, sell_through_pct numeric, wos numeric, clasificacion text
)
LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_max_date date;
  v_boundary timestamptz := _col_date_boundary(dias_atras, p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT sub.snapshot_date INTO v_max_date
  FROM (SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt FROM inventory_snapshot GROUP BY snapshot_date ORDER BY snapshot_date DESC) sub
  WHERE sub.cnt >= 5000 LIMIT 1;
  IF v_max_date IS NULL THEN SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot; END IF;

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
    WHERE inv.snapshot_date = v_max_date
      AND p.product_id = p_product_id AND (location_filtro IS NULL OR inv.location_id = location_filtro)
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
