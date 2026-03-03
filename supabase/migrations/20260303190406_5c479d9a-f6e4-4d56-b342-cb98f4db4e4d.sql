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
DECLARE
  v_max_date date;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

  RETURN QUERY
  WITH
  VentasPorCategoria AS (
    SELECT
      UPPER(p.category) AS cat,
      SUM(oi.quantity::NUMERIC) AS und_cat
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(COALESCE(p.category,'')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  ),
  TotalVentas AS (
    SELECT COALESCE(SUM(und_cat), 1) AS total FROM VentasPorCategoria
  ),
  PesoCategoria AS (
    SELECT vc.cat, ROUND((vc.und_cat / tv.total) * 100, 2) AS pct_participacion
    FROM VentasPorCategoria vc CROSS JOIN TotalVentas tv
  ),
  VentasPorTienda AS (
    SELECT
      p.product_id AS pid,
      p.title AS prod,
      p.color AS col,
      oi.sku AS sku_v,
      o.location_id AS loc_id,
      MAX(p.image_url) AS foto_v,
      MAX(p.variant_name) AS talla_v,
      MAX(UPPER(p.category)) AS categoria_v,
      SUM(oi.quantity::NUMERIC) / NULLIF((dias_atras::NUMERIC / 7.0), 0) AS venta_semanal
    FROM order_items oi
    JOIN orders o ON o.shopify_order_id = oi.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(COALESCE(p.category,'')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.product_id, p.title, p.color, oi.sku, o.location_id
  ),
  StockPorTienda AS (
    SELECT
      p.product_id AS pid,
      p.title AS prod,
      p.color AS col,
      inv.sku AS sku_v,
      inv.location_id AS loc_id,
      MAX(p.image_url) AS foto_v,
      MAX(p.variant_name) AS talla_v,
      MAX(UPPER(p.category)) AS categoria_v,
      SUM(inv.available) AS stock
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.snapshot_date = v_max_date
      AND UPPER(COALESCE(p.category,'')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY p.product_id, p.title, p.color, inv.sku, inv.location_id
  ),
  Combined AS (
    SELECT
      COALESCE(s.pid, v.pid) AS pid,
      COALESCE(s.prod, v.prod) AS prod,
      COALESCE(s.col, v.col) AS col,
      COALESCE(s.sku_v, v.sku_v) AS sku_v,
      COALESCE(s.loc_id, v.loc_id) AS loc_id,
      COALESCE(v.foto_v, s.foto_v, '') AS foto_v,
      COALESCE(v.talla_v, s.talla_v, '') AS talla_v,
      COALESCE(s.categoria_v, v.categoria_v, '') AS categoria_v,
      COALESCE(s.stock, 0)::NUMERIC AS stock,
      COALESCE(v.venta_semanal, 0) AS venta_semanal,
      COALESCE(v.venta_semanal, 0) / 7.0 AS consumo_diario,
      CASE
        WHEN COALESCE(v.venta_semanal, 0) = 0 AND COALESCE(s.stock, 0) > 0 THEN 999
        WHEN COALESCE(v.venta_semanal, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(s.stock, 0)::NUMERIC / v.venta_semanal, 1)
      END AS wos
    FROM StockPorTienda s
    FULL OUTER JOIN VentasPorTienda v ON s.pid = v.pid AND s.sku_v = v.sku_v AND s.loc_id = v.loc_id
    WHERE COALESCE(s.stock, 0) > 0 OR COALESCE(v.venta_semanal, 0) > 0
  ),
  Destinos AS (
    SELECT *
    FROM Combined
    WHERE venta_semanal > 0
      AND (wos < 4 OR stock < 2)
  ),
  Origenes AS (
    SELECT c.pid, c.sku_v, c.loc_id, c.stock, c.wos, c.consumo_diario,
           GREATEST(c.stock - CEIL(c.consumo_diario * 60), 0) AS stock_cedible
    FROM Combined c
    WHERE c.wos > 12 AND c.stock > 3
      AND (c.stock - CEIL(c.consumo_diario * 60)) > 0
  ),
  Candidatos AS (
    SELECT
      d.pid, d.prod, d.col, d.sku_v, d.foto_v, d.talla_v, d.categoria_v,
      ori.loc_id AS loc_origen, d.loc_id AS loc_destino,
      ori.stock::INTEGER AS stock_origen_val,
      d.stock::INTEGER AS stock_destino_val,
      d.venta_semanal,
      d.wos AS wos_destino,
      d.consumo_diario AS consumo_diario_dest,
      LEAST(ori.stock_cedible, GREATEST(CEIL(d.consumo_diario * 56) - d.stock, 1))::INTEGER AS uds_sugeridas_val,
      COALESCE(pc.pct_participacion, 0) * (1.0 / NULLIF(d.wos, 0)) AS prioridad_val,
      ROW_NUMBER() OVER (PARTITION BY d.sku_v, d.loc_id ORDER BY ori.stock_cedible DESC) AS rn
    FROM Destinos d
    JOIN Origenes ori ON d.sku_v = ori.sku_v AND d.loc_id != ori.loc_id
    LEFT JOIN PesoCategoria pc ON d.categoria_v = pc.cat
  )
  SELECT
    c.pid::TEXT,
    c.prod::TEXT,
    c.col::TEXT,
    c.foto_v::TEXT,
    c.talla_v::TEXT,
    c.sku_v::TEXT,
    CASE WHEN ld.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE ld.name END::TEXT,
    c.stock_destino_val::INTEGER,
    ROUND(c.venta_semanal, 2)::NUMERIC,
    c.uds_sugeridas_val::INTEGER,
    CASE WHEN lo.location_id = '71474315479' THEN 'Bodega Ecommerce' ELSE lo.name END::TEXT,
    c.stock_origen_val::INTEGER,
    ROUND(COALESCE(c.prioridad_val, 0), 2)::NUMERIC
  FROM Candidatos c
  JOIN locations ld ON c.loc_destino = ld.location_id
  JOIN locations lo ON c.loc_origen = lo.location_id
  WHERE c.rn = 1 AND c.uds_sugeridas_val > 0
    AND (p_origen IS NULL OR lo.name = p_origen OR (lo.location_id = '71474315479' AND p_origen = 'Bodega Ecommerce'))
    AND (p_destino IS NULL OR ld.name = p_destino OR (ld.location_id = '71474315479' AND p_destino = 'Bodega Ecommerce'))
  ORDER BY COALESCE(c.prioridad_val, 0) DESC, c.venta_semanal DESC
  LIMIT 300;
END;
$function$;