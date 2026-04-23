import { useUserScope } from "./useUserScope";

/**
 * Helper que indica si los datos deben filtrarse y, si sí, con qué array.
 *
 * Uso:
 *   const { shouldFilter, locationIds, isEmpty } = useCanScope();
 *   if (isEmpty) return <EmptyScopeState />;
 *   let q = supabase.from("orders").select("*");
 *   if (shouldFilter) q = q.in("location_id", locationIds);
 *
 * - shouldFilter=false → no filtrar (admin / scope null)
 * - shouldFilter=true & locationIds.length>0 → filtrar por estos IDs
 * - isEmpty=true → scope=[] explícito; mostrar EmptyScopeState
 */
export function useCanScope() {
  const { scope, loading } = useUserScope();

  if (loading) {
    return { loading: true, shouldFilter: false, locationIds: [] as string[], isEmpty: false };
  }

  if (scope === null) {
    return { loading: false, shouldFilter: false, locationIds: [] as string[], isEmpty: false };
  }

  return {
    loading: false,
    shouldFilter: true,
    locationIds: scope,
    isEmpty: scope.length === 0,
  };
}
