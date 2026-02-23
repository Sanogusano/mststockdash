import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Globe, TrendingUp, TrendingDown } from "lucide-react";

interface ChannelRow {
  canal: string | null;
  unidades_vendidas: number | null;
  ingresos_netos: number | null;
  ticket_promedio: number | null;
  sku_top: string | null;
  sku_peor: string | null;
}

interface Props {
  days: number;
}

function KpiCard({ label, value, prefix = "" }: { label: string; value: string; prefix?: string }) {
  return (
    <div className="glass-card rounded-xl p-5 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-display font-bold text-foreground">
        {prefix}{value}
      </p>
    </div>
  );
}

function SkuPill({ sku, type }: { sku: string | null; type: "top" | "bottom" }) {
  const isTop = type === "top";
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border ${
      isTop 
        ? "bg-success/5 border-success/20" 
        : "bg-danger/5 border-danger/20"
    }`}>
      {isTop ? (
        <TrendingUp className="h-3.5 w-3.5 text-success shrink-0" />
      ) : (
        <TrendingDown className="h-3.5 w-3.5 text-danger shrink-0" />
      )}
      <span className={`text-sm font-mono font-medium ${isTop ? "text-success" : "text-danger"}`}>
        {sku ?? "—"}
      </span>
    </div>
  );
}

function ChannelTab({ row }: { row: ChannelRow }) {
  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          label="Ingresos Netos"
          value={(row.ingresos_netos ?? 0).toLocaleString()}
          prefix="$"
        />
        <KpiCard
          label="Unidades Vendidas"
          value={(row.unidades_vendidas ?? 0).toLocaleString()}
        />
        <KpiCard
          label="Ticket Promedio"
          value={(row.ticket_promedio ?? 0).toLocaleString()}
          prefix="$"
        />
      </div>

      {/* Top & Bottom SKUs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-4 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3 text-success" />
            Top Ganador
          </p>
          <SkuPill sku={row.sku_top} type="top" />
        </div>
        <div className="glass-card rounded-xl p-4 space-y-3">
          <p className="text-xs text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3 text-danger" />
            Mayor Hueso
          </p>
          <SkuPill sku={row.sku_peor} type="bottom" />
        </div>
      </div>
    </div>
  );
}

export function ChannelPerformance({ days }: Props) {
  const [data, setData] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { data: rows, error } = await supabase.rpc(
        "reporte_desempeño_por_canal",
        { dias_atras: days }
      );
      if (!error && rows) setData(rows as ChannelRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days]);

  if (loading) return <LoadingState rows={4} />;
  if (!data.length) return <EmptyState message="No hay datos de canales para este período." />;

  const posData = data.find((r) => r.canal?.includes("POS"));
  const digitalData = data.find((r) => !r.canal?.includes("POS"));

  // Total KPIs across channels
  const totalRevenue = data.reduce((s, r) => s + (r.ingresos_netos ?? 0), 0);
  const totalUnits = data.reduce((s, r) => s + (r.unidades_vendidas ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* Global summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Ingresos Totales</p>
          <p className="text-2xl font-display font-bold text-primary">${totalRevenue.toLocaleString()}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Unidades Totales</p>
          <p className="text-2xl font-display font-bold text-foreground">{totalUnits.toLocaleString()}</p>
        </div>
      </div>

      {/* Channel Tabs */}
      <Tabs defaultValue="pos" className="w-full">
        <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-lg p-1">
          <TabsTrigger
            value="pos"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
          >
            <Store className="h-4 w-4" />
            Canal POS
          </TabsTrigger>
          <TabsTrigger
            value="digital"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
          >
            <Globe className="h-4 w-4" />
            Canal Digital
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pos">
          {posData ? <ChannelTab row={posData} /> : <EmptyState message="Sin datos POS." />}
        </TabsContent>
        <TabsContent value="digital">
          {digitalData ? <ChannelTab row={digitalData} /> : <EmptyState message="Sin datos digitales." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
