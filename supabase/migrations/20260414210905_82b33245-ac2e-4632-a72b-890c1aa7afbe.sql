
-- HOTFIX: Change inventory_snapshot JOINs from sku to variant_id in 4 functions (all overloads)

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
    AND p.proname IN (
      'reporte_comportamiento_producto',
      'reporte_desempeno_por_linea',
      'reporte_detalle_skus_producto'
    )
  LOOP
    func_def := pg_get_functiondef(r.oid);
    
    -- Replace inv.sku = p.sku with inv.variant_id = p.variant_id
    new_def := regexp_replace(
      func_def,
      E'inv\\.sku\\s*=\\s*p\\.sku',
      'inv.variant_id = p.variant_id',
      'g'
    );
    
    -- For reporte_detalle_skus_producto: also fix SELECT inv.sku -> p.sku and GROUP BY inv.sku -> p.sku
    IF r.proname = 'reporte_detalle_skus_producto' THEN
      new_def := regexp_replace(
        new_def,
        E'inv\\.sku\\s+AS\\s+s_sku',
        'p.sku AS s_sku',
        'g'
      );
      new_def := regexp_replace(
        new_def,
        E'GROUP\\s+BY\\s+inv\\.sku',
        'GROUP BY p.sku',
        'g'
      );
    END IF;
    
    IF new_def IS DISTINCT FROM func_def THEN
      EXECUTE new_def;
      modified_count := modified_count + 1;
      RAISE NOTICE 'Modified function: %', r.proname;
    ELSE
      RAISE NOTICE 'Skipped (no change): %', r.proname;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Phase 1 done. Modified: %', modified_count;
END $$;

-- Phase 2: Fix reporte_detalle_producto_tiendas separately (different pattern)
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
    AND p.proname = 'reporte_detalle_producto_tiendas'
  LOOP
    func_def := pg_get_functiondef(r.oid);
    
    -- Fix SP CTE: add variant_id to the select
    -- Pattern: SELECT pc.sku FROM product_catalog pc WHERE
    new_def := regexp_replace(
      func_def,
      E'SELECT\\s+pc\\.sku\\s+FROM\\s+product_catalog\\s+pc\\s+WHERE',
      'SELECT pc.sku, pc.variant_id FROM product_catalog pc WHERE',
      'g'
    );
    
    -- Fix STK CTE: change inv.sku IN (SELECT sku FROM SP) to inv.variant_id IN (SELECT variant_id FROM SP WHERE variant_id IS NOT NULL)
    new_def := regexp_replace(
      new_def,
      E'inv\\.sku\\s+IN\\s*\\(\\s*SELECT\\s+sku\\s+FROM\\s+SP\\s*\\)',
      'inv.variant_id IN (SELECT variant_id FROM SP WHERE variant_id IS NOT NULL)',
      'g'
    );
    
    IF new_def IS DISTINCT FROM func_def THEN
      EXECUTE new_def;
      modified_count := modified_count + 1;
      RAISE NOTICE 'Modified function: %', r.proname;
    ELSE
      RAISE NOTICE 'Skipped (no change): %', r.proname;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Phase 2 done. Modified: %', modified_count;
END $$;
