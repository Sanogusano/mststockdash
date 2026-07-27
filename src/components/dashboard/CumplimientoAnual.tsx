import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarRange, Target, TrendingUp, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { cn } from "@/lib/utils";

/* ── Tipos ── */
interface FilaMes {
  mes: number;
  presupuesto: number;
  venta_real: number;
  pct_cumplimiento: number;
  proy_corte_dia10: number | null;
  proy_corte_dia20: number | null;
  proy_ultima: number | null;
  fecha_ultima_proy: string | null;
  fotos_disponibles: number;
}

const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtMM = (v: number) => `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}M`;

function cumplimientoColor(pct: number) {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 90) return "text-amber-500";
  return "text-destructive";
}

/** Desviación de una proyección vs la venta real de un mes cerrado (con signo) */
function desviacion(proy: number | null, real: number): string {
  if (proy == null || real <= 0) return "\u2014";
  const d = ((proy - real) / real) * 100;
  const signo = d >= 0 ? "+" : "";
  return `${signo}${d.toFixed(1)}%`;
}

function desviacionColor(proy: number | null, real: number) {
  if (proy == null || real <= 0) return "text-muted-foreground";
  const abs = Math.abs(((proy - real) / real) * 100);
  if (abs <= 5) return "text-emerald-600";
  if (abs <= 10) return "text-amber-500";
  return "text-destructive";
}

