CREATE INDEX IF NOT EXISTS idx_inventory_snapshot_date_variant_location_available
ON public.inventory_snapshot (snapshot_date, variant_id, location_id)
INCLUDE (available);

CREATE INDEX IF NOT EXISTS idx_product_catalog_variant_category_sku
ON public.product_catalog (variant_id, category, sku)
WHERE variant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_health_period
ON public.orders (created_at, financial_status, shopify_order_id, location_id)
WHERE financial_status IN ('paid', 'partially_refunded', 'partially_paid');

CREATE INDEX IF NOT EXISTS idx_order_items_order_sku_qty
ON public.order_items (shopify_order_id, sku)
INCLUDE (quantity);

CREATE OR REPLACE FUNCTION public.reporte_salud_inventario(dias_atras integer, p_hasta date DEFAULT NULL::date)
RETURNS TABLE(
  tipo text,
  tienda text,
  inventario_total bigint,
  venta_promedio_semanal numeric,
  semanas_inventario numeric,
  estado_salud text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_snapshot_date date;
  v_boundary timestamptz := _col_date_boundary(GREATEST(COALESCE(dias_atras, 1), 1), p_hasta);
  v_upper timestamptz := _col_upper_boundary(p_hasta);
  v_dias_denom numeric := GREATEST(COALESCE(dias_atras, 1)::numeric / 7.0, 1);
BEGIN
  SELECT snapshot_date
  INTO v_snapshot_date
  FROM public.inventory_snapshot
  GROUP BY snapshot_date
  HAVING COUNT(DISTINCT variant_id) >= 5000
  ORDER BY snapshot_date DESC
  LIMIT 1;

  IF v_snapshot_date IS NULL THEN
    SELECT MAX(snapshot_date) INTO v_snapshot_date FROM public.inventory_snapshot;
  END IF;

  RETURN QUERY
  WITH
  CatalogoTipo AS MATERIALIZED (
    SELECT
      pc.variant_id,
      pc.sku,
      CASE
        WHEN UPPER(COALESCE(pc.category, '')) IN ('BOLSA', 'INSUMOS') THEN 'BOLSAS Y EMPAQUES'
        ELSE 'PRENDAS'
      END AS tipo_inv
    FROM public.product_catalog pc
    WHERE pc.variant_id IS NOT NULL
  ),
  StockPorTienda AS MATERIALIZED (
    SELECT
      ct.tipo_inv,
      inv.location_id,
      SUM(GREATEST(inv.available, 0))::bigint AS stock_total
    FROM public.inventory_snapshot inv
    JOIN CatalogoTipo ct ON ct.variant_id = inv.variant_id
    WHERE inv.snapshot_date = v_snapshot_date
    GROUP BY ct.tipo_inv, inv.location_id
  ),
  VentasPorTienda AS MATERIALIZED (
    SELECT
      ct.tipo_inv,
      o.location_id,
      (SUM(oi.quantity)::numeric / v_dias_denom) AS promedio_venta_semanal
    FROM public.orders o
    JOIN public.order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN CatalogoTipo ct ON ct.sku = oi.sku
    WHERE o.created_at >= v_boundary
      AND o.created_at < v_upper
      AND o.financial_status IN ('paid', 'partially_refunded', 'partially_paid')
    GROUP BY ct.tipo_inv, o.location_id
  ),
  Base AS (
    SELECT
      tipo_inv,
      location_id,
      SUM(stock_total)::bigint AS stock_total,
      0::numeric AS venta_promedio
    FROM StockPorTienda
    GROUP BY tipo_inv, location_id
    UNION ALL
    SELECT
      tipo_inv,
      location_id,
      0::bigint AS stock_total,
      SUM(promedio_venta_semanal)::numeric AS venta_promedio
    FROM VentasPorTienda
    GROUP BY tipo_inv, location_id
  ),
  Consolidado AS (
    SELECT
      tipo_inv,
      location_id,
      SUM(stock_total)::bigint AS stock_total,
      SUM(venta_promedio)::numeric AS venta_promedio
    FROM Base
    GROUP BY tipo_inv, location_id
  )
  SELECT
    c.tipo_inv::text,
    l.name::text,
    c.stock_total::bigint,
    ROUND(c.venta_promedio, 1),
    ROUND(c.stock_total::numeric / NULLIF(c.venta_promedio, 0), 1),
    CASE
      WHEN c.tipo_inv = 'BOLSAS Y EMPAQUES' THEN
        CASE
          WHEN COALESCE(c.venta_promedio, 0) = 0 AND COALESCE(c.stock_total, 0) > 0 THEN '✅ STOCK SUFICIENTE'
          WHEN ROUND(c.stock_total::numeric / NULLIF(c.venta_promedio, 0), 1) < 2 THEN '🚨 REORDEN URGENTE'
          WHEN ROUND(c.stock_total::numeric / NULLIF(c.venta_promedio, 0), 1) < 4 THEN '⚠️ PLANEAR COMPRA'
          ELSE '✅ STOCK SUFICIENTE'
        END
      ELSE
        CASE
          WHEN COALESCE(c.venta_promedio, 0) = 0 AND COALESCE(c.stock_total, 0) > 0 THEN '🔴 SOBRESTOCK'
          WHEN ROUND(c.stock_total::numeric / NULLIF(c.venta_promedio, 0), 1) > 20 THEN '🔴 SOBRESTOCK'
          WHEN ROUND(c.stock_total::numeric / NULLIF(c.venta_promedio, 0), 1) < 8 THEN '🟡 RIESGO AGOTADOS'
          ELSE '🟢 NIVEL ÓPTIMO'
        END
    END::text
  FROM Consolidado c
  JOIN public.locations l ON l.location_id = c.location_id
  WHERE l.is_active = true
    AND (COALESCE(c.stock_total, 0) > 0 OR COALESCE(c.venta_promedio, 0) > 0)
  ORDER BY c.tipo_inv, c.stock_total DESC;
END;
$function$;