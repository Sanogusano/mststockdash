
-- Políticas RLS para incentivos
CREATE POLICY "Lectura autenticados incentivos" ON public.incentivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserción autenticados incentivos" ON public.incentivos FOR INSERT TO authenticated WITH CHECK (true);

-- Políticas RLS para incentivo_reglas
CREATE POLICY "Lectura autenticados incentivo_reglas" ON public.incentivo_reglas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserción autenticados incentivo_reglas" ON public.incentivo_reglas FOR INSERT TO authenticated WITH CHECK (true);

-- Políticas RLS para incentivo_recompensas
CREATE POLICY "Lectura autenticados incentivo_recompensas" ON public.incentivo_recompensas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserción autenticados incentivo_recompensas" ON public.incentivo_recompensas FOR INSERT TO authenticated WITH CHECK (true);

-- Políticas RLS para incentivo_liquidaciones
CREATE POLICY "Lectura autenticados incentivo_liquidaciones" ON public.incentivo_liquidaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Inserción autenticados incentivo_liquidaciones" ON public.incentivo_liquidaciones FOR INSERT TO authenticated WITH CHECK (true);
