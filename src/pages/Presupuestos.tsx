import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { PresupuestosWizard } from "@/components/dashboard/PresupuestosWizard";
import { CumplimientoDashboard } from "@/components/dashboard/CumplimientoDashboard";
import { PresupuestosGuardados } from "@/components/dashboard/PresupuestosGuardados";
import { ProyeccionCierreDashboard } from "@/components/dashboard/ProyeccionCierreDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Eye, PlusCircle, TrendingUp } from "lucide-react";

export default function PresupuestosPage() {
  const { isAdmin, loading } = useUserRole();
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState("cumplimiento");
  const [editPeriod, setEditPeriod] = useState<{ anio: number; mes: number } | null>(null);

  const handleEdit = (anio: number, mes: number) => {
    setEditPeriod({ anio, mes });
    setActiveTab("crear");
  };

  const handleSaved = () => {
    setRefreshKey(k => k + 1);
    setEditPeriod(null);
    setActiveTab("ver");
  };

  if (loading) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Presupuestos</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {isAdmin ? "Cumplimiento y configuración de metas de venta" : "Seguimiento de metas de venta"}
            </p>
            {isAdmin ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6">
                  <TabsTrigger value="cumplimiento" className="gap-1.5">
                    <BarChart3 className="h-4 w-4" /> Cumplimiento
                  </TabsTrigger>
                  <TabsTrigger value="ver" className="gap-1.5">
                    <Eye className="h-4 w-4" /> Visualización
                  </TabsTrigger>
                  <TabsTrigger value="proyeccion" className="gap-1.5">
                    <TrendingUp className="h-4 w-4" /> Proyección Cierre
                  </TabsTrigger>
                  <TabsTrigger value="crear" className="gap-1.5">
                    <PlusCircle className="h-4 w-4" /> Crear Presupuesto
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="cumplimiento">
                  <CumplimientoDashboard key={refreshKey} />
                </TabsContent>
                <TabsContent value="proyeccion">
                  <ProyeccionCierreDashboard />
                </TabsContent>
                <TabsContent value="ver">
                  <PresupuestosGuardados
                    refreshKey={refreshKey}
                    onEdit={handleEdit}
                    onDeleted={() => setRefreshKey(k => k + 1)}
                  />
                </TabsContent>
                <TabsContent value="crear">
                  <PresupuestosWizard
                    onSaved={handleSaved}
                    editPeriod={editPeriod}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <CumplimientoDashboard />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
