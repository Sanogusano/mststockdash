import { useUserPermissions } from "./useUserPermissions";

type Check = { module: string; action: string };

/**
 * Devuelve true si el usuario tiene el permiso indicado.
 * Filtro en memoria sobre la cache de get_user_permissions.
 */
export function useHasPermission(check: Check): boolean {
  const { data: permissions, isLoading } = useUserPermissions();
  if (isLoading || !permissions) return false;
  return permissions.some(
    (p) =>
      p.module_key === check.module &&
      p.action_key === check.action &&
      p.granted === true
  );
}

/**
 * Devuelve true si el usuario tiene AL MENOS UNO de los permisos indicados.
 */
export function useHasAnyPermission(checks: Check[]): boolean {
  const { data: permissions } = useUserPermissions();
  if (!permissions) return false;
  return checks.some((c) =>
    permissions.some(
      (p) =>
        p.module_key === c.module &&
        p.action_key === c.action &&
        p.granted === true
    )
  );
}
