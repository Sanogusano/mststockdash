
-- Fix reporte_wos_categoria_tienda: add MAX(snapshot_date) filter
CREATE OR REPLACE FUNCTION public.reporte_wos_categoria_tienda(dias_atras integer, p_location_id text)
 RETURNS TABLE(categoria text, inventario_total bigint, venta_promedio_semanal numeric, semanas_inventario numeric, estado_salud text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

    RETURN QUERY
    WITH TiendaIdentificada AS (
        SELECT location_id FROM locations 
        WHERE location_id = p_location_id OR name = p_location_id 
        LIMIT 1
    ),
    VentasPeriodo AS (
        SELECT 
            UPPER(c.category) as cat, 
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) as promedio_semanal
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        JOIN product_catalog c ON oi.sku = c.sku
        WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
          AND o.location_id = (SELECT location_id FROM TiendaIdentificada)
          AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    ),
    StockPorCategoria AS (
        SELECT 
            UPPER(c.category) as cat, 
            SUM(inv.available)::BIGINT as stock_total
        FROM inventory_snapshot inv
        JOIN product_catalog c ON inv.sku = c.sku
        WHERE inv.snapshot_date = v_max_date
          AND inv.location_id = (SELECT location_id FROM TiendaIdentificada)
          AND UPPER(c.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY UPPER(c.category)
    )
    SELECT 
        COALESCE(s.cat, v.cat),
        COALESCE(s.stock_total, 0)::BIGINT,
        ROUND(COALESCE(v.promedio_semanal, 0), 2)::NUMERIC,
        ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1)::NUMERIC,
        CASE 
            WHEN COALESCE(v.promedio_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK CRÍTICO (Sin Venta)'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) > 12 THEN '🔴 SOBRESTOCK'
            WHEN ROUND(COALESCE(s.stock_total, 0)::NUMERIC / NULLIF(v.promedio_semanal, 0), 1) < 4 THEN '🟡 RIESGO AGOTADOS'
            ELSE '🟢 NIVEL ÓPTIMO'
        END::TEXT
    FROM StockPorCategoria s
    FULL OUTER JOIN VentasPeriodo v ON s.cat = v.cat
    ORDER BY COALESCE(s.stock_total, 0) DESC;
END;
$function$;

-- Fix reporte_reorden_insumos: add MAX(snapshot_date) filter
CREATE OR REPLACE FUNCTION public.reporte_reorden_insumos()
 RETURNS TABLE(foto text, insumo text, sku text, stock_cedi bigint, consumo_diario_total numeric, dias_autonomia numeric, estado_gestion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

    RETURN QUERY
    WITH ConsumoGlobal AS (
        SELECT 
            oi.sku, 
            SUM(oi.quantity) / 30.0 as unidades_dia
        FROM order_items oi
        JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
        WHERE o.created_at >= (NOW() - INTERVAL '30 days')
          AND (oi.category ILIKE '%bolsa%' OR oi.category ILIKE '%insumo%')
        GROUP BY oi.sku
    ),
    StockCEDI AS (
        SELECT inv.sku, SUM(inv.available)::BIGINT as stock
        FROM inventory_snapshot inv
        WHERE inv.location_id = '71474315479'
          AND inv.snapshot_date = v_max_date
        GROUP BY inv.sku
    )
    SELECT 
        c.image_url,
        c.title,
        c.sku,
        COALESCE(s.stock, 0)::BIGINT,
        ROUND(COALESCE(v.unidades_dia, 0), 2),
        ROUND(COALESCE(s.stock, 0)::NUMERIC / NULLIF(v.unidades_dia, 0), 1),
        CASE 
            WHEN ROUND(COALESCE(s.stock, 0)::NUMERIC / NULLIF(v.unidades_dia, 0), 1) < 15 THEN '🚨 REORDEN URGENTE'
            WHEN ROUND(COALESCE(s.stock, 0)::NUMERIC / NULLIF(v.unidades_dia, 0), 1) < 30 THEN '⚠️ PLANEAR COMPRA'
            ELSE '✅ STOCK SUFICIENTE'
        END
    FROM product_catalog c
    LEFT JOIN StockCEDI s ON c.sku = s.sku
    LEFT JOIN ConsumoGlobal v ON c.sku = v.sku
    WHERE (c.category ILIKE '%bolsa%' OR c.category ILIKE '%insumo%')
    ORDER BY ROUND(COALESCE(s.stock, 0)::NUMERIC / NULLIF(v.unidades_dia, 0), 1) ASC;
END;
$function$;

-- Fix reporte_ejecutivo_productos: add MAX(snapshot_date) filter
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, orden text DEFAULT 'TOP'::text, limite integer DEFAULT 20, zona_filtro text DEFAULT NULL::text)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, clasificacion text, unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint, sell_through_pct numeric, wos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

  RETURN QUERY
  WITH VentasFiltradas AS (
    SELECT
      p.product_id AS pid,
      MAX(p.image_url) AS img,
      MAX(p.title) AS titulo,
      MAX(p.category) AS cat,
      SUM(oi.quantity)::BIGINT AS und_vendidas,
      SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0
                AND COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) <= oi.price::numeric
                AND NOT (p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric)
           THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0
                AND (
                  COALESCE(NULLIF(oi.compare_at_price::numeric, 0), NULLIF(p.compare_at_price::numeric, 0), 0) > oi.price::numeric
                  OR (p.price IS NOT NULL AND p.price > 0 AND oi.price::numeric < p.price::numeric)
                )
           THEN oi.quantity ELSE 0 END) AS und_rebajas,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0
           THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND p.product_id IS NOT NULL
      AND (NULLIF(TRIM(location_filtro), '') IS NULL OR o.location_id = location_filtro)
      AND (NULLIF(TRIM(zona_filtro), '') IS NULL OR o.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = zona_filtro AND loc.is_active = true))
      AND (
        NULLIF(TRIM(canal_filtro), '') IS NULL OR
        (UPPER(canal_filtro) = 'DIGITAL' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (UPPER(canal_filtro) = 'OUTLET' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (UPPER(canal_filtro) = 'TIENDAS' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479') OR
        (UPPER(canal_filtro) = 'POS' AND o.source_name = 'pos')
      )
    GROUP BY p.product_id
  ),
  StockTotal AS (
    SELECT p.product_id AS pid, SUM(inv.available)::BIGINT AS stock
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.snapshot_date = v_max_date
      AND p.product_id IS NOT NULL
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(location_filtro), '') IS NULL OR inv.location_id = location_filtro)
      AND (NULLIF(TRIM(zona_filtro), '') IS NULL OR inv.location_id IN (SELECT loc.location_id FROM locations loc WHERE loc.zona = zona_filtro AND loc.is_active = true))
    GROUP BY p.product_id
  ),
  Combinado AS (
    SELECT
      v.img, v.titulo, v.pid, v.cat,
      v.und_vendidas, v.ingresos,
      COALESCE(st.stock, 0)::BIGINT AS stock,
      v.und_full, v.und_rebajas, v.und_promo,
      CASE WHEN (v.und_vendidas + COALESCE(st.stock, 0)) = 0 THEN 0.0
        ELSE ROUND(v.und_vendidas::NUMERIC / (v.und_vendidas + COALESCE(st.stock, 0))::NUMERIC * 100, 1)
      END AS st_pct,
      CASE WHEN v.und_vendidas = 0 THEN 0.0
        ELSE ROUND(COALESCE(st.stock, 0)::NUMERIC / (v.und_vendidas::NUMERIC / (GREATEST(dias_atras, 1)::NUMERIC / 7.0)), 1)
      END AS wos_val
    FROM VentasFiltradas v
    LEFT JOIN StockTotal st ON v.pid = st.pid
  )
  SELECT
    c.img::TEXT, c.titulo::TEXT, c.pid::TEXT, c.cat::TEXT,
    CASE
      WHEN c.und_full >= c.und_rebajas AND c.und_full >= c.und_promo THEN 'Ganador Full Price'
      WHEN c.und_rebajas >= c.und_full AND c.und_rebajas >= c.und_promo THEN 'Ganador Rebajas'
      ELSE 'Ganador Promo'
    END::TEXT,
    c.und_vendidas,
    ROUND(c.ingresos / NULLIF(c.und_vendidas, 0), 0)::NUMERIC,
    c.stock,
    c.st_pct::NUMERIC,
    c.wos_val::NUMERIC
  FROM Combinado c
  ORDER BY
    CASE WHEN UPPER(COALESCE(orden, 'TOP')) = 'TOP' THEN c.und_vendidas END DESC NULLS LAST,
    CASE WHEN UPPER(COALESCE(orden, 'TOP')) != 'TOP' THEN c.und_vendidas END ASC NULLS LAST
  LIMIT GREATEST(COALESCE(limite, 20), 1);
