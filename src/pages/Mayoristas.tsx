import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { Package, Users } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TimeFilter, THIS_MONTH_SENTINEL, type ComparisonPeriod } from "@/components/dashboard/TimeFilter";
import { getRangeStrings } from "@/components/dashboard/ExecutiveDashboard";
import { MayoristasOrdenes } from "@/components/mayoristas/MayoristasOrdenes";
import { MayoristasClientes } from "@/components/mayoristas/MayoristasClientes";

export default function MayoristasPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "clientes" ? "clientes" : "ordenes";
  const vendedor = params.get("vendedor");
  const initFrom = params.get("desde"); const initTo = params.get("hasta");
  const initRange = initFrom && initTo ? { from: new Date(`${initFrom}T00:00:00`), to: new Date(`${initTo}T00:00:00`) } : null;
  const setParam = (k: string, v: string | null) => setParams(prev => { const n = new URLSearchParams(prev); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const [days, setDays] = useState(initRange ? Math.max(differenceInCalendarDays(initRange.to, initRange.from), 0) : THIS_MONTH_SENTINEL);
  const [comparisonPeriod, setComparisonPeriod] = useState<ComparisonPeriod>("previous");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(initRange?.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(initRange?.to);
  const { desde, hasta } = getRangeStrings(days, customFrom, customTo);

  return (
    <MainLayout>
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
        <div className="flex min-w-0 items-start sm:items-center gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Mayoristas</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Gestión del canal mayorista</p>
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col sm:w-auto sm:flex-row sm:items-center gap-2 [&>div]:w-full sm:[&>div]:w-auto [&>div>button]:w-full sm:[&>div>button]:w-auto [&>div>button]:justify-center">
          <TimeFilter
            value={days}
            onChange={(d) => { setCustomFrom(undefined); setCustomTo(undefined); setDays(d); }}
            comparisonPeriod={comparisonPeriod}
            onComparisonChange={setComparisonPeriod}
            customFrom={customFrom}
            customTo={customTo}
            onCustomRangeChange={(from, to) => { setCustomFrom(from); setCustomTo(to); setDays(Math.max(differenceInCalendarDays(to, from), 0)); }}
          />
        </div>
      </header>
      <div className="flex-1 min-w-0 px-4 sm:px-6 py-4 sm:py-6">
        <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "ordenes" ? null : v)} className="w-full">
          <TabsList className="w-full min-w-0 grid grid-cols-2 bg-muted/50 rounded-xl p-1 h-auto border border-border mb-6">
            <TabsTrigger value="ordenes" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 text-xs sm:text-base font-medium rounded-lg px-1 sm:px-4 py-2 sm:py-3 text-center whitespace-nowrap transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Package className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>Órdenes</span>
            </TabsTrigger>
            <TabsTrigger value="clientes" className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2.5 text-xs sm:text-base font-medium rounded-lg px-1 sm:px-4 py-2 sm:py-3 text-center whitespace-nowrap transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Users className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>Venta por cliente</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="ordenes">
            <MayoristasOrdenes desde={desde} hasta={hasta} vendedor={vendedor} onVendedorChange={(v) => setParam("vendedor", v)} />
          </TabsContent>
          <TabsContent value="clientes">
            <MayoristasClientes desde={desde} hasta={hasta} vendedor={vendedor} onVendedorChange={(v) => setParam("vendedor", v)} />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
