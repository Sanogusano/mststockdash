DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'reporte_cierre_coleccion%'
      AND pg_get_functiondef(p.oid) LIKE '%target_gender%'
  LOOP
    def := replace(pg_get_functiondef(r.oid), 'target_gender', 'genero_norm');
    EXECUTE def;
  END LOOP;
END $$;