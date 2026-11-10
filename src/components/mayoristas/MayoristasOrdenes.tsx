import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent, PackageX, Clock, Copy, ChevronDown } from "lucide-react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, Legend } from "recharts";
import { KpiCard, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtPct, fmtFecha, fmtMesGrupo, tituloNombre, semaforoFacturado, semaforoDiasPendiente } from "@/lib/mayoristas-format";
import type { Semaforo } from "@/lib/mayoristas-format";
import { ConsultaError } from "@/components/mayoristas/MayoristasPanel";
import { cn } from "@/lib/utils";

const TXT: Record<Semaforo, string> = { verde: "text-success", ambar: "text-warning", rojo: "text-danger", neutro: "text-muted-foreground" };

interface PvfRow {
  grupo: string; grupo_id: string | null; ordenes: number;
  pedido_uds: number; facturado_uds: number; pct_uds: number | null;
  pedido_valor: number; facturado_valor: number; pct_valor: number | null;
  no_facturado_uds: number; no_facturado_valor: number;
  pendiente_uds: number; pendiente_valor: number;
}
interface PendienteRow {
  orden: string; fecha: string; dias: number; estado: string; cliente: string; vendedora: string;
  unidades_pendientes: number; valor_pendiente: number; unidades_pedidas: number; valor_pedido: number;
}
interface NoDespachadaRow {
  orden: string; fecha: string; cliente: string; vendedora: string;
  unidades_pedidas: number; unidades_no_facturadas: number; valor_no_facturado: number;
  pct_facturado: number | null; productos_faltantes: string | null;
}
interface DuplicadaRow {
  orden: string; fecha: string; cliente: string; unidades: number; valor: number;
  motivo: string | null; orden_relacionada: string | null;
}

type Agrupacion = "vendedora" | "cliente" | "producto";
const AGRUPACIONES: { id: Agrupacion; label: string }[] = [
  { id: "vendedora", label: "Por asesora" },
  { id: "cliente", label: "Por cliente" },
  { id: "producto", label: "Por producto" },
];

function TablaCardBase({ title, children, minW = 900 }: { title: React.ReactNode; children: React.ReactNode; minW?: number }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">{title}</h3></div>
      <div className="overflow-x-auto"><table className="w-full text-sm" style={{ minWidth: minW }}>{children}</table></div>
    </div>
  );
}

function Th({ cols }: { cols: string[] }) {
  return <thead><tr className="border-b border-border bg-muted/30">{cols.map(col => <th key={col} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{col}</th>)}</tr></thead>;
}

export function TablaCard({ title, children, minW = 900 }: { title: React.ReactNode; children: React.ReactNode; minW?: number }) {
  return <TablaCardBase title={title} minW={minW}>{children}</TablaCardBase>;
}
export { Th as TablaTh };

