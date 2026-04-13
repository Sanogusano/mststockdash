import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CierreColeccionDashboard } from "@/components/dashboard/CierreColeccionDashboard";

export default function CierreColeccionPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Cierre de Colección</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Análisis de fin de temporada & gestión de remanentes</p>
            </div>
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <CierreColeccionDashboard />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
