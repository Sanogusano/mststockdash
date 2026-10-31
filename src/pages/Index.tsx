import { useState, useEffect } from "react";
import { differenceInCalendarDays } from "date-fns";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MainLayout } from "@/components/layout/MainLayout";
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
  return <span className="text-sm sm:text-xs text-muted-foreground">{formatted}</span>;
}

export default function ExecutivePage() {
  const [days, setDays] = useState(THIS_MONTH_SENTINEL);
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("previous");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const handleDaysChange = (d: number) => {
    // A preset click clears any active custom range.
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
    <MainLayout>
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex min-w-0 items-start sm:items-center gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-base sm:text-lg font-semibold text-foreground">Resumen Ejecutivo</h2>
              <div className="hidden sm:block"><ColombiaDateTime /></div>
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Desempeño comercial por canal</p>
            <div className="mt-1 sm:hidden"><ColombiaDateTime /></div>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col sm:w-auto sm:flex-row sm:items-center gap-2 [&>button]:w-full sm:[&>button]:w-auto [&>button]:whitespace-nowrap [&>div]:w-full sm:[&>div]:w-auto [&>div>button]:w-full sm:[&>div>button]:w-auto [&>div>button]:justify-center">
          <TimeFilter
            value={days}
            onChange={handleDaysChange}
            comparisonPeriod={comparisonPeriod}
            onComparisonChange={setComparisonPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomRangeChange={handleCustomRangeChange}
          />
          <ReportGeneratorButton days={days} />
        </div>
      </header>
      <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
        <ExecutiveDashboard days={days} comparisonPeriod={comparisonPeriod} customFrom={customFrom} customTo={customTo} />
      </div>
    </MainLayout>
  );
}
