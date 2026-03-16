DROP POLICY IF EXISTS "Escritura para admins" ON presupuestos_config;
DROP POLICY IF EXISTS "Lectura para autenticados" ON presupuestos_config;

CREATE POLICY "Lectura para autenticados"
ON presupuestos_config FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins pueden insertar"
ON presupuestos_config FOR INSERT TO authenticated
WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

CREATE POLICY "Admins pueden actualizar"
ON presupuestos_config FOR UPDATE TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

CREATE POLICY "Admins pueden eliminar"
ON presupuestos_config FOR DELETE TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);