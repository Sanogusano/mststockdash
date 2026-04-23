import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Navigate } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import {
  countUsersByRole,
  listPermissionCatalog,
  listRoles,
  type Role,
} from "@/lib/permissions-api";
import { RolesList } from "@/components/roles/RolesList";
import { EditarRolModal } from "@/components/roles/EditarRolModal";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

export default function ConfiguracionRolesPage() {
  const { isAdmin, loading } = useUserRole();
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: listRoles });
  const { data: catalog = [] } = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: listPermissionCatalog,
  });
  const { data: userCounts = {} } = useQuery({
    queryKey: ["users-by-role"],
    queryFn: countUsersByRole,
  });

  const { data: permCounts = {} } = useQuery({
    queryKey: ["permissions-by-role"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role_id")
        .eq("granted", true);
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        m[r.role_id] = (m[r.role_id] ?? 0) + 1;
      });
      return m;
    },
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const handleEdit = (role: Role) => {
    setEditing(role);
    setOpen(true);
  };

  const handleNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Roles y Permisos</h1>
              <p className="text-xs text-muted-foreground">
                {roles.length} roles · {catalog.length} permisos en el catálogo
              </p>
            </div>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo rol
            </Button>
          </header>

          <main className="p-6 max-w-5xl">
            <RolesList
              roles={roles}
              permissionCounts={permCounts}
              userCounts={userCounts}
              onEdit={handleEdit}
            />
          </main>
        </SidebarInset>
      </div>

      <EditarRolModal open={open} onOpenChange={setOpen} role={editing} />
    </SidebarProvider>
  );
}
