import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { PresupuestosWizard } from "@/components/dashboard/PresupuestosWizard";
import { PresupuestosDashboard } from "@/components/dashboard/PresupuestosDashboard";

export default function PresupuestosPage() {
  const { isAdmin, loading } = useUserRole();

  if (loading) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Presupuestos</h1>
            <p className="text-sm text-muted-foreground mb-8">
              {isAdmin ? "Configura las metas de venta mensuales" : "Seguimiento de metas de venta"}
            </p>
            {isAdmin ? <PresupuestosWizard /> : <PresupuestosDashboard />}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
