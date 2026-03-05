
-- 1) Drop and recreate reporte_ejecutivo_productos with coleccion column
DROP FUNCTION IF EXISTS public.reporte_ejecutivo_productos(integer, text, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(
  dias_atras integer,
  canal_filtro text DEFAULT NULL,
  location_filtro text DEFAULT NULL,
  orden text DEFAULT 'TOP',
  limite integer DEFAULT 20,
  zona_filtro text DEFAULT NULL
)
RETURNS TABLE(
  foto text, producto text, sku text, categoria text, clasificacion text,
  unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint,
  sell_through_pct numeric, wos numeric, coleccion text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_max_date date;
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
    WHERE o.created_at>=(NOW()-(dias_atras||' days')::INTERVAL)
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

-- 2) Drop and recreate reporte_top_productos_global with coleccion column
DROP FUNCTION IF EXISTS public.reporte_top_productos_global(integer, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.reporte_top_productos_global(
  dias_atras integer, p_canal text DEFAULT NULL, p_categoria text DEFAULT NULL,
  p_orden text DEFAULT 'TOP', p_limite integer DEFAULT 50
)
RETURNS TABLE(
  foto text, producto text, sku text, categoria text,
  und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint,
  pct_full_price numeric, pct_rebajas numeric, pct_descuento numeric,
  clasificacion text, coleccion text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT p.title AS prod, MAX(p.image_url) AS img, MAX(p.category) AS cat,
      MAX(COALESCE(p.collection_season, '')) AS col_season,
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
    WHERE o.created_at>=(NOW()-(GREATEST(COALESCE(dias_atras,1),1)||' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA','INSUMOS')
      AND (NULLIF(TRIM(p_categoria),'') IS NULL OR UPPER(p.category)=UPPER(TRIM(p_categoria)))
      AND (NULLIF(TRIM(p_canal),'') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id='71474315479' OR o.source_name!='pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))='OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name='pos' AND UPPER(COALESCE(l.tipo_tienda,''))!='OUTLET' AND o.location_id!='71474315479'))
    GROUP BY p.title
  )
  SELECT v.img::TEXT, v.prod::TEXT, 'Varias Tallas'::TEXT, UPPER(v.cat)::TEXT,
    v.uds_tiendas, v.uds_outlets, v.uds_digital, v.uds_total,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_full/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_rebajas/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_total=0 THEN 0.0 ELSE ROUND((v.uds_promo/v.uds_total::NUMERIC)*100,1) END::NUMERIC,
    CASE WHEN v.uds_full>=v.uds_rebajas AND v.uds_full>=v.uds_promo THEN '🏆 Ganador Full Price'
         WHEN v.uds_rebajas>=v.uds_full AND v.uds_rebajas>=v.uds_promo THEN '🏷️ Ganador Rebajas'
         ELSE '🧲 Ganador Promo' END::TEXT,
    CASE WHEN COALESCE(NULLIF(TRIM(v.col_season),''),'')='' THEN 'Otros' ELSE v.col_season END::TEXT
  FROM VentasPorCanal v
  ORDER BY CASE WHEN UPPER(COALESCE(p_orden,'TOP'))='TOP' THEN v.uds_total END DESC NULLS LAST,
           CASE WHEN UPPER(COALESCE(p_orden,'TOP'))!='TOP' THEN v.uds_total END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limite,50),1);
END;
$function$;

-- 3) Drop and recreate reporte_comportamiento_producto with coleccion
DROP FUNCTION IF EXISTS public.reporte_comportamiento_producto(integer, text, text);

CREATE OR REPLACE FUNCTION public.reporte_comportamiento_producto(
  dias_atras integer, p_sku_filter text DEFAULT NULL, p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  foto text, sku text, producto text, categoria text, und_vendidas bigint,
  stock_tiendas bigint, stock_digital bigint, clasificacion text,
  sell_through_pct numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint, coleccion text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
        WHERE o.created_at>=(NOW()-(GREATEST(COALESCE(dias_atras,1),1)||' days')::INTERVAL)
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

-- 4) Drop and recreate reporte_productos_por_categoria with coleccion
DROP FUNCTION IF EXISTS public.reporte_productos_por_categoria(integer, text, text, text);

