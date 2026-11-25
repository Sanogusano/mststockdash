INSERT INTO permission_catalog (module_key, module_name, module_group, module_order, action_key, action_name, action_order)
SELECT 'comercial.catalogo','Catálogo','Dashboards',24,v.a,v.n,v.o
FROM (VALUES ('view','Ver',1),('comercial','Vista comercial (stock por canal)',2)) v(a,n,o)
WHERE NOT EXISTS (SELECT 1 FROM permission_catalog WHERE module_key='comercial.catalogo' AND action_key=v.a);