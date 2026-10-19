import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ChequeoRow {
  chequeo: string;
  severidad: "alta" | "media" | "info" | string;
  detalle: string | null;
  valor: number | string | null;
}

export const CHEQUEO_QUERY_KEY = ["chequeo_integridad_diario"];
export const CHEQUEOS_CRITICOS = ["pedidos_sin_orden_venta"];

export function useChequeoIntegridad(enabled = true) {
  return useQuery({
    queryKey: CHEQUEO_QUERY_KEY,
    enabled,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("chequeo_integridad_diario");
      if (error) throw error;
      return (data ?? []) as ChequeoRow[];
    },
  });
}