/** Selector de vendedora compartido por las pestañas del módulo Mayoristas (valor = vendedor_id). */
export function VendedoraSelect({ desde, hasta, value, onChange }: { desde: string | null; hasta: string | null; value: string | null; onChange: (v: string | null) => void }) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const vendQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-vendedora", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_vendedora" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return (data as unknown as { vendedor_id: string | null; vendedora: string }[]) ?? [];
    },
  });
  return (
    <Select value={value ?? "__todas__"} onValueChange={(v) => onChange(v === "__todas__" ? null : v)}>
      <SelectTrigger className="w-full sm:w-[220px] h-9 text-sm bg-card border border-border"><SelectValue placeholder="Asesora comercial" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__todas__">Todas</SelectItem>
        {(vendQ.data ?? []).filter(v => v.vendedor_id).map(v => <SelectItem key={v.vendedor_id!} value={String(v.vendedor_id)}>{tituloNombre(v.vendedora)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function MayoristasOrdenes({ desde, hasta, vendedor, onVendedorChange }: { desde: string | null; hasta: string | null; vendedor: string | null; onVendedorChange: (v: string | null) => void }) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [agrupar, setAgrupar] = useState<Agrupacion>("vendedora");
  const pVendedor = vendedor;



  const mesQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-pvf", desde, hasta, "mes", pVendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_pedido_vs_facturado" as never, { p_desde: desde, p_hasta: hasta, p_agrupar: "mes", p_vendedor: pVendedor } as never);
      if (error) throw error;
      return (data as unknown as PvfRow[]) ?? [];
    },
  });

  const grupoQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-pvf", desde, hasta, agrupar, pVendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_pedido_vs_facturado" as never, { p_desde: desde, p_hasta: hasta, p_agrupar: agrupar, p_vendedor: pVendedor } as never);
      if (error) throw error;
      return (data as unknown as PvfRow[]) ?? [];
    },
  });

  const pendQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-ordenes-pendientes", pVendedor],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_ordenes_pendientes" as never, { p_vendedor: pVendedor } as never);
      if (error) throw error;
      return (data as unknown as PendienteRow[]) ?? [];
    },
  });

  const noDespQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-ordenes-no-despachadas", desde, hasta, pVendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_ordenes_no_despachadas" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: pVendedor } as never);
      if (error) throw error;
      return (data as unknown as NoDespachadaRow[]) ?? [];
    },
  });

  const dupQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-ordenes-duplicadas", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_ordenes_duplicadas" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return (data as unknown as DuplicadaRow[]) ?? [];
    },
  });

  const meses = mesQ.data ?? [];
  const pedidoUds = meses.reduce((s, r) => s + Number(r.pedido_uds), 0);
  const facturadoUds = meses.reduce((s, r) => s + Number(r.facturado_uds), 0);
  const pctFacturado = pedidoUds > 0 ? (facturadoUds / pedidoUds) * 100 : null;
  const noFactValor = meses.reduce((s, r) => s + Number(r.no_facturado_valor), 0);
  const noFactUds = meses.reduce((s, r) => s + Number(r.no_facturado_uds), 0);
  const pendientes = pendQ.data ?? [];
  const pendValor = pendientes.reduce((s, r) => s + Number(r.valor_pendiente), 0);
  const duplicadas = dupQ.data ?? [];
  const dupValor = duplicadas.reduce((s, r) => s + Number(r.valor), 0);

  const chartData = meses.map(r => ({ name: fmtMesGrupo(r.grupo), pedido: Number(r.pedido_uds), facturado: Number(r.facturado_uds), pct: r.pct_uds == null ? null : Number(r.pct_uds) }));

  return (
    <div className="space-y-4 min-w-0">
      <div className="glass-card p-5">
        <CommercialSectionHeader title="📦 ÓRDENES MAYORISTAS">
          <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={onVendedorChange} />
        </CommercialSectionHeader>
        <p className="text-xs text-muted-foreground mb-4">Pedidos vs. facturación · fuente: NetSuite</p>
        {mesQ.error ? <ConsultaError error={mesQ.error} /> : mesQ.isLoading || pendQ.isLoading || dupQ.isLoading ? <LoadingState /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Pedido vs. Facturado (%)" value={fmtPct(pctFacturado)} icon={Percent}>
              <p className="text-xs text-muted-foreground">{fmtNum(facturadoUds)} de {fmtNum(pedidoUds)} uds</p>
            </KpiCard>
            <KpiCard label="No despachado" value={fmtMonto(noFactValor)} icon={PackageX}>
              <p className="text-xs text-muted-foreground">{fmtNum(noFactUds)} unidades</p>
            </KpiCard>
            <KpiCard label="Pendientes" value={fmtNum(pendientes.length)} icon={Clock}>
              <p className="text-xs text-muted-foreground">{fmtMonto(pendValor)} por facturar</p>
            </KpiCard>
            <KpiCard label="Probables duplicados" value={fmtNum(duplicadas.length)} icon={Copy}>
              <p className="text-xs text-muted-foreground">{fmtMonto(dupValor)} · excluidas del cálculo</p>
            </KpiCard>
          </div>
        )}
        {pendQ.error ? <ConsultaError error={pendQ.error} /> : null}
        {dupQ.error ? <ConsultaError error={dupQ.error} /> : null}
      </div>

      {mesQ.error ? null : mesQ.isLoading ? <LoadingState /> : chartData.length === 0 ? <EmptyState message="Pedido vs. Facturado por mes · Sin datos para el periodo." /> : (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Pedido vs. Facturado por mes</h3>
          <div className="min-h-[220px]">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData} barGap={4} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="uds" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={55} />
                <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={45} />
                <Tooltip
                  formatter={(v: number, name: string) => name === "% facturado" ? [fmtPct(v), name] : [fmtNum(v), name]}
                  contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="uds" dataKey="pedido" name="Pedido (uds)" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="uds" dataKey="facturado" name="Facturado (uds)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="pct" name="% facturado" stroke="hsl(var(--success))" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">Pedido vs. Facturado por asesora / cliente / producto</h2>
        <Select value={agrupar} onValueChange={(v) => setAgrupar(v as Agrupacion)}>
          <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm bg-card border border-border"><SelectValue /></SelectTrigger>
          <SelectContent>{AGRUPACIONES.map(a => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {grupoQ.error ? <ConsultaError error={grupoQ.error} /> : grupoQ.isLoading ? <LoadingState /> : (grupoQ.data ?? []).length === 0 ? <EmptyState message="Sin datos para el periodo." /> : (
        <TablaCard title={AGRUPACIONES.find(a => a.id === agrupar)?.label ?? ""}>
          <Th cols={[AGRUPACIONES.find(a => a.id === agrupar)?.label.replace("Por ", "") ?? "Grupo", "Pedido uds", "Facturado uds", "Pedido vs. Facturado (%)", "No despachado uds", "No despachado valor", "Pendiente valor"]} />
          <tbody>{(grupoQ.data ?? []).map(r => (
            <tr key={r.grupo_id ?? r.grupo} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium text-foreground">{agrupar === "vendedora" ? tituloNombre(r.grupo) : r.grupo}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.pedido_uds)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.facturado_uds)}</td>
              <td className={cn("px-3 py-2.5 tabular-nums font-medium", TXT[semaforoFacturado(r.pct_uds)])}>{fmtPct(r.pct_uds)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.no_facturado_uds)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.no_facturado_valor)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.pendiente_valor)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}

      {pendQ.error ? null : pendQ.isLoading ? null : pendientes.length === 0 ? <EmptyState message="Órdenes pendientes · Sin órdenes pendientes." /> : (
        <TablaCard title="Órdenes pendientes" minW={1000}>
          <Th cols={["Orden", "Fecha", "Días", "Estado", "Cliente", "Asesora", "Uds pendientes", "Valor pendiente"]} />
          <tbody>{pendientes.map(r => (
            <tr key={r.orden} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{r.orden}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
              <td className={cn("px-3 py-2.5 tabular-nums font-medium", TXT[semaforoDiasPendiente(r.dias)])}>{fmtNum(r.dias)}</td>
              <td className="px-3 py-2.5">{r.estado}</td>
              <td className="px-3 py-2.5">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades_pendientes)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.valor_pendiente)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}

      {noDespQ.error ? <ConsultaError error={noDespQ.error} /> : noDespQ.isLoading ? <LoadingState /> : (noDespQ.data ?? []).length === 0 ? <EmptyState message="No despachadas · Sin datos para el periodo." /> : (
        <TablaCard title="No despachadas" minW={1100}>
          <Th cols={["Orden", "Fecha", "Cliente", "Asesora", "Uds pedidas", "Uds no facturadas", "Valor no facturado", "% facturado", "Productos faltantes"]} />
          <tbody>{(noDespQ.data ?? []).map(r => (
            <tr key={r.orden} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{r.orden}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
              <td className="px-3 py-2.5">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades_pedidas)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades_no_facturadas)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.valor_no_facturado)}</td>
              <td className={cn("px-3 py-2.5 tabular-nums font-medium", TXT[semaforoFacturado(r.pct_facturado)])}>{fmtPct(r.pct_facturado)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[260px]"><span className="line-clamp-2" title={r.productos_faltantes ?? ""}>{r.productos_faltantes ?? "—"}</span></td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}

      {dupQ.error ? null : dupQ.isLoading ? null : duplicadas.length === 0 ? null : (
        <Collapsible>
          <div className="glass-card overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-5 py-4 border-b border-border text-left group">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Probables duplicados (excluidos)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Órdenes cerradas sin facturar cuyo pedido se facturó en otra orden del mismo cliente (±15 días, mismos productos). Validar con comercial.</p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto"><table className="w-full text-sm min-w-[900px]">
                <Th cols={["Orden", "Fecha", "Cliente", "Uds", "Valor", "Motivo", "Orden relacionada"]} />
                <tbody>{duplicadas.map(r => (
                  <tr key={r.orden} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{r.orden}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                    <td className="px-3 py-2.5">{r.cliente}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.valor)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.motivo ?? "—"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.orden_relacionada ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  );
}
