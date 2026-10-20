import { ReactNode } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { LoadingState } from "@/components/dashboard/LoadingState";

/** Restringe una pantalla a roles leídos de app_metadata.role. */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { role, isAdmin, loading } = useUserRole();
  if (loading) return <LoadingState />;
  if (!isAdmin && !(role && roles.includes(role))) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">No tienes acceso a esta pantalla.</p>
      </div>
    );
  }
  return <>{children}</>;
}
