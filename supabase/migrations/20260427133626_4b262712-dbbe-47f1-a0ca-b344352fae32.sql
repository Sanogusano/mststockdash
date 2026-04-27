-- Registrar permiso "Rendimiento de Red" en el catálogo
INSERT INTO permission_catalog (module_key, module_name, module_group, module_order, action_key, action_name, action_order)
VALUES 
  ('dashboards.rendimiento_red', 'Rendimiento de Red', 'Dashboards', 22, 'view', 'Ver', 1),
  ('dashboards.rendimiento_red', 'Rendimiento de Red', 'Dashboards', 22, 'export', 'Exportar', 5)
ON CONFLICT DO NOTHING;

-- Asignar a roles admin y gerencia (si existen)
INSERT INTO role_permissions (role_id, module_key, action_key, granted)
SELECT r.id, 'dashboards.rendimiento_red', a.action_key, true
FROM roles r
CROSS JOIN (VALUES ('view'), ('export')) AS a(action_key)
WHERE r.key IN ('admin', 'gerencia', 'gerente_general', 'super_admin')
ON CONFLICT DO NOTHING;