
-- Grant UPDATE on incentivos tables to authenticated role
GRANT UPDATE ON public.incentivos TO authenticated;
GRANT UPDATE ON public.incentivo_reglas TO authenticated;
GRANT UPDATE ON public.incentivo_recompensas TO authenticated;

-- RLS policies for UPDATE
CREATE POLICY "Actualización autenticados incentivos"
ON public.incentivos FOR UPDATE TO authenticated
USING (true) WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Actualización autenticados incentivo_reglas"
ON public.incentivo_reglas FOR UPDATE TO authenticated
USING (true) WITH CHECK (auth.role() = 'authenticated'::text);

CREATE POLICY "Actualización autenticados incentivo_recompensas"
ON public.incentivo_recompensas FOR UPDATE TO authenticated
USING (true) WITH CHECK (auth.role() = 'authenticated'::text);
