import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Package, Receipt, Users, Trophy, Layers, Download, Target } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { KpiCard, ComparisonIndicator, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { StoreRow, StoreLeaderboard } from "@/components/dashboard/StoreLeaderboard";
import { CollectionBadge } from "@/components/dashboard/CollectionBadge";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { fmtMillones as fmtMonto, fmtNum, fmtPct, fmtFecha, tituloNombre } from "@/lib/mayoristas-format";
import type { Semaforo } from "@/lib/mayoristas-format";
import { exportToXLS } from "@/lib/xls-export";
import { TablaCard, TablaTh, VendedoraSelect } from "@/components/mayoristas/MayoristasOrdenes";
import { cn } from "@/lib/utils";

const TXT: Record<Semaforo, string> = { verde: "text-success", ambar: "text-warning", rojo: "text-danger", neutro: "text-muted-foreground" };

const COMP_COLORS = [
  "hsl(220,70%,55%)", "hsl(160,55%,45%)", "hsl(330,65%,55%)",
  "hsl(38,85%,55%)", "hsl(260,60%,55%)", "hsl(0,65%,55%)",
  "hsl(190,60%,45%)", "hsl(280,50%,55%)", "hsl(45,80%,50%)", "hsl(300,40%,60%)",
  "hsl(220,10%,65%)",
];

interface CanalRow {
  venta: number; unidades: number; facturas: number; clientes: number; ticket: number;
  meta: number | null; meta_a_la_fecha: number | null; cumplimiento: number | null; cumplimiento_a_la_fecha: number | null;
  venta_ant: number | null; var_ant: number | null; venta_aa: number | null; var_aa: number | null; facturas_anuladas: number;
}
interface VendedoraRow extends Omit<CanalRow, "facturas_anuladas"> {
  vendedor_id: string | null; vendedora: string; clientes_nuevos: number; clientes_perdidos: number; participacion: number | null;
}
interface IndicadoresRow {
  upt: number; upt_ant: number | null;
  precio_promedio: number; precio_promedio_ant: number | null;
  margen_pct: number; margen_pct_ant: number | null;
  descuento_comercial_pct: number; descuento_comercial_pct_ant: number | null;
  concentracion_top3_pct: number;
}
interface ComposicionRow {
  grupo: string; orden: number | null; venta: number; unidades: number;
  pct_venta: number; pct_unidades: number; margen_pct: number | null;
}
interface TopProductoRow {
  producto_id: number; producto: string; coleccion: string | null; linea: string | null; image_url: string | null;
  unidades: number; venta: number; pct_venta: number; clientes: number;
  precio_mayorista: number; precio_retail_sin_iva: number;
  descuento_comercial_pct: number; margen_pct: number; stock_reserva_distribuidores: number;
  semanas_vida: number | null;
}
interface ClienteRow {
  cliente_id: string; cliente: string; vendedora: string; estado: string;
  unidades: number; venta: number; participacion: number;
  facturas: number; ultima_compra: string | null; dias_sin_compra: number | null;
}
interface PendienteRow {
  orden: string; fecha: string; dias: number; estado: string; cliente: string; vendedora: string;
  unidades_pendientes: number; valor_pendiente: number; unidades_pedidas: number; valor_pedido: number;
}
interface FacturaRow {
  factura: string; fecha: string; cliente: string; punto_entrega: string | null;
  vendedora: string; unidades: number; valor: number; estado: string;
}
interface CompDetalleRow {
  cliente_id: string; cliente: string; vendedora: string;
  venta: number; unidades: number; facturas: number; pct_grupo: number | null;
}
interface CarteraDetalleRow {
  tranid: string; fecha: string; vencimiento: string; total: number; saldo: number; dias_vencido: number; tramo: string;
}

type Dimension = "coleccion" | "linea" | "genero";
const DIMENSIONES: { id: Dimension; label: string }[] = [
  { id: "coleccion", label: "Por Colección" },
  { id: "linea", label: "Por Línea" },
];

interface RecenciaRow { tramo: string; orden: number; clientes: number; venta_12m: number; pct_venta_12m: number | null }
const TRAMO_BG: Record<string, string> = {
  Activo: "bg-success",
  "Sin pedido 60 días": "bg-warning/50",
  "Sin pedido 90 días": "bg-warning",
  "Sin pedido 120 días": "bg-[color:color-mix(in_srgb,hsl(var(--warning)),hsl(var(--danger)))]",
  Perdido: "bg-danger",
};

function MetaCard({ c, pendValor, pendCount, pendError, pendLoading, mostrarAnuladas, onVerOrdenes }: {
  c: CanalRow; pendValor: number; pendCount: number; pendError: unknown; pendLoading: boolean; mostrarAnuladas: boolean; onVerOrdenes: () => void;
}) {
  const venta = Number(c.venta);
  const meta = c.meta == null ? 0 : Number(c.meta);
  const pend = pendError ? 0 : pendValor;
  const proy = venta + pend;
  const base = Math.max(meta, proy, 1);
  const wFact = (venta / base) * 100;
  const wPend = (pend / base) * 100;
  const pctMeta = (v: number) => (meta > 0 ? fmtPct((v / meta) * 100) : "sin meta");
  const esperado = meta > 0 && c.meta_a_la_fecha != null ? Math.min((Number(c.meta_a_la_fecha) / base) * 100, 100) : null;
  const cifra = (label: string, valor: React.ReactNode, detalle: React.ReactNode) => (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-foreground whitespace-nowrap">{valor}</p>
      <p className="text-xs text-muted-foreground whitespace-nowrap">{detalle}</p>
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-4 min-w-0">
      <div className="flex items-start gap-2 mb-4">
        <Target className="h-4 w-4 text-primary mt-0.5" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Meta del mes</h3>
          <p className="text-xs text-muted-foreground">{meta > 0 ? `Meta ${fmtMonto(meta)}` : "Sin meta"}</p>
        </div>
        <button type="button" onClick={onVerOrdenes} className="ml-auto text-xs text-primary font-medium hover:underline whitespace-nowrap">Ver órdenes →</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {cifra("Facturado", fmtMonto(venta), `(${pctMeta(venta)})`)}
        {cifra("Por facturar", pendError ? <span className="text-destructive text-base">No disponible</span> : pendLoading ? "…" : fmtMonto(pend), pendError || pendLoading ? "" : `(${fmtNum(pendCount)} órdenes)`)}
        {cifra("Proyección", pendLoading ? "…" : fmtMonto(proy), `(${pctMeta(proy)})`)}
      </div>
      <div className="relative pt-5">
        {esperado != null && <div className="absolute top-0 text-[10px] text-muted-foreground whitespace-nowrap -translate-x-1/2" style={{ left: `clamp(2.5rem, ${esperado}%, calc(100% - 2.5rem))` }}>Esperado a hoy</div>}
        <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
          <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${wFact}%` }} />
          <div className="absolute inset-y-0 bg-primary/30" style={{ left: `${wFact}%`, width: `${wPend}%` }} />
          {esperado != null && <div className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `calc(${esperado}% - 1px)` }} />}
        </div>
      </div>
      {mostrarAnuladas && Number(c.facturas_anuladas) > 0 && <p className="mt-2 text-xs text-muted-foreground">{fmtNum(c.facturas_anuladas)} factura(s) anulada(s) excluidas</p>}
      {pendError ? <div className="mt-2"><ConsultaError error={pendError} /></div> : null}
    </div>
  );
}

type Drill =
  | { tipo: "facturas" }
  | { tipo: "clientes" }
  | { tipo: "ventas" }
  | { tipo: "unidades" }
  | { tipo: "pendientes" }
  | { tipo: "composicion"; dimension: Dimension; grupo: string; label: string }
  | { tipo: "cliente"; clienteId: string; nombre: string };

function stockSemaforo(stock: number): Semaforo {
  if (stock < 10) return "rojo";
  if (stock < 50) return "ambar";
  return "neutro";
}

/** Agrupa líneas: top 8 por venta + "Otras" con la suma del resto (presentación). */
function agruparLineas(rows: ComposicionRow[]): ComposicionRow[] {
  if (rows.length <= 8) return rows;
  const top = rows.slice(0, 8);
  const resto = rows.slice(8);
  const otras: ComposicionRow = {
    grupo: "Otras", orden: null,
    venta: resto.reduce((s, r) => s + Number(r.venta), 0),
    unidades: resto.reduce((s, r) => s + Number(r.unidades), 0),
    pct_venta: resto.reduce((s, r) => s + Number(r.pct_venta), 0),
    pct_unidades: resto.reduce((s, r) => s + Number(r.pct_unidades), 0),
    margen_pct: null,
  };
  return [...top, otras];
}

export function ConsultaError({ error }: { error: unknown }) {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
  return <p role="alert" className="text-destructive break-words">{message}</p>;
}

function DrillShell({ title, subtitle, onExport, onClose, children }: {
  title: string; subtitle?: string; onExport?: () => void; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
        </SheetHeader>
        {onExport ? (
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={onExport}><Download className="h-4 w-4 mr-2" />Exportar Excel</Button>
          </div>
        ) : null}
        <div className="mt-4 min-w-0">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function useFacturas(desde: string | null, hasta: string | null, vendedor: string | null, cliente: string | null) {
  return useQuery({
    retry: false,
    queryKey: ["mayoristas-facturas", desde, hasta, vendedor, cliente],
    enabled: !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_facturas" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor, p_cliente: cliente } as never);
      if (error) throw error;
      return (data as unknown as FacturaRow[]) ?? [];
    },
  });
}

function facturasExcel(rows: FacturaRow[]) {
  return rows.map(r => ({
    Factura: r.factura, Fecha: fmtFecha(r.fecha), Cliente: r.cliente,
    "Punto de entrega": r.punto_entrega ?? "", Asesora: tituloNombre(r.vendedora),
    Unidades: Number(r.unidades), Valor: Number(r.valor), Estado: r.estado,
  }));
}

function FacturasDetalle({ desde, hasta, vendedor, cliente }: { desde: string | null; hasta: string | null; vendedor: string | null; cliente: string | null }) {
  const q = useFacturas(desde, hasta, vendedor, cliente);
  if (q.error) return <ConsultaError error={q.error} />;
  if (q.isLoading) return <LoadingState />;
  const rows = q.data ?? [];
  if (!rows.length) return <EmptyState message="Sin facturas para el periodo." />;
  return (
    <TablaCard title={`Facturas (${fmtNum(rows.length)})`} minW={900}>
      <TablaTh cols={["Factura", "Fecha", "Cliente", "Punto de entrega", "Asesora", "Unidades", "Valor", "Estado"]} />
      <tbody>{rows.map(r => (
        <tr key={r.factura} className="border-b border-border last:border-0">
          <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">{r.factura}</td>
          <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
          <td className="px-3 py-2.5">{r.cliente}</td>
          <td className="px-3 py-2.5">{r.punto_entrega ?? "—"}</td>
          <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
          <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
          <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.valor)}</td>
          <td className="px-3 py-2.5">{r.estado}</td>
        </tr>
      ))}</tbody>
    </TablaCard>
  );
}

function FacturasSheet({ desde, hasta, vendedor, onClose }: { desde: string | null; hasta: string | null; vendedor: string | null; onClose: () => void }) {
  const q = useFacturas(desde, hasta, vendedor, null);
  return (
    <DrillShell title="Facturas del periodo" subtitle="Venta neta sin IVA · fuente: facturas NetSuite" onClose={onClose}
      onExport={q.data?.length ? () => exportToXLS(facturasExcel(q.data!), `mayoristas-facturas-${desde}-${hasta}`) : undefined}>
      <FacturasDetalle desde={desde} hasta={hasta} vendedor={vendedor} cliente={null} />
    </DrillShell>
  );
}

function useClientes(desde: string | null, hasta: string | null, vendedor: string | null) {
  return useQuery({
    retry: false,
    queryKey: ["mayoristas-clientes", desde, hasta, vendedor],
    enabled: !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_clientes" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as ClienteRow[]) ?? [];
    },
  });
}

function clientesExcel(rows: ClienteRow[]) {
  return rows.map(r => ({
    Cliente: r.cliente, Asesora: tituloNombre(r.vendedora), Venta: Number(r.venta),
    Unidades: Number(r.unidades), Facturas: Number(r.facturas), "Última compra": fmtFecha(r.ultima_compra),
  }));
}

function ClientesSheet({ desde, hasta, vendedor, orden, onClose }: { desde: string | null; hasta: string | null; vendedor: string | null; orden: "estado" | "venta"; onClose: () => void }) {
  const q = useClientes(desde, hasta, vendedor);
  const rows = [...(q.data ?? [])].sort((a, b) => Number(b.venta) - Number(a.venta));
  return (
    <DrillShell title={orden === "venta" ? "Ventas netas por cliente" : "Clientes activos"} subtitle="Venta neta sin IVA · fuente: facturas NetSuite" onClose={onClose}
      onExport={rows.length ? () => exportToXLS(clientesExcel(rows), `mayoristas-clientes-${desde}-${hasta}`) : undefined}>
      {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : !rows.length ? <EmptyState message="Sin clientes para el periodo." /> : (
        <TablaCard title={`Clientes (${fmtNum(rows.length)})`} minW={850}>
          <TablaTh cols={["Cliente", "Asesora", "Venta", "Unidades", "Facturas", "Última compra"]} />
          <tbody>{rows.map(r => (
            <tr key={r.cliente_id} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium text-foreground">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.venta)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.facturas)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.ultima_compra)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}
    </DrillShell>
  );
}

function UnidadesSheet({ desde, hasta, vendedor, onClose }: { desde: string | null; hasta: string | null; vendedor: string | null; onClose: () => void }) {
  const q = useQuery({
    retry: false,
    queryKey: ["mayoristas-top-productos", desde, hasta, vendedor, 200],
    enabled: !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_top_productos" as never, { p_desde: desde, p_hasta: hasta, p_limite: 200, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as TopProductoRow[]) ?? [];
    },
  });
  const rows = q.data ?? [];
  return (
    <DrillShell title="Unidades vendidas por producto" subtitle="Top 200 productos del periodo" onClose={onClose}
      onExport={rows.length ? () => exportToXLS(rows.map(p => ({
        Producto: p.producto, Colección: p.coleccion ?? "", Línea: p.linea ?? "",
        Unidades: Number(p.unidades), Venta: Number(p.venta), Clientes: Number(p.clientes),
      })), `mayoristas-unidades-${desde}-${hasta}`) : undefined}>
      {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : !rows.length ? <EmptyState message="Sin productos para el periodo." /> : (
        <TablaCard title={`Productos (${fmtNum(rows.length)})`} minW={800}>
          <TablaTh cols={["Producto", "Colección", "Línea", "Unidades", "Venta", "Clientes"]} />
          <tbody>{rows.map(p => (
            <tr key={String(p.producto_id)} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium text-foreground">{p.producto}</td>
              <td className="px-3 py-2.5">{p.coleccion ?? "—"}</td>
              <td className="px-3 py-2.5">{p.linea ?? "—"}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(p.unidades)}</td>
              <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(p.venta)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(p.clientes)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}
    </DrillShell>
  );
}

function ComposicionSheet({ desde, hasta, vendedor, dimension, grupo, label, onCliente, onClose }: {
  desde: string | null; hasta: string | null; vendedor: string | null;
  dimension: Dimension; grupo: string; label: string;
  onCliente: (clienteId: string, nombre: string) => void; onClose: () => void;
}) {
  const q = useQuery({
    retry: false,
    queryKey: ["mayoristas-composicion-detalle", desde, hasta, vendedor, dimension, grupo],
    enabled: !!desde && !!hasta && desde <= hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_composicion_detalle" as never, { p_desde: desde, p_hasta: hasta, p_dimension: dimension, p_grupo: grupo, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as CompDetalleRow[]) ?? [];
    },
  });
  const rows = q.data ?? [];
  return (
    <DrillShell title={`${label}: ${grupo}`} subtitle="Clientes del segmento · clic para ver sus facturas" onClose={onClose}
      onExport={rows.length ? () => exportToXLS(rows.map(r => ({
        Cliente: r.cliente, Asesora: tituloNombre(r.vendedora), Venta: Number(r.venta),
        Unidades: Number(r.unidades), Facturas: Number(r.facturas),
      })), `mayoristas-${dimension}-${grupo}-${desde}-${hasta}`) : undefined}>
      {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : !rows.length ? <EmptyState message="Sin clientes para este segmento." /> : (
        <TablaCard title={`Clientes (${fmtNum(rows.length)})`} minW={750}>
          <TablaTh cols={["Cliente", "Asesora", "Venta", "Unidades", "Facturas"]} />
          <tbody>{rows.map(r => (
            <tr key={r.cliente_id} onClick={() => onCliente(r.cliente_id, r.cliente)} className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40">
              <td className="px-3 py-2.5 font-medium text-primary">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.venta)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.facturas)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}
    </DrillShell>
  );
}

function ClienteSheet({ desde, hasta, vendedor, clienteId, nombre, onClose }: {
  desde: string | null; hasta: string | null; vendedor: string | null;
  clienteId: string; nombre: string; onClose: () => void;
}) {
  const facturasQ = useFacturas(desde, hasta, vendedor, clienteId);
  const carteraQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-cartera-detalle", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_cartera_detalle" as never, { p_cliente: clienteId } as never);
      if (error) throw error;
      return (data as unknown as CarteraDetalleRow[]) ?? [];
    },
  });
  const cartera = carteraQ.data ?? [];
  const saldo = cartera.reduce((s, r) => s + Number(r.saldo), 0);
  return (
    <DrillShell title={nombre} subtitle="Facturas del periodo y saldo de cartera" onClose={onClose}
      onExport={facturasQ.data?.length ? () => exportToXLS(facturasExcel(facturasQ.data!), `mayoristas-facturas-${nombre}-${desde}-${hasta}`) : undefined}>
      <div className="space-y-5">
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-2">Saldo de cartera · {fmtMonto(saldo)}</h4>
          {carteraQ.error ? <ConsultaError error={carteraQ.error} /> : carteraQ.isLoading ? <LoadingState /> : !cartera.length ? <p className="text-xs text-muted-foreground">Sin facturas con saldo.</p> : (
            <TablaCard title="Cartera" minW={700}>
              <TablaTh cols={["Factura", "Vencimiento", "Total", "Saldo", "Días vencido", "Tramo"]} />
              <tbody>{cartera.map((r, i) => (
                <tr key={`${r.tranid}-${i}`} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-medium whitespace-nowrap">{r.tranid}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.vencimiento)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.total)}</td>
                  <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.saldo)}</td>
                  <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.dias_vencido)}</td>
                  <td className="px-3 py-2.5">{r.tramo}</td>
                </tr>
              ))}</tbody>
            </TablaCard>
          )}
        </section>
        <section>
          <h4 className="text-sm font-semibold text-foreground mb-2">Facturas del periodo</h4>
          <FacturasDetalle desde={desde} hasta={hasta} vendedor={vendedor} cliente={clienteId} />
        </section>
      </div>
    </DrillShell>
  );
}

function usePendientes(vendedor: string | null) {
  return useQuery({
    retry: false,
    queryKey: ["mayoristas-ordenes-pendientes", vendedor],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_ordenes_pendientes" as never, { p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as PendienteRow[]) ?? [];
    },
  });
}

function PendientesSheet({ vendedor, onClose }: { vendedor: string | null; onClose: () => void }) {
  const q = usePendientes(vendedor);
  const rows = q.data ?? [];
  return (
    <DrillShell title="Pedidos por facturar" subtitle="Órdenes abiertas con unidades pendientes" onClose={onClose}
      onExport={rows.length ? () => exportToXLS(rows.map(r => ({
        Orden: r.orden, Fecha: fmtFecha(r.fecha), Días: Number(r.dias), Estado: r.estado, Cliente: r.cliente,
        Asesora: tituloNombre(r.vendedora), "Unidades pendientes": Number(r.unidades_pendientes), "Valor pendiente": Number(r.valor_pendiente),
      })), "mayoristas-pedidos-por-facturar") : undefined}>
      {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : !rows.length ? <EmptyState message="Sin pedidos por facturar." /> : (
        <TablaCard title={`Órdenes (${fmtNum(rows.length)})`} minW={900}>
          <TablaTh cols={["Orden", "Fecha", "Días", "Estado", "Cliente", "Asesora", "Uds pendientes", "Valor pendiente"]} />
          <tbody>{rows.map(r => (
            <tr key={r.orden} className={cn("border-b border-border last:border-0", Number(r.dias) > 15 && "bg-warning/10")}>
              <td className="px-3 py-2.5 font-medium text-foreground whitespace-nowrap">{r.orden}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
              <td className={cn("px-3 py-2.5 tabular-nums", Number(r.dias) > 15 && "font-medium text-warning")}>{fmtNum(r.dias)}</td>
              <td className="px-3 py-2.5">{r.estado}</td>
              <td className="px-3 py-2.5">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades_pendientes)}</td>
              <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.valor_pendiente)}</td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}
    </DrillShell>
  );
}

function ComposicionCard({ desde, hasta, vendedor, dimension, label, onSelect }: {
  desde: string | null; hasta: string | null; vendedor: string | null;
  dimension: Dimension; label: string; onSelect: (grupo: string) => void;
}) {
  const [modo, setModo] = useState<"unidades" | "valor">("unidades");
  const compQ = useQuery({
    queryKey: ["mayoristas-composicion", desde, hasta, vendedor, dimension],
    enabled: !!desde && !!hasta && desde <= hasta,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_composicion" as never, { p_desde: desde, p_hasta: hasta, p_dimension: dimension, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as ComposicionRow[]) ?? [];
    },
  });
  const rows = dimension === "linea" ? agruparLineas(compQ.data ?? []) : (compQ.data ?? []);
  if (compQ.error) return <ConsultaError error={compQ.error} />;
  if (compQ.isLoading) return <LoadingState />;
  if (!rows.length) return <EmptyState message={`${label} · Sin datos para el periodo.`} />;
  const items = rows.map(r => ({
    name: r.grupo,
    value: modo === "unidades" ? Number(r.unidades) : Number(r.venta),
    pct: modo === "unidades" ? Number(r.pct_unidades) : Number(r.pct_venta),
    uds: Number(r.unidades),
    venta: Number(r.venta),
  }));
  const total = items.reduce((s, r) => s + r.value, 0);
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <div className="ml-auto flex items-center rounded-lg border border-border overflow-hidden">
          {(["unidades", "valor"] as const).map(m => (
            <button key={m} type="button" onClick={() => setModo(m)}
              className={`px-2.5 py-1 text-xs font-medium transition-colors ${modo === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "unidades" ? "Unidades" : "Valor"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col items-start gap-4">
        <ResponsiveContainer width={140} height={140} className="shrink-0">
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
              {items.map((r, i) => (
                <Cell key={r.name} fill={COMP_COLORS[i % COMP_COLORS.length]} className="cursor-pointer" onClick={() => onSelect(r.name)} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, name: string) => [modo === "unidades" ? `${v.toLocaleString("es-CO")} uds` : fmtMonto(v), name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-0.5 max-h-[280px] overflow-y-auto w-full">
          {items.map((r, i) => (
            <button key={r.name} type="button" onClick={() => onSelect(r.name)}
              className="flex items-center justify-between text-xs gap-2 w-full py-1.5 px-1 rounded transition-colors hover:bg-muted/40 cursor-pointer">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COMP_COLORS[i % COMP_COLORS.length] }} />
                <span className="text-foreground font-medium truncate max-w-[140px]">{r.name}</span>
              </div>
              <span className="text-muted-foreground shrink-0 whitespace-nowrap">
                {fmtNum(r.uds)} uds · {fmtMonto(r.venta)} · <span className="text-foreground font-mono font-semibold">{r.pct.toFixed(1)}%</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{modo === "unidades" ? `${total.toLocaleString("es-CO")} uds totales` : `${fmtMonto(total)} en venta`}</p>
      </div>
    </div>
  );
}

export function MayoristasPanel({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [vendedor, setVendedor] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(null);
  const navigate = useNavigate();
  const canalQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-canal", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_canal" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return ((data as unknown as CanalRow[]) ?? [])[0] ?? null;
    },
  });
  const vendQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-vendedora", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_vendedora" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return [...((data as unknown as VendedoraRow[]) ?? [])].sort((a, b) => Number(b.venta) - Number(a.venta));
    },
  });
  const indQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-indicadores", desde, hasta, vendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_indicadores" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return ((data as unknown as IndicadoresRow[]) ?? [])[0] ?? null;
    },
  });
  const topProdQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-top-productos", desde, hasta, vendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_top_productos" as never, { p_desde: desde, p_hasta: hasta, p_limite: 20, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as TopProductoRow[]) ?? [];
    },
  });
  const clientesQ = useClientes(desde, hasta, vendedor);
  const pendQ = usePendientes(vendedor);
  const recenciaQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-recencia", hasta, vendedor],
    enabled: !!hasta,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_recencia" as never, { p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return ((data as unknown as RecenciaRow[]) ?? []).slice().sort((a, b) => Number(a.orden) - Number(b.orden));
    },
  });

  const selRow = vendedor ? (vendQ.data ?? []).find(v => String(v.vendedor_id) === vendedor) ?? null : null;
  const c: CanalRow | null = vendedor ? (selRow ? { ...selRow, facturas_anuladas: 0 } : null) : canalQ.data;
  const cError = vendedor ? vendQ.error : canalQ.error;
  const cLoading = vendedor ? vendQ.isLoading : canalQ.isLoading;
  const ind = indQ.data;
  const topClientes = [...(clientesQ.data ?? [])].filter(r => Number(r.venta) > 0).sort((a, b) => Number(b.venta) - Number(a.venta)).slice(0, 10);
  const topProductos = (topProdQ.data ?? []).slice(0, 10);
  const sellers = vendQ.data ?? [];
  const pendientes = pendQ.data ?? [];
  const pendValor = pendientes.reduce((s, r) => s + Number(r.valor_pendiente), 0);
  const recencia = recenciaQ.data ?? [];
  const totalRecencia = recencia.reduce((s, r) => s + Math.max(Number(r.venta_12m), 0), 0);
  const verClientes = `/mayoristas?tab=clientes${vendedor ? `&vendedor=${encodeURIComponent(vendedor)}` : ""}`;
  return (
    <div className="space-y-4 min-w-0">
      <div className="glass-card p-5 min-w-0">
        <CommercialSectionHeader title="📊 DESEMPEÑO COMERCIAL MAYORISTAS">
          <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={setVendedor} />
        </CommercialSectionHeader>
        <p className="text-xs text-muted-foreground mb-4">Venta neta sin IVA · fuente: facturas NetSuite</p>
        {cError ? <ConsultaError error={cError} /> : cLoading ? <LoadingState /> : c ? <>
          <MetaCard c={c} pendValor={pendValor} pendCount={pendientes.length} pendError={pendQ.error} pendLoading={pendQ.isLoading} mostrarAnuladas={!vendedor} onVerOrdenes={() => setDrill({ tipo: "pendientes" })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
            <KpiCard label="Ventas Netas" value={fmtMonto(c.venta)} icon={DollarSign} onClick={() => setDrill({ tipo: "facturas" })}>
              {c.var_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(c.var_ant)} label="vs ant." />}
              <p className="text-xs text-primary mt-1">Ver facturas</p>
            </KpiCard>
            <KpiCard label="Unidades vendidas" value={fmtNum(c.unidades)} icon={Package} onClick={() => setDrill({ tipo: "unidades" })}>
              <p className="text-xs text-primary mt-1">Ver productos</p>
            </KpiCard>
            <KpiCard label="Clientes activos" value={fmtNum(c.clientes)} icon={Users} onClick={() => setDrill({ tipo: "clientes" })}>
              <p className="text-xs text-primary mt-1">Ver clientes</p>
            </KpiCard>
            <KpiCard label="Ticket promedio" value={fmtMonto(c.ticket)} icon={Receipt} />
          </div>
        </> : <EmptyState message="Sin datos para el periodo." />}
        {indQ.error ? <div className="mt-3"><ConsultaError error={indQ.error} /></div> : indQ.isLoading ? null : ind && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Calidad de la venta</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Precio promedio", value: fmtMonto(ind.precio_promedio), cmp: ind.precio_promedio_ant != null && Number(ind.precio_promedio_ant) > 0 && <ComparisonIndicator actual={0} anterior={0} percentage={((Number(ind.precio_promedio) - Number(ind.precio_promedio_ant)) / Number(ind.precio_promedio_ant)) * 100} label="vs ant." /> },
                { label: "Margen bruto", value: fmtPct(ind.margen_pct), cmp: ind.margen_pct_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(ind.margen_pct) - Number(ind.margen_pct_ant)} points label="vs ant." /> },
                { label: "Descuento comercial", value: fmtPct(ind.descuento_comercial_pct), cmp: ind.descuento_comercial_pct_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(ind.descuento_comercial_pct) - Number(ind.descuento_comercial_pct_ant)} points invert label="vs ant." /> },
              ].map(k => (
                <div key={k.label} className="min-w-0">
                  <p className="text-xs text-muted-foreground whitespace-nowrap truncate">{k.label}</p>
                  <p className="text-base font-semibold text-foreground tabular-nums whitespace-nowrap">{k.value}</p>
                  <div className="whitespace-nowrap">{k.cmp}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {vendQ.error ? <ConsultaError error={vendQ.error} /> : vendQ.isLoading ? <LoadingState /> : <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border"><Trophy className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Asesoras comerciales</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-muted/30">{["#", "Asesora", "Ventas Netas", "Uds", "Ticket Prom", "Facturas", "Clientes", "% canal", "Variación", "Cumplimiento"].map(col => <th key={col} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{col}</th>)}</tr></thead>
          <tbody>{sellers.map((v, i) => <StoreRow key={v.vendedor_id ?? v.vendedora} rank={i} medals={false} selected={vendedor != null && String(v.vendedor_id) === vendedor} onClick={v.vendedor_id && v.vendedor_id !== "(sin)" && v.vendedora !== "(Sin vendedora)" ? () => navigate(`/mayoristas?tab=clientes&vendedor=${encodeURIComponent(String(v.vendedor_id))}${desde && hasta ? `&desde=${desde}&hasta=${hasta}` : ""}`) : undefined} presupuesto={v.meta == null ? undefined : Number(v.meta)} porcentaje={v.cumplimiento} row={{ tienda: tituloNombre(v.vendedora), ventas_totales: Number(v.venta), unidades_vendidas: Number(v.unidades), ticket_promedio: Number(v.ticket), upt: 0, pct_venta_full_price: 0, zona: "" }} extraCells={[
            fmtNum(v.facturas),
            <div>{fmtNum(v.clientes)}{Number(v.clientes_nuevos) > 0 && <p className="text-xs text-success">+{fmtNum(v.clientes_nuevos)} nuevos</p>}{Number(v.clientes_perdidos) > 0 && <p className="text-xs text-danger">−{fmtNum(v.clientes_perdidos)} perdidos</p>}</div>,
            fmtPct(v.participacion),
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">{v.var_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(v.var_ant)} label="vs ant." />}<span className="text-xs text-muted-foreground">A la fecha: {fmtPct(v.cumplimiento_a_la_fecha)}</span></div>,
          ]} />)}</tbody>
        </table></div>
      </div>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Composición de la venta</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{DIMENSIONES.map(d => <ComposicionCard key={d.id} desde={desde} hasta={hasta} vendedor={vendedor} dimension={d.id} label={d.label} onSelect={(grupo) => setDrill({ tipo: "composicion", dimension: d.id, grupo, label: d.label })} />)}</div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        <div className="min-w-0 space-y-2">
          {clientesQ.error ? <div className="glass-card p-4"><ConsultaError error={clientesQ.error} /></div> : clientesQ.isLoading ? <LoadingState /> : <>
            <StoreLeaderboard days={0} supplied={{
              title: "Top clientes del período",
              columns: ["Cliente", "Venta", "% canal"],
              rows: topClientes.map(r => ({
                id: String(r.cliente_id), name: r.cliente, value: fmtMonto(r.venta),
                detail: <p className="text-xs text-muted-foreground truncate">{tituloNombre(r.vendedora)} · {fmtPct(r.participacion)}</p>,
                cells: [fmtMonto(r.venta), fmtPct(r.participacion)],
                onClick: () => setDrill({ tipo: "cliente", clienteId: String(r.cliente_id), nombre: r.cliente }),
              })),
            }} />
            {topClientes.length > 0 && topClientes.length < 3 && <p className="text-xs text-muted-foreground px-1">Solo {topClientes.length} cliente{topClientes.length === 1 ? "" : "s"} han comprado en el período</p>}
          </>}
        </div>
        <div className="glass-card p-5 min-w-0">
          <div className="flex items-center gap-2 mb-4"><Users className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Estado de la base de clientes</h3></div>
          {recenciaQ.error ? <ConsultaError error={recenciaQ.error} /> : recenciaQ.isLoading ? <LoadingState /> : !recencia.length ? <EmptyState message="Sin datos de clientes." /> : <>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted mb-4">
              {recencia.map(r => totalRecencia > 0 && Number(r.venta_12m) > 0 && <div key={r.tramo} className={TRAMO_BG[r.tramo] ?? "bg-muted-foreground"} style={{ width: `${(Number(r.venta_12m) / totalRecencia) * 100}%` }} title={`${r.tramo}: ${fmtMonto(r.venta_12m)}`} />)}
            </div>
            <ul className="space-y-2">{recencia.map(r => (
              <li key={r.tramo} className="flex items-center gap-2 text-xs">
                <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", TRAMO_BG[r.tramo] ?? "bg-muted-foreground")} />
                <span className="text-foreground font-medium flex-1 min-w-0 truncate">{r.tramo}</span>
                <span className="font-semibold tabular-nums w-10 text-right">{fmtNum(r.clientes)}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">{fmtMonto(r.venta_12m)} · {fmtPct(r.pct_venta_12m)}</span>
              </li>
            ))}</ul>
            <p className="text-[11px] text-muted-foreground mt-3">Venta de los últimos 12 meses de cada tramo y su % del total.</p>
          </>}
          <button type="button" onClick={() => navigate(verClientes)} className="text-xs text-primary font-medium mt-3 hover:underline">Ver clientes →</button>
        </div>
      </div>

      <div className="glass-card overflow-hidden min-w-0">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border"><Package className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Top 10 productos</h3></div>
        {topProdQ.error ? <div className="p-4"><ConsultaError error={topProdQ.error} /></div> : topProdQ.isLoading ? <LoadingState /> : !topProductos.length ? <EmptyState message="Sin productos en el periodo." /> : (
          <table className="w-full table-fixed text-sm">
            <thead><tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground"><th className="px-3 py-2 text-left font-medium w-[38%]">Producto</th><th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Colección</th><th className="px-3 py-2 text-right font-medium">Uds</th><th className="px-3 py-2 text-right font-medium">Venta</th><th className="px-3 py-2 text-right font-medium hidden sm:table-cell">Clientes</th><th className="px-3 py-2 text-right font-medium">Stock Reserva</th></tr></thead>
            <tbody>{topProductos.map(p => (
              <tr key={p.producto_id} className="border-b border-border last:border-0">
                <td className="px-3 py-2"><div className="flex items-center gap-2 min-w-0">
                  {p.image_url ? <ProductImageThumb src={p.image_url} alt={p.producto} productId={String(p.producto_id)} title={p.producto} className="w-9 h-9 rounded-md object-cover bg-muted shrink-0" /> : <div className="w-9 h-9 rounded-md bg-muted/50 shrink-0" />}
                  <div className="min-w-0"><p className="font-medium text-foreground truncate" title={p.producto}>{p.producto}</p><p className="text-xs text-muted-foreground truncate">{p.linea ?? "—"}</p></div>
                </div></td>
                <td className="px-3 py-2 hidden sm:table-cell"><CollectionBadge coleccion={p.coleccion} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(p.unidades)}</td>
                <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtMonto(p.venta)}</td>
                <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{fmtNum(p.clientes)}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums", TXT[stockSemaforo(Number(p.stock_reserva_distribuidores))])}>{fmtNum(p.stock_reserva_distribuidores)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {drill?.tipo === "facturas" && <FacturasSheet desde={desde} hasta={hasta} vendedor={vendedor} onClose={() => setDrill(null)} />}
      {(drill?.tipo === "clientes" || drill?.tipo === "ventas") && <ClientesSheet desde={desde} hasta={hasta} vendedor={vendedor} orden={drill.tipo === "ventas" ? "venta" : "estado"} onClose={() => setDrill(null)} />}
      {drill?.tipo === "unidades" && <UnidadesSheet desde={desde} hasta={hasta} vendedor={vendedor} onClose={() => setDrill(null)} />}
      {drill?.tipo === "pendientes" && <PendientesSheet vendedor={vendedor} onClose={() => setDrill(null)} />}
      {drill?.tipo === "composicion" && <ComposicionSheet desde={desde} hasta={hasta} vendedor={vendedor} dimension={drill.dimension} grupo={drill.grupo} label={drill.label} onCliente={(clienteId, nombre) => setDrill({ tipo: "cliente", clienteId, nombre })} onClose={() => setDrill(null)} />}
      {drill?.tipo === "cliente" && <ClienteSheet desde={desde} hasta={hasta} vendedor={vendedor} clienteId={drill.clienteId} nombre={drill.nombre} onClose={() => setDrill(null)} />}
    </div>
  );
}
