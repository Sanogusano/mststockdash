import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Users, ShieldCheck, Activity } from "lucide-react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listRoles, listUsuarios, type UsuarioGestion } from "@/lib/permissions-api";
import { UsuariosTable } from "@/components/usuarios/UsuariosTable";
import { InvitarUsuarioModal } from "@/components/usuarios/InvitarUsuarioModal";
import { EditarUsuarioModal } from "@/components/usuarios/EditarUsuarioModal";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";

export default function ConfiguracionUsuariosPage() {
  const { isAdmin, loading } = useUserRole();
  const [invitarOpen, setInvitarOpen] = useState(false);
  const [editar, setEditar] = useState<UsuarioGestion | null>(null);

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: listUsuarios,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["roles"],
    queryFn: listRoles,
  });

  const kpis = useMemo(() => {
    const total = usuarios.length;
    const activos = usuarios.filter((u) => u.is_active).length;
    const admins = usuarios.filter((u) => u.role_key === "admin").length;
    const ahora = Date.now();
    const ult30 = usuarios.filter((u) => {
      const t = u.last_sign_in_at ?? u.last_login_at;
      if (!t) return false;
      return ahora - new Date(t).getTime() < 30 * 24 * 3600 * 1000;
    }).length;
    return { total, activos, admins, ult30 };
  }, [usuarios]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset>
          <header className="flex items-center gap-3 px-6 py-4 border-b border-border">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-xl font-semibold">Usuarios</h1>
              <p className="text-xs text-muted-foreground">Gestión de usuarios y accesos</p>
            </div>
            <Button onClick={() => setInvitarOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invitar usuario
            </Button>
          </header>

          <main className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard icon={Users} label="Total" value={kpis.total} />
              <KpiCard icon={Activity} label="Activos" value={kpis.activos} />
              <KpiCard icon={ShieldCheck} label="Administradores" value={kpis.admins} />
              <KpiCard icon={Activity} label="Activos último mes" value={kpis.ult30} />
            </div>

            <UsuariosTable usuarios={usuarios} loading={isLoading} onEdit={setEditar} />
          </main>
        </SidebarInset>
      </div>

      <InvitarUsuarioModal open={invitarOpen} onOpenChange={setInvitarOpen} roles={roles} />
      <EditarUsuarioModal
        open={!!editar}
        onOpenChange={(o) => !o && setEditar(null)}
        usuario={editar}
        roles={roles}
      />
    </SidebarProvider>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </Card>
  );
}
