DO $$
DECLARE
  fn RECORD;
  old_def TEXT;
  new_def TEXT;
BEGIN
  FOR fn IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc LIKE '%GREATEST(COALESCE(dias_atras%'
  LOOP
    old_def := pg_get_functiondef(fn.oid);

    -- Replace boundary pattern: _col_date_boundary(GREATEST(COALESCE(dias_atras, N), 1))
    -- Allow dias_atras=0 (today only) by changing minimum from 1 to 0
    new_def := regexp_replace(
      old_def,
      '_col_date_boundary\(GREATEST\(COALESCE\(dias_atras\s*,\s*1\)\s*,\s*1\)',
      '_col_date_boundary(GREATEST(COALESCE(dias_atras, 0), 0)',
      'g'
    );

    -- Same for functions with default 30
    new_def := regexp_replace(
      new_def,
      '_col_date_boundary\(GREATEST\(COALESCE\(dias_atras\s*,\s*30\)\s*,\s*1\)',
      '_col_date_boundary(GREATEST(COALESCE(dias_atras, 30), 0)',
      'g'
    );

    -- Also handle v_dias declarations used for boundaries
    new_def := regexp_replace(
      new_def,
      '(v_dias\s+int\s*:=\s*)GREATEST\(COALESCE\(dias_atras\s*,\s*1\)\s*,\s*1\)',
      '\1GREATEST(COALESCE(dias_atras, 0), 0)',
      'g'
    );

    IF new_def <> old_def THEN
      EXECUTE new_def;
    END IF;
  END LOOP;
END $$;