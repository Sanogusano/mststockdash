import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, type ComparisonPeriod } from "@/components/dashboard/TimeFilter";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import { ReportGeneratorButton } from "@/components/dashboard/ReportGenerator";

function ColombiaDateTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const formatted = now.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return <span className="text-xs text-muted-foreground">{formatted}</span>;
}

export default function ExecutivePage() {
  const [days, setDays] = useState(THIS_MONTH_SENTINEL);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-base sm:text-lg font-semibold text-foreground">Resumen Ejecutivo</h2>
                  <ColombiaDateTime />
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Desempeño comercial por canal</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TimeFilter value={days} onChange={setDays} />
              <ReportGeneratorButton days={days} />
            </div>
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <ExecutiveDashboard days={days} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
