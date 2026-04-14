-- Part C: Add financial_status filter to ALL functions that query orders

DO $$
DECLARE
  r RECORD;
  func_def text;
  new_def text;
  modified_count int := 0;
BEGIN
  FOR r IN 
    SELECT p.oid, p.proname
    FROM pg_proc p 
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.prosrc LIKE '%orders%'
    AND p.prosrc NOT LIKE '%financial_status%'
    AND p.proname NOT LIKE '\_%'
  LOOP
    func_def := pg_get_functiondef(r.oid);
    
    -- Strategy 1: Add filter after every "o.created_at >= ..." pattern
    -- Uses [^;\n]+ to stop before semicolons, and captures trailing ; separately
    new_def := regexp_replace(
      func_def,
      E'(o\\.created_at\\s*>=\\s*[^;\\n]+)(;?)',
      E'\\1 AND o.financial_status NOT IN (''voided'', ''refunded'')\\2',
      'g'
    );
    
    -- Strategy 2: If first regex didn't change anything (e.g. cierre_coleccion functions
    -- that join orders but don't filter by created_at), add filter to JOIN condition
    IF new_def = func_def THEN
      new_def := regexp_replace(
        func_def,
        E'((?:LEFT\\s+)?JOIN\\s+orders\\s+o\\s+ON\\s+[^\\n]+)',
        E'\\1 AND o.financial_status NOT IN (''voided'', ''refunded'')',
        'g'
      );
    END IF;
    
    -- Only execute if actually changed
    IF new_def IS DISTINCT FROM func_def THEN
      EXECUTE new_def;
      modified_count := modified_count + 1;
      RAISE NOTICE 'Modified function: %', r.proname;
    ELSE
      RAISE NOTICE 'Skipped function (no matching pattern): %', r.proname;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total functions modified: %', modified_count;
END $$;

-- Also update the reporte_cumplimiento_presupuesto view
CREATE OR REPLACE VIEW public.reporte_cumplimiento_presupuesto AS
WITH ventas_reales AS (
  SELECT orders.location_id,
    (date_trunc('month', orders.created_at))::date AS mes_anio,
    sum(orders.total_price) AS venta_total_real
  FROM orders
  WHERE orders.financial_status NOT IN ('voided', 'refunded')
  GROUP BY orders.location_id, (date_trunc('month', orders.created_at))::date
)
SELECT l.name AS sucursal,
  g.month_year AS periodo,
  g.goal_amount AS meta_venta,
  COALESCE(v.venta_total_real, 0::numeric) AS venta_actual,
  CASE
    WHEN g.goal_amount > 0::numeric THEN round(((COALESCE(v.venta_total_real, 0::numeric) / g.goal_amount) * 100::numeric), 2)
    ELSE 0::numeric
  END AS porc_cumplimiento,
  (g.goal_amount - COALESCE(v.venta_total_real, 0::numeric)) AS diferencia_faltante
FROM budget_goals g
LEFT JOIN ventas_reales v ON g.location_id = v.location_id AND g.month_year = v.mes_anio
JOIN locations l ON g.location_id = l.location_id;