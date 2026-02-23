
-- RPC: Executive KPIs by channel and optional location
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_kpis(
  dias_atras integer,
  canal_filtro text DEFAULT NULL,
  location_filtro text DEFAULT NULL
)
RETURNS TABLE(
  ventas_totales numeric,
  unidades_totales bigint,
  ticket_promedio numeric
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
    RAISE EXCEPTION 'dias_atras must be between 1 and 365';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(oi.price * oi.quantity), 0)::numeric,
    COALESCE(SUM(oi.quantity), 0)::bigint,
    ROUND(COALESCE(SUM(oi.price * oi.quantity), 0) / NULLIF(COUNT(DISTINCT o.shopify_order_id), 0), 0)::numeric
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
    AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (canal_filtro IS NULL OR 
         (canal_filtro = 'POS' AND o.source_name = 'pos') OR
         (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
    AND (location_filtro IS NULL OR o.location_id = location_filtro);
END;
$$;

-- RPC: Executive product ranking by channel, location, direction
CREATE OR REPLACE FUNCTION public.reporte_ejecutivo_productos(
  dias_atras integer,
  canal_filtro text DEFAULT NULL,
  location_filtro text DEFAULT NULL,
  orden text DEFAULT 'TOP',
  limite integer DEFAULT 20
)
RETURNS TABLE(
  foto text,
  producto text,
  sku text,
  categoria text,
  clasificacion text,
  unidades_vendidas bigint,
  precio_prom_venta numeric,
  stock_disponible bigint
)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF dias_atras IS NULL OR dias_atras < 1 OR dias_atras > 365 THEN
    RAISE EXCEPTION 'dias_atras must be between 1 and 365';
  END IF;

  RETURN QUERY
  WITH VentasFiltradas AS (
    SELECT
      oi.sku AS v_sku,
      SUM(oi.quantity) AS und_vendidas,
      SUM(oi.price * oi.quantity) AS ingresos,
      SUM(CASE WHEN oi.manual_discount_amount = 0 AND oi.is_markdown = false THEN oi.quantity ELSE 0 END) AS und_full,
      SUM(CASE WHEN oi.manual_discount_amount > 0 OR oi.is_markdown = true THEN oi.quantity ELSE 0 END) AS und_promo
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (dias_atras || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (canal_filtro IS NULL OR
           (canal_filtro = 'POS' AND o.source_name = 'pos') OR
           (canal_filtro = 'DIGITAL' AND o.source_name != 'pos'))
      AND (location_filtro IS NULL OR o.location_id = location_filtro)
    GROUP BY oi.sku
  ),
  StockTotal AS (
    SELECT inv.sku AS s_sku, SUM(inv.available)::bigint AS stock
    FROM inventory_snapshot inv
    GROUP BY inv.sku
  )
  SELECT
    c.image_url,
    c.title,
    v.v_sku,
    c.category,
    CASE
      WHEN v.und_full >= v.und_promo THEN 'Ganador Full Price'
      ELSE 'Ganador Promo'
    END,
    v.und_vendidas,
    ROUND(v.ingresos / NULLIF(v.und_vendidas, 0), 0),
    COALESCE(st.stock, 0)
  FROM VentasFiltradas v
  JOIN product_catalog c ON v.v_sku = c.sku
  LEFT JOIN StockTotal st ON v.v_sku = st.s_sku
  ORDER BY
    CASE WHEN orden = 'TOP' THEN v.und_vendidas END DESC NULLS LAST,
    CASE WHEN orden = 'BOTTOM' THEN v.und_vendidas END ASC NULLS LAST
  LIMIT limite;
END;
$$;
