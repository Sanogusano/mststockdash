-- RPC de cruce automático Addi <-> Shopify
CREATE OR REPLACE FUNCTION public.cruzar_addi_con_shopify()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- E_COMMERCE: cruzar por payment_token
  UPDATE addi_transactions at2
  SET shopify_order_id = o.shopify_order_id
  FROM orders o
  WHERE at2.canal = 'E_COMMERCE_SHOPIFY'
    AND at2.shopify_order_id IS NULL
    AND o.payment_token = at2.id_orden;

  -- PAY_LINK: cruzar por monto + fecha +-3 días
  WITH matches AS (
    SELECT DISTINCT ON (at2.id_transaccion)
      at2.id_transaccion,
      o.shopify_order_id
    FROM addi_transactions at2
    JOIN orders o ON ABS(o.total_price - at2.monto) < 1000
      AND o.created_at::date BETWEEN at2.fecha_creacion::date - 3
          AND at2.fecha_creacion::date + 3
    WHERE at2.canal = 'PAY_LINK'
      AND at2.shopify_order_id IS NULL
    ORDER BY at2.id_transaccion, ABS(o.total_price - at2.monto) ASC
  )
  UPDATE addi_transactions at2
  SET shopify_order_id = matches.shopify_order_id
  FROM matches
  WHERE at2.id_transaccion = matches.id_transaccion;

  -- ADDI_MARKETPLACE: cruzar por monto + fecha
  UPDATE addi_transactions at2
  SET shopify_order_id = o.shopify_order_id
  FROM orders o
  WHERE at2.canal = 'ADDI_MARKETPLACE'
    AND at2.shopify_order_id IS NULL
    AND ABS(o.total_price - at2.monto) < 1
    AND o.created_at::date = at2.fecha_creacion::date
    AND o.payment_gateway = 'Addi Marketplace';
END;
$func$;

GRANT EXECUTE ON FUNCTION public.cruzar_addi_con_shopify() TO authenticated;

-- Historial de cargas de archivos financieros
CREATE TABLE IF NOT EXISTS public.addi_upload_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid,
  uploaded_by_email text,
  nombre_archivo text NOT NULL,
  tipo text NOT NULL,
  total_registros integer NOT NULL DEFAULT 0,
  cruzados integer NOT NULL DEFAULT 0,
  sin_cruce integer NOT NULL DEFAULT 0,
  errores integer NOT NULL DEFAULT 0,
  detalle jsonb
);

ALTER TABLE public.addi_upload_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_addi_upload_history
ON public.addi_upload_history
FOR ALL
TO authenticated
USING (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)
WITH CHECK (((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text);

CREATE INDEX IF NOT EXISTS idx_addi_upload_history_uploaded_at ON public.addi_upload_history (uploaded_at DESC);