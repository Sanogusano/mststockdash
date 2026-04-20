-- Permisos de escritura para admins en commission_batches y commission_settlements
GRANT INSERT, UPDATE, DELETE ON public.commission_batches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.commission_settlements TO authenticated;

-- Asegurar RLS
ALTER TABLE public.commission_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;

-- commission_batches: admins escriben
DROP POLICY IF EXISTS "Admins pueden insertar batches" ON public.commission_batches;
CREATE POLICY "Admins pueden insertar batches"
  ON public.commission_batches FOR INSERT TO authenticated
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "Admins pueden actualizar batches" ON public.commission_batches;
CREATE POLICY "Admins pueden actualizar batches"
  ON public.commission_batches FOR UPDATE TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "Admins pueden eliminar batches" ON public.commission_batches;
CREATE POLICY "Admins pueden eliminar batches"
  ON public.commission_batches FOR DELETE TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

-- commission_settlements: lectura authenticated, escritura admins
DROP POLICY IF EXISTS "Authenticated lee settlements" ON public.commission_settlements;
CREATE POLICY "Authenticated lee settlements"
  ON public.commission_settlements FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins pueden insertar settlements" ON public.commission_settlements;
CREATE POLICY "Admins pueden insertar settlements"
  ON public.commission_settlements FOR INSERT TO authenticated
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "Admins pueden actualizar settlements" ON public.commission_settlements;
CREATE POLICY "Admins pueden actualizar settlements"
  ON public.commission_settlements FOR UPDATE TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

DROP POLICY IF EXISTS "Admins pueden eliminar settlements" ON public.commission_settlements;
CREATE POLICY "Admins pueden eliminar settlements"
  ON public.commission_settlements FOR DELETE TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

-- Vincular settlements a batch (opcional pero útil para historial)
ALTER TABLE public.commission_settlements
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.commission_batches(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_commission_settlements_batch ON public.commission_settlements(batch_id);
CREATE INDEX IF NOT EXISTS idx_commission_settlements_anio_mes ON public.commission_settlements(anio, mes);

-- Tabla de plantillas de escalas (referencia para tab "Escalas")
CREATE TABLE IF NOT EXISTS public.commission_scale_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol text NOT NULL,
  nombre text NOT NULL,
  reglas jsonb NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.commission_scale_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commission_scale_templates TO authenticated;

DROP POLICY IF EXISTS "Authenticated lee plantillas" ON public.commission_scale_templates;
CREATE POLICY "Authenticated lee plantillas"
  ON public.commission_scale_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gestionan plantillas" ON public.commission_scale_templates;
CREATE POLICY "Admins gestionan plantillas"
  ON public.commission_scale_templates FOR ALL TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

-- Seed de escala por defecto para vendedor
INSERT INTO public.commission_scale_templates (rol, nombre, reglas, is_default)
SELECT 'vendedor', 'Escala estándar vendedor',
  '[{"min_pct":90,"max_pct":99.99,"comision_pct":0.40},
    {"min_pct":100,"max_pct":104.99,"comision_pct":0.60},
    {"min_pct":105,"max_pct":null,"comision_pct":0.80}]'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.commission_scale_templates WHERE rol='vendedor' AND is_default=true);