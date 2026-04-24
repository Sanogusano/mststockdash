import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CentroAccionComercial } from "@/components/dashboard/CentroAccionComercial";

export default function CentroAccionPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10 md:hidden">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <h2 className="text-base font-semibold text-foreground">Centro de Acción</h2>
          </header>
          <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold text-foreground mb-1 hidden md:block">Centro de Acción Comercial</h1>
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
