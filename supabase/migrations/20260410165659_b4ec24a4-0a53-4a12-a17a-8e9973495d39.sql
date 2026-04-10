
CREATE POLICY "Actualización autenticados incentivo_liquidaciones"
ON public.incentivo_liquidaciones
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (auth.role() = 'authenticated'::text);
