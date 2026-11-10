import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SEGMENTOS, filtrarRfm, useMayoristasRfm } from "@/lib/mayoristas-rfm";
import { useQuery } from "@tanstack/react-query";
import { Users, Clock, UserMinus, Banknote } from "lucide-react";
import { KpiCard, ComparisonIndicator, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtPct, fmtFecha, tituloNombre } from "@/lib/mayoristas-format";
import { ConsultaError } from "@/components/mayoristas/MayoristasPanel";
import { TablaCard, TablaTh, VendedoraSelect } from "@/components/mayoristas/MayoristasOrdenes";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type Estado = "Activo" | "Nuevo" | "Sin pedido 60 días" | "Sin pedido 90 días" | "Sin pedido 120 días" | "Perdido";
interface RecenciaRow {
  tramo: Exclude<Estado, "Nuevo">; orden: number; clientes: number; venta_12m: number; pct_venta_12m: number | null;
}
interface ClienteRow {
  cliente_id: string; cliente: string; vendedor_id: string | null; vendedora: string; estado: Estado;
  venta: number; unidades: number; facturas: number; puntos_entrega: number; ticket: number | null;
  participacion: number | null; ultima_compra: string | null; dias_sin_compra: number | null;
  venta_ant: number | null; var_ant: number | null; venta_aa: number | null; var_aa: number | null;
}

const ESTADO_COLOR: Record<Estado, string> = {
  Nuevo: "text-[hsl(var(--chart-5))]",
  Activo: "text-success",
  "Sin pedido 60 días": "text-warning/70",
  "Sin pedido 90 días": "text-warning",
  "Sin pedido 120 días": "text-[color:color-mix(in_srgb,hsl(var(--warning)),hsl(var(--danger)))]",
  Perdido: "text-danger",
};
const ESTADO_CLASS: Record<Estado, string> = {
  Nuevo: "bg-[hsl(var(--chart-5)/0.1)] border-[hsl(var(--chart-5)/0.3)]",
  Activo: "status-optimal",
  "Sin pedido 60 días": "bg-warning/5 border-warning/20",
  "Sin pedido 90 días": "status-warning",
  "Sin pedido 120 días": "bg-warning/15 border-danger/30",
  Perdido: "status-danger",
};
const FILTROS: { id: string; label: string }[] = [
  { id: "todos", label: "Todos" },
  ...(["Activo", "Nuevo", "Sin pedido 60 días", "Sin pedido 90 días", "Sin pedido 120 días", "Perdido"] as Estado[]).map(estado => ({ id: estado, label: estado })),
];

function EstadoBadge({ estado }: { estado: Estado }) {
  return <Badge variant="outline" className={cn("font-medium", ESTADO_CLASS[estado], ESTADO_COLOR[estado])}>{estado}</Badge>;
}

function Vs({ r }: { r: ClienteRow }) {
  if (r.estado === "Perdido") return <span className="text-xs text-muted-foreground">antes {fmtMonto(r.venta_ant)}</span>;
  if (r.var_ant == null) return <span className="text-muted-foreground">—</span>;
  return <ComparisonIndicator actual={0} anterior={0} percentage={Number(r.var_ant)} label="vs ant." />;
}

function UltimaCompra({ r }: { r: ClienteRow }) {
  return <div className="whitespace-nowrap">
    <p>{fmtFecha(r.ultima_compra)}</p>
    {r.dias_sin_compra != null && <p className="text-xs text-muted-foreground">hace {fmtNum(r.dias_sin_compra)} días</p>}
  </div>;
}

