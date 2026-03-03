
DROP FUNCTION IF EXISTS public.reporte_curva_traslados(integer, text, text);

CREATE OR REPLACE FUNCTION public.reporte_curva_traslados(
  dias_atras integer,
  p_origen text DEFAULT NULL::text,
  p_destino text DEFAULT NULL::text
)
RETURNS TABLE(
  product_id text,
  producto text,
  color text,
  foto text,
  talla text,
  sku text,
  tienda_destino text,
  stock_destino integer,
  ritmo_venta numeric,
  uds_sugeridas integer,
  tienda_origen text,
  stock_origen integer,
  prioridad numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH
  -- 1. Category sales participation weight
  VentasPorCategoria AS (
    SELECT
      UPPER(p.category) AS cat,
      SUM(oi.quantity::NUMERIC) AS und_cat
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  ),
  TotalVentas AS (
    SELECT COALESCE(SUM(und_cat), 1) AS total FROM VentasPorCategoria
  ),
  PesoCategoria AS (
    SELECT
      vc.cat,
      ROUND((vc.und_cat / tv.total) * 100, 2) AS pct_participacion
    FROM VentasPorCategoria vc
    CROSS JOIN TotalVentas tv
  ),
  -- 2. Sales per store per SKU
  VentasPorTienda AS (
    SELECT
      p.product_id,
      p.title AS producto_name,
      p.color AS color_name,
      oi.sku AS sku_val,
      o.location_id,
      MAX(p.image_url) AS foto_url,
      MAX(p.variant_name) AS talla_name,
      MAX(UPPER(p.category)) AS categoria,
      SUM(oi.quantity::NUMERIC) AS und_vendidas,
      SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_prom_semanal
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.product_id, p.title, p.color, oi.sku, o.location_id
  ),
  -- 3. Stock per store per SKU
  StockPorTienda AS (
    SELECT
      p.product_id,
      p.title AS producto_name,
      p.color AS color_name,
      inv.sku AS sku_val,
      inv.location_id,
      MAX(p.image_url) AS foto_url,
      MAX(p.variant_name) AS talla_name,
      MAX(UPPER(p.category)) AS categoria,
      SUM(inv.available::NUMERIC) AS stock_total
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.product_id, p.title, p.color, inv.sku, inv.location_id
  ),
  -- 4. WOS calculation
  WosPorTienda AS (
    SELECT
      COALESCE(s.product_id, v.product_id) AS pid,
      COALESCE(s.producto_name, v.producto_name) AS prod,
      COALESCE(s.color_name, v.color_name) AS col,
      COALESCE(s.sku_val, v.sku_val) AS sku_v,
      COALESCE(s.location_id, v.location_id) AS loc_id,
      COALESCE(v.foto_url, s.foto_url, '') AS foto_v,
      COALESCE(v.talla_name, s.talla_name, '') AS talla_v,
      COALESCE(s.categoria, v.categoria, '') AS categoria_v,
      COALESCE(s.stock_total, 0) AS stock,
      COALESCE(v.venta_prom_semanal, 0) AS venta_semanal,
      COALESCE(v.venta_prom_semanal, 0) / 7.0 AS consumo_diario,
      CASE
        WHEN COALESCE(v.venta_prom_semanal, 0) = 0 AND COALESCE(s.stock_total, 0) > 0 THEN 999
        WHEN COALESCE(v.venta_prom_semanal, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(s.stock_total, 0) / v.venta_prom_semanal, 1)
      END AS wos
    FROM StockPorTienda s
    FULL OUTER JOIN VentasPorTienda v
      ON s.product_id = v.product_id AND s.sku_val = v.sku_val AND s.location_id = v.location_id
    WHERE COALESCE(s.stock_total, 0) > 0 OR COALESCE(v.venta_prom_semanal, 0) > 0
  ),
  -- 5. Destinations: WOS < 4, with sales
  Destinos AS (
    SELECT w.pid, w.prod, w.col, w.sku_v, w.loc_id, w.foto_v, w.talla_v, w.categoria_v,
           w.stock, w.venta_semanal, w.wos, w.consumo_diario AS consumo_diario_dest
    FROM WosPorTienda w
    WHERE w.wos > 0 AND w.wos < 4
      AND w.venta_semanal > 0
  ),
  -- 6. Origins: WOS > 12, cedible stock
  Origenes AS (
    SELECT w.pid, w.sku_v, w.loc_id, w.stock, w.wos, w.consumo_diario,
           GREATEST(w.stock - CEIL(w.consumo_diario * 60), 0) AS stock_cedible
    FROM WosPorTienda w
    WHERE w.wos > 12
      AND w.wos < 999
      AND w.stock > 3
      AND (w.stock - CEIL(w.consumo_diario * 60)) > 0
  ),
  -- 7. Match candidates with category-weighted priority
  Candidatos AS (
    SELECT
      d.pid, d.prod, d.col, d.sku_v, d.foto_v, d.talla_v, d.categoria_v,
      ori.loc_id AS loc_origen,
      d.loc_id AS loc_destino,
      ori.stock AS stock_origen_val,
      ori.stock_cedible,
      ori.wos AS wos_origen,
      d.venta_semanal,
      d.wos AS wos_destino,
      d.consumo_diario_dest,
      d.stock AS stock_destino_val,
      LEAST(
        ori.stock_cedible,
        GREATEST(CEIL(d.consumo_diario_dest * 56) - d.stock, 1)
      )::INTEGER AS uds_sugeridas_val,
      -- Priority = category participation % * urgency (1/WOS)
      COALESCE(pc.pct_participacion, 0) * (1.0 / NULLIF(d.wos, 0)) AS prioridad_val,
      ROW_NUMBER() OVER (PARTITION BY d.sku_v, d.loc_id ORDER BY ori.stock_cedible DESC) AS rn
    FROM Destinos d
    JOIN Origenes ori ON d.sku_v = ori.sku_v AND d.loc_id != ori.loc_id
    LEFT JOIN PesoCategoria pc ON d.categoria_v = pc.cat
  ),
  Unicos AS (
    SELECT * FROM Candidatos WHERE rn = 1
  )
  SELECT
    u.pid::TEXT,
    u.prod::TEXT,
    u.col::TEXT,
    u.foto_v::TEXT,
    u.talla_v::TEXT,
    u.sku_v::TEXT,
    CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END::TEXT,
    u.stock_destino_val::INTEGER,
    ROUND(u.venta_semanal, 2)::NUMERIC,
    u.uds_sugeridas_val::INTEGER,
    CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END::TEXT,
    u.stock_origen_val::INTEGER,
    ROUND(COALESCE(u.prioridad_val, 0), 2)::NUMERIC
  FROM Unicos u
  JOIN locations ld ON u.loc_destino = ld.location_id
  JOIN locations lo ON u.loc_origen = lo.location_id
  WHERE u.uds_sugeridas_val > 0
    AND (p_origen IS NULL OR lo.name = p_origen OR (lo.location_id = '71474315479' AND p_origen = 'Bodega Ecommerce'))
    AND (p_destino IS NULL OR ld.name = p_destino OR (ld.location_id = '71474315479' AND p_destino = 'Bodega Ecommerce'))
  ORDER BY COALESCE(u.prioridad_val, 0) DESC, u.venta_semanal DESC
  LIMIT 300;
END;
$function$;
