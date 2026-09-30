import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { ProductBehaviorTable } from "@/components/dashboard/ProductBehaviorTable";

export default function ComportamientoProductoPage() {
  const [searchParams] = useSearchParams();
  const initialDays = Number(searchParams.get("days")) || 30;
  const initialSalud = searchParams.get("salud"); // "riesgo" → "risk"
  const initialLocation = searchParams.get("location") || undefined;

  const saludMap: Record<string, string> = {
    riesgo: "risk",
    optimo: "optimal",
    sobrestock: "overstock",
    estancado: "stagnant",
  };

  const [days, setDays] = useState<number>(() => {
    const d = searchParams.get("desde"), h = searchParams.get("hasta");
    return d && h ? Math.max(differenceInCalendarDays(parseISO(h), parseISO(d)), 0) : initialDays;
  });
  const initialLinea = searchParams.get("linea") || undefined;
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(desdeParam && hastaParam ? parseISO(desdeParam) : undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(desdeParam && hastaParam ? parseISO(hastaParam) : undefined);

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
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Salud de Producto</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Análisis de sell-through, WOS y salud por producto</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={handleDaysChange} customFrom={customFrom} customTo={customTo} onCustomRangeChange={handleCustomRangeChange} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <ProductBehaviorTable
              days={days}
              customFrom={customFrom}
              customTo={customTo}
              initialWosFilter={initialSalud ? saludMap[initialSalud] ?? "all" : undefined}
              initialLocationId={initialLocation}
              initialTipo={initialLinea}
            />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
