CREATE TABLE IF NOT EXISTS public.whatsapp_destinatarios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  numero text NOT NULL,
  activo boolean DEFAULT true,
  reportes jsonb DEFAULT '["cumplimiento_diario"]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_whatsapp_destinatarios"
ON public.whatsapp_destinatarios
FOR ALL
TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

CREATE POLICY "read_whatsapp_destinatarios"
ON public.whatsapp_destinatarios
FOR SELECT
TO authenticated
USING (true);

INSERT INTO public.whatsapp_destinatarios (nombre, numero, activo) VALUES
('Juan Restrepo', '573206986342', true),
('Carlos', '573206623153', true)
ON CONFLICT DO NOTHING;