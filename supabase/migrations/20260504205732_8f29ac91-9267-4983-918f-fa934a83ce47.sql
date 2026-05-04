INSERT INTO permission_catalog (module_key, module_name, module_group, module_order, action_key, action_name, action_order)
VALUES
  ('finanzas.view',         'Finanzas',                    'Finanzas', 30, 'view',   'Ver',              1),
  ('finanzas.addi',         'Conciliación Addi',           'Finanzas', 31, 'view',   'Ver',              1),
  ('finanzas.addi',         'Conciliación Addi',           'Finanzas', 31, 'export', 'Exportar',         5),
  ('finanzas.addi',         'Conciliación Addi',           'Finanzas', 31, 'upload', 'Cargar archivos', 10),
  ('finanzas.wompi',        'Conciliación Wompi',          'Finanzas', 32, 'view',   'Ver',              1),
  ('finanzas.mercadopago',  'Conciliación Mercado Pago',   'Finanzas', 33, 'view',   'Ver',              1),
  ('finanzas.sistecredito', 'Conciliación Sistecredito',   'Finanzas', 34, 'view',   'Ver',              1)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, module_key, action_key, granted)
SELECT r.id, pc.module_key, pc.action_key, true
FROM roles r
CROSS JOIN permission_catalog pc
WHERE r.key IN ('admin', 'gerencia', 'gerente_general', 'super_admin', 'finanzas')
  AND pc.module_key IN ('finanzas.view','finanzas.addi','finanzas.wompi','finanzas.mercadopago','finanzas.sistecredito')
ON CONFLICT DO NOTHING;