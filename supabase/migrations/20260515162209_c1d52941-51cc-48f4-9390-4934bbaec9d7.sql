CREATE OR REPLACE FUNCTION public.reporte_cumplimiento_whatsapp(p_fecha date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_result jsonb;
  v_mes integer := EXTRACT(MONTH FROM p_fecha)::integer;
  v_anio integer := EXTRACT(YEAR FROM p_fecha)::integer;
  v_inicio_mes date := DATE_TRUNC('month', p_fecha)::date;
  v_dias_mes integer := EXTRACT(DAY FROM (DATE_TRUNC('month', p_fecha) + interval '1 month - 1 day'))::integer;
  v_dias_transcurridos integer := EXTRACT(DAY FROM p_fecha)::integer;
BEGIN
  WITH ventas_acumuladas AS (
    SELECT
      l.name as tienda, l.zona,
      ROUND(SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19)) as venta_acumulada,
      SUM(oi.quantity) as unidades_acumuladas
    FROM orders o
    JOIN locations l ON l.location_id = o.location_id
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio_mes AND p_fecha
      AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
      AND l.is_active = true AND l.tipo_tienda NOT IN ('Online','Distribucion')
    GROUP BY l.name, l.zona
  ),
  ventas_hoy AS (
    SELECT
      l.name as tienda,
      ROUND(SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19)) as venta_hoy,
      SUM(oi.quantity) as unidades_hoy,
      COUNT(DISTINCT o.shopify_order_id) as ordenes_hoy
    FROM orders o
    JOIN locations l ON l.location_id = o.location_id
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha
      AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
      AND l.is_active = true AND l.tipo_tienda NOT IN ('Online','Distribucion')
    GROUP BY l.name
  ),
  presupuestos AS (
    SELECT nombre_identificador, monto
    FROM presupuestos_config
    WHERE mes = v_mes AND anio = v_anio AND tipo = 'tienda'
  ),
  digital_data AS (
    SELECT
      ROUND(SUM(CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha 
        THEN (oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19 ELSE 0 END)) as venta_hoy,
      ROUND(SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19)) as venta_acumulada,
      SUM(CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha THEN oi.quantity ELSE 0 END) as unidades_hoy,
      SUM(oi.quantity) as unidades_acumuladas,
      COUNT(DISTINCT CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha 
        THEN o.shopify_order_id END) as ordenes_hoy
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio_mes AND p_fecha
      AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
      AND o.source_name IN ('web','271832285185','3441759')
      AND o.location_id = '71474315479'
  ),
  ps_data AS (
    SELECT
      ROUND(SUM(CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha 
        THEN (oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19 ELSE 0 END)) as venta_hoy,
      ROUND(SUM((oi.price * oi.quantity - COALESCE(oi.manual_discount_amount,0)) / 1.19)) as venta_acumulada,
      SUM(CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha THEN oi.quantity ELSE 0 END) as unidades_hoy,
      SUM(oi.quantity) as unidades_acumuladas,
      COUNT(DISTINCT CASE WHEN (o.created_at AT TIME ZONE 'America/Bogota')::date = p_fecha 
        THEN o.shopify_order_id END) as ordenes_hoy
    FROM orders o
    JOIN order_items oi ON oi.shopify_order_id = o.shopify_order_id
    JOIN product_catalog pc ON pc.sku = oi.sku
    WHERE o.financial_status IN ('paid','partially_refunded','partially_paid')
      AND (o.created_at AT TIME ZONE 'America/Bogota')::date BETWEEN v_inicio_mes AND p_fecha
      AND UPPER(pc.category) NOT IN ('BOLSA','INSUMOS')
      AND o.source_name = 'shopify_draft_order'
  )
  SELECT jsonb_build_object(
    'fecha', p_fecha,
    'dias_mes', v_dias_mes,
    'dias_transcurridos', v_dias_transcurridos,
    'tiendas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'tienda', va.tienda,
        'zona', va.zona,
        'venta_hoy', COALESCE(vh.venta_hoy,0),
        'unidades_hoy', COALESCE(vh.unidades_hoy,0),
        'ordenes_hoy', COALESCE(vh.ordenes_hoy,0),
        'venta_acumulada', va.venta_acumulada,
        'unidades_acumuladas', va.unidades_acumuladas,
        'presupuesto_mes', COALESCE(p.monto,0)
      ))
      FROM ventas_acumuladas va
      LEFT JOIN ventas_hoy vh ON vh.tienda = va.tienda
      LEFT JOIN presupuestos p ON p.nombre_identificador = va.tienda
    ), '[]'::jsonb),
    'digital', (
      SELECT jsonb_build_object(
        'venta_hoy', COALESCE(d.venta_hoy,0),
        'venta_acumulada', COALESCE(d.venta_acumulada,0),
        'unidades_hoy', COALESCE(d.unidades_hoy,0),
        'unidades_acumuladas', COALESCE(d.unidades_acumuladas,0),
        'ordenes_hoy', COALESCE(d.ordenes_hoy,0),
        'presupuesto_mes', COALESCE((SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Shopify Colombia'),0),
        'cumplimiento', CASE WHEN (SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Shopify Colombia') > 0 
          THEN ROUND((COALESCE(d.venta_acumulada,0) / (SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Shopify Colombia')) * 100, 1) 
          ELSE 0 END
      ) FROM digital_data d
    ),
    'personal_shopper', (
      SELECT jsonb_build_object(
        'venta_hoy', COALESCE(ps.venta_hoy,0),
        'venta_acumulada', COALESCE(ps.venta_acumulada,0),
        'unidades_hoy', COALESCE(ps.unidades_hoy,0),
        'unidades_acumuladas', COALESCE(ps.unidades_acumuladas,0),
        'ordenes_hoy', COALESCE(ps.ordenes_hoy,0),
        'presupuesto_mes', COALESCE((SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Personal Shopper'),0),
        'cumplimiento', CASE WHEN (SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Personal Shopper') > 0 
          THEN ROUND((COALESCE(ps.venta_acumulada,0) / (SELECT monto FROM presupuestos_config WHERE mes=v_mes AND anio=v_anio AND tipo='digital' AND nombre_identificador='Personal Shopper')) * 100, 1) 
          ELSE 0 END
      ) FROM ps_data ps
    )
  ) INTO v_result;
  RETURN v_result;
END;
$function$;