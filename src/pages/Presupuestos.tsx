import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useUserRole } from "@/hooks/useUserRole";
import { PresupuestosWizard } from "@/components/dashboard/PresupuestosWizard";
import { CumplimientoDashboard } from "@/components/dashboard/CumplimientoDashboard";
import { PresupuestosGuardados } from "@/components/dashboard/PresupuestosGuardados";
import { ProyeccionCierreDashboard } from "@/components/dashboard/ProyeccionCierreDashboard";
import { CumplimientoAnual } from "@/components/dashboard/CumplimientoAnual";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, CalendarRange, Eye, PlusCircle, TrendingUp } from "lucide-react";

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
        <main className="flex-1 min-w-0 overflow-auto">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10 md:hidden">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <h2 className="text-base font-semibold text-foreground">Presupuestos</h2>
          </header>
          <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-1 hidden md:block">Presupuestos</h1>
            <p className="text-sm text-muted-foreground mb-6">
              {isAdmin ? "Cumplimiento y configuración de metas de venta" : "Seguimiento de metas de venta"}
            </p>
            {isAdmin ? (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6 bg-muted/50 p-1">
                  <TabsTrigger value="cumplimiento" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <BarChart3 className="h-4 w-4" /> Cumplimiento
                  </TabsTrigger>
                  <TabsTrigger value="ver" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <Eye className="h-4 w-4" /> Visualización
                  </TabsTrigger>
                  <TabsTrigger value="proyeccion" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <TrendingUp className="h-4 w-4" /> Proyección Cierre
                  </TabsTrigger>
                  <TabsTrigger value="anual" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <CalendarRange className="h-4 w-4" /> Año Completo
                  </TabsTrigger>
                  <TabsTrigger value="crear" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <PlusCircle className="h-4 w-4" /> Crear Presupuesto
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="cumplimiento">
                  <CumplimientoDashboard key={refreshKey} />
                </TabsContent>
                <TabsContent value="proyeccion">
                  <ProyeccionCierreDashboard />
                </TabsContent>
                <TabsContent value="anual">
                  <CumplimientoAnual />
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
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-6 bg-muted/50 p-1">
                  <TabsTrigger value="cumplimiento" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <BarChart3 className="h-4 w-4" /> Cumplimiento
                  </TabsTrigger>
                  <TabsTrigger value="proyeccion" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <TrendingUp className="h-4 w-4" /> Proyección Cierre
                  </TabsTrigger>
                  <TabsTrigger value="anual" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    <CalendarRange className="h-4 w-4" /> Año Completo
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="cumplimiento">
                  <CumplimientoDashboard />
                </TabsContent>
                <TabsContent value="proyeccion">
                  <ProyeccionCierreDashboard />
                </TabsContent>
                <TabsContent value="anual">
                  <CumplimientoAnual />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
