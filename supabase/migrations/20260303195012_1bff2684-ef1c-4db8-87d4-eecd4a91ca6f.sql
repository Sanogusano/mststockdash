CREATE OR REPLACE FUNCTION public.reporte_curva_traslados(
  dias_atras integer,
  p_origen text DEFAULT NULL,
  p_destino text DEFAULT NULL
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
AS $$
DECLARE
  v_max_date date;
  v_days numeric;
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM public.inventory_snapshot;
  IF v_max_date IS NULL THEN
    RETURN;
  END IF;

  v_days := GREATEST(COALESCE(dias_atras, 30), 1);

  RETURN QUERY
  WITH catalogo AS (
    SELECT DISTINCT ON (pc.sku)
      pc.sku,
      pc.product_id,
      pc.title AS producto,
      pc.color,
      pc.image_url AS foto,
      pc.variant_name AS talla,
      UPPER(COALESCE(pc.category, '')) AS categoria
    FROM public.product_catalog pc
    WHERE pc.sku IS NOT NULL
    ORDER BY pc.sku, pc.updated_at DESC NULLS LAST
  ),
  ventas_base AS (
    SELECT
      oi.sku,
      REGEXP_REPLACE(COALESCE(o.location_id, ''), '^gid://shopify/Location/', '') AS loc_id,
      SUM(oi.quantity)::numeric AS und
    FROM public.order_items oi
    JOIN public.orders o ON o.shopify_order_id = oi.shopify_order_id
    WHERE o.created_at >= NOW() - (v_days || ' days')::interval
    GROUP BY
      oi.sku,
      REGEXP_REPLACE(COALESCE(o.location_id, ''), '^gid://shopify/Location/', '')
  ),
  ventas_tienda AS (
    SELECT
      c.product_id AS pid,
      c.producto AS prod,
      c.color AS col,
      c.foto AS foto_v,
      c.talla AS talla_v,
      c.categoria AS categoria_v,
      vb.sku AS sku_v,
      vb.loc_id,
      (vb.und / (v_days / 7.0))::numeric AS venta_semanal
    FROM ventas_base vb
    JOIN catalogo c ON c.sku = vb.sku
    WHERE c.categoria NOT IN ('BOLSA', 'INSUMOS')
  ),
  ventas_categoria AS (
    SELECT
      c.categoria AS cat,
      SUM(vb.und) AS und_cat
    FROM ventas_base vb
    JOIN catalogo c ON c.sku = vb.sku
    WHERE c.categoria NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY c.categoria
  ),
  total_ventas AS (
    SELECT COALESCE(SUM(und_cat), 1)::numeric AS total FROM ventas_categoria
  ),
  peso_categoria AS (
    SELECT
      vc.cat,
      ROUND((vc.und_cat / tv.total) * 100.0, 2) AS pct_participacion
    FROM ventas_categoria vc
    CROSS JOIN total_ventas tv
  ),
  stock_base AS (
    SELECT
      inv.sku,
      REGEXP_REPLACE(COALESCE(inv.location_id, ''), '^gid://shopify/Location/', '') AS loc_id,
      SUM(COALESCE(inv.available, 0))::numeric AS stock
    FROM public.inventory_snapshot inv
    WHERE inv.snapshot_date = v_max_date
    GROUP BY
      inv.sku,
      REGEXP_REPLACE(COALESCE(inv.location_id, ''), '^gid://shopify/Location/', '')
  ),
  stock_tienda AS (
    SELECT
      c.product_id AS pid,
      c.producto AS prod,
      c.color AS col,
      c.foto AS foto_v,
      c.talla AS talla_v,
      c.categoria AS categoria_v,
      sb.sku AS sku_v,
      sb.loc_id,
      sb.stock
    FROM stock_base sb
    JOIN catalogo c ON c.sku = sb.sku
    WHERE c.categoria NOT IN ('BOLSA', 'INSUMOS')
  ),
  combined AS (
    SELECT
      COALESCE(s.pid, v.pid) AS pid,
      COALESCE(s.prod, v.prod) AS prod,
      COALESCE(s.col, v.col) AS col,
      COALESCE(s.foto_v, v.foto_v, '') AS foto_v,
      COALESCE(s.talla_v, v.talla_v, '') AS talla_v,
      COALESCE(s.categoria_v, v.categoria_v, '') AS categoria_v,
      COALESCE(s.sku_v, v.sku_v) AS sku_v,
      COALESCE(s.loc_id, v.loc_id) AS loc_id,
      COALESCE(s.stock, 0) AS stock,
      COALESCE(v.venta_semanal, 0) AS venta_semanal,
      CASE
        WHEN COALESCE(v.venta_semanal, 0) = 0 AND COALESCE(s.stock, 0) > 0 THEN 999
        WHEN COALESCE(v.venta_semanal, 0) = 0 THEN 0
        ELSE ROUND(COALESCE(s.stock, 0) / NULLIF(v.venta_semanal, 0), 2)
      END AS wos,
      (COALESCE(v.venta_semanal, 0) / 7.0) AS consumo_diario
    FROM stock_tienda s
    FULL JOIN ventas_tienda v
      ON s.sku_v = v.sku_v
     AND s.loc_id = v.loc_id
  ),
  destinos AS (
    SELECT *
    FROM combined
    WHERE venta_semanal > 0
      AND (wos < 4 OR stock < 2)
  ),
  origenes AS (
    SELECT
      c.*,
      GREATEST(c.stock - CEIL(c.consumo_diario * 60), 0) AS stock_cedible
    FROM combined c
    WHERE c.wos > 12
      AND c.stock > 3
      AND (c.stock - CEIL(c.consumo_diario * 60)) > 0
  ),
  match_origen AS (
    SELECT
      d.pid,
      d.prod,
      d.col,
      d.foto_v,
      d.talla_v,
      d.sku_v,
      d.categoria_v,
      d.loc_id AS loc_destino,
      d.stock AS stock_destino_val,
      d.venta_semanal,
      d.wos,
      o.loc_id AS loc_origen,
      o.stock AS stock_origen_val,
      o.stock_cedible
    FROM destinos d
    JOIN LATERAL (
      SELECT o1.loc_id, o1.stock, o1.stock_cedible, o1.wos
      FROM origenes o1
      WHERE o1.sku_v = d.sku_v
        AND o1.loc_id <> d.loc_id
      ORDER BY o1.stock_cedible DESC, o1.wos DESC
      LIMIT 1
    ) o ON TRUE
  )
  SELECT
    m.pid::text AS product_id,
    m.prod::text AS producto,
    m.col::text AS color,
    m.foto_v::text AS foto,
    m.talla_v::text AS talla,
    m.sku_v::text AS sku,
    COALESCE(ld.name, m.loc_destino)::text AS tienda_destino,
    m.stock_destino_val::integer AS stock_destino,
    ROUND(m.venta_semanal, 2) AS ritmo_venta,
    LEAST(
      GREATEST(
        CEIL((GREATEST(4 - COALESCE(m.wos, 0), 0)) * m.venta_semanal),
        GREATEST(2 - m.stock_destino_val, 0),
        1
      ),
      m.stock_cedible
    )::integer AS uds_sugeridas,
    COALESCE(lo.name, m.loc_origen)::text AS tienda_origen,
    m.stock_origen_val::integer AS stock_origen,
    ROUND(COALESCE(pc.pct_participacion, 0) * (1.0 / NULLIF(GREATEST(m.wos, 0.1), 0)), 4) AS prioridad
  FROM match_origen m
  LEFT JOIN peso_categoria pc ON pc.cat = m.categoria_v
  LEFT JOIN public.locations lo ON lo.location_id = m.loc_origen
  LEFT JOIN public.locations ld ON ld.location_id = m.loc_destino
  WHERE LEAST(
      GREATEST(
        CEIL((GREATEST(4 - COALESCE(m.wos, 0), 0)) * m.venta_semanal),
        GREATEST(2 - m.stock_destino_val, 0),
        1
      ),
      m.stock_cedible
    ) > 0
    AND (p_origen IS NULL OR COALESCE(lo.name, m.loc_origen) = p_origen)
    AND (p_destino IS NULL OR COALESCE(ld.name, m.loc_destino) = p_destino)
  ORDER BY prioridad DESC, ritmo_venta DESC;
END;
$$;