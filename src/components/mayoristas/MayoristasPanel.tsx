import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Package, Receipt, Users, ShoppingBag, Banknote, Percent, Trophy, Clock, Layers, Download, Wallet, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { KpiCard, ComparisonIndicator, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { CumplimientoPresupuestoCard } from "@/components/dashboard/CumplimientoPresupuestoCard";
import { ProductTable } from "@/components/dashboard/ExecutiveDashboard";
import { StoreRow, StoreLeaderboard } from "@/components/dashboard/StoreLeaderboard";
import { CollectionBadge } from "@/components/dashboard/CollectionBadge";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtPct, fmtFecha, tituloNombre } from "@/lib/mayoristas-format";
import type { Semaforo } from "@/lib/mayoristas-format";
import { exportToXLS } from "@/lib/xls-export";
import { TablaCard, TablaTh, VendedoraSelect } from "@/components/mayoristas/MayoristasOrdenes";
import type { CarteraRow } from "@/lib/mayoristas-cartera";
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
  { id: "genero", label: "Por Género" },
];

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
  const carteraQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-cartera", vendedor],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_cartera" as never, { p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as CarteraRow[]) ?? [];
    },
  });
  const recaudoQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-recaudo", desde, hasta, vendedor],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_recaudo" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor } as never);
      if (error) throw error;
      return (data as unknown as { recaudo: number }[]) ?? [];
    },
  });

  const selRow = vendedor ? (vendQ.data ?? []).find(v => String(v.vendedor_id) === vendedor) ?? null : null;
  const c: CanalRow | null = vendedor ? (selRow ? { ...selRow, facturas_anuladas: 0 } : null) : canalQ.data;
  const cError = vendedor ? vendQ.error : canalQ.error;
  const cLoading = vendedor ? vendQ.isLoading : canalQ.isLoading;
  const ind = indQ.data;
  const topClientes = (clientesQ.data ?? []).filter(r => r.estado !== "Perdido").slice(0, 10);
  const sellers = vendQ.data ?? [];
  const pendientes = pendQ.data ?? [];
  const pendValor = pendientes.reduce((s, r) => s + Number(r.valor_pendiente), 0);
  const carteraRows = carteraQ.data ?? [];
  const saldoCartera = carteraRows.reduce((s, r) => s + Number(r.saldo), 0);
  const vencidoCartera = carteraRows.reduce((s, r) => s + Number(r.vencido_total), 0);
  const pctVencido = saldoCartera > 0 ? (vencidoCartera / saldoCartera) * 100 : null;
  const recaudo = (recaudoQ.data ?? []).reduce((s, r) => s + Number(r.recaudo), 0);
  const ventaConIva = c ? Number(c.venta) * 1.19 : 0;
  const pctRecaudoFacturado = ventaConIva > 0 ? (recaudo / ventaConIva) * 100 : null;
  const carteraPorCliente = new Map(carteraRows.map(r => [String(r.cliente_id), r]));
  const riesgo = (clientesQ.data ?? []).map(r => {
    const car = carteraPorCliente.get(String(r.cliente_id));
    const vencido60 = car ? Number(car.vencido_61_90) + Number(car.vencido_90) : 0;
    const sinPedido = r.dias_sin_compra != null && Number(r.dias_sin_compra) > 60;
    const carteraVencida = vencido60 > 0;
    return { ...r, saldo: car ? Number(car.saldo) : 0, vencido60, motivo: sinPedido && carteraVencida ? "Ambos" : sinPedido ? "Sin pedido" : carteraVencida ? "Cartera vencida" : null };
  }).filter(r => r.motivo != null)
    .sort((a, b) => (a.motivo === "Ambos" ? 0 : 1) - (b.motivo === "Ambos" ? 0 : 1) || Number(b.vencido60) - Number(a.vencido60));
  const irACartera = () => navigate(`/mayoristas?tab=cartera${vendedor ? `&vendedor=${encodeURIComponent(vendedor)}` : ""}`);
  return (
    <div className="space-y-4 min-w-0">
      <div className="glass-card p-5">
        <CommercialSectionHeader title="📊 DESEMPEÑO COMERCIAL MAYORISTAS">
          <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={setVendedor} />
        </CommercialSectionHeader>
        <p className="text-xs text-muted-foreground mb-4">Venta neta sin IVA · fuente: facturas NetSuite</p>
        {cError ? <ConsultaError error={cError} /> : cLoading ? <LoadingState /> : c ? <>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <CumplimientoPresupuestoCard desde={desde ?? ""} hasta={hasta ?? ""} channels={[]} venta={Number(c.venta)} universo="Mayoristas" supplied={{ meta: c.meta, porcentaje: c.cumplimiento }} />
              <p className="text-xs text-muted-foreground mt-1">A la fecha: {fmtPct(c.cumplimiento_a_la_fecha)}</p>
              {!vendedor && Number(c.facturas_anuladas) > 0 && <p className="text-xs text-muted-foreground">{fmtNum(c.facturas_anuladas)} factura(s) anulada(s) excluidas</p>}
              {c.meta != null && Number(c.meta) > 0 && !pendQ.error && (
                <p className="text-xs text-muted-foreground mt-1">Facturado + pedidos pendientes = {fmtMonto(Number(c.venta) + pendValor)} ({fmtPct(((Number(c.venta) + pendValor) / Number(c.meta)) * 100)} de la meta)</p>
              )}
            </div>
            {pendQ.error ? <ConsultaError error={pendQ.error} /> : pendQ.isLoading ? <LoadingState /> : (
              <KpiCard label="Pedidos por facturar" value={fmtMonto(pendValor)} icon={Clock} onClick={() => setDrill({ tipo: "pendientes" })}>
                <p className="text-xs text-muted-foreground">{fmtNum(pendientes.length)} órdenes abiertas</p>
                <p className="text-xs text-primary mt-1">Ver detalle</p>
              </KpiCard>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="Ventas Netas" value={fmtMonto(c.venta)} icon={DollarSign} onClick={() => setDrill({ tipo: "ventas" })}>
              {c.var_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(c.var_ant)} label="vs ant." />}
              <p className="text-xs text-primary mt-1">Ver detalle</p>
            </KpiCard>
            <KpiCard label="Unidades vendidas" value={fmtNum(c.unidades)} icon={Package} onClick={() => setDrill({ tipo: "unidades" })}>
              <p className="text-xs text-primary mt-1">Ver detalle</p>
            </KpiCard>
            <KpiCard label="Facturas" value={fmtNum(c.facturas)} icon={Receipt} onClick={() => setDrill({ tipo: "facturas" })}>
              <p className="text-xs text-primary mt-1">Ver detalle</p>
            </KpiCard>
            <KpiCard label="Clientes activos" value={fmtNum(c.clientes)} icon={Users} onClick={() => setDrill({ tipo: "clientes" })}>
              <p className="text-xs text-primary mt-1">Ver detalle</p>
            </KpiCard>
            <KpiCard label="Ticket promedio" value={fmtMonto(c.ticket)} icon={Receipt} />
            {ind && !indQ.error && <>
              <KpiCard label="UPT" value={Number(ind.upt).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} icon={ShoppingBag} actual={Number(ind.upt)} anterior={ind.upt_ant == null ? undefined : Number(ind.upt_ant)} />
              <KpiCard label="Precio promedio" value={fmtMonto(ind.precio_promedio)} icon={Banknote} actual={Number(ind.precio_promedio)} anterior={ind.precio_promedio_ant == null ? undefined : Number(ind.precio_promedio_ant)} />
              <KpiCard label="Margen bruto" value={fmtPct(ind.margen_pct)} icon={Percent}>
                {ind.margen_pct_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(ind.margen_pct) - Number(ind.margen_pct_ant)} points label="vs ant." />}
              </KpiCard>
              <KpiCard label="Descuento comercial" value={fmtPct(ind.descuento_comercial_pct)} icon={Percent}>
                <p className="text-xs text-muted-foreground">bajo precio retail</p>
                {ind.descuento_comercial_pct_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(ind.descuento_comercial_pct) - Number(ind.descuento_comercial_pct_ant)} points invert label="vs ant." />}
              </KpiCard>
            </>}
          </div>
        </> : <EmptyState message="Sin datos para el periodo." />}
        {indQ.error ? <ConsultaError error={indQ.error} /> : indQ.isLoading ? <LoadingState /> : null}
      </div>

      <TooltipProvider>
        {carteraQ.error ? <ConsultaError error={carteraQ.error} /> : recaudoQ.error ? <ConsultaError error={recaudoQ.error} /> : carteraQ.isLoading || recaudoQ.isLoading ? <LoadingState /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard label="Saldo de cartera" value={fmtMonto(saldoCartera)} icon={Wallet} onClick={irACartera}>
              <p className="text-xs text-primary mt-1">Ver cartera</p>
            </KpiCard>
            <KpiCard label="% vencido" value={fmtPct(pctVencido)} icon={AlertTriangle} className={pctVencido != null && pctVencido > 30 ? "text-danger" : undefined} onClick={irACartera}>
              <p className="text-xs text-muted-foreground">{fmtMonto(vencidoCartera)} vencidos</p>
            </KpiCard>
            <KpiCard label="Recaudo del período" value={fmtMonto(recaudo)} icon={Banknote} />
            <KpiCard label="Recaudo / Facturado" value={fmtPct(pctRecaudoFacturado)} icon={Percent}>
              <UiTooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground underline decoration-dotted cursor-help">¿cómo se calcula?</p>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px]">Recaudo del período (con IVA) ÷ ventas netas del período × 1,19, porque la venta va sin IVA y el recaudo con IVA.</TooltipContent>
              </UiTooltip>
            </KpiCard>
          </div>
        )}
      </TooltipProvider>

      {!clientesQ.error && !clientesQ.isLoading && !carteraQ.error && !carteraQ.isLoading && riesgo.length > 0 && (
        <TablaCard title={`⚠️ Clientes en riesgo (${fmtNum(riesgo.length)})`} minW={900}>
          <TablaTh cols={["Cliente", "Asesora", "Días sin compra", "Venta del período", "Saldo", "Vencido +60", "Motivo"]} />
          <tbody>{riesgo.map(r => (
            <tr key={r.cliente_id} onClick={() => setDrill({ tipo: "cliente", clienteId: String(r.cliente_id), nombre: r.cliente })} className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40">
              <td className="px-3 py-2.5 font-medium text-primary">{r.cliente}</td>
              <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
              <td className="px-3 py-2.5 tabular-nums">{r.dias_sin_compra == null ? "—" : fmtNum(r.dias_sin_compra)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.venta)}</td>
              <td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.saldo)}</td>
              <td className={cn("px-3 py-2.5 tabular-nums", r.vencido60 > 0 && "font-medium text-danger")}>{fmtMonto(r.vencido60)}</td>
              <td className="px-3 py-2.5"><Badge variant="outline" className={cn("font-medium", r.motivo === "Ambos" ? "status-danger text-danger" : "text-muted-foreground")}>{r.motivo}</Badge></td>
            </tr>
          ))}</tbody>
        </TablaCard>
      )}

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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{DIMENSIONES.map(d => <ComposicionCard key={d.id} desde={desde} hasta={hasta} vendedor={vendedor} dimension={d.id} label={d.label} onSelect={(grupo) => setDrill({ tipo: "composicion", dimension: d.id, grupo, label: d.label })} />)}</div>
      </section>

      {topProdQ.error ? <ConsultaError error={topProdQ.error} /> : topProdQ.isLoading ? <LoadingState /> : <ProductTable data={[]} title="Top productos mayoristas" days={0} exportFilename="" supplied={{
        columns: ["Producto", "Unidades", "Venta", "% canal", "Clientes", "Precio may. / retail", "Desc. %", "Margen %", "Stock Reserva"],
        rows: (topProdQ.data ?? []).map(p => ({ id: String(p.producto_id), name: p.producto, productContent: <div className="flex items-start gap-3">
          <div className="shrink-0">{p.image_url ? <ProductImageThumb src={p.image_url} alt={p.producto} productId={String(p.producto_id)} title={p.producto} className="w-12 h-12 rounded-lg object-cover bg-muted" /> : <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-lg">📦</div>}</div>
          <div className="flex flex-col min-w-0"><span className="text-sm font-medium text-foreground line-clamp-2 max-w-[200px] pt-0.5" title={p.producto}>{p.producto}</span><span className="text-xs text-muted-foreground">{p.linea ?? "—"}</span><div className="flex flex-wrap items-center gap-2 mt-1"><CollectionBadge coleccion={p.coleccion} /><Badge variant="secondary" className="text-[10px] gap-1 whitespace-nowrap"><Clock className="h-3 w-3" />{p.semanas_vida == null ? "Pre-lanzamiento" : `${fmtNum(p.semanas_vida)} sem. en retail`}</Badge></div></div>
        </div>, cells: [fmtNum(p.unidades), fmtMonto(p.venta), fmtPct(p.pct_venta), fmtNum(p.clientes), `${fmtMonto(p.precio_mayorista)} / ${fmtMonto(p.precio_retail_sin_iva)}`, fmtPct(p.descuento_comercial_pct), fmtPct(p.margen_pct), <span className={TXT[stockSemaforo(Number(p.stock_reserva_distribuidores))]}>{fmtNum(p.stock_reserva_distribuidores)}</span>] })),
      }} />}
      {clientesQ.error ? <ConsultaError error={clientesQ.error} /> : clientesQ.isLoading ? <LoadingState /> : <StoreLeaderboard days={0} supplied={{ title: "Top clientes",
        columns: ["Cliente", "Asesora", "Unidades", "Valor facturado", "% canal"],
        rows: topClientes.map(r => ({ id: String(r.cliente_id), name: r.cliente, value: fmtMonto(r.venta), onClick: () => setDrill({ tipo: "cliente", clienteId: String(r.cliente_id), nombre: r.cliente }), detail: <div className="text-xs text-muted-foreground space-y-1"><p>{tituloNombre(r.vendedora)}</p><p>{fmtNum(r.unidades)} unidades · {fmtPct(r.participacion)} del canal</p></div>, cells: [tituloNombre(r.vendedora), fmtNum(r.unidades), fmtMonto(r.venta), fmtPct(r.participacion)] })),
      }} />}

      {drill?.tipo === "facturas" && <FacturasSheet desde={desde} hasta={hasta} vendedor={vendedor} onClose={() => setDrill(null)} />}
      {(drill?.tipo === "clientes" || drill?.tipo === "ventas") && <ClientesSheet desde={desde} hasta={hasta} vendedor={vendedor} orden={drill.tipo === "ventas" ? "venta" : "estado"} onClose={() => setDrill(null)} />}
      {drill?.tipo === "unidades" && <UnidadesSheet desde={desde} hasta={hasta} vendedor={vendedor} onClose={() => setDrill(null)} />}
      {drill?.tipo === "pendientes" && <PendientesSheet vendedor={vendedor} onClose={() => setDrill(null)} />}
      {drill?.tipo === "composicion" && <ComposicionSheet desde={desde} hasta={hasta} vendedor={vendedor} dimension={drill.dimension} grupo={drill.grupo} label={drill.label} onCliente={(clienteId, nombre) => setDrill({ tipo: "cliente", clienteId, nombre })} onClose={() => setDrill(null)} />}
      {drill?.tipo === "cliente" && <ClienteSheet desde={desde} hasta={hasta} vendedor={vendedor} clienteId={drill.clienteId} nombre={drill.nombre} onClose={() => setDrill(null)} />}
    </div>
  );
}
