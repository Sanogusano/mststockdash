import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildRpcDateParams } from "./TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { exportToCSV } from "@/lib/csv-export";
import { exportComportamientoProductoPDF } from "@/lib/comportamiento-producto-pdf";
import { Search, Download, FileText, Tag, Pause, Store, Globe, Truck, PackageX, Clock, Warehouse, Gauge } from "lucide-react";
import { CollectionBadge } from "./CollectionBadge";

const RDV_STYLES: Record<string, { text: string; chip: string | null }> = {
  DETENIDO: { text: "text-red-600", chip: "bg-red-100 text-red-700" },
  BAJO: { text: "text-orange-600", chip: "bg-orange-100 text-orange-700" },
  REGULAR: { text: "text-amber-600", chip: "bg-amber-100 text-amber-700" },
  BUENO: { text: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700" },
  EXCELENTE: { text: "text-blue-600", chip: "bg-blue-100 text-blue-700" },
  AGOTADO: { text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  "SOLO ONLINE": { text: "text-muted-foreground", chip: null },
  "SIN COMPARABLES": { text: "text-muted-foreground", chip: null },
};
import { ProductImageThumb } from "./ProductImageThumb";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZE = 15;

interface ProductBehaviorRow {
  foto: string;
  product_id: string;
  producto: string;
  distribuido: number;
  dist_tiendas: number;
  dist_online: number;
  dist_standby: number;
  dist_mayoristas: number;
  dias_en_venta: number;
  semanas_en_venta: number;
  ritmo_semanal?: number | null;
  ritmo_tienda?: number | null;
  ritmo_online?: number | null;
  rdv_indice?: number | null;
  rdv_estado?: 'DETENIDO' | 'BAJO' | 'REGULAR' | 'BUENO' | 'EXCELENTE' | 'SOLO ONLINE' | 'SIN COMPARABLES' | 'AGOTADO' | string | null;
  und_vendidas_vida: number;
  tallas_con_stock: number;
  tallas_totales: number;
  categoria: string;
  und_vendidas: number;
  stock_tiendas: number;
  stock_digital: number;
  stock_standby: number;
  stock_total: number;
  bod_principal: number;
  bod_reserva: number;
  bod_tiendas: number;
  bod_exportaciones: number;
  clasificacion: string;
  tipo: string;
  st_120d: number;
  sell_through_pct: number;
  base_st: "distribuido" | "estimada" | null;
  wos: number | null;
  wos_total: number | null;
  estado_salud: string;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  coleccion: string;
}

const stColor = (pct: number) => (pct >= 70 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-danger");

function StRow({ label, value, estimated }: { label: string; value: number | null | undefined; estimated?: boolean }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase font-semibold text-muted-foreground w-14 shrink-0">
        {label}
        {estimated && (
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0} className="cursor-help text-warning ml-0.5">*</span></TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">Sin historial de traslados suficiente. Lo distribuido se estima como vendido más stock.</TooltipContent>
          </Tooltip>
        )}
      </span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", stColor(v))} style={{ width: `${Math.min(Math.max(v, 0), 100)}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-foreground w-9 text-right shrink-0 tabular-nums">{v}%</span>
    </div>
  );
}

const fmtRdv = (n?: number | null) => Number(n ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Índice RDV topado en 10,0×; la RPC envía 999 cuando el valor real supera el tope.
const fmtIdx = (idx: number) => (idx === 999 ? "+10×" : `${(idx / 100).toFixed(1).replace(".", ",")}×`);

function DistributionBars({ row }: { row: ProductBehaviorRow }) {
  const items = [
    { label: "A tiendas", icon: Store, value: row.dist_tiendas ?? 0 },
    { label: "A online", icon: Globe, value: row.dist_online ?? 0 },
    { label: "A bodega", icon: Warehouse, value: row.dist_standby ?? 0 },
    { label: "A mayoristas", icon: Truck, value: row.dist_mayoristas ?? 0 },
  ].filter((i) => i.value > 0);
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="min-w-[150px] space-y-1">
      <p className="text-base font-semibold text-foreground tabular-nums">{(row.distribuido ?? 0).toLocaleString("es-CO")}</p>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild><span tabIndex={0} aria-label={i.label}><i.icon className="h-3 w-3 text-muted-foreground shrink-0" /></span></TooltipTrigger>
            <TooltipContent>{i.label}</TooltipContent>
          </Tooltip>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
          <span className="text-[10px] font-semibold text-foreground w-10 text-right shrink-0 tabular-nums">{i.value.toLocaleString("es-CO")}</span>
        </div>
      ))}
    </div>
  );
}

