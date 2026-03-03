
DROP FUNCTION IF EXISTS public.reporte_desempeno_por_linea(integer, text, text);

CREATE OR REPLACE FUNCTION public.reporte_desempeno_por_linea(dias_atras integer, p_canal text DEFAULT NULL::text, p_categoria text DEFAULT NULL::text)
 RETURNS TABLE(categoria text, stock_tiendas bigint, stock_digital bigint, und_tiendas bigint, und_outlets bigint, und_digital bigint, und_total bigint, pct_participacion numeric, sell_through_pct numeric, wos numeric, estado_salud text, und_full_price bigint, und_rebajas bigint, und_promo bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  gran_total_uds NUMERIC;
BEGIN
  SELECT COALESCE(SUM(oi.quantity), 0) INTO gran_total_uds
  FROM order_items oi
  JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
  JOIN locations l ON o.location_id = l.location_id
  JOIN product_catalog p ON oi.sku = p.sku
  WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
    AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    AND (
      NULLIF(TRIM(p_canal), '') IS NULL OR
      (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
      (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
      (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
    );

  RETURN QUERY
  WITH VentasPorCanal AS (
    SELECT
      UPPER(p.category) AS cat,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_tiendas,
      SUM(CASE WHEN o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_outlets,
      SUM(CASE WHEN o.location_id = '71474315479' OR o.source_name != 'pos' THEN oi.quantity ELSE 0 END)::BIGINT AS uds_digital,
      SUM(oi.quantity)::BIGINT AS uds_total,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) = 0 AND NOT COALESCE(oi.is_markdown, false) THEN oi.quantity ELSE 0 END)::BIGINT AS uds_full,
      SUM(CASE WHEN COALESCE(oi.is_markdown, false) = true THEN oi.quantity ELSE 0 END)::BIGINT AS uds_reb,
      SUM(CASE WHEN COALESCE(oi.manual_discount_amount::numeric, 0) > 0 AND NOT COALESCE(oi.is_markdown, false) THEN oi.quantity ELSE 0 END)::BIGINT AS uds_prom
    FROM order_items oi
    JOIN orders o ON oi.shopify_order_id = o.shopify_order_id
    JOIN locations l ON o.location_id = l.location_id
    JOIN product_catalog p ON oi.sku = p.sku
    WHERE o.created_at >= (NOW() - (GREATEST(COALESCE(dias_atras, 1), 1) || ' days')::INTERVAL)
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
      AND (NULLIF(TRIM(p_categoria), '') IS NULL OR UPPER(p.category) = UPPER(TRIM(p_categoria)))
      AND (
        NULLIF(TRIM(p_canal), '') IS NULL OR
        (LOWER(p_canal) LIKE '%digital%' AND (o.location_id = '71474315479' OR o.source_name != 'pos')) OR
        (LOWER(p_canal) LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) = 'OUTLET') OR
        (LOWER(p_canal) NOT LIKE '%digital%' AND LOWER(p_canal) NOT LIKE '%outlet%' AND o.source_name = 'pos' AND UPPER(COALESCE(l.tipo_tienda, '')) != 'OUTLET' AND o.location_id != '71474315479')
      )
    GROUP BY UPPER(p.category)
  ),
  StockTiendas AS (
    SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS st
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.location_id != '71474315479'
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  ),
  StockDigital AS (
    SELECT UPPER(p.category) AS cat, SUM(inv.available)::BIGINT AS sd
    FROM inventory_snapshot inv
    JOIN product_catalog p ON inv.sku = p.sku
    WHERE inv.location_id = '71474315479'
      AND UPPER(p.category) NOT IN ('BOLSA', 'INSUMOS')
    GROUP BY UPPER(p.category)
  )
  SELECT
    COALESCE(v.cat, COALESCE(st.cat, sd.cat))::TEXT,
    COALESCE(st.st, 0)::BIGINT, COALESCE(sd.sd, 0)::BIGINT,
    COALESCE(v.uds_tiendas, 0)::BIGINT, COALESCE(v.uds_outlets, 0)::BIGINT,
    COALESCE(v.uds_digital, 0)::BIGINT, COALESCE(v.uds_total, 0)::BIGINT,
    ROUND(COALESCE(v.uds_total, 0)::NUMERIC / NULLIF(gran_total_uds, 0) * 100, 1)::NUMERIC,
    CASE WHEN (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) = 0 THEN 0.0
      ELSE ROUND(COALESCE(v.uds_total, 0)::NUMERIC / (COALESCE(v.uds_total, 0) + COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC * 100, 1)
    END::NUMERIC,
    CASE WHEN COALESCE(v.uds_total, 0) = 0 THEN 0.0
      ELSE ROUND((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0)), 1)
    END::NUMERIC,
    CASE 
      WHEN COALESCE(v.uds_total, 0) = 0 AND (COALESCE(st.st, 0) + COALESCE(sd.sd, 0)) > 0 THEN '🔴 ESTANCADO'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) > 12 THEN '🔴 SOBRESTOCK'
      WHEN COALESCE(v.uds_total, 0) > 0 AND ((COALESCE(st.st, 0) + COALESCE(sd.sd, 0))::NUMERIC / (COALESCE(v.uds_total, 0)::NUMERIC / (GREATEST(COALESCE(dias_atras, 1), 1)::NUMERIC / 7.0))) < 4 THEN '🟡 RIESGO AGOTADOS'
      ELSE '🟢 ÓPTIMO'
    END::TEXT,
    COALESCE(v.uds_full, 0)::BIGINT,
    COALESCE(v.uds_reb, 0)::BIGINT,
    COALESCE(v.uds_prom, 0)::BIGINT
  FROM VentasPorCanal v
  FULL OUTER JOIN StockTiendas st ON v.cat = st.cat
  FULL OUTER JOIN StockDigital sd ON COALESCE(v.cat, st.cat) = sd.cat
  WHERE (COALESCE(v.uds_total, 0) > 0 OR COALESCE(st.st, 0) > 0 OR COALESCE(sd.sd, 0) > 0)
  ORDER BY COALESCE(v.uds_total, 0) DESC;
END;
$function$;
