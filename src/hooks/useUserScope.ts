import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

/**
 * Devuelve el scope de ubicaciones del usuario actual:
 *  - `null`        → ve TODAS las ubicaciones (admin, gerencia, finanzas, etc.)
 *  - `[]`          → no tiene ninguna ubicación asignada (config incompleta)
 *  - `string[]`    → solo esas location_id
 *
 * Para el admin con failsafe, siempre devuelve `null` (ve todo) sin importar
 * lo que diga la DB. Esto evita auto-bloqueo por bug.
 */
export function useUserScope() {
  const { session } = useAuth();
  const { isAdmin } = useUserRole();
  const userId = session?.user?.id;

  const query = useQuery({
    queryKey: ["user-scope", userId],
    queryFn: async (): Promise<string[] | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("user_profiles")
        .select("scope_location_ids")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      // null en DB = todas; array = específicas (puede ser [])
      return (data?.scope_location_ids ?? null) as string[] | null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  // Failsafe: admin nunca queda restringido por scope
  if (isAdmin) {
    return { scope: null as string[] | null, loading: false };
  }

  return { scope: query.data ?? null, loading: query.isLoading };
}