CREATE OR REPLACE FUNCTION public.reporte_productos_por_categoria(
  dias_atras integer, p_categoria text DEFAULT NULL, p_canal text DEFAULT NULL, p_location_id text DEFAULT NULL
)
RETURNS TABLE(
  foto text, producto text, product_id text, stock_total bigint,
  venta_prom_semanal numeric, wos numeric, estado_salud text,
  und_full_price bigint, und_rebajas bigint, und_promo bigint,
  und_total bigint, clasificacion text, coleccion text
)
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  fecha_inicio TIMESTAMP WITH TIME ZONE := now()-(dias_atras||' days')::INTERVAL;
  semanas NUMERIC := GREATEST(dias_atras::NUMERIC/7.0,1);
  v_max_date date;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
  RETURN QUERY
  WITH productos AS (
    SELECT DISTINCT pc.product_id AS pid, pc.title, pc.image_url, pc.category,
           COALESCE(pc.collection_season, '') AS col_season
    FROM product_catalog pc WHERE pc.category=p_categoria AND pc.product_id IS NOT NULL
  ),
  inv AS (
    SELECT pc.product_id AS pid, SUM(COALESCE(i.available,0)) AS stock
    FROM inventory_snapshot i JOIN product_catalog pc ON pc.sku=i.sku
    WHERE i.snapshot_date=v_max_date AND pc.category=p_categoria AND pc.product_id IS NOT NULL
      AND (p_location_id IS NULL OR i.location_id=p_location_id)
    GROUP BY pc.product_id
  ),
  ventas AS (
    SELECT pc.product_id AS pid,
      SUM(CASE WHEN oi.is_markdown=false AND oi.manual_discount_amount<=0 THEN oi.quantity ELSE 0 END) AS uds_full,
      SUM(CASE WHEN oi.is_markdown=true THEN oi.quantity ELSE 0 END) AS uds_reb,
      SUM(CASE WHEN oi.is_markdown=false AND oi.manual_discount_amount>0 THEN oi.quantity ELSE 0 END) AS uds_promo,
      SUM(oi.quantity) AS uds_total
    FROM order_items oi JOIN orders o ON o.shopify_order_id=oi.shopify_order_id JOIN product_catalog pc ON pc.sku=oi.sku
    WHERE pc.category=p_categoria AND pc.product_id IS NOT NULL AND o.created_at>=fecha_inicio
      AND (p_location_id IS NULL OR oi.location_id=p_location_id)
      AND (p_canal IS NULL OR (p_canal='Digital' AND o.source_name IN ('web','shopify_draft_order')) OR (p_canal='POS' AND o.source_name='pos'))
    GROUP BY pc.product_id
  )
  SELECT COALESCE(p.image_url,'')::TEXT, COALESCE(p.title,'')::TEXT, p.pid::TEXT,
    COALESCE(inv.stock,0)::BIGINT, ROUND(COALESCE(v.uds_total,0)::NUMERIC/semanas,1),
    CASE WHEN COALESCE(v.uds_total,0)=0 THEN 999 ELSE ROUND(COALESCE(inv.stock,0)::NUMERIC/(COALESCE(v.uds_total,0)::NUMERIC/semanas),1) END,
    CASE
      WHEN COALESCE(v.uds_total,0)=0 AND COALESCE(inv.stock,0)>0 THEN '🔴 SOBRESTOCK CRÍTICO'
      WHEN COALESCE(inv.stock,0)=0 AND COALESCE(v.uds_total,0)>0 THEN '🟡 AGOTADO'
      WHEN COALESCE(inv.stock,0)=0 AND COALESCE(v.uds_total,0)=0 THEN '⚪ SIN DATOS'
      WHEN ROUND(COALESCE(inv.stock,0)::NUMERIC/NULLIF(COALESCE(v.uds_total,0)::NUMERIC/semanas,0),1)>20 THEN '🔴 SOBRESTOCK'
      WHEN ROUND(COALESCE(inv.stock,0)::NUMERIC/NULLIF(COALESCE(v.uds_total,0)::NUMERIC/semanas,0),1)<8 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 NIVEL ÓPTIMO' END::TEXT,
    COALESCE(v.uds_full,0)::BIGINT, COALESCE(v.uds_reb,0)::BIGINT,
    COALESCE(v.uds_promo,0)::BIGINT, COALESCE(v.uds_total,0)::BIGINT,
    CASE WHEN COALESCE(v.uds_full,0)>=COALESCE(v.uds_reb,0) AND COALESCE(v.uds_full,0)>=COALESCE(v.uds_promo,0) THEN 'Full Price'
         WHEN COALESCE(v.uds_reb,0)>=COALESCE(v.uds_full,0) AND COALESCE(v.uds_reb,0)>=COALESCE(v.uds_promo,0) THEN 'Rebajas'
         ELSE 'Promo' END::TEXT,
    CASE WHEN COALESCE(NULLIF(TRIM(p.col_season),''),'')='' THEN 'Otros' ELSE p.col_season END::TEXT
  FROM productos p LEFT JOIN inv ON inv.pid=p.pid LEFT JOIN ventas v ON v.pid=p.pid
  ORDER BY COALESCE(inv.stock,0) DESC;
