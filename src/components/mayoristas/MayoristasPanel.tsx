import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Package, Receipt, Users, ShoppingBag, Banknote, Percent, Trophy, Clock } from "lucide-react";
import { KpiCard, ComparisonIndicator, CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { CumplimientoPresupuestoCard } from "@/components/dashboard/CumplimientoPresupuestoCard";
import { ProductTable } from "@/components/dashboard/ExecutiveDashboard";
import { StoreRow, StoreLeaderboard } from "@/components/dashboard/StoreLeaderboard";
import { CollectionCompositionCard } from "@/components/dashboard/CollectionCompositionCard";
import { CollectionBadge } from "@/components/dashboard/CollectionBadge";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { Badge } from "@/components/ui/badge";
import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MayoristasOrdenes } from "@/components/mayoristas/MayoristasOrdenes";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtPct, tituloNombre } from "@/lib/mayoristas-format";
import type { Semaforo } from "@/lib/mayoristas-format";

const TXT: Record<Semaforo, string> = { verde: "text-success", ambar: "text-warning", rojo: "text-danger", neutro: "text-muted-foreground" };

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
  cliente_id: number; cliente: string; vendedora: string; estado: string;
  unidades: number; venta: number; participacion: number;
}

type Dimension = "coleccion" | "linea" | "genero";
const DIMENSIONES: { id: Dimension; label: string }[] = [
  { id: "coleccion", label: "Por Colección" },
  { id: "linea", label: "Por Línea" },
  { id: "genero", label: "Por Género" },
];

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

function ComposicionCard({ desde, hasta, dimension, label }: {
  desde: string | null; hasta: string | null; dimension: Dimension; label: string;
}) {
  const compQ = useQuery({
    queryKey: ["mayoristas-composicion", desde, hasta, dimension],
    enabled: !!desde && !!hasta && desde <= hasta,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_composicion" as never, { p_desde: desde, p_hasta: hasta, p_dimension: dimension } as never);
      if (error) throw error;
      return (data as unknown as ComposicionRow[]) ?? [];
    },
  });
  const rows = dimension === "linea" ? agruparLineas(compQ.data ?? []) : (compQ.data ?? []);
  if (compQ.error) return <ConsultaError error={compQ.error} />;
  if (compQ.isLoading) return <LoadingState />;
  if (!rows.length) return <EmptyState message={`${label} · Sin datos para el periodo.`} />;
  return <CollectionCompositionCard days={0} supplied={{ title: label, items: rows.map(r => ({
    name: r.grupo, value: Number(r.unidades), pct: Number(r.pct_unidades),
    detail: `${fmtMonto(r.venta)} · ${fmtPct(r.pct_venta)} de la venta${r.margen_pct != null ? ` · margen ${fmtPct(r.margen_pct)}` : ""}`,
  })) }} />;
}

