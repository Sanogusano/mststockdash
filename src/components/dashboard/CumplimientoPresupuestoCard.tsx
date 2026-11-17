import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Target } from "lucide-react";
import { formatKpiMoney } from "@/lib/kpi-money";
import { budgetProgress, selectedBudget, type BudgetChannel, type BudgetRow } from "@/lib/executive-budget";

interface Props {
  desde: string;
  hasta: string;
  zona?: string | null;
  canal?: "tienda" | "online" | null;
  locationId?: string | null;
  channels: BudgetChannel[];
  venta: number;
  universo: string;
  preserveTotal?: boolean;
  supplied?: { meta: number | null; porcentaje: number | null; porcentajeALaFecha?: number | null };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Returns full-month range when desde–hasta is inside one month and doesn't cover it entirely. */
export function partialMonthRange(desde: string, hasta: string): { desde: string; hasta: string; label: string; rango: string } | null {
  const d = desde.slice(0, 10), h = hasta.slice(0, 10);
  if (d.slice(0, 7) !== h.slice(0, 7)) return null;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const di = Number(d.slice(8, 10)), hi = Number(h.slice(8, 10));
  if (di === 1 && hi >= last) return null;
  const mm = String(m).padStart(2, "0");
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(last).padStart(2, "0")}`, label: `${MESES[m - 1]} ${y}`, rango: `${di}–${hi} ${MESES[m - 1]}` };
}

function tono(pct: number | null) {
  const cumplio = pct != null && pct >= 100;
  const cerca = pct != null && pct >= 90 && pct < 100;
  return {
    cumplio,
    color: pct == null ? "text-muted-foreground" : cumplio ? "text-success" : cerca ? "text-warning" : "text-destructive",
    barra: cumplio ? "bg-success" : cerca ? "bg-warning" : "bg-destructive",
  };
}

function Columna({ titulo, venta, meta }: { titulo: string; venta: number; meta: number }) {
  const { pct, diferencia } = budgetProgress(venta, meta);
  const t = tono(pct);
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate">{titulo}</span>
        <span className={`text-2xl font-semibold tabular-nums ${t.color}`}>
          {pct == null ? <span className="text-base">Sin meta</span> : `${pct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`absolute inset-y-0 left-0 rounded-full ${t.barra}`} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <div className="flex justify-between gap-2 text-xs tabular-nums">
        <span className="min-w-0 text-muted-foreground"><span className="font-medium text-foreground">{formatKpiMoney(venta)}</span>{pct != null && ` de ${formatKpiMoney(meta)}`}</span>
        {pct != null && <span className={`text-right ${t.cumplio ? "text-success" : "text-muted-foreground"}`}>{t.cumplio ? `+${formatKpiMoney(diferencia)} sobre meta` : `Faltan ${formatKpiMoney(-diferencia)}`}</span>}
      </div>
    </div>
  );
}

