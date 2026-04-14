
-- FIX: Change financial_status filter from exclusion to inclusion in ALL RPC functions
-- This ensures only paid orders are counted (matching Shopify Net Sales logic)

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
    AND p.prosrc LIKE '%financial_status%'
  LOOP
    func_def := pg_get_functiondef(r.oid);
    
    -- Pattern 1: NOT IN ('voided', 'refunded') with various spacing
    new_def := regexp_replace(
      func_def,
      E'o\\.financial_status\\s+NOT\\s+IN\\s*\\(\\s*''voided''\\s*,\\s*''refunded''\\s*\\)',
      E'o.financial_status IN (''paid'', ''partially_refunded'', ''partially_paid'')',
      'gi'
    );
    
    IF new_def IS DISTINCT FROM func_def THEN
      EXECUTE new_def;
      modified_count := modified_count + 1;
      RAISE NOTICE 'Modified function: %', r.proname;
    ELSE
      RAISE NOTICE 'Skipped (no match): %', r.proname;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total functions modified: %', modified_count;
END $$;

-- Also update the view reporte_cumplimiento_presupuesto if it has the old filter
DO $$
DECLARE
  view_def text;
BEGIN
  SELECT definition INTO view_def 
  FROM pg_views 
  WHERE schemaname = 'public' AND viewname = 'reporte_cumplimiento_presupuesto';
  
  IF view_def IS NOT NULL AND view_def LIKE '%NOT IN%voided%' THEN
    view_def := regexp_replace(
      view_def,
      E'o\\.financial_status\\s+NOT\\s+IN\\s*\\(\\s*''voided''\\s*,\\s*''refunded''\\s*\\)',
      E'o.financial_status IN (''paid'', ''partially_refunded'', ''partially_paid'')',
      'gi'
    );
    EXECUTE 'CREATE OR REPLACE VIEW public.reporte_cumplimiento_presupuesto AS ' || view_def;
    RAISE NOTICE 'View reporte_cumplimiento_presupuesto updated';
  ELSE
    RAISE NOTICE 'View not found or no match';
  END IF;
END $$;
