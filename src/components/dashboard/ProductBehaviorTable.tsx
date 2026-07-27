import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildRpcDateParams } from "./TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { exportToCSV } from "@/lib/csv-export";
import { exportComportamientoProductoPDF } from "@/lib/comportamiento-producto-pdf";
import { Search, Download, FileText, Tag } from "lucide-react";
import { CollectionBadge } from "./CollectionBadge";
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

interface ProductRow {
  foto: string;
  sku: string;
  producto: string;
  categoria: string;
  und_vendidas: number;
  stock_tiendas: number;
  stock_digital: number;
  clasificacion: string;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  coleccion: string;
}

const WOS_FILTERS = [
  { value: "all", label: "Todos los WOS" },
  { value: "risk", label: "🟡 Riesgo (<4 sem)" },
  { value: "optimal", label: "🟢 Óptimo (4-12 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>12 sem)" },
  { value: "stagnant", label: "🔴 Estancado (0 ventas)" },
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
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [wosFilter, setWosFilter] = useState(initialWosFilter ?? "all");
  const [stFilter, setStFilter] = useState("all");
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
      return (data ?? []) as ProductRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const rows = useMemo(() => {
    let all = data ?? [];
    if (wosFilter !== "all") {
      all = all.filter((r) => {
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
  }, [data, wosFilter, stFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useMemo(() => setPage(0), [search, days, wosFilter, stFilter, locationId, canalFilter]);

  const handleExportCSV = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        SKU: r.sku,
        Producto: r.producto,
        Categoría: r.categoria,
        Clasificación: r.clasificacion,
        "Und. Vendidas": r.und_vendidas,
        "Und. Full Price": r.und_full_price ?? 0,
        "Und. Rebajas": r.und_rebajas ?? 0,
        "Und. Promo": r.und_promo ?? 0,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Sell-Through %": r.sell_through_pct,
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
        sku: r.sku,
        producto: r.producto,
        categoria: r.categoria,
        und_vendidas: r.und_vendidas ?? 0,
        und_full_price: r.und_full_price ?? 0,
        und_rebajas: r.und_rebajas ?? 0,
        und_promo: r.und_promo ?? 0,
        stock_tiendas: r.stock_tiendas ?? 0,
        stock_digital: r.stock_digital ?? 0,
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
                  <TableHead className="text-right">Und.</TableHead>
                  <TableHead className="min-w-[180px]">Desglose Ventas</TableHead>
                  <TableHead className="min-w-[110px]">
                    <div className="flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5" />
                      Clasificación
                    </div>
                  </TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                  <TableHead>WOS & Salud</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => {
                  const full = row.und_full_price ?? 0;
                  const reb = row.und_rebajas ?? 0;
                  const promo = row.und_promo ?? 0;
                  const isFull = full >= (reb + promo);

                  return (
                    <TableRow key={row.sku} className="cursor-pointer" onClick={() => setSelectedProduct(row)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {row.foto ? (
                            <ProductImageThumb src={row.foto} alt={row.producto} sku={row.sku} title={row.producto} className="h-14 w-14 rounded-lg object-cover border border-border shrink-0" />
                          ) : (
                            <div className="h-14 w-14 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-xs shrink-0">N/A</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{row.producto}</p>
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs text-muted-foreground">{row.categoria}</p>
                              <CollectionBadge coleccion={row.coleccion} />
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <span className="text-base font-semibold text-foreground">{(row.und_vendidas ?? 0).toLocaleString()}</span>
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
                          <p>🏪 <span className="font-medium">{(row.stock_tiendas ?? 0).toLocaleString()}</span></p>
                          <p>📦 <span className="font-medium">{(row.stock_digital ?? 0).toLocaleString()}</span></p>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(row.sell_through_pct ?? 0, 100)}
                            className="h-2.5 flex-1 bg-muted"
                            indicatorClassName={getSellThroughColor(row.sell_through_pct ?? 0)}
                          />
                          <span className="text-sm font-medium text-foreground w-12 text-right">{row.sell_through_pct ?? 0}%</span>
                        </div>
                      </TableCell>

                      <TableCell>
                        <p className="text-sm font-semibold text-foreground">{row.wos ?? 0} sem.</p>
                        <StatusBadge label={row.estado_salud} />
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
      <ProductDetailDrawer product={selectedProduct} days={resolvedDays} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
