
ALTER TABLE public.incentivo_reglas DROP CONSTRAINT IF EXISTS incentivo_reglas_tipo_regla_check;
ALTER TABLE public.incentivo_reglas ADD CONSTRAINT incentivo_reglas_tipo_regla_check
  CHECK (tipo_regla = ANY (ARRAY[
    'presupuesto'::text,
    'presupuesto_semanal_dual'::text,
    'tienda_cumplimiento'::text,
    'venta_categoria'::text,
    'venta_sku'::text,
    'ticket_minimo'::text,
    'upt_minimo'::text,
    'numero_pedidos'::text,
    'metodo_pago'::text
  ]));

ALTER TABLE public.incentivo_recompensas DROP CONSTRAINT IF EXISTS incentivo_recompensas_tipo_pago_check;
ALTER TABLE public.incentivo_recompensas ADD CONSTRAINT incentivo_recompensas_tipo_pago_check
  CHECK (tipo_pago = ANY (ARRAY[
    'monto_fijo'::text,
    'por_unidad'::text,
    'porcentaje'::text,
    'porcentaje_venta'::text,
    'bono_monto'::text,
    'bono_especie'::text
  ]));