export function MayoristasPanel({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [selectedSellers, setSelectedSellers] = useState<string[]>([]);
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
    queryKey: ["mayoristas-indicadores", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_indicadores" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return ((data as unknown as IndicadoresRow[]) ?? [])[0] ?? null;
    },
  });
  const topProdQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-top-productos", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_top_productos" as never, { p_desde: desde, p_hasta: hasta, p_limite: 20 } as never);
      if (error) throw error;
      return (data as unknown as TopProductoRow[]) ?? [];
    },
  });
  const clientesQ = useQuery({
    retry: false,
    queryKey: ["mayoristas-clientes", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_clientes" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return (data as unknown as ClienteRow[]) ?? [];
    },
  });
  const c = canalQ.data;
  const ind = indQ.data;
  const topClientes = (clientesQ.data ?? []).filter(r => r.estado !== "Perdido").slice(0, 10);
  const sellers = (vendQ.data ?? []).filter(v => selectedSellers.length === 0 || selectedSellers.includes(v.vendedora));
  return (
    <div className="space-y-4 mb-6 min-w-0">
      <div className="glass-card p-5">
        <CommercialSectionHeader title="📊 DESEMPEÑO COMERCIAL MAYORISTAS">
          <MultiSelectFilter label="Vendedora" allLabel="Todas" options={(vendQ.data ?? []).map(v => v.vendedora)} selected={selectedSellers} onChange={setSelectedSellers} />
        </CommercialSectionHeader>
        <p className="text-xs text-muted-foreground mb-4">Venta neta sin IVA · fuente: facturas NetSuite</p>
        {canalQ.error ? <ConsultaError error={canalQ.error} /> : canalQ.isLoading ? <LoadingState /> : c ? <>
          <div className="mb-4">
            <CumplimientoPresupuestoCard desde={desde ?? ""} hasta={hasta ?? ""} channels={[]} venta={Number(c.venta)} universo="Mayoristas" supplied={{ meta: c.meta, porcentaje: c.cumplimiento }} />
            <p className="text-xs text-muted-foreground mt-1">A la fecha: {fmtPct(c.cumplimiento_a_la_fecha)}</p>
            {Number(c.facturas_anuladas) > 0 && <p className="text-xs text-muted-foreground">{fmtNum(c.facturas_anuladas)} factura(s) anulada(s) excluidas</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard label="Ventas Netas" value={fmtMonto(c.venta)} icon={DollarSign}>
              {c.var_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(c.var_ant)} label="vs ant." />}
            </KpiCard>
            <KpiCard label="Unidades vendidas" value={fmtNum(c.unidades)} icon={Package} />
            <KpiCard label="Facturas" value={fmtNum(c.facturas)} icon={Receipt} />
            <KpiCard label="Clientes activos" value={fmtNum(c.clientes)} icon={Users} />
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

      {vendQ.error ? <ConsultaError error={vendQ.error} /> : vendQ.isLoading ? <LoadingState /> : <div className="glass-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border"><Trophy className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-foreground">Vendedoras</h3></div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[1000px]">
          <thead><tr className="border-b border-border bg-muted/30">{["#", "Vendedora", "Ventas Netas", "Uds", "Ticket Prom", "Facturas", "Clientes", "% canal", "Variación", "Cumplimiento"].map(col => <th key={col} className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">{col}</th>)}</tr></thead>
          <tbody>{sellers.map((v, i) => <StoreRow key={v.vendedor_id ?? v.vendedora} rank={i} medals={false} presupuesto={v.meta == null ? undefined : Number(v.meta)} porcentaje={v.cumplimiento} row={{ tienda: tituloNombre(v.vendedora), ventas_totales: Number(v.venta), unidades_vendidas: Number(v.unidades), ticket_promedio: Number(v.ticket), upt: 0, pct_venta_full_price: 0, zona: "" }} extraCells={[
            fmtNum(v.facturas),
            <div>{fmtNum(v.clientes)}{Number(v.clientes_nuevos) > 0 && <p className="text-xs text-success">+{fmtNum(v.clientes_nuevos)} nuevos</p>}{Number(v.clientes_perdidos) > 0 && <p className="text-xs text-danger">−{fmtNum(v.clientes_perdidos)} perdidos</p>}</div>,
            fmtPct(v.participacion),
            <div>{v.var_ant != null && <ComparisonIndicator actual={0} anterior={0} percentage={Number(v.var_ant)} label="vs ant." />}<p className="text-xs text-muted-foreground">A la fecha: {fmtPct(v.cumplimiento_a_la_fecha)}</p></div>,
          ]} />)}</tbody>
        </table></div>
      </div>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Composición de la venta</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">{DIMENSIONES.map(d => <ComposicionCard key={d.id} desde={desde} hasta={hasta} dimension={d.id} label={d.label} />)}</div>
      </section>

      {topProdQ.error ? <ConsultaError error={topProdQ.error} /> : topProdQ.isLoading ? <LoadingState /> : <ProductTable data={[]} title="Top productos mayoristas" days={0} exportFilename="" supplied={{
        columns: ["Producto", "Unidades", "Venta", "% canal", "Clientes", "Precio may. / retail", "Desc. %", "Margen %", "Stock Reserva"],
        rows: (topProdQ.data ?? []).map(p => ({ id: String(p.producto_id), name: p.producto, productContent: <div className="flex items-start gap-3">
          <div className="shrink-0">{p.image_url ? <ProductImageThumb src={p.image_url} alt={p.producto} productId={String(p.producto_id)} title={p.producto} className="w-12 h-12 rounded-lg object-cover bg-muted" /> : <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-lg">📦</div>}</div>
          <div className="flex flex-col min-w-0"><span className="text-sm font-medium text-foreground line-clamp-2 max-w-[200px] pt-0.5" title={p.producto}>{p.producto}</span><span className="text-xs text-muted-foreground">{p.linea ?? "—"}</span><div className="flex flex-wrap items-center gap-2 mt-1"><CollectionBadge coleccion={p.coleccion} /><Badge variant="secondary" className="text-[10px] gap-1 whitespace-nowrap"><Clock className="h-3 w-3" />{p.semanas_vida == null ? "Pre-lanzamiento" : `${fmtNum(p.semanas_vida)} sem. en retail`}</Badge></div></div>
        </div>, cells: [fmtNum(p.unidades), fmtMonto(p.venta), fmtPct(p.pct_venta), fmtNum(p.clientes), `${fmtMonto(p.precio_mayorista)} / ${fmtMonto(p.precio_retail_sin_iva)}`, fmtPct(p.descuento_comercial_pct), fmtPct(p.margen_pct), <span className={TXT[stockSemaforo(Number(p.stock_reserva_distribuidores))]}>{fmtNum(p.stock_reserva_distribuidores)}</span>] })),
      }} />}
      {clientesQ.error ? <ConsultaError error={clientesQ.error} /> : clientesQ.isLoading ? <LoadingState /> : <StoreLeaderboard days={0} supplied={{ title: "Top clientes",
        columns: ["Cliente", "Vendedora", "Unidades", "Valor facturado", "% canal"],
        rows: topClientes.map(r => ({ id: String(r.cliente_id), name: r.cliente, value: fmtMonto(r.venta), detail: <div className="text-xs text-muted-foreground space-y-1"><p>{tituloNombre(r.vendedora)}</p><p>{fmtNum(r.unidades)} unidades · {fmtPct(r.participacion)} del canal</p></div>, cells: [tituloNombre(r.vendedora), fmtNum(r.unidades), fmtMonto(r.venta), fmtPct(r.participacion)] })),
      }} />}
    </div>
  );
}
