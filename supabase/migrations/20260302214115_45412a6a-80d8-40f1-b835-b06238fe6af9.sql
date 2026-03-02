
CREATE OR REPLACE FUNCTION public.reporte_curva_traslados(
  dias_atras INTEGER,
  p_origen TEXT DEFAULT NULL,
  p_destino TEXT DEFAULT NULL
)
RETURNS TABLE(
  product_id TEXT,
  producto TEXT,
  color TEXT,
  foto TEXT,
  talla TEXT,
  sku TEXT,
  tienda_destino TEXT,
  stock_destino INTEGER,
  ritmo_venta NUMERIC,
  uds_sugeridas INTEGER,
  tienda_origen TEXT,
  stock_origen INTEGER,
  prioridad INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  semanas NUMERIC := GREATEST(dias_atras / 7.0, 1);
  max_snap DATE;
BEGIN
  SELECT MAX(i.snapshot_date) INTO max_snap FROM inventory_snapshot i;

  RETURN QUERY
  WITH 
  -- Latest inventory by SKU per location (normalize GID location_id)
  latest_inv AS (
    SELECT i.sku,
      REPLACE(i.location_id, 'gid://shopify/Location/', '') AS loc_id,
      SUM(i.available)::INTEGER AS available
    FROM inventory_snapshot i
    WHERE i.snapshot_date = max_snap
    GROUP BY i.sku, REPLACE(i.location_id, 'gid://shopify/Location/', '')
  ),
  -- Sales velocity per SKU per location
  sales_vel AS (
    SELECT oi.sku, o.location_id AS loc_id,
      SUM(oi.quantity)::NUMERIC / semanas AS venta_semanal
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
    GROUP BY oi.sku, o.location_id
  ),
  -- Global sales velocity per SKU
  sales_global AS (
    SELECT oi.sku, SUM(oi.quantity)::NUMERIC / semanas AS venta_global
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
    GROUP BY oi.sku
  ),
  -- Product info (one row per SKU, exclude supplies)
  prod AS (
    SELECT DISTINCT ON (pc.sku)
      pc.sku, pc.product_id, pc.title AS producto, pc.color,
      pc.image_url AS foto, pc.variant_name AS talla
    FROM product_catalog pc
    WHERE UPPER(COALESCE(pc.category, '')) NOT IN ('BOLSA', 'INSUMOS')
  ),
  -- Stock status per SKU per location
  stock_status AS (
    SELECT
      p.product_id, p.sku, p.talla,
      li.loc_id, l.name AS tienda,
      li.available AS stock,
      COALESCE(sv.venta_semanal, 0) AS venta_sem,
      sg.venta_global,
      CASE WHEN COALESCE(sv.venta_semanal, 0) > 0 
        THEN ROUND(li.available::NUMERIC / sv.venta_semanal, 1)
        ELSE CASE WHEN li.available > 0 THEN 999 ELSE 0 END
      END AS wos
    FROM prod p
    JOIN sales_global sg ON sg.sku = p.sku
    JOIN latest_inv li ON li.sku = p.sku AND li.available IS NOT NULL
    JOIN locations l ON l.location_id = li.loc_id AND l.is_active = true
    LEFT JOIN sales_vel sv ON sv.sku = p.sku AND sv.loc_id = li.loc_id
  ),
  -- Destinations: stock < 2 per SKU
  destinos AS (
    SELECT ss.product_id, ss.loc_id, ss.tienda, ss.sku, ss.talla,
      ss.stock, ss.venta_sem, ss.venta_global,
      GREATEST(2 - ss.stock, 0)::INTEGER AS uds_necesarias
    FROM stock_status ss
    WHERE ss.stock < 2
      AND (p_destino IS NULL OR ss.tienda ILIKE '%' || p_destino || '%')
  ),
  -- Sources: WOS > 12 and stock > 2
  origenes AS (
    SELECT ss.product_id, ss.loc_id, ss.tienda, ss.sku, ss.stock, ss.venta_sem,
      GREATEST(ss.stock - GREATEST(CEIL(ss.venta_sem * 8)::INTEGER, 1), 0)::INTEGER AS stock_cedible
    FROM stock_status ss
    WHERE ss.wos > 12 AND ss.stock > 2
      AND (p_origen IS NULL OR ss.tienda ILIKE '%' || p_origen || '%')
  ),
  -- Match destinations with sources
  matches AS (
    SELECT
      d.product_id, d.tienda AS dest_tienda, d.sku, d.talla,
      d.stock AS dest_stock, d.venta_sem AS dest_venta, d.venta_global,
      o.tienda AS orig_tienda, o.stock AS orig_stock,
      LEAST(d.uds_necesarias, o.stock_cedible)::INTEGER AS uds_trasladar,
      ROW_NUMBER() OVER (
        PARTITION BY d.sku, d.loc_id
        ORDER BY o.stock_cedible DESC
      )::INTEGER AS src_priority
    FROM destinos d
    JOIN origenes o ON o.sku = d.sku
      AND o.loc_id != d.loc_id
      AND o.stock_cedible > 0
    WHERE d.uds_necesarias > 0
  )
  SELECT
    m.product_id::TEXT,
    p2.producto::TEXT,
    p2.color::TEXT,
    p2.foto::TEXT,
    m.talla::TEXT,
    m.sku::TEXT,
    m.dest_tienda::TEXT,
    m.dest_stock::INTEGER,
    m.dest_venta::NUMERIC,
    m.uds_trasladar::INTEGER,
    m.orig_tienda::TEXT,
    m.orig_stock::INTEGER,
    m.src_priority::INTEGER
  FROM matches m
  JOIN prod p2 ON p2.sku = m.sku
  WHERE m.uds_trasladar > 0
    AND m.src_priority <= 3
  ORDER BY m.product_id, m.dest_tienda, m.venta_global DESC, p2.talla, m.src_priority
  LIMIT 5000;
END;
$$;
