import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Clock, AlertTriangle, Banknote, Receipt, Download, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { KpiCard, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ConsultaError } from "@/components/mayoristas/MayoristasPanel";
import { TablaCard, TablaTh, VendedoraSelect } from "@/components/mayoristas/MayoristasOrdenes";
import { MayoristasCarteraDetalle } from "@/components/mayoristas/MayoristasCarteraDetalle";
import { fmtMonto, fmtNum, fmtPct, fmtFecha, fmtMesGrupo, tituloNombre } from "@/lib/mayoristas-format";
import { exportToXLS } from "@/lib/xls-export";
import { carteraColumns, tramosCartera, totalCartera, ordenarCartera, carteraEnRiesgo, carteraExcel, recaudoExcel, type CarteraRow } from "@/lib/mayoristas-cartera";
import { cn } from "@/lib/utils";

function actualizadoFecha(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
}

export function MayoristasCartera({ desde, hasta, vendedor, onVendedorChange }: {
  desde: string | null; hasta: string | null; vendedor: string | null; onVendedorChange: (v: string | null) => void;
}) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [sort, setSort] = useState<{ key: keyof CarteraRow; asc: boolean }>({ key: "saldo", asc: false });
  const [cliente, setCliente] = useState<CarteraRow | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const cartera = useQuery({ queryKey: ["mayoristas-cartera", vendedor], retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_cartera", { p_vendedor: vendedor } as never);
      if (error) throw error;
      return data ?? [];
    },
  });
  const recaudo = useQuery({ queryKey: ["mayoristas-recaudo", desde, hasta, vendedor], retry: false, enabled: valido,
    queryFn: async () => {
      if (!desde || !hasta) return [];
      const { data, error } = await supabase.rpc("reporte_mayoristas_recaudo", { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return data ?? [];
    },
  });
  const mensual = useQuery({ queryKey: ["mayoristas-recaudo-mensual", vendedor], retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_recaudo_mensual", { p_meses: 12, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data ?? []).slice().sort((a, b) => a.mes.localeCompare(b.mes));
    },
  });
  const rows = ordenarCartera(cartera.data ?? [], sort.key, sort.asc);
  const total = totalCartera(rows);
  const pagos = recaudo.data ?? [];
  const meses = (mensual.data ?? []).map(r => ({ ...r, mesLabel: fmtMesGrupo(r.mes.slice(0, 7)) }));
  const actualizado = rows.map(r => r.actualizado_en).filter(Boolean).sort().at(-1);
  const exportar = (data: Record<string, unknown>[], name: string) => {
    setExportError(null);
    try { exportToXLS(data, name); } catch (error) { setExportError(error); }
  };

  return <div className="min-w-0 space-y-6">
    <CommercialSectionHeader title="CARTERA ACTUAL">
      <div className="flex w-full sm:w-auto flex-wrap gap-2">
        <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={onVendedorChange} />
        <Button variant="outline" size="sm" disabled={!rows.length || !!cartera.error} onClick={() => exportar(carteraExcel(rows), "mayoristas-cartera-actual")}><Download className="h-4 w-4 mr-2" />Excel cartera</Button>
      </div>
    </CommercialSectionHeader>
    {exportError ? <ConsultaError error={exportError} /> : null}
    <section className="min-w-0 space-y-4" aria-label="Cartera actual">
      {cartera.error ? <ConsultaError error={cartera.error} /> : cartera.isLoading ? <LoadingState /> : <>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard label="Saldo total" value={fmtMonto(total.saldo)} icon={Wallet} />
          <KpiCard label="Por vencer" value={fmtMonto(total.porVencer)} icon={Clock} className="text-success" />
          <KpiCard label="Vencido" value={fmtMonto(total.vencido)} icon={AlertTriangle} className="text-danger"><p className="text-xs text-muted-foreground mt-1">{fmtPct(total.pctVencido)} del saldo</p></KpiCard>
          <KpiCard label="Vencido +90 días" value={fmtMonto(total.vencido90)} icon={AlertTriangle} className="text-danger" />
        </div>
        {!rows.length ? <EmptyState message="Sin cartera para esta asesora." /> : <>
          <div className="space-y-3 py-2">
            <div className="flex h-5 w-full overflow-hidden rounded" role="img" aria-label="Distribución del saldo por vencimiento">
              {tramosCartera.map(t => <div key={t.key} title={`${t.label}: ${fmtMonto(total.tramos[t.key])}`} style={{ backgroundColor: t.color, width: `${total.saldo > 0 ? Math.max(0, total.tramos[t.key]) / total.saldo * 100 : 0}%` }} />)}
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">{tramosCartera.map(t => <span key={t.key} className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: t.color }} />{t.label} · {fmtMonto(total.tramos[t.key])}</span>)}</div>
          </div>
          <TablaCard title={`Cartera por cliente (${fmtNum(rows.length)})`} minW={1300}>
            <thead><tr className="border-b border-border bg-muted/30">{carteraColumns.map(c => <th key={c.key} aria-sort={sort.key === c.key ? sort.asc ? "ascending" : "descending" : "none"} className="px-3 py-2.5 text-left whitespace-nowrap">
              <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium text-muted-foreground gap-1" onClick={() => setSort({ key: c.key, asc: sort.key === c.key ? !sort.asc : "text" in c })}>
                {c.label}{sort.key === c.key ? sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
              </Button>
            </th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={`${r.cliente_id}-${r.vendedor_id}-${i}`} onClick={() => setCliente(r)} className={cn("border-b border-border last:border-0 cursor-pointer hover:bg-muted/40", carteraEnRiesgo(r) && "bg-danger/10 hover:bg-danger/15")}>
              {carteraColumns.map(c => <td key={c.key} className="px-3 py-2.5 tabular-nums">
                {c.key === "cliente" ? <Button variant="link" className="h-auto p-0 font-medium text-left whitespace-normal" onClick={e => { e.stopPropagation(); setCliente(r); }}>{r.cliente}</Button> : c.key === "vendedora" ? tituloNombre(r.vendedora) : "percent" in c ? fmtPct(Number(r[c.key])) : "count" in c ? fmtNum(Number(r[c.key])) : fmtMonto(Number(r[c.key]))}
              </td>)}
            </tr>)}</tbody>
          </TablaCard>
        </>}
      </>}
    </section>

    <section className="min-w-0 space-y-4 border-t border-border pt-6" aria-label="Recaudo del período">
      <CommercialSectionHeader title="RECAUDO DEL PERÍODO">
        <Button variant="outline" size="sm" disabled={!pagos.length || !!recaudo.error} onClick={() => exportar(recaudoExcel(pagos), `mayoristas-recaudo-${desde}-${hasta}`)}><Download className="h-4 w-4 mr-2" />Excel recaudo</Button>
      </CommercialSectionHeader>
      <p className="text-xs text-muted-foreground">{fmtFecha(desde)} – {fmtFecha(hasta)}</p>
      {!valido ? <EmptyState message="Selecciona un período válido." /> : recaudo.error ? <ConsultaError error={recaudo.error} /> : recaudo.isLoading ? <LoadingState /> : <>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <KpiCard label="Recaudo del período" value={fmtMonto(pagos.reduce((s, r) => s + Number(r.recaudo), 0))} icon={Banknote} />
          <KpiCard label="Notas crédito aplicadas" value={fmtMonto(pagos.reduce((s, r) => s + Number(r.notas_credito), 0))} icon={Receipt}><p className="text-xs text-muted-foreground mt-1">no es recaudo de caja</p></KpiCard>
        </div>
      </>}
      {mensual.error ? <ConsultaError error={mensual.error} /> : mensual.isLoading ? <LoadingState /> : !meses.length ? <EmptyState message="Sin recaudo mensual." /> : <div className="min-w-0 py-3">
        <h3 className="text-sm font-semibold mb-4">Recaudo mensual · últimos 12 meses</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={meses} margin={{ top: 8, right: 8, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="mesLabel" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={12} />
            <YAxis width={65} tickFormatter={fmtMonto} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: number) => [fmtMonto(v), "Recaudo"]} contentStyle={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))" }} />
            <Bar dataKey="recaudo" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>}
      {valido && !recaudo.error && !recaudo.isLoading && (!pagos.length ? <EmptyState message="Sin recaudo para el período." /> : <TablaCard title={`Recaudo por cliente (${fmtNum(pagos.length)})`} minW={850}>
        <TablaTh cols={["Cliente", "Asesora", "Recaudo", "Facturas pagadas", "Último pago", "Notas crédito"]} />
        <tbody>{pagos.map((r, i) => <tr key={`${r.cliente_id}-${r.vendedor_id}-${i}`} className="border-b border-border last:border-0">
          <td className="px-3 py-2.5 font-medium">{r.cliente}</td><td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
          <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.recaudo)}</td><td className="px-3 py-2.5 tabular-nums">{fmtNum(r.facturas_pagadas)}</td>
          <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.ultimo_pago)}</td><td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.notas_credito)}</td>
        </tr>)}</tbody>
      </TablaCard>)}
    </section>
    <p className="text-xs text-muted-foreground border-t border-border pt-4">Saldos con IVA según NetSuite. Se actualiza 2 veces al día (actualizado: {actualizadoFecha(actualizado)}).</p>
    <MayoristasCarteraDetalle cliente={cliente} onClose={() => setCliente(null)} />
  </div>;
}