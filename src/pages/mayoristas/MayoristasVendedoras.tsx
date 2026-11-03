import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Handshake } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  fmtMonto, fmtNum, fmtPct, fmtRango, hoyBogota, Periodo, rangoPeriodo, semaforoCumplimiento, Semaforo, tituloNombre,
} from "@/lib/mayoristas-format";

interface CanalRow {
  venta: number; unidades: number; facturas: number; clientes: number; ticket: number;
  meta: number | null; meta_a_la_fecha: number | null; cumplimiento: number | null; cumplimiento_a_la_fecha: number | null;
  venta_ant: number | null; var_ant: number | null; venta_aa: number | null; var_aa: number | null; facturas_anuladas: number;
}
interface VendedoraRow extends Omit<CanalRow, "facturas_anuladas"> {
  vendedor_id: string | null; vendedora: string; clientes_nuevos: number; clientes_perdidos: number; participacion: number | null;
}

const TXT: Record<Semaforo, string> = {
  verde: "text-success", ambar: "text-warning",
  rojo: "text-danger", neutro: "text-muted-foreground",
};
const BAR: Record<Semaforo, string> = {
  verde: "bg-success", ambar: "bg-warning",
  rojo: "bg-danger", neutro: "bg-muted-foreground",
};

function Variacion({ label, value }: { label: string; value: number | null }) {
  if (value === null || value === undefined) return <div className="text-xs text-muted-foreground">— {label}</div>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex items-center gap-1 text-xs", up ? TXT.verde : TXT.rojo)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium tabular-nums">{up ? "+" : ""}{fmtPct(value)}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function Cumplimiento({ venta, meta, cumplimiento, aLaFecha, big }: {
  venta: number; meta: number | null; cumplimiento: number | null; aLaFecha: number | null; big?: boolean;
}) {
  if (meta === null || meta === undefined) {
    return <div className={cn("font-semibold text-muted-foreground", big ? "text-3xl" : "text-xl")}>Sin meta</div>;
  }
  const s = semaforoCumplimiento(aLaFecha);
  const diff = Number(meta) - Number(venta);
  return (
    <div className="space-y-2 min-w-0">
      <div className={cn("font-bold tabular-nums", TXT[s], big ? "text-4xl" : "text-2xl")}>{fmtPct(cumplimiento)}</div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", BAR[s])} style={{ width: `${Math.min(Math.max(Number(cumplimiento) || 0, 0), 100)}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
        <span className="tabular-nums">{fmtMonto(venta)} de {fmtMonto(meta)}</span>
        {diff > 0
          ? <span className="text-muted-foreground tabular-nums">Faltan {fmtMonto(diff)}</span>
          : <span className={cn("tabular-nums", TXT.verde)}>+{fmtMonto(-diff)} sobre meta</span>}
      </div>
      <div className="text-xs text-muted-foreground">A la fecha: <span className={cn("font-medium", TXT[s])}>{fmtPct(aLaFecha)}</span></div>
    </div>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="min-w-0"><CardContent className="p-3 sm:p-4 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg sm:text-2xl font-semibold tabular-nums truncate">{value}</div>
      {children}
    </CardContent></Card>
  );
}

export default function MayoristasVendedoras() {
  const hoy = hoyBogota();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [custom, setCustom] = useState(() => rangoPeriodo("mes", hoy));
  const rango = useMemo(() => (periodo === "custom" ? custom : rangoPeriodo(periodo, hoy)), [periodo, custom, hoy]);
  const valido = !!rango.desde && !!rango.hasta && rango.desde <= rango.hasta;

  const canalQ = useQuery({
    queryKey: ["mayoristas-canal", rango.desde, rango.hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_canal" as never, { p_desde: rango.desde, p_hasta: rango.hasta } as never);
      if (error) throw error;
      return ((data as unknown as CanalRow[]) ?? [])[0] ?? null;
    },
  });
  const vendQ = useQuery({
    queryKey: ["mayoristas-vendedora", rango.desde, rango.hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_vendedora" as never, { p_desde: rango.desde, p_hasta: rango.hasta } as never);
      if (error) throw error;
      return [...((data as unknown as VendedoraRow[]) ?? [])].sort((a, b) => Number(b.venta) - Number(a.venta));
    },
  });
  const c = canalQ.data;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-5 min-w-0">
        <header className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 min-w-0">
          <div className="flex items-start gap-2 min-w-0">
            <SidebarTrigger className="mt-1" />
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2"><Handshake className="h-5 w-5 shrink-0" />Ventas por Vendedora</h1>
              <p className="text-xs text-muted-foreground">Venta neta sin IVA · fuente: facturas NetSuite</p>
            </div>
          </div>
          <div className="flex flex-col gap-1 w-full md:w-auto">
            <span className="text-xs text-muted-foreground">Periodo</span>
            <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
              <SelectTrigger className="w-full md:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mes">Este mes</SelectItem>
                <SelectItem value="mes_ant">Mes anterior</SelectItem>
                <SelectItem value="3m">Últimos 3 meses</SelectItem>
                <SelectItem value="anio">Año en curso</SelectItem>
                <SelectItem value="custom">Rango personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodo === "custom" && (
              <div className="flex gap-2">
                <Input type="date" value={custom.desde} onChange={(e) => setCustom((r) => ({ ...r, desde: e.target.value }))} className="min-w-0" />
                <Input type="date" value={custom.hasta} onChange={(e) => setCustom((r) => ({ ...r, hasta: e.target.value }))} className="min-w-0" />
              </div>
            )}
            <span className="text-xs text-muted-foreground">{valido ? fmtRango(rango.desde, rango.hasta) : "Rango inválido"}</span>
          </div>
        </header>

        {(canalQ.error || vendQ.error) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {(canalQ.error as Error)?.message || (vendQ.error as Error)?.message}
          </div>
        )}

        {canalQ.isLoading ? <LoadingState /> : c && (
          <section className="space-y-3">
            <Card><CardContent className="p-4 sm:p-5 space-y-2">
              <div className="text-sm font-medium">Cumplimiento Mayoristas</div>
              <Cumplimiento big venta={c.venta} meta={c.meta} cumplimiento={c.cumplimiento} aLaFecha={c.cumplimiento_a_la_fecha} />
              {Number(c.facturas_anuladas) > 0 && (
                <div className="text-xs text-muted-foreground">{fmtNum(c.facturas_anuladas)} factura(s) anulada(s) excluidas</div>
              )}
            </CardContent></Card>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="col-span-2 lg:col-span-1 min-w-0">
                <Kpi label="Venta neta (sin IVA)" value={fmtMonto(c.venta)}>
                  <Variacion label="vs periodo anterior" value={c.var_ant} />
                  <Variacion label="vs año anterior" value={c.var_aa} />
                </Kpi>
              </div>
              <Kpi label="Unidades" value={fmtNum(c.unidades)} />
              <Kpi label="Facturas" value={fmtNum(c.facturas)} />
              <Kpi label="Clientes activos" value={fmtNum(c.clientes)} />
              <Kpi label="Ticket promedio por factura" value={fmtMonto(c.ticket)} />
            </div>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Vendedoras</h2>
          {vendQ.isLoading ? <LoadingState /> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {(vendQ.data ?? []).map((v) => {
                const sin = v.vendedora?.startsWith("(");
                return (
                  <Card key={v.vendedor_id ?? v.vendedora} className="min-w-0"><CardContent className="p-4 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className={cn("font-semibold", sin && "text-muted-foreground")}>{tituloNombre(v.vendedora)}</div>
                      <div className="text-xs text-muted-foreground">{fmtPct(v.participacion)} del canal</div>
                    </div>
                    {sin
                      ? <div className="text-sm text-muted-foreground tabular-nums">{fmtMonto(v.venta)}</div>
                      : <Cumplimiento venta={v.venta} meta={v.meta} cumplimiento={v.cumplimiento} aLaFecha={v.cumplimiento_a_la_fecha} />}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      <div><div className="text-xs text-muted-foreground">Unidades</div><div className="tabular-nums">{fmtNum(v.unidades)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Facturas</div><div className="tabular-nums">{fmtNum(v.facturas)}</div></div>
                      <div>
                        <div className="text-xs text-muted-foreground">Clientes</div>
                        <div className="tabular-nums">{fmtNum(v.clientes)}</div>
                        {Number(v.clientes_nuevos) > 0 && <div className={cn("text-xs", TXT.verde)}>+{fmtNum(v.clientes_nuevos)} nuevos</div>}
                        {Number(v.clientes_perdidos) > 0 && <div className={cn("text-xs", TXT.rojo)}>−{fmtNum(v.clientes_perdidos)} perdidos</div>}
                      </div>
                      <div><div className="text-xs text-muted-foreground">Ticket</div><div className="tabular-nums">{fmtMonto(v.ticket)}</div></div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <Variacion label="vs periodo anterior" value={v.var_ant} />
                      <Variacion label="vs año anterior" value={v.var_aa} />
                    </div>
                  </CardContent></Card>
                );
              })}
              {(vendQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">Sin datos para el periodo.</div>}
            </div>
          )}
        </section>
      </div>
    </MainLayout>
  );
}
