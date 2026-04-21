ALTER TABLE public.incentivo_reglas DROP CONSTRAINT IF EXISTS incentivo_reglas_tipo_regla_check;
ALTER TABLE public.incentivo_reglas ADD CONSTRAINT incentivo_reglas_tipo_regla_check 
CHECK (tipo_regla = ANY (ARRAY['presupuesto'::text, 'presupuesto_semanal_dual'::text, 'venta_categoria'::text, 'venta_sku'::text, 'ticket_minimo'::text, 'metodo_pago'::text]));