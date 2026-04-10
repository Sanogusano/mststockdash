
GRANT DELETE ON public.incentivos TO authenticated;
GRANT DELETE ON public.incentivo_reglas TO authenticated;
GRANT DELETE ON public.incentivo_recompensas TO authenticated;
GRANT DELETE ON public.incentivo_liquidaciones TO authenticated;

CREATE POLICY "Eliminación autenticados incentivos"
ON public.incentivos FOR DELETE TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Eliminación autenticados incentivo_reglas"
ON public.incentivo_reglas FOR DELETE TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Eliminación autenticados incentivo_recompensas"
ON public.incentivo_recompensas FOR DELETE TO authenticated
USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Eliminación autenticados incentivo_liquidaciones"
ON public.incentivo_liquidaciones FOR DELETE TO authenticated
USING (auth.role() = 'authenticated'::text);
