
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
  fecha_inicio DATE := CURRENT_DATE - dias_atras;
  semanas NUMERIC := GREATEST(dias_atras / 7.0, 1);
BEGIN
  RETURN QUERY
  WITH 
  -- Latest inventory per variant per location
  latest_inv AS (
    SELECT DISTINCT ON (i.variant_id, i.location_id)
      i.variant_id, i.location_id, i.available
    FROM inventory_snapshot i
    WHERE i.snapshot_date >= CURRENT_DATE - 7
    ORDER BY i.variant_id, i.location_id, i.snapshot_date DESC
  ),
  -- Sales velocity per variant per location
  sales_vel AS (
    SELECT 
      sf.variant_id,
      sf.location_id,
      SUM(sf.quantity)::NUMERIC / semanas AS venta_semanal
    FROM sales_fact sf
    WHERE sf.order_date >= fecha_inicio
    GROUP BY sf.variant_id, sf.location_id
  ),
  -- Global sales velocity per variant (for prioritization)
  sales_global AS (
    SELECT 
      sf.variant_id,
      SUM(sf.quantity)::NUMERIC / semanas AS venta_semanal_global
    FROM sales_fact sf
    WHERE sf.order_date >= fecha_inicio
    GROUP BY sf.variant_id
  ),
  -- Product info
  prod AS (
    SELECT DISTINCT ON (pc.variant_id)
      pc.variant_id,
      pc.product_id,
      pc.title AS producto,
      pc.color,
      pc.image_url AS foto,
      pc.variant_name AS talla,
      pc.sku,
      pc.category
    FROM product_catalog pc
    WHERE pc.variant_id IS NOT NULL
  ),
  -- Stock status per variant per location
  stock_status AS (
    SELECT
      p.product_id,
      p.variant_id,
      p.talla,
      p.sku,
      li.location_id,
      l.name AS tienda,
      COALESCE(li.available, 0) AS stock,
      COALESCE(sv.venta_semanal, 0) AS venta_sem,
      COALESCE(sg.venta_semanal_global, 0) AS venta_global,
      CASE WHEN COALESCE(sv.venta_semanal, 0) > 0 
        THEN ROUND(COALESCE(li.available, 0)::NUMERIC / sv.venta_semanal, 1)
        ELSE CASE WHEN COALESCE(li.available, 0) > 0 THEN 999 ELSE 0 END
      END AS wos
    FROM prod p
    JOIN latest_inv li ON li.variant_id = p.variant_id
    JOIN locations l ON l.location_id = li.location_id AND l.is_active = true
    LEFT JOIN sales_vel sv ON sv.variant_id = p.variant_id AND sv.location_id = li.location_id
    LEFT JOIN sales_global sg ON sg.variant_id = p.variant_id
    WHERE p.category IS DISTINCT FROM 'BOLSAS'
      AND p.category IS DISTINCT FROM 'INSUMOS'
  ),
  -- Destinations: locations where a product has WOS < 4 or stock < 2 for any variant
  -- We want at least 2 units per size to form a curve
  destinos AS (
    SELECT 
      ss.product_id,
      ss.location_id,
      ss.tienda,
      ss.variant_id,
      ss.talla,
      ss.sku,
      ss.stock,
      ss.venta_sem,
      ss.venta_global,
      GREATEST(2 - ss.stock, 0)::INTEGER AS uds_necesarias
    FROM stock_status ss
    WHERE (ss.wos < 4 OR ss.stock < 2)
      AND ss.stock < 2
      AND (p_destino IS NULL OR ss.tienda ILIKE '%' || p_destino || '%')
  ),
  -- Sources: locations with surplus stock (WOS > 12 and stock > 2)
  origenes AS (
    SELECT
      ss.product_id,
      ss.location_id,
      ss.tienda,
      ss.variant_id,
      ss.stock,
      ss.venta_sem,
      -- Cedible: keep 8 weeks of stock
      GREATEST(ss.stock - GREATEST(CEIL(ss.venta_sem * 8)::INTEGER, 1), 0)::INTEGER AS stock_cedible
    FROM stock_status ss
    WHERE ss.wos > 12 AND ss.stock > 2
      AND (p_origen IS NULL OR ss.tienda ILIKE '%' || p_origen || '%')
  ),
  -- Match: for each destination need, find sources
  matches AS (
    SELECT
      d.product_id,
      d.tienda AS dest_tienda,
      d.variant_id,
      d.talla,
      d.sku,
      d.stock AS dest_stock,
      d.venta_sem AS dest_venta,
      d.uds_necesarias,
      d.venta_global,
      o.tienda AS orig_tienda,
      o.stock AS orig_stock,
      o.stock_cedible,
      LEAST(d.uds_necesarias, o.stock_cedible)::INTEGER AS uds_trasladar,
      -- Prioritize: 1) source that covers more sizes of same product for same dest
      -- 2) higher cedible stock
      ROW_NUMBER() OVER (
        PARTITION BY d.product_id, d.location_id, d.variant_id
        ORDER BY o.stock_cedible DESC, o.tienda
      )::INTEGER AS src_priority
    FROM destinos d
    JOIN origenes o ON o.variant_id = d.variant_id 
      AND o.location_id != d.location_id
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
  JOIN prod p2 ON p2.variant_id = m.variant_id
  WHERE m.uds_trasladar > 0
    AND m.src_priority <= 3
  ORDER BY m.product_id, m.dest_tienda, m.venta_global DESC, p2.talla, m.src_priority;
END;
$$;