function DistributionChip({ row }: { row: ProductBehaviorRow }) {
  const floor = (row.dist_tiendas ?? 0) + (row.dist_online ?? 0);
  if (floor > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success/10 text-success">
        <Truck className="h-3 w-3" /> Distribuido
      </span>
    );
  }
  if ((row.dist_standby ?? 0) > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning">
        <Warehouse className="h-3 w-3" /> En bodega
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
      <PackageX className="h-3 w-3" /> Sin distribuir
    </span>
  );
}

const WOS_FILTERS = [
  { value: "all", label: "Todos los WOS" },
  { value: "risk", label: "🟡 Riesgo (<4 sem)" },
  { value: "optimal", label: "🟢 Óptimo (4-12 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>12 sem)" },
  { value: "stagnant", label: "🔴 Estancado (0 ventas)" },
  { value: "unreleased", label: "⚫ SIN LIBERAR" },
];

const ST_FILTERS = [
  { value: "all", label: "Todos los %ST" },
  { value: "high", label: "🟢 Alto (≥70%)" },
  { value: "medium", label: "🟡 Medio (30-69%)" },
  { value: "low", label: "🔴 Bajo (<30%)" },
];

const CANAL_FILTERS = [
  { value: "all", label: "Todos los canales" },
  { value: "tiendas", label: "🏪 Tiendas de Línea" },
  { value: "outlet", label: "🏷️ Outlets" },
  { value: "digital", label: "🌐 Digital" },
];

const DIGITAL_LOCATION_ID = "71474315479";

interface LocationOption {
  location_id: string;
  name: string;
  tipo_tienda: string | null;
}

