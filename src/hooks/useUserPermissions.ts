import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserPermission = {
  module_key: string;
  action_key: string;
  granted: boolean;
  source: string; // 'role' | 'override'
};

/**
 * Trae todos los permisos del usuario actual en una sola llamada.
 * Se cachea 5 min — filtramos en memoria desde useHasPermission.
 */
export function useUserPermissions() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ["user-permissions", userId],
    queryFn: async (): Promise<UserPermission[]> => {
      if (!userId) return [];
      const { data, error } = await supabase.rpc("get_user_permissions", {
        p_user_id: userId,
      });
      if (error) throw error;
      return (data as UserPermission[]) ?? [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
