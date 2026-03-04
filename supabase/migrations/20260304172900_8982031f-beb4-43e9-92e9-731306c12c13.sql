
CREATE OR REPLACE FUNCTION public.reporte_curva_traslados(dias_atras integer, p_origen text DEFAULT NULL::text, p_destino text DEFAULT NULL::text)
 RETURNS TABLE(product_id text, producto text, color text, foto text, talla text, sku text, tienda_destino text, stock_destino bigint, ritmo_venta numeric, uds_sugeridas bigint, tienda_origen text, stock_origen bigint, prioridad numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
  v_days int := GREATEST(COALESCE(dias_atras, 30), 1);
BEGIN
  SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;

  RETURN QUERY
  WITH
  inv AS (
    SELECT
      i.sku,
      i.location_id AS loc_id,
      SUM(i.available)::BIGINT AS stock
    FROM inventory_snapshot i
    WHERE i.snapshot_date = v_max_date
      AND i.available > 0
    GROUP BY i.sku, i.location_id
  ),
  ventas AS (
    SELECT
      oi.sku,
      o.location_id AS loc_id,
      SUM(oi.quantity)::NUMERIC / (v_days::NUMERIC / 7.0) AS vps
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (v_days || ' days')::INTERVAL)
      AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY oi.sku, o.location_id
  ),
  combined AS (
    SELECT
      COALESCE(i.sku, v.sku) AS sku,
      COALESCE(i.loc_id, v.loc_id) AS loc_id,
      COALESCE(i.stock, 0)::BIGINT AS stock,
      COALESCE(v.vps, 0) AS vps,
      CASE
        WHEN COALESCE(v.vps, 0) = 0 AND COALESCE(i.stock, 0) > 0 THEN 999.0
        WHEN COALESCE(v.vps, 0) = 0 THEN 0.0
        ELSE ROUND(COALESCE(i.stock, 0)::NUMERIC / v.vps, 1)
      END AS wos
    FROM inv i
    FULL OUTER JOIN ventas v ON i.sku = v.sku AND i.loc_id = v.loc_id
    WHERE COALESCE(i.stock, 0) > 0 OR COALESCE(v.vps, 0) > 0
  ),
  destinos AS (
    SELECT c.sku, c.loc_id, c.stock, c.vps, c.wos
    FROM combined c
    WHERE c.wos > 0 AND c.wos < 4 AND c.vps > 0
  ),
  origenes AS (
    SELECT
      c.sku, c.loc_id, c.stock, c.wos,
      GREATEST(c.stock - CEIL((c.vps / 7.0) * 60)::BIGINT, 0)::BIGINT AS stock_cedible
    FROM combined c
    WHERE c.wos > 12 AND c.wos < 999 AND c.stock > 3
  ),
  candidatos AS (
    SELECT
      d.sku, d.loc_id AS dest_loc, d.stock AS stock_dest, d.vps,
      o.loc_id AS orig_loc, o.stock AS stock_orig, o.stock_cedible,
      LEAST(
        o.stock_cedible,
        GREATEST(CEIL((d.vps / 7.0) * 56)::BIGINT - d.stock, 1)
      )::BIGINT AS uds,
      ROW_NUMBER() OVER (PARTITION BY d.sku, d.loc_id ORDER BY o.stock_cedible DESC) AS rn
    FROM destinos d
    JOIN origenes o ON d.sku = o.sku AND d.loc_id <> o.loc_id
    WHERE o.stock_cedible > 0
  ),
  cat_part AS (
    SELECT
      UPPER(COALESCE(oi.category, 'SIN CATEGORÍA')) AS cat,
      SUM(oi.price * oi.quantity)::NUMERIC AS ing
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    WHERE o.created_at >= (NOW() - (v_days || ' days')::INTERVAL)
      AND UPPER(COALESCE(oi.category, '')) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(COALESCE(oi.category, 'SIN CATEGORÍA'))
  ),
  cat_total AS (SELECT SUM(ing) AS total FROM cat_part),
  cat_pct AS (
    SELECT cp.cat, ROUND((cp.ing / NULLIF(ct.total, 0)) * 100, 2) AS pct
    FROM cat_part cp, cat_total ct
  ),
  final AS (
    SELECT
      pc.product_id,
      pc.title AS producto,
      pc.color,
      pc.image_url AS foto,
      pc.variant_name AS talla,
      ca.sku,
      ld.name AS tienda_destino,
      ca.stock_dest,
      ROUND(ca.vps, 2) AS ritmo_venta,
      ca.uds,
      lo.name AS tienda_origen,
      ca.stock_orig,
      ROUND(COALESCE(cpct.pct, 1) * (1.0 / NULLIF(
        CASE WHEN ca.vps = 0 THEN 999 ELSE ROUND(ca.stock_dest::NUMERIC / (ca.vps / 7.0), 1) END
      , 0)), 4) AS prioridad
    FROM candidatos ca
    JOIN product_catalog pc ON ca.sku = pc.sku
    JOIN locations ld ON ca.dest_loc = ld.location_id
    JOIN locations lo ON ca.orig_loc = lo.location_id
    LEFT JOIN cat_pct cpct ON UPPER(COALESCE(pc.category, '')) = cpct.cat
    WHERE ca.rn = 1
      AND ca.uds > 0
      AND (p_origen IS NULL OR lo.name = p_origen)
      AND (p_destino IS NULL OR ld.name = p_destino)
  )
  SELECT
    f.product_id, f.producto, f.color, f.foto, f.talla,
    f.sku, f.tienda_destino, f.stock_dest, f.ritmo_venta,
    f.uds, f.tienda_origen, f.stock_orig, f.prioridad
  FROM final f
  ORDER BY f.prioridad DESC
  LIMIT 500;
END;
$function$;
