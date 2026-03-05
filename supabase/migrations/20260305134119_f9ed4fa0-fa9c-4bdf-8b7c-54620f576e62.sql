
-- Fix reporte_ejecutivo_productos: use complete snapshot logic instead of MAX(snapshot_date)
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(dias_atras integer, canal_filtro text DEFAULT NULL::text, location_filtro text DEFAULT NULL::text, orden text DEFAULT 'TOP'::text, limite integer DEFAULT 20, zona_filtro text DEFAULT NULL::text)
 RETURNS TABLE(foto text, producto text, sku text, categoria text, clasificacion text, unidades_vendidas bigint, precio_prom_venta numeric, stock_disponible bigint, sell_through_pct numeric, wos numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_date date;
BEGIN
  -- Use the most recent complete snapshot (>=5000 distinct variants)
  SELECT sub.snapshot_date INTO v_max_date
  FROM (
    SELECT snapshot_date, COUNT(DISTINCT variant_id) as cnt
    FROM inventory_snapshot
    GROUP BY snapshot_date
    ORDER BY snapshot_date DESC
  ) sub
  WHERE sub.cnt >= 5000
  LIMIT 1;

  IF v_max_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_max_date FROM inventory_snapshot;
  END IF;

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
    JOIN product_catalog p ON p.variant_id = inv.variant_id
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
