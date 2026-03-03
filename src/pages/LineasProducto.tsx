import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { CategoryProductsDrawer } from "@/components/dashboard/CategoryProductsDrawer";
import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Search, Star, Tag, Package, Hash, Layers } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface LineRow {
  categoria: string;
  stock_tiendas: number;
  stock_digital: number;
  und_tiendas: number;
  und_outlets: number;
  und_digital: number;
  und_total: number;
  pct_participacion: number;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
}

interface SupplyStockRow {
  sku: string;
  title: string;
  available: number;
}

interface LocationOption {
  location_id: string;
  name: string;
  tipo_tienda: string | null;
}

const DIGITAL_LOCATION_ID = "71474315479";

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los Canales" },
  { value: "tiendas", label: "🏪 Tiendas de Línea" },
  { value: "outlets", label: "🏷️ Outlets" },
  { value: "digital", label: "🌐 Digital" },
];

/* ── Sales Breakdown Bars ── */
function SalesBreakdownBars({ full, rebajas, promo, total }: { full: number; rebajas: number; promo: number; total: number }) {
  if (total === 0) return <span className="text-xs text-muted-foreground">Sin ventas</span>;
  const max = Math.max(full, rebajas, promo, 1);
  const bars = [
    { label: "Full", value: full, color: "bg-emerald-500", textColor: "text-emerald-600" },
    { label: "Reb.", value: rebajas, color: "bg-destructive", textColor: "text-destructive" },
    { label: "Promo", value: promo, color: "bg-amber-500", textColor: "text-amber-600" },
  ];
  return (
    <div className="space-y-1 w-full min-w-[130px]">
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

export default function LineasProductoPage() {
  const [searchParams] = useSearchParams();
  const initialCanal = searchParams.get("canal") || "all";

  const [days, setDays] = useState(THIS_MONTH_SENTINEL);
  const [canal, setCanal] = useState(initialCanal);
  const [locationId, setLocationId] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCategorias, setSelectedCategorias] = useState<string[]>([]);
  const [data, setData] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);
  const [supplyStock, setSupplyStock] = useState<SupplyStockRow[]>([]);
  const [showSupplies, setShowSupplies] = useState(false);
  const [showStockDetail, setShowStockDetail] = useState(false);
  const [stockSkuCount, setStockSkuCount] = useState(0);
  const [stockRefCount, setStockRefCount] = useState(0);
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);

  // Fetch locations once
  useEffect(() => {
    supabase.from("locations").select("location_id, name, tipo_tienda").eq("is_active", true).order("name")
      .then(({ data }) => setAllLocations((data ?? []) as LocationOption[]));
  }, []);

  // Filter locations by canal
  const filteredLocations = useMemo(() => {
    if (canal === "all") return allLocations;
    if (canal === "digital") return allLocations.filter(l => l.location_id === DIGITAL_LOCATION_ID);
    if (canal === "outlets") return allLocations.filter(l => (l.tipo_tienda ?? "").toUpperCase() === "OUTLET");
    return allLocations.filter(l => ["A", "B", "C"].includes((l.tipo_tienda ?? "").toUpperCase()));
  }, [allLocations, canal]);

  // Reset location when canal changes
  useEffect(() => {
    setLocationId("all");
  }, [canal]);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      const effectiveDays = resolveDays(days);
      const canalParam = canal === "all" ? null : canal;
      const [res, supplyRes, stockCountRes] = await Promise.all([
        supabase.rpc("reporte_desempeno_por_linea" as any, {
          dias_atras: effectiveDays,
          p_canal: canalParam,
        }),
        supabase.rpc("stock_insumos_agregado" as any),
        supabase.rpc("stock_general_por_producto" as any),
      ]);
      if (res.error) {
        setError(res.error.message);
        setData([]);
      } else {
        setData((res.data ?? []) as unknown as LineRow[]);
      }
      if (supplyRes.data) {
        const rows = (supplyRes.data as any[]).map((r: any) => ({
          sku: r.sku,
          title: r.titulo ?? r.sku,
          available: Number(r.stock_total) || 0,
        }));
        setSupplyStock(rows.sort((a, b) => b.available - a.available));
      }
      // Count SKUs and unique product_ids (references)
      if (stockCountRes.data) {
        const productRows = stockCountRes.data as any[];
        setStockRefCount(productRows.length);
        // SKU count = we need to query product_catalog for total SKU count
        const { count } = await supabase.from("product_catalog").select("sku", { count: "exact", head: true })
          .not("category", "in", '("BOLSA","INSUMOS")');
        setStockSkuCount(count ?? 0);
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal]);

  // Available categories for multi-select
  const availableCategories = useMemo(() => {
    return [...new Set(data.map(r => r.categoria).filter(Boolean))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data;
    if (search.trim()) {
      result = result.filter(r => r.categoria?.toLowerCase().includes(search.toLowerCase()));
    }
    if (selectedCategorias.length > 0) {
      result = result.filter(r => selectedCategorias.includes(r.categoria));
    }
    return result;
  }, [data, search, selectedCategorias]);

  const stockTotals = useMemo(() => {
    const totalStock = data.reduce((s, r) => s + (r.stock_tiendas ?? 0) + (r.stock_digital ?? 0), 0);
    return { total: totalStock };
  }, [data]);

  const supplyTotal = supplyStock.reduce((s, r) => s + r.available, 0);

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  const handleExportCSV = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map(r => ({
        Categoría: r.categoria,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Uds Tiendas": r.und_tiendas,
        "Uds Outlets": r.und_outlets,
        "Uds Digital": r.und_digital,
        "Uds Total": r.und_total,
        "Full Price": r.und_full_price ?? 0,
        "Rebajas": r.und_rebajas ?? 0,
        "Promo": r.und_promo ?? 0,
        "% Participación": r.pct_participacion,
        "Sell-Through %": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      "desempeno_lineas"
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length) return;
    exportToPDF(
      filtered.map(r => ({
        Categoría: r.categoria,
        "Stock Total": (r.stock_tiendas + r.stock_digital),
        Full: r.und_full_price ?? 0,
        Reb: r.und_rebajas ?? 0,
        Promo: r.und_promo ?? 0,
        Total: r.und_total,
        "% Part.": r.pct_participacion,
        "%ST": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      "desempeno_lineas",
      "Desempeño por Línea de Producto"
    );
  };

  const canalRpcParam = canal === "all" ? null : canal;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Desempeño por Línea</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Stock, ventas por canal, participación, sell-through y salud por categoría</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setShowStockDetail(true)}
                className="glass-card p-4 text-left transition-all border-2 border-transparent hover:border-border"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-muted-foreground font-medium uppercase">Stock Prendas</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{stockTotals.total.toLocaleString()} uds</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Hash className="h-3 w-3" /> {stockSkuCount.toLocaleString()} SKUs
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Layers className="h-3 w-3" /> {stockRefCount.toLocaleString()} Refs
                  </span>
                </div>
                <p className="text-xs text-primary font-medium mt-0.5">Ver detalle →</p>
              </button>
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Tag className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground font-medium uppercase">Categorías</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{data.length}</p>
              </div>
              <button
                onClick={() => setShowSupplies(true)}
                className="glass-card p-4 text-left transition-all border-2 border-transparent hover:border-border"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground font-medium uppercase">Insumos</span>
                </div>
                <p className="text-xl font-semibold text-foreground">{supplyTotal.toLocaleString()} uds</p>
                <p className="text-xs text-primary font-medium">{supplyStock.length} SKUs →</p>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar categoría..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
              <MultiSelectFilter
                label="Categoría"
                options={availableCategories}
                selected={selectedCategorias}
                onChange={setSelectedCategorias}
              />
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger className="w-full sm:w-[200px] h-10">
                  <SelectValue placeholder="Todos los Canales" />
                </SelectTrigger>
                <SelectContent>
                  {CANAL_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="w-full sm:w-[200px] h-10">
                  <SelectValue placeholder="Todas las tiendas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {canal === "all" ? "Todas las tiendas" : `Todas (${CANAL_OPTIONS.find(c => c.value === canal)?.label.replace(/🏪|🏷️|🌐/g, "").trim()})`}
                  </SelectItem>
                  {filteredLocations.map(loc => (
                    <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
            </div>

            {/* Legend */}
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

            {/* Table */}
            <div className="glass-card overflow-hidden">
              {loading ? (
                <div className="p-6"><LoadingState rows={8} /></div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-4xl mb-3">⚠️</p>
                  <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
                  <p className="text-muted-foreground text-xs mt-1 max-w-md">{error}</p>
                </div>
              ) : !filtered.length ? (
                <EmptyState message="No se encontraron líneas para estos filtros." />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[1100px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[160px]">Categoría</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Uds Total</TableHead>
                        <TableHead className="min-w-[160px]">Desglose Ventas</TableHead>
                        <TableHead className="min-w-[110px]">
                          <div className="flex items-center gap-1">
                            <Tag className="h-3.5 w-3.5" />
                            Clasificación
                          </div>
                        </TableHead>
                        <TableHead className="text-right">% Participación</TableHead>
                        <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                        <TableHead>WOS & Salud</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(row => {
                        const full = row.und_full_price ?? 0;
                        const reb = row.und_rebajas ?? 0;
                        const promo = row.und_promo ?? 0;
                        const isFull = full >= (reb + promo);

                        return (
                          <TableRow
                            key={row.categoria}
                            className="cursor-pointer hover:bg-primary/5"
                            onClick={() => setSelectedCategoria(row.categoria)}
                          >
                            <TableCell>
                              <span className="text-sm font-medium text-primary underline decoration-primary/30">{row.categoria}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="space-y-0.5 text-sm">
                                <p>🏪 <span className="font-medium">{(row.stock_tiendas ?? 0).toLocaleString()}</span></p>
                                <p>📦 <span className="font-medium">{(row.stock_digital ?? 0).toLocaleString()}</span></p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-semibold text-sm">
                              {(row.und_total ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <SalesBreakdownBars full={full} rebajas={reb} promo={promo} total={row.und_total ?? 0} />
                            </TableCell>
                            <TableCell>
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold",
                                isFull ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                              )}>
                                {isFull ? "✅ Venta Full" : "🔻 Con Impulso"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-semibold text-foreground">{row.pct_participacion ?? 0}%</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={Math.min(row.sell_through_pct ?? 0, 100)}
                                  className="h-2.5 flex-1 bg-muted"
                                  indicatorClassName={getSellThroughColor(row.sell_through_pct ?? 0)}
                                />
                                <span className="text-sm font-medium text-foreground w-12 text-right">
                                  {row.sell_through_pct ?? 0}%
                                </span>
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
                  <p className="text-xs text-muted-foreground px-4 py-2">Click en una categoría para ver productos</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Category Products Drawer */}
      <CategoryProductsDrawer
        categoria={selectedCategoria}
        days={days}
        canal={canalRpcParam}
        onClose={() => setSelectedCategoria(null)}
      />

      {/* Stock Detail Dialog */}
      <Dialog open={showStockDetail} onOpenChange={setShowStockDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-emerald-600" />
              Detalle Stock Prendas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Total Unidades</p>
                <p className="text-2xl font-bold text-foreground">{stockTotals.total.toLocaleString()}</p>
              </div>
              <div className="border border-border rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase font-medium mb-1">Categorías</p>
                <p className="text-2xl font-bold text-foreground">{data.length}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-border rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase font-medium">SKUs Únicos</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{stockSkuCount.toLocaleString()}</p>
              </div>
              <div className="border border-border rounded-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground uppercase font-medium">Referencias (Productos)</p>
                </div>
                <p className="text-2xl font-bold text-foreground">{stockRefCount.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">Agrupados por Product ID</p>
              </div>
            </div>
            {/* Stock by category */}
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Categoría</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Stock Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sort((a, b) => ((b.stock_tiendas ?? 0) + (b.stock_digital ?? 0)) - ((a.stock_tiendas ?? 0) + (a.stock_digital ?? 0))).map(r => (
                    <tr key={r.categoria} className="border-b border-border/50">
                      <td className="px-3 py-2 text-xs font-medium text-foreground">{r.categoria}</td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-foreground">
                        {((r.stock_tiendas ?? 0) + (r.stock_digital ?? 0)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Supplies Dialog */}
      <Dialog open={showSupplies} onOpenChange={setShowSupplies}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Stock Total Insumos — {supplyTotal.toLocaleString()} uds
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Insumo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {supplyStock.map((row) => (
                  <tr key={row.sku} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{row.sku}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground text-xs">{row.title}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground">{row.available.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
