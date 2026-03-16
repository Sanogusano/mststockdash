
CREATE TABLE public.presupuestos_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_identificador text NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio integer NOT NULL CHECK (anio BETWEEN 2024 AND 2030),
  monto numeric NOT NULL DEFAULT 0,
  tipo text NOT NULL CHECK (tipo IN ('tienda', 'canal')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (nombre_identificador, mes, anio)
);

ALTER TABLE public.presupuestos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura para autenticados" ON public.presupuestos_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Escritura para admins" ON public.presupuestos_config
  FOR ALL TO authenticated
  USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
  WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);