END;
$function$;

-- 5) Drop and recreate reporte_desempeño_comercial with coleccion
DROP FUNCTION IF EXISTS public."reporte_desempeño_comercial"(integer);

CREATE OR REPLACE FUNCTION public."reporte_desempeño_comercial"(dias_atras integer)
RETURNS TABLE(
  foto text, producto text, sku text, unidades_vendidas bigint,
  precio_prom_venta numeric, pct_contribucion numeric, perfil_ejecutivo text, coleccion text
)
LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE gran_total_ingresos NUMERIC;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF dias_atras IS NULL OR dias_atras<1 OR dias_atras>365 THEN RAISE EXCEPTION 'dias_atras must be between 1 and 365'; END IF;

    SELECT SUM(oi.price*oi.quantity) INTO gran_total_ingresos
    FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
    WHERE o.created_at>=(NOW()-(dias_atras||' days')::INTERVAL) AND UPPER(oi.category) NOT IN ('BOLSA','INSUMOS');

    RETURN QUERY
    WITH VentasPeriodo AS (
        SELECT oi.sku,
            SUM(oi.quantity) as und_vendidas,
            SUM(CASE WHEN oi.manual_discount_amount=0 AND oi.is_markdown=false THEN oi.quantity ELSE 0 END) as und_full_price,
            SUM(CASE WHEN oi.manual_discount_amount>0 OR oi.is_markdown=true THEN oi.quantity ELSE 0 END) as und_promo,
            SUM(oi.price*oi.quantity) as ingresos_netos
        FROM order_items oi JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
        WHERE o.created_at>=(NOW()-(dias_atras||' days')::INTERVAL) AND UPPER(oi.category) NOT IN ('BOLSA','INSUMOS')
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

-- 6) New RPC: Collection composition (units sold by collection)
CREATE OR REPLACE FUNCTION public.reporte_composicion_coleccion(
  dias_atras integer,
  p_canal text DEFAULT NULL,
  p_location_id text DEFAULT NULL,
  p_zona text DEFAULT NULL
)
RETURNS TABLE(coleccion text, unidades bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN COALESCE(NULLIF(TRIM(p.collection_season),''),'')='' THEN 'Otros' ELSE p.collection_season END::TEXT AS col,
    SUM(oi.quantity)::BIGINT AS uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id=o.shopify_order_id
  JOIN locations l ON o.location_id=l.location_id
  JOIN product_catalog p ON oi.sku=p.sku
  WHERE o.created_at>=(NOW()-(GREATEST(COALESCE(dias_atras,1),1)||' days')::INTERVAL)
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
