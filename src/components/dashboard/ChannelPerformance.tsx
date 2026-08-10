import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays, toDateStr, getDateRange, CUSTOM_SENTINEL } from "@/components/dashboard/TimeFilter";
import { BarraCumplimiento } from "./BarraCumplimiento";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Globe, Tag } from "lucide-react";

type CanalKey = "digital" | "tiendas" | "outlets";

interface ChannelRow {
  canal: string | null;
  canal_key: CanalKey | string | null;
  ventas_totales: number | null;
  total_pedidos: number | null;
}

interface BudgetRow {
  canal: string | null;
  presupuesto: number | null;
  venta: number | null;
  pct_cumplimiento: number | null;
}

interface Props {
  days: number;
  /** When provided (custom range mode), sends p_desde/p_hasta and omits dias_atras. */
  customFrom?: Date;
  customTo?: Date;
}

function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 3 })}M`;
  return value.toLocaleString("es-CO");
}

function KpiCard({ label, value, mobileValue, prefix = "", footer }: { label: string; value: string; mobileValue?: string; prefix?: string; footer?: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl p-5 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-display font-bold text-foreground whitespace-normal break-words tabular-nums">
        {mobileValue ? <><span className="sm:hidden">{prefix}{mobileValue}</span><span className="hidden sm:inline">{prefix}{value}</span></> : <>{prefix}{value}</>}
      </p>
      {footer && <div className="mt-1">{footer}</div>}
    </div>
  );
}

function ChannelTab({ row, presupuesto }: { row: ChannelRow; presupuesto?: BudgetRow }) {
  const ventas = row.ventas_totales ?? 0;
  const pedidos = row.total_pedidos ?? 0;
  const ticket = pedidos > 0 ? ventas / pedidos : 0;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <KpiCard
        label="Ventas Totales"
        value={ventas.toLocaleString()}
        mobileValue={formatCompactMoney(ventas)}
        prefix="$"
        footer={
          presupuesto ? (
            <BarraCumplimiento
              pct={presupuesto.pct_cumplimiento}
              venta={presupuesto.venta}
              presupuesto={presupuesto.presupuesto}
              mostrarMontos
            />
          ) : undefined
        }
      />
      <KpiCard label="Total Pedidos" value={pedidos.toLocaleString()} />
      <KpiCard
        label="Ticket Promedio"
        value={Math.round(ticket).toLocaleString()}
        mobileValue={formatCompactMoney(Math.round(ticket))}
        prefix="$"
      />
    </div>
  );
}

const EMPTY_ROW: ChannelRow = { canal: null, canal_key: null, ventas_totales: 0, total_pedidos: 0 };

export function ChannelPerformance({ days, customFrom, customTo }: Props) {
  const [data, setData] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const isCustomRange = !!(customFrom && customTo);
      // Two modes — never mix. Custom range → p_desde + p_hasta.
      // Preset → dias_atras only.
      const params = isCustomRange
        ? { p_desde: toDateStr(customFrom!), p_hasta: toDateStr(customTo!) }
        : { dias_atras: resolveDays(days) };
      const { data: rows, error } = await supabase.rpc(
        "reporte_desempeño_por_canal",
        params as any
      );
      if (!error && rows) setData(rows as unknown as ChannelRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days, customFrom, customTo]);

  if (loading) return <LoadingState rows={4} />;
  if (!data.length) return <EmptyState message="No hay datos de canales para este período." />;

  // Mapeo explícito por canal_key — nunca comparar texto de `canal`.
  const porCanal = Object.fromEntries(
    data.map((r) => [r.canal_key, r])
  ) as Record<string, ChannelRow | undefined>;

  const digital = porCanal.digital ?? EMPTY_ROW;
  const tiendas = porCanal.tiendas ?? EMPTY_ROW;
  const outlets = porCanal.outlets ?? EMPTY_ROW;

  const totalRevenue = (digital.ventas_totales ?? 0) + (tiendas.ventas_totales ?? 0) + (outlets.ventas_totales ?? 0);
  const totalPedidos = (digital.total_pedidos ?? 0) + (tiendas.total_pedidos ?? 0) + (outlets.total_pedidos ?? 0);

  return (
    <div className="space-y-5">
      {/* Global summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Ventas Totales</p>
          <p className="text-2xl font-display font-bold text-primary whitespace-normal break-words tabular-nums">
            <span className="sm:hidden">${formatCompactMoney(totalRevenue)}</span>
            <span className="hidden sm:inline">${totalRevenue.toLocaleString()}</span>
          </p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Pedidos Totales</p>
          <p className="text-2xl font-display font-bold text-foreground">{totalPedidos.toLocaleString()}</p>
        </div>
      </div>

      {/* Channel Tabs */}
      <Tabs defaultValue="tiendas" className="w-full">
        <TabsList className="w-full grid grid-cols-3 bg-muted/50 rounded-lg p-1">
          <TabsTrigger
            value="tiendas"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
          >
            <Store className="h-4 w-4" />
            Tiendas Físicas
          </TabsTrigger>
          <TabsTrigger
            value="outlets"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
          >
            <Tag className="h-4 w-4" />
            Outlets
          </TabsTrigger>
          <TabsTrigger
            value="digital"
            className="flex items-center gap-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
          >
            <Globe className="h-4 w-4" />
            Digital
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tiendas"><ChannelTab row={tiendas} /></TabsContent>
        <TabsContent value="outlets"><ChannelTab row={outlets} /></TabsContent>
        <TabsContent value="digital"><ChannelTab row={digital} /></TabsContent>
      </Tabs>
    </div>
  );
}