END;
$function$;

-- Fix reporte_sugerencias_traslado: add MAX(snapshot_date) filter and direct joins
CREATE OR REPLACE FUNCTION public.reporte_sugerencias_traslado(dias_atras integer)
 RETURNS TABLE(foto text, producto text, sku text, tienda_origen text, stock_origen numeric, tienda_destino text, ritmo_venta_destino numeric, uds_sugeridas numeric, accion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

    RETURN QUERY
    WITH VentasPorTienda AS (
        SELECT 
            p.title AS producto,
            oi.sku,
            o.location_id,
            MAX(p.image_url) AS foto,
            SUM(oi.quantity::NUMERIC) AS und_vendidas,
            SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_prom_semanal
        FROM order_items oi 
        JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
        JOIN product_catalog p ON oi.sku = p.sku
        WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, oi.sku, o.location_id
    ),
    StockPorTienda AS (
        SELECT 
            p.title AS producto,
            inv.sku,
            inv.location_id,
            SUM(inv.available::NUMERIC) AS stock_total
        FROM inventory_snapshot inv
        JOIN product_catalog p ON inv.sku = p.sku
        WHERE inv.snapshot_date = v_max_date
          AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
        GROUP BY p.title, inv.sku, inv.location_id
    ),
    WosPorTienda AS (
        SELECT
            COALESCE(s.producto, v.producto) AS producto,
            COALESCE(s.sku, v.sku) AS sku,
            COALESCE(s.location_id, v.location_id) AS location_id,
            COALESCE(v.foto, '') AS foto,
            COALESCE(s.stock_total, 0) AS stock,
            COALESCE(v.venta_prom_semanal, 0) AS venta_semanal,
            COALESCE(v.venta_prom_semanal, 0) / 7.0 AS consumo_diario,
            CASE 
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN 999
                WHEN COALESCE(v.venta_prom_semanal, 0) = 0 THEN 0
                ELSE ROUND(COALESCE(s.stock_total, 0) / v.venta_prom_semanal, 1)
            END AS wos
        FROM StockPorTienda s
        FULL OUTER JOIN VentasPorTienda v ON s.sku = v.sku AND s.location_id = v.location_id
        WHERE COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.venta_prom_semanal, 0) > 0
    ),
    Destinos AS (
        SELECT w.producto, w.sku, w.location_id, w.foto, w.stock, w.venta_semanal, w.wos, w.consumo_diario AS consumo_diario_dest
        FROM WosPorTienda w
        WHERE w.wos > 0 AND w.wos < 4 AND w.venta_semanal > 0
    ),
    Origenes AS (
        SELECT w.producto, w.sku, w.location_id, w.stock, w.wos, w.consumo_diario,
               GREATEST(w.stock - CEIL(w.consumo_diario * 60), 0) AS stock_cedible
        FROM WosPorTienda w
        WHERE w.wos > 12 AND w.wos < 999 AND w.stock > 3
          AND (w.stock - CEIL(w.consumo_diario * 60)) > 0
    ),
    Candidatos AS (
        SELECT 
            d.foto, d.producto, d.sku,
            ori.location_id AS loc_origen,
            d.location_id AS loc_destino,
            ori.stock AS stock_origen,
            ori.stock_cedible,
            ori.wos AS wos_origen,
            d.venta_semanal,
            d.wos AS wos_destino,
            d.consumo_diario_dest,
            d.stock AS stock_destino,
            LEAST(ori.stock_cedible, GREATEST(CEIL(d.consumo_diario_dest * 56) - d.stock, 1)) AS uds_sugeridas,
            ROW_NUMBER() OVER (PARTITION BY d.sku, d.location_id ORDER BY ori.stock_cedible DESC) AS rn
        FROM Destinos d
        JOIN Origenes ori ON d.sku = ori.sku AND d.location_id != ori.location_id
    ),
    Unicos AS (SELECT * FROM Candidatos WHERE rn = 1)
    SELECT 
        u.foto,
        u.producto,
        u.sku,
        CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END AS tienda_origen,
        u.stock_origen,
        CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END AS tienda_destino,
        ROUND(u.venta_semanal, 2)::NUMERIC AS ritmo_venta_destino,
        u.uds_sugeridas::NUMERIC,
        ('🚚 Origen ' || u.wos_origen || ' sem → Destino ' || u.wos_destino || ' sem')::TEXT AS accion
    FROM Unicos u
    JOIN locations ld ON u.loc_destino = ld.location_id
    JOIN locations lo ON u.loc_origen = lo.location_id
    WHERE u.uds_sugeridas > 0
    ORDER BY u.venta_semanal DESC, u.stock_cedible DESC
    LIMIT 150;
END;
$function$;
