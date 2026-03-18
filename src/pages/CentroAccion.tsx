import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CentroAccionComercial } from "@/components/dashboard/CentroAccionComercial";

export default function CentroAccionPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-1">Centro de Acción Comercial</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Diagnóstico automatizado de puntos de venta con riesgo de incumplimiento
            </p>
            <CentroAccionComercial />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
