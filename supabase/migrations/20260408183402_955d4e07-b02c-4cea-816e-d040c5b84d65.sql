GRANT SELECT, INSERT ON TABLE public.incentivos TO authenticated;
GRANT SELECT, INSERT ON TABLE public.incentivo_reglas TO authenticated;
GRANT SELECT, INSERT ON TABLE public.incentivo_recompensas TO authenticated;
GRANT SELECT, INSERT ON TABLE public.incentivo_liquidaciones TO authenticated;

DROP POLICY IF EXISTS "Inserción autenticados incentivos" ON public.incentivos;
CREATE POLICY "Inserción autenticados incentivos"
ON public.incentivos
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Inserción autenticados incentivo_reglas" ON public.incentivo_reglas;
CREATE POLICY "Inserción autenticados incentivo_reglas"
ON public.incentivo_reglas
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Inserción autenticados incentivo_recompensas" ON public.incentivo_recompensas;
CREATE POLICY "Inserción autenticados incentivo_recompensas"
ON public.incentivo_recompensas
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Inserción autenticados incentivo_liquidaciones" ON public.incentivo_liquidaciones;
CREATE POLICY "Inserción autenticados incentivo_liquidaciones"
ON public.incentivo_liquidaciones
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');