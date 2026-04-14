import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL } from "@/components/dashboard/TimeFilter";
import { CierreColeccionDashboard } from "@/components/dashboard/CierreColeccionDashboard";

export default function CierreColeccionPage() {
  const [days, setDays] = useState(THIS_MONTH_SENTINEL);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Comportamiento de Colección</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Análisis de desempeño por colección & gestión de remanentes</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <CierreColeccionDashboard days={days} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}