/* ── Sales Breakdown Bars (3 individual) ── */
function SalesBreakdownBars({ full, rebajas, promo, total }: { full: number; rebajas: number; promo: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">Sin ventas</span>;

  const max = Math.max(full, rebajas, promo, 1);

  const bars = [
    { label: "Full", value: full, color: "bg-emerald-500", textColor: "text-emerald-600" },
    { label: "Reb.", value: rebajas, color: "bg-destructive", textColor: "text-destructive" },
    { label: "Promo", value: promo, color: "bg-amber-500", textColor: "text-amber-600" },
  ];

  return (
    <div className="space-y-1 w-full min-w-[140px]">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-1.5">
          <span className={cn("text-[9px] font-semibold w-8 text-right shrink-0", b.textColor)}>{b.label}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", b.color)} style={{ width: `${max > 0 ? (b.value / max) * 100 : 0}%` }} />
          </div>
          <span className={cn("text-[10px] font-semibold w-8 shrink-0", b.textColor)}>{b.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ProductBehaviorTable({ days, initialWosFilter, initialLocationId, customFrom, customTo }: { days: number; initialWosFilter?: string; initialLocationId?: string; customFrom?: Date; customTo?: Date }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ProductBehaviorRow | null>(null);
  const [wosFilter, setWosFilter] = useState(initialWosFilter ?? "all");
  const [stFilter, setStFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [coleccionFilter, setColeccionFilter] = useState("all");
  const [clasifFilter, setClasifFilter] = useState("all");
  const [canalFilter, setCanalFilter] = useState("all");
  const [locationId, setLocationId] = useState(initialLocationId ?? "all");

  const { dias_atras: resolvedDays, p_hasta: hastaParam } = buildRpcDateParams(days, customFrom, customTo);

  const { data: allLocations } = useQuery({
    queryKey: ["locations-active-full"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("location_id, name, tipo_tienda").eq("is_active", true).order("name");
      return (data ?? []) as LocationOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Filter locations by selected channel
  const filteredLocations = useMemo(() => {
    if (!allLocations) return [];
    if (canalFilter === "all") return allLocations;
    if (canalFilter === "digital") return allLocations.filter((l) => l.location_id === DIGITAL_LOCATION_ID);
    if (canalFilter === "outlet") return allLocations.filter((l) => (l.tipo_tienda ?? "").toUpperCase() === "OUTLET");
    // tiendas = A, B, C
    return allLocations.filter((l) => ["A", "B", "C"].includes((l.tipo_tienda ?? "").toUpperCase()));
  }, [allLocations, canalFilter]);

  // Reset location when channel changes
  useMemo(() => {
    if (canalFilter !== "all") {
      const valid = filteredLocations.map((l) => l.location_id);
      if (locationId !== "all" && !valid.includes(locationId)) {
        setLocationId("all");
      }
    }
  }, [canalFilter, filteredLocations]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["producto-comportamiento", resolvedDays, hastaParam, search, locationId],
    queryFn: async () => {
      const params: { dias_atras: number; p_sku_filter?: string; p_location_id?: string; p_hasta?: string | null } = { dias_atras: resolvedDays, p_hasta: hastaParam };
      if (search.trim()) params.p_sku_filter = search.trim();
      if (locationId !== "all") params.p_location_id = locationId;
      const { data, error } = await supabase.rpc("reporte_comportamiento_producto", params);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as ProductBehaviorRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const buildOpts = (key: "tipo" | "coleccion" | "clasificacion") => {
    const m = new Map<string, number>();
    for (const r of data ?? []) {
      const v = (r[key] ?? "").toString().trim();
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  };
  const tipoOpts = useMemo(() => buildOpts("tipo"), [data]);
  const coleccionOpts = useMemo(() => buildOpts("coleccion"), [data]);
  const clasifOpts = useMemo(() => buildOpts("clasificacion"), [data]);

  const rows = useMemo(() => {
    let all = data ?? [];
    if (tipoFilter !== "all") all = all.filter((r) => (r.tipo ?? "").trim() === tipoFilter);
    if (coleccionFilter !== "all") all = all.filter((r) => (r.coleccion ?? "").trim() === coleccionFilter);
    if (clasifFilter !== "all") all = all.filter((r) => (r.clasificacion ?? "").trim() === clasifFilter);
    if (wosFilter !== "all") {
      all = all.filter((r) => {
        if (wosFilter === "unreleased") return r.estado_salud.includes("SIN LIBERAR");
        if (wosFilter === "stagnant") return r.estado_salud.includes("ESTANCADO");
        if (wosFilter === "risk") return r.wos > 0 && r.wos < 4;
        if (wosFilter === "optimal") return r.wos >= 4 && r.wos <= 12;
        if (wosFilter === "overstock") return r.wos > 12;
        return true;
      });
    }
    if (stFilter !== "all") {
      all = all.filter((r) => {
        if (stFilter === "high") return r.sell_through_pct >= 70;
        if (stFilter === "medium") return r.sell_through_pct >= 30 && r.sell_through_pct < 70;
        if (stFilter === "low") return r.sell_through_pct < 30;
        return true;
      });
    }
    return all;
  }, [data, wosFilter, stFilter, tipoFilter, coleccionFilter, clasifFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useMemo(() => setPage(0), [search, days, wosFilter, stFilter, locationId, canalFilter, tipoFilter, coleccionFilter, clasifFilter]);

  const handleExportCSV = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        "Product ID": r.product_id,
        Producto: r.producto,
        Categoría: r.categoria,
        Clasificación: r.clasificacion,
        "Und. Vendidas": r.und_vendidas,
        Distribuido: r.distribuido ?? 0,
        "Dist. Tiendas": r.dist_tiendas ?? 0,
        "Dist. Online": r.dist_online ?? 0,
        "Dist. Stand By": r.dist_standby ?? 0,
        "Dist. Mayoristas": r.dist_mayoristas ?? 0,
        "Semanas en venta": r.semanas_en_venta ?? 0,
        "Días en venta": r.dias_en_venta ?? 0,
        "Tallas con stock": r.tallas_con_stock ?? 0,
        "Tallas totales": r.tallas_totales ?? 0,
        "Und. Full Price": r.und_full_price ?? 0,
        "Und. Rebajas": r.und_rebajas ?? 0,
        "Und. Promo": r.und_promo ?? 0,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Stock Stand-by": r.stock_standby ?? 0,
        "Stock Total": r.stock_total ?? 0,
        "Principal": r.bod_principal ?? 0,
        "Reserva Distribuidores": r.bod_reserva ?? 0,
        "Tiendas Monastery": r.bod_tiendas ?? 0,
        "Exportaciones": r.bod_exportaciones ?? 0,
        "ST 120d": r.st_120d ?? 0,
        "ST Total": r.sell_through_pct ?? 0,
        "RDV Total": Number(r.ritmo_semanal ?? 0),
        "RDV Tienda": Number(r.ritmo_tienda ?? 0),
        "RDV Online": Number(r.ritmo_online ?? 0),
        WOS: r.wos,
        "Estado Salud": r.estado_salud,
      })),
      "comportamiento_producto"
    );
  };

  const handleExportPDF = async () => {
    if (!rows.length) return;
    await exportComportamientoProductoPDF(
      rows.map((r) => ({
        foto: r.foto,
        product_id: r.product_id,
        distribuido: r.distribuido ?? 0,
        dist_tiendas: r.dist_tiendas ?? 0,
        dist_online: r.dist_online ?? 0,
        dist_standby: r.dist_standby ?? 0,
        dist_mayoristas: r.dist_mayoristas ?? 0,
        semanas_en_venta: r.semanas_en_venta ?? 0,
        dias_en_venta: r.dias_en_venta ?? 0,
        ritmo_semanal: Number(r.ritmo_semanal ?? 0),
        ritmo_tienda: Number(r.ritmo_tienda ?? 0),
        ritmo_online: Number(r.ritmo_online ?? 0),
        tallas_con_stock: r.tallas_con_stock ?? 0,
        tallas_totales: r.tallas_totales ?? 0,
        producto: r.producto,
        categoria: r.categoria,
        und_vendidas: r.und_vendidas ?? 0,
        und_full_price: r.und_full_price ?? 0,
        und_rebajas: r.und_rebajas ?? 0,
        und_promo: r.und_promo ?? 0,
        stock_tiendas: r.stock_tiendas ?? 0,
        stock_digital: r.stock_digital ?? 0,
        stock_standby: r.stock_standby ?? 0,
        stock_total: r.stock_total ?? 0,
        bod_principal: r.bod_principal ?? 0,
        bod_reserva: r.bod_reserva ?? 0,
        bod_tiendas: r.bod_tiendas ?? 0,
        bod_exportaciones: r.bod_exportaciones ?? 0,
        st_120d: r.st_120d ?? 0,
        sell_through_pct: r.sell_through_pct ?? 0,
      })),
      "comportamiento_producto",
      "Comportamiento de Producto"
    );
  };

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      {/* Filters row 1 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Select value={canalFilter} onValueChange={(v) => { setCanalFilter(v); setLocationId("all"); }}>
          <SelectTrigger className="w-full sm:w-[200px] h-10">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            {CANAL_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-full sm:w-[200px] h-10">
            <SelectValue placeholder="Todas las tiendas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {canalFilter === "all" ? "Todas las tiendas" : `Todas (${CANAL_FILTERS.find(c => c.value === canalFilter)?.label.replace(/🏪|🏷️|🌐/g, "").trim()})`}
            </SelectItem>
            {filteredLocations.map((loc) => (
              <SelectItem key={loc.location_id} value={loc.location_id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={wosFilter} onValueChange={setWosFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue placeholder="Filtrar por WOS" />
          </SelectTrigger>
          <SelectContent>
            {WOS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stFilter} onValueChange={setStFilter}>
          <SelectTrigger className="w-full sm:w-[180px] h-10">
            <SelectValue placeholder="Filtrar por %ST" />
          </SelectTrigger>
          <SelectContent>
            {ST_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {([
          { value: tipoFilter, set: setTipoFilter, all: "Todos los tipos", opts: tipoOpts },
          { value: coleccionFilter, set: setColeccionFilter, all: "Todas las colecciones", opts: coleccionOpts },
          { value: clasifFilter, set: setClasifFilter, all: "Toda la clasificación", opts: clasifOpts },
        ]).map((f) => (
          <Select key={f.all} value={f.value} onValueChange={f.set}>
            <SelectTrigger className="w-full sm:w-[200px] h-10">
              <SelectValue placeholder={f.all} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.all}</SelectItem>
              {f.opts.map(([v, n]) => (
                <SelectItem key={v} value={v}>{v} ({n.toLocaleString("es-CO")})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {/* Export row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Full Price
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-destructive" />
            Rebajas
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Promo
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!rows.length}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><LoadingState rows={8} /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
            <p className="text-muted-foreground text-xs mt-1 max-w-md">{(error as Error).message}</p>
          </div>
        ) : !paged.length ? (
          <EmptyState message="No se encontraron productos para este filtro." />
        ) : (
          <>
            <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[240px]">Producto</TableHead>
                  <TableHead className="text-right">Unidades vendidas</TableHead>
                  <TableHead className="min-w-[170px]">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">Distribución</span></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">Unidades despachadas desde bodega, por destino. Es flujo histórico, no el stock actual. Mayoristas no entra en el cálculo del sell-through.</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="min-w-[170px]">Tiempo y ritmo</TableHead>
                  <TableHead className="min-w-[180px]">Desglose Ventas</TableHead>
                  <TableHead className="min-w-[110px]">
                    <div className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" />
                      Clasificación
                    </div>
                  </TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="min-w-[120px]">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">Sell-Through</span></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">Arriba: lo vendido en el período sobre lo que había disponible. Cambia con el filtro. Abajo: de todo lo que ha existido del producto, cuánto se ha vendido. No cambia con el filtro.</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="min-w-[150px] whitespace-nowrap">
                    <Tooltip>
                      <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">WOS</span></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">Semanas que dura el stock al ritmo de las últimas 8 semanas. A la venta cuenta tiendas y online; Con bodega suma lo detenido.</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="w-36 text-center">Salud</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => {
                  const full = row.und_full_price ?? 0;
                  const reb = row.und_rebajas ?? 0;
                  const promo = row.und_promo ?? 0;
                  const isFull = full >= (reb + promo);
                  const showStandby = locationId === "all" && row.stock_standby > 0;

                  return (
                    <TableRow key={row.product_id} className="cursor-pointer" onClick={() => setSelectedProduct(row)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {row.foto ? (
                            <ProductImageThumb src={row.foto} alt={row.producto} productId={row.product_id} title={row.producto} className="h-14 w-14 rounded-lg object-cover border border-border shrink-0" />
                          ) : (
                            <div className="h-14 w-14 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-xs shrink-0">N/A</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{row.producto}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-muted-foreground">{row.categoria}</p>
                              <CollectionBadge coleccion={row.coleccion} />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {(row.tallas_totales ?? 0) > 0 && (
                                <p className={cn("text-[11px] tabular-nums", (row.tallas_con_stock ?? 0) < row.tallas_totales / 2 ? "text-warning font-medium" : "text-muted-foreground")}>
                                  {row.tallas_con_stock ?? 0}/{row.tallas_totales} tallas
                                </p>
                              )}
                              <DistributionChip row={row} />
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <span className="text-base font-semibold text-foreground">{(row.und_vendidas ?? 0).toLocaleString()}</span>
                      </TableCell>

                      <TableCell className="align-top">
                        <DistributionBars row={row} />
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="w-40 shrink-0">
                          <div className="flex items-start gap-1.5">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div>
                              <p className="text-base font-semibold text-foreground leading-tight tabular-nums">{row.semanas_en_venta ?? 0} sem.</p>
                              <p className="text-xs text-muted-foreground tabular-nums">{row.dias_en_venta ?? 0} días</p>
                            </div>
                          </div>
                          <div className="border-t border-border/60 my-1.5" />
                          {(() => {
                            const estado = (row.rdv_estado ?? "SOLO ONLINE").toUpperCase();
                            const st = RDV_STYLES[estado] ?? RDV_STYLES["SOLO ONLINE"];
                            const idx = row.rdv_indice;
                            const tip = idx != null
                              ? `Vende ${fmtIdx(idx)} más rápido por tienda que la mediana de su cohorte (${row.coleccion || "—"} · ${row.categoria || "—"}) en los últimos 56 días.`
                              : estado === "SOLO ONLINE" ? "Vende solo online. No hay productividad por tienda que comparar."
                              : estado === "SIN COMPARABLES" ? "Su categoría tiene menos de 8 productos comparables para calcular el índice."
                              : estado === "DETENIDO" ? "Tiene stock pero no vendió una sola unidad en los últimos 56 días."
                              : estado === "AGOTADO" ? "Sin stock. No vende porque no hay unidades."
                              : "Menos de 8 productos comparables para calcular el índice.";
                            return (
                              <div className="space-y-0.5 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Gauge className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">RDV</span>
                                </div>
                                <p className={cn("text-sm font-semibold tabular-nums", st.text)}>
                                  {Number(row.ritmo_semanal ?? 0) > 0 ? fmtRdv(row.ritmo_semanal) : "0"} u/sem
                                </p>
                                {st.chip ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span tabIndex={0} className={cn("inline-block cursor-help text-[10px] font-medium px-1.5 py-0 rounded", st.chip)}>
                                        {estado}{idx != null ? ` (${fmtIdx(idx)})` : ""}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
                                  </Tooltip>
                                ) : estado === "SOLO ONLINE" || estado === "SIN COMPARABLES" ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span tabIndex={0} className="inline-block cursor-help text-[10px] uppercase tracking-wide text-muted-foreground">{estado}</span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="h-[15px]" />
                                )}
                                <p className="text-[10px] text-muted-foreground tabular-nums">En tienda {fmtRdv(row.ritmo_tienda)} · Online {fmtRdv(row.ritmo_online)}</p>
                              </div>
                            );
                          })()}
                        </div>
                      </TableCell>

                      <TableCell>
                        <SalesBreakdownBars full={full} rebajas={reb} promo={promo} total={row.und_vendidas ?? 0} />
                      </TableCell>

                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                          isFull ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                        )}>
                          {isFull ? "✅ Venta Full" : "🔻 Con Impulso"}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="space-y-0.5 text-sm">
                          <p><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label="En tiendas (piso de venta)">🏪</span></TooltipTrigger><TooltipContent>En tiendas (piso de venta)</TooltipContent></Tooltip> <StockValue value={row.stock_tiendas} /></p>
                          <p><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label="Digital / CEDI">📦</span></TooltipTrigger><TooltipContent>Digital / CEDI</TooltipContent></Tooltip> <StockValue value={row.stock_digital} /></p>
                          {showStandby && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Tooltip>
                                <TooltipTrigger asChild><span tabIndex={0} aria-label="Stand-by: detenido en bodega, no disponible para venta"><Pause className="h-4 w-4" /></span></TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>Stand-by: detenido en bodega, no disponible para venta</p>
                                  {([
                                    ["Principal", row.bod_principal],
                                    ["Reserva Distribuidores", row.bod_reserva],
                                    ["Tiendas Monastery", row.bod_tiendas],
                                    ["Exportaciones", row.bod_exportaciones],
                                  ] as const).filter(([, value]) => value > 0).map(([label, value]) => (
                                    <p key={label}>{label}: {value.toLocaleString("es-CO")}</p>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                              <StockValue value={row.stock_standby} />
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="w-40 shrink-0 min-w-0 space-y-1.5">
                          <StRow label="ST 120d" value={row.st_120d} />
                          <StRow
                            label="ST Total"
                            value={row.sell_through_pct}
                            estimated={row.base_st === "estimada"}
                          />
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="w-36 shrink-0 min-w-0">
                          {(() => {
                            const fmtW = (v: number | null) => v == null || v > 90 ? "+99" : Number(v).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                            const lbl = "text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5";
                            return (
                              <>
                                <div>
                                  <span className="inline-block border border-border rounded-md px-2 py-1 text-base font-semibold text-foreground tabular-nums whitespace-nowrap">{fmtW(row.wos)} Semanas</span>
                                  {row.wos == null
                                    ? <p className={cn(lbl, "text-danger font-bold")}>SIN ROTACIÓN</p>
                                    : <p className={lbl}>Lo disponibilizado</p>}
                                </div>
                                <div className="mt-2">
                                  <p className="text-sm font-medium text-foreground tabular-nums whitespace-nowrap">{fmtW(row.wos_total)} Semanas</p>
                                  {row.wos_total == null
                                    ? <p className={cn(lbl, "text-danger font-bold")}>SIN ROTACIÓN</p>
                                    : <p className={lbl}>Totalidad de inventario</p>}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </TableCell>

                      <TableCell className="align-top text-center">
                        <div className="w-36 shrink-0 mx-auto flex justify-center whitespace-nowrap">
                          <StatusBadge label={row.estado_salud} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">{rows.length} productos · Página {page + 1} de {totalPages}</p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Siguiente</Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ProductDetailDrawer product={selectedProduct} days={resolvedDays} rangeValue={days} customFrom={customFrom} customTo={customTo} metrics={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
    </TooltipProvider>
  );
}

function StockValue({ value }: { value: number | null | undefined }) {
  const v = value ?? 0;
  if (v < 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild><span tabIndex={0} className="font-medium cursor-help">0*</span></TooltipTrigger>
        <TooltipContent>Stock negativo en NetSuite; se muestra como 0</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="font-medium">{v.toLocaleString("es-CO")}</span>;
}
