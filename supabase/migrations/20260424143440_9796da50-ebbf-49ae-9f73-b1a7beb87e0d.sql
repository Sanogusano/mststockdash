
-- RPC para obtener siguiente consecutivo por origen NetSuite
CREATE OR REPLACE FUNCTION public.obtener_siguiente_consecutivo(p_origen_netsuite_id integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_consecutivo integer;
BEGIN
  SELECT COALESCE(MAX(consecutivo::integer), 46124) INTO v_max_consecutivo
  FROM (
    SELECT SPLIT_PART(id_externo, ' ', 2) as consecutivo
    FROM allocation_runs
    WHERE origen_netsuite_id = p_origen_netsuite_id
  ) sub
  WHERE consecutivo ~ '^\d+$';

  RETURN v_max_consecutivo + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_siguiente_consecutivo(integer) TO authenticated;

-- Columna para trazabilidad de quién generó (vincula a auth.users)
ALTER TABLE public.allocation_runs
  ADD COLUMN IF NOT EXISTS generated_by_user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_allocation_runs_generated_by_user_id
  ON public.allocation_runs(generated_by_user_id);

CREATE INDEX IF NOT EXISTS idx_allocation_runs_id_externo
  ON public.allocation_runs(id_externo);