export function MayoristasClientes({ desde, hasta, vendedor, onVendedorChange, onClienteClick }: { desde: string | null; hasta: string | null; vendedor: string | null; onVendedorChange: (v: string | null) => void; onClienteClick?: (clienteId: string) => void }) {
  const [params, setParams] = useSearchParams();
  const segmento = SEGMENTOS.some(s => s.nombre === params.get("segmento")) ? params.get("segmento") : null;
  const vencida = params.get("cartera_vencida") === "true";
  const setRfmParam = (key: string, value: string | null) => setParams(prev => { const next = new URLSearchParams(prev); if (value) next.set(key, value); else next.delete(key); return next; }, { replace: true });
  const rfmQ = useMayoristasRfm(vendedor);
  const rfmPorCliente = new Map((rfmQ.data ?? []).map(r => [String(r.cliente_id), r]));
  const valido = !!desde && !!hasta && desde <= hasta;
  const [filtro, setFiltro] = useState<string>("todos");
  const q = useQuery({
    retry: false,
    queryKey: ["mayoristas-clientes", desde, hasta, vendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_clientes" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as ClienteRow[]) ?? [];
    },
  });
  const recencia = useQuery({
    retry: false,
    queryKey: ["mayoristas-recencia", hasta, vendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_recencia" as never, { p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return ((data as unknown as RecenciaRow[]) ?? []).slice().sort((a, b) => Number(a.orden) - Number(b.orden));
    },
  });
  const rows = q.data ?? [];
  const activos = rows.filter(r => r.estado === "Activo" || r.estado === "Nuevo").length;
  const conVenta = rows.filter(r => Number(r.venta) > 0);
  const ventaTotal = conVenta.reduce((s, r) => s + Number(r.venta), 0);
  const promedio = conVenta.length > 0 ? ventaTotal / conVenta.length : null;
  const visibles = filtrarRfm(filtro === "todos" ? rows : rows.filter(r => r.estado === filtro), rfmQ.data ?? [], segmento, vencida);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap gap-2">
        {[{ nombre: "Todos" }, ...SEGMENTOS].map(s => <Button key={s.nombre} size="sm" variant={(segmento ?? "Todos") === s.nombre ? "default" : "outline"} onClick={() => setRfmParam("segmento", s.nombre === "Todos" ? null : s.nombre)}>{s.nombre}</Button>)}
        <Button size="sm" variant={vencida ? "default" : "outline"} aria-pressed={vencida} onClick={() => setRfmParam("cartera_vencida", vencida ? null : "true")}>Con cartera vencida</Button>
      </div>
      {rfmQ.error && <ConsultaError error={rfmQ.error} />}
      {rfmQ.isLoading && (segmento || vencida) && <LoadingState />}
      <div className="glass-card p-5">
        <CommercialSectionHeader title="👥 VENTA POR CLIENTE">
          <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={onVendedorChange} />
        </CommercialSectionHeader>
        <p className="text-xs text-muted-foreground mb-4">Venta neta sin IVA · fuente: facturas NetSuite</p>
        {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KpiCard label="Clientes activos" value={fmtNum(activos)} icon={Users} />
            <KpiCard label="Venta promedio por cliente" value={fmtMonto(promedio)} icon={Banknote} />
          </div>
        )}
      </div>

      {recencia.error ? <ConsultaError error={recencia.error} /> : recencia.isLoading ? <LoadingState /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {(recencia.data ?? []).map(r => (
            <KpiCard key={r.tramo} label={r.tramo} value={fmtNum(r.clientes)} className={ESTADO_COLOR[r.tramo]}
              icon={r.tramo === "Activo" ? Users : r.tramo === "Perdido" ? UserMinus : Clock}
              onClick={() => setFiltro(r.tramo)}>
              <p className="text-xs text-muted-foreground mt-1">compraban {fmtMonto(r.venta_12m)} al año ({fmtPct(r.pct_venta_12m)})</p>
            </KpiCard>
          ))}
        </div>
      )}

      {q.error || q.isLoading ? null : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">Clientes</h2>
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm bg-card border border-border"><SelectValue /></SelectTrigger>
              <SelectContent>{FILTROS.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {visibles.length === 0 ? <EmptyState message="Sin clientes para el periodo." /> : (
            <>
              <div className="hidden md:block">
                <TablaCard title={`Clientes (${fmtNum(visibles.length)})`} minW={1750}>
                  <TablaTh cols={["Cliente", "Asesora", "Estado", "Venta", "% canal", "Unidades", "Facturas", "Ticket", "vs periodo ant.", "Última compra", "Segmento", "Compras 12 m", "Facturas 12 m", "Saldo", "Vencido +60"]} />
                  <tbody>{visibles.map(r => (
                    <tr key={`${r.cliente_id}-${r.vendedor_id}`} className="border-b border-border last:border-0">
                      <td className="px-3 py-2.5"><button type="button" onClick={() => onClienteClick?.(r.cliente_id)} className="font-medium text-primary hover:underline text-left">{r.cliente}</button>{Number(r.puntos_entrega) > 1 && <p className="text-xs text-muted-foreground">{fmtNum(r.puntos_entrega)} puntos de entrega</p>}</td>
                      <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
                      <td className="px-3 py-2.5"><EstadoBadge estado={r.estado} /></td>
                      <td className={cn("px-3 py-2.5 tabular-nums font-medium", r.estado === "Perdido" && "text-muted-foreground")}>{fmtMonto(r.venta)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtPct(r.participacion)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.facturas)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.ticket)}</td>
                      <td className="px-3 py-2.5"><Vs r={r} /></td>
                      <td className="px-3 py-2.5"><UltimaCompra r={r} /></td>
                      <td className="px-3 py-2.5"><Badge variant="outline" className={SEGMENTOS.find(s => s.nombre === rfmPorCliente.get(String(r.cliente_id))?.segmento)?.badge}>{rfmPorCliente.get(String(r.cliente_id))?.segmento ?? "—"}</Badge></td>
                      <td className="px-3 py-2.5 tabular-nums">{rfmPorCliente.has(String(r.cliente_id)) ? fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.compras_12m) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{rfmPorCliente.has(String(r.cliente_id)) ? fmtNum(rfmPorCliente.get(String(r.cliente_id))?.facturas_12m) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums">{rfmPorCliente.has(String(r.cliente_id)) ? fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.saldo) : "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums text-danger">{rfmPorCliente.has(String(r.cliente_id)) ? fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.vencido_60) : "—"}</td>
                    </tr>
                  ))}</tbody>
                </TablaCard>
              </div>
              <div className="md:hidden space-y-3">
                {visibles.map(r => (
                  <div key={`${r.cliente_id}-${r.vendedor_id}`} className="glass-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><button type="button" onClick={() => onClienteClick?.(r.cliente_id)} className="font-medium text-primary hover:underline text-sm text-left">{r.cliente}</button><p className="text-xs text-muted-foreground">{tituloNombre(r.vendedora)}{Number(r.puntos_entrega) > 1 ? ` · ${fmtNum(r.puntos_entrega)} puntos de entrega` : ""}</p></div>
                      <EstadoBadge estado={r.estado} />
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-lg font-semibold tabular-nums", r.estado === "Perdido" && "text-muted-foreground")}>{fmtMonto(r.venta)}</span>
                      <Vs r={r} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>% canal: {fmtPct(r.participacion)}</span><span>Unidades: {fmtNum(r.unidades)}</span>
                      <span>Facturas: {fmtNum(r.facturas)}</span><span>Ticket: {fmtMonto(r.ticket)}</span>
                    </div>
                    <div className="text-xs"><UltimaCompra r={r} /></div>
                    {rfmPorCliente.has(String(r.cliente_id)) && <div className="space-y-2">
                      <Badge variant="outline" className={SEGMENTOS.find(s => s.nombre === rfmPorCliente.get(String(r.cliente_id))?.segmento)?.badge}>{rfmPorCliente.get(String(r.cliente_id))?.segmento}</Badge>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <span>Compras 12 m: {fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.compras_12m)}</span><span>Facturas 12 m: {fmtNum(rfmPorCliente.get(String(r.cliente_id))?.facturas_12m)}</span>
                        <span>Saldo: {fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.saldo)}</span><span className="text-danger">Vencido +60: {fmtMonto(rfmPorCliente.get(String(r.cliente_id))?.vencido_60)}</span>
                      </div>
                    </div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