export function CumplimientoAnual() {
  const anioActual = new Date().getFullYear();
  const mesActual = new Date().getMonth() + 1;
  const [anio, setAnio] = useState(anioActual);
  const [data, setData] = useState<FilaMes[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data: rows, error } = await supabase.rpc("reporte_cumplimiento_anual" as any, { p_anio: anio });
      if (import.meta.env.DEV && error) console.error("Error en reporte_cumplimiento_anual:", error);
      setData(((rows ?? []) as any[]).map(r => ({
        mes: toNum(r.mes),
        presupuesto: toNum(r.presupuesto),
        venta_real: toNum(r.venta_real),
        pct_cumplimiento: toNum(r.pct_cumplimiento),
        proy_corte_dia10: r.proy_corte_dia10 == null ? null : toNum(r.proy_corte_dia10),
        proy_corte_dia20: r.proy_corte_dia20 == null ? null : toNum(r.proy_corte_dia20),
        proy_ultima: r.proy_ultima == null ? null : toNum(r.proy_ultima),
        fecha_ultima_proy: r.fecha_ultima_proy ?? null,
        fotos_disponibles: toNum(r.fotos_disponibles),
      })));
      setLoading(false);
    }
    fetch();
  }, [anio]);

  if (loading) return <LoadingState rows={5} />;
  if (!data.length) return <EmptyState message={`No hay presupuestos configurados para ${anio}.`} />;

  const esMesEnCurso = (m: number) => anio === anioActual && m === mesActual;
  const esMesCerrado = (m: number) => anio < anioActual || m < mesActual;

  const chartData = data.map(r => ({
    name: MESES[r.mes].slice(0, 3),
    Presupuesto: r.presupuesto,
    "Venta Real": r.venta_real,
  }));

  const totales = data.filter(r => esMesCerrado(r.mes)).reduce(
    (acc, r) => ({ ppto: acc.ppto + r.presupuesto, venta: acc.venta + r.venta_real }),
    { ppto: 0, venta: 0 }
  );
  const pctAcumulado = totales.ppto > 0 ? (totales.venta / totales.ppto) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Encabezado + selector de año */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarRange className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Cumplimiento Anual {anio}</h3>
            <p className="text-xs text-muted-foreground">Presupuesto vs venta real por mes, y precisión de la proyección de cierre</p>
          </div>
        </div>
        <Select value={String(anio)} onValueChange={v => setAnio(Number(v))}>
          <SelectTrigger className="w-[120px] bg-card border border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border z-50">
            {[anioActual, anioActual - 1].map(a => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI acumulado (solo meses cerrados) */}
      {totales.ppto > 0 && (
        <div className="glass-card p-5 flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Cumplimiento acumulado (meses cerrados)</p>
            <p className={cn("text-2xl font-semibold tabular-nums", cumplimientoColor(pctAcumulado))}>
              {pctAcumulado.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtCurrency(totales.venta)} vendidos de {fmtCurrency(totales.ppto)} presupuestados
            </p>
          </div>
        </div>
      )}

      {/* Gráfico presupuesto vs real */}
      <div className="glass-card p-5">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-4">Presupuesto vs Venta Real</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={4} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={v => fmtMM(v)} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={70} />
            <Tooltip
              formatter={(v: number, name: string) => [fmtCurrency(v), name]}
              contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Presupuesto" fill="hsl(var(--muted-foreground) / 0.35)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Venta Real" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla mensual con precisión de proyección */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold text-foreground">Detalle mensual y precisión de la proyección</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Mes</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Presupuesto</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Venta Real</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Cumplimiento</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Proy. día 10</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Proy. día 20</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Última proyección</th>
              </tr>
            </thead>
            <tbody>
              {data.map(r => {
                const cerrado = esMesCerrado(r.mes);
                const enCurso = esMesEnCurso(r.mes);
                return (
                  <tr key={r.mes} className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors", enCurso && "bg-primary/5")}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {MESES[r.mes]}
                      {enCurso && <span className="ml-2 text-[10px] font-semibold text-primary uppercase">En curso</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(r.presupuesto)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmtCurrency(r.venta_real)}</td>
                    <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", cumplimientoColor(r.pct_cumplimiento))}>
                      {r.pct_cumplimiento.toFixed(1)}%
                    </td>
                    {/* Precisión: solo evaluable en meses cerrados con fotografías */}
                    <td className={cn("px-4 py-3 text-right tabular-nums text-xs", cerrado ? desviacionColor(r.proy_corte_dia10, r.venta_real) : "text-muted-foreground")}>
                      {cerrado ? desviacion(r.proy_corte_dia10, r.venta_real)
                        : r.proy_corte_dia10 != null ? fmtCurrency(r.proy_corte_dia10) : "\u2014"}
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums text-xs", cerrado ? desviacionColor(r.proy_corte_dia20, r.venta_real) : "text-muted-foreground")}>
                      {cerrado ? desviacion(r.proy_corte_dia20, r.venta_real)
                        : r.proy_corte_dia20 != null ? fmtCurrency(r.proy_corte_dia20) : "\u2014"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs">
                      {r.proy_ultima != null ? (
                        <div>
                          <span className={cn("font-medium", cerrado ? desviacionColor(r.proy_ultima, r.venta_real) : "text-foreground")}>
                            {cerrado ? desviacion(r.proy_ultima, r.venta_real) : fmtCurrency(r.proy_ultima)}
                          </span>
                          {r.fecha_ultima_proy && (
                            <span className="block text-[10px] text-muted-foreground">foto: {r.fecha_ultima_proy}</span>
                          )}
                        </div>
                      ) : "\u2014"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nota de honestidad metodológica */}
      <div className="flex items-start gap-2.5 p-4 rounded-xl border border-border bg-muted/20">
        <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Las columnas de proyección se evalúan contra <span className="font-medium text-foreground">fotografías fechadas</span> tomadas
          automáticamente cada noche (activas desde el <span className="font-medium text-foreground">27 de julio de 2026</span>).
          Los meses anteriores muestran "—" porque sus proyecciones no fueron registradas en su momento y reconstruirlas sería
          engañoso. En meses cerrados, el porcentaje indica la desviación de la proyección frente al cierre real
          (verde ≤5%, ámbar ≤10%, rojo &gt;10%). La primera evaluación completa estará disponible al cierre de agosto.
        </p>
      </div>
    </div>
  );
}