export function CumplimientoPresupuestoCard({ desde, hasta, zona, canal, locationId, channels, venta, universo, preserveTotal = false, supplied }: Props) {
  const [presupuesto, setPresupuesto] = useState(0);
  const [presupuestoMes, setPresupuestoMes] = useState<number | null>(null);
  const mes = supplied ? null : partialMonthRange(desde, hasta);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelsKey = [...channels].sort().join(",");

  useEffect(() => {
    if (supplied) return;
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const getMeta = async (desde: string, hasta: string): Promise<number> => {
        let meta: number;
        if (preserveTotal) {
          // Keep the existing total budget universe unchanged for Venta Directa / Todos.
          const { data, error } = await supabase.rpc("reporte_cumplimiento_ejecutivo", {
            p_desde: desde, p_hasta: hasta, p_zona: null, p_canal: null, p_location_id: null,
          });
          if (error) throw error;
          meta = Number(data?.[0]?.presupuesto ?? 0);
        } else {
          const [budgets, locations] = await Promise.all([
            supabase.from("presupuestos_config").select("tipo,location_id,nombre_identificador,mes,anio,monto")
              .gte("anio", Number(desde.slice(0, 4))).lte("anio", Number(hasta.slice(0, 4))),
            supabase.from("locations").select("location_id,tipo_tienda,zona"),
          ]);
          if (budgets.error) throw budgets.error;
          if (locations.error) throw locations.error;
          meta = selectedBudget((budgets.data ?? []) as BudgetRow[], locations.data ?? [], {
            channels: channelsKey.split(",").filter(Boolean) as BudgetChannel[], locationId, zona,
          }, desde, hasta);
        }
        return meta;
        };
        const [meta, metaMes] = await Promise.all([getMeta(desde, hasta), mes ? getMeta(mes.desde, mes.hasta) : Promise.resolve(null)]);
        if (activo) { setPresupuesto(meta); setPresupuestoMes(metaMes); }
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => { activo = false; };
  }, [desde, hasta, zona, canal, locationId, channelsKey, preserveTotal, supplied]);

  if (!supplied && loading) return <div className="rounded-lg border px-4 py-3 flex min-w-0 flex-wrap gap-4"><div className="h-8 w-20 bg-muted rounded animate-pulse" /><div className="h-3 w-40 max-w-full bg-muted rounded animate-pulse" /></div>;
  if (!supplied && error) return <div className="rounded-lg border px-4 py-3 text-sm text-destructive break-words">Cumplimiento presupuesto · {error}</div>;

  if (mes && presupuestoMes != null) {
    return (
      <div className="rounded-lg border px-4 py-3 min-w-0 space-y-3">
        <div className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">Cumplimiento presupuesto · {universo}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Columna titulo={`A la fecha · ${mes.rango}`} venta={venta} meta={presupuesto} />
          <Columna titulo={`Mes completo · ${mes.label}`} venta={venta} meta={presupuestoMes} />
        </div>
      </div>
    );
  }

  const meta = supplied ? supplied.meta ?? 0 : presupuesto;
  const progress = budgetProgress(venta, meta);
  const pct = supplied ? supplied.porcentaje : progress.pct;
  const diferencia = progress.diferencia;
  const cumplio = pct != null && pct >= 100;
  const cerca = pct != null && pct >= 90 && pct < 100;
  const color = pct == null ? "text-muted-foreground" : cumplio ? "text-success" : cerca ? "text-warning" : "text-destructive";
  const barra = cumplio ? "bg-success" : cerca ? "bg-warning" : "bg-destructive";

  return (
    <div className={`rounded-lg border px-4 py-3 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:flex-wrap sm:items-center gap-x-3 gap-y-2 ${cumplio ? "border-success/30 bg-success/5" : ""}`}>
      <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
        <Target className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Cumplimiento presupuesto</span>
      </div>
      <div className={`text-2xl font-semibold tabular-nums shrink-0 text-right ${color}`}>
        {pct == null ? <span className="text-base">Sin meta</span> : `${pct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`}
      </div>
      <div className="col-span-2 relative h-1.5 w-full sm:w-auto sm:flex-1 sm:min-w-[80px] rounded-full bg-muted overflow-hidden">
        <div className={`absolute inset-y-0 left-0 rounded-full ${barra}`} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <div className="col-span-2 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] sm:flex sm:flex-wrap sm:justify-start gap-x-3 gap-y-1 text-sm sm:text-xs tabular-nums">
        <span className="min-w-0 text-muted-foreground"><span className="block text-xs sm:inline">{universo}<span className="hidden sm:inline"> · </span></span><span className="font-medium text-foreground">{formatKpiMoney(venta)}</span>{pct != null && ` de ${formatKpiMoney(meta)}`}</span>
        {pct != null && <span className={`self-end max-w-[110px] sm:max-w-none text-right ${cumplio ? "text-success" : "text-muted-foreground"}`}>{cumplio ? `+${formatKpiMoney(diferencia)} sobre meta` : `Faltan ${formatKpiMoney(-diferencia)}`}</span>}
        {supplied?.porcentajeALaFecha != null && <span className="text-muted-foreground">A la fecha: {supplied.porcentajeALaFecha.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</span>}
      </div>
    </div>
  );
}
export default CumplimientoPresupuestoCard;
