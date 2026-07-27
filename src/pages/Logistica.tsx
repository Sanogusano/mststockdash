import { useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { differenceInCalendarDays } from "date-fns";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { LogisticsTransfers } from "@/components/dashboard/LogisticsTransfers";

export default function LogisticaPage() {
  const [days, setDays] = useState<number>(30);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const handleDaysChange = (d: number) => {
    // Un preset limpia cualquier rango personalizado activo.
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setDays(d);
  };

  const handleCustomRangeChange = (from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
    setDays(Math.max(differenceInCalendarDays(to, from), 0));
  };


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Logística & Traslados</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Allocation · Feed de accionables</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={handleDaysChange} customFrom={customFrom} customTo={customTo} onCustomRangeChange={handleCustomRangeChange} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <LogisticsTransfers days={days} customFrom={customFrom} customTo={customTo} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
