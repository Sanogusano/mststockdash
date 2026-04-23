import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserScope } from "@/hooks/useUserScope";
import { EmptyScopeState } from "@/components/EmptyScopeState";

interface Props {
  module: string;
  action: string;
  /** Si true, exige que el usuario (no-admin) tenga al menos 1 ubicación en su scope.
   *  Si scope === [] o null para no-admin, muestra EmptyScopeState en vez del contenido. */
  requireScope?: boolean;
  children: ReactNode;
}

/**
 * Guard de ruta basado en permisos.
 *
 * - Failsafe: admin (app_metadata.role === 'admin') siempre pasa.
 * - Mientras carga permisos → spinner; sin esto se producen "flashes".
 * - Si el rol del usuario requiere scope (rol "tienda"), valida que sea no-vacío.
 */
export function RequirePermission({ module, action, requireScope, children }: Props) {
  const { isAdmin, role, loading: roleLoading } = useUserRole();
  const { data: permissions, isLoading: permsLoading } = useUserPermissions();
  const { scope, loading: scopeLoading } = useUserScope();

  // Loading global — evitamos flashes
  if (roleLoading || permsLoading || scopeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Failsafe admin — siempre pasa
  if (isAdmin) return <>{children}</>;

  // Check de permiso normal
  const hasPermission = (permissions ?? []).some(
    (p) => p.module_key === module && p.action_key === action && p.granted === true,
  );

  if (!hasPermission) {
    toast.error("No tienes permiso para acceder a esta sección");
    return <Navigate to="/" replace />;
  }

  // Check de scope si la ruta lo exige Y el rol requiere scope (tienda)
  // Para roles globales (gerencia, finanzas, etc.) scope=null es válido.
  const roleRequiresScope = role === "tienda";
  if (requireScope && roleRequiresScope) {
    if (scope === null || scope.length === 0) {
      return <EmptyScopeState />;
    }
  }

  return <>{children}</>;
}
