import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";

export default function ExecutivePage() {
  const [days, setDays] = useState(30);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">Resumen Ejecutivo</h2>
                <p className="text-xs text-muted-foreground">Desempeño comercial por canal</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-6 py-6">
            <ExecutiveDashboard days={days} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
