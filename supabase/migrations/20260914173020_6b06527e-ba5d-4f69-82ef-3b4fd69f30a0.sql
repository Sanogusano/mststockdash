INSERT INTO public.role_permissions (role_id, module_key, action_key, granted)
SELECT rp.role_id, 'producto.asignacion', 'view', true
FROM public.role_permissions rp
WHERE rp.module_key = 'dashboards.salud_producto' AND rp.action_key = 'view' AND rp.granted
ON CONFLICT DO NOTHING;

DELETE FROM public.role_permissions WHERE module_key = 'producto.cobertura_distribucion';
DELETE FROM public.user_permission_overrides WHERE module_key = 'producto.cobertura_distribucion';