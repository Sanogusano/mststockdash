import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { CategoryProductsDrawer } from "./CategoryProductsDrawer";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Filter, Star, Tag, Package, Download, FileText } from "lucide-react";
import { CollectionInventoryCard } from "./CollectionInventoryCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface WosCatGlobalRow {
  tienda: string;
  location_id: string;
  categoria: string;
  inventario_total: number;
  venta_promedio_semanal: number;
  semanas_inventario: number | null;
  pct_full_price: number;
  pct_rebajado: number;
  estado_salud: string;
}

interface SupplyStockRow {
  sku: string;
  title: string;
  available: number;
}

const getBarColor = (semanas: number | null) => {
  if (!semanas) return "hsl(240,10%,40%)";
  if (semanas > 20) return "hsl(0,72%,51%)";
  if (semanas < 8) return "hsl(38,92%,50%)";
  return "hsl(152,60%,40%)";
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: number;
}

export function InventoryGlobalReport({ open, onOpenChange, days }: Props) {
  const [data, setData] = useState<WosCatGlobalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplyStock, setSupplyStock] = useState<SupplyStockRow[]>([]);
  const [showSupplies, setShowSupplies] = useState(false);

  const [selCanal, setSelCanal] = useState<string[]>([]);
  const [selTienda, setSelTienda] = useState<string[]>([]);
  const [selEstado, setSelEstado] = useState<string[]>([]);
  const [priceFilter, setPriceFilter] = useState<"all" | "full_price" | "rebajado">("all");
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);

  const [locTipoMap, setLocTipoMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    async function fetch() {
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const [res, locRes, supplyRes] = await Promise.all([
        supabase.rpc("reporte_wos_categoria_global", { dias_atras: effectiveDays }),
        supabase.from("locations").select("location_id, tipo_tienda").eq("is_active", true),
        supabase
          .from("inventory_snapshot")
          .select("sku, available, product_catalog!inner(title, category)")
          .or("category.ilike.%bolsa%,category.ilike.%insumo%", { referencedTable: "product_catalog" }),
      ]);
      if (res.data) setData(res.data as unknown as WosCatGlobalRow[]);
      if (locRes.data) {
        const m = new Map<string, string>();
        for (const l of locRes.data) m.set(l.location_id, (l.tipo_tienda ?? '').toUpperCase());
        setLocTipoMap(m);
      }
      if (supplyRes.data) {
        const mapped = (supplyRes.data as any[]).map((r) => ({
          sku: r.sku,
          title: (r.product_catalog as any)?.title ?? r.sku,
          available: r.available ?? 0,
        }));
        const aggregated: Record<string, SupplyStockRow> = {};
        mapped.forEach((r) => {
          if (aggregated[r.sku]) aggregated[r.sku].available += r.available;
          else aggregated[r.sku] = { ...r };
        });
        setSupplyStock(Object.values(aggregated).sort((a, b) => b.available - a.available));
      }
      setLoading(false);
    }
    fetch();
  }, [open, days]);

  const getCanal = (row: WosCatGlobalRow) => {
    const tipo = locTipoMap.get(row.location_id) ?? '';
    if (tipo === 'OUTLET') return 'Outlets';
    if (row.location_id === '71474315479') return 'Digital';
    return 'Tiendas';
  };

  const canalOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => set.add(getCanal(r)));
    return [...set].sort();
  }, [data, locTipoMap]);

  const tiendaOptions = useMemo(() => [...new Set(data.map((r) => r.tienda))].sort(), [data]);
  const estadoOptions = useMemo(() => [...new Set(data.map((r) => r.estado_salud))], [data]);

  // Compute stock totals for price cards
  const stockTotals = useMemo(() => {
    const totalStock = data.reduce((s, r) => s + (r.inventario_total ?? 0), 0);
    if (totalStock === 0) return { fullPrice: 0, rebajado: 0, fullPct: 0, rebPct: 0 };
    const weightedFull = data.reduce((s, r) => s + (r.pct_full_price ?? 0) * (r.inventario_total ?? 0), 0) / totalStock;
    const weightedReb = data.reduce((s, r) => s + (r.pct_rebajado ?? 0) * (r.inventario_total ?? 0), 0) / totalStock;
    const fullUnits = Math.round(totalStock * weightedFull / 100);
    const rebUnits = totalStock - fullUnits;
    return { fullPrice: fullUnits, rebajado: rebUnits, fullPct: weightedFull, rebPct: weightedReb };
  }, [data]);

  const supplyTotal = supplyStock.reduce((s, r) => s + r.available, 0);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (selCanal.length > 0 && !selCanal.includes(getCanal(row))) return false;
      if (selTienda.length > 0 && !selTienda.includes(row.tienda)) return false;
      if (selEstado.length > 0 && !selEstado.some((e) => row.estado_salud.includes(e))) return false;
      if (priceFilter === "full_price" && row.pct_full_price < 50) return false;
      if (priceFilter === "rebajado" && row.pct_rebajado < 50) return false;
      return true;
    });
  }, [data, selCanal, selTienda, selEstado, priceFilter]);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map((r) => ({
        Tienda: r.tienda,
        Categoría: r.categoria,
        "Stock Total": r.inventario_total,
        "Venta Prom/Sem": r.venta_promedio_semanal,
        WOS: r.semanas_inventario,
        "% Full Price": r.pct_full_price,
        "% Rebajado": r.pct_rebajado,
        Estado: r.estado_salud,
      })),
      "informe_inventario_global"
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length) return;
    exportToPDF(
      filtered.map((r) => ({
        Tienda: r.tienda,
        Categoría: r.categoria,
        Stock: r.inventario_total,
        "Vta/Sem": r.venta_promedio_semanal,
        WOS: r.semanas_inventario,
        "% Full": r.pct_full_price,
        "% Reb": r.pct_rebajado,
        Estado: r.estado_salud,
      })),
      "informe_inventario_global",
      "Informe General — WOS por Categoría"
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Informe General — WOS por Categoría (Todos los canales)</DialogTitle>
          </DialogHeader>

          {loading ? (
            <LoadingState rows={6} />
          ) : data.length === 0 ? (
            <EmptyState message="No hay datos disponibles." />
          ) : (
            <div className="space-y-4">
              {/* Price Filter Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setPriceFilter(priceFilter === "full_price" ? "all" : "full_price")}
                  className={cn(
                    "glass-card p-4 text-left transition-all border-2",
                    priceFilter === "full_price" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-transparent hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Star className="h-4 w-4 text-emerald-600" />
                    <span className="text-xs text-muted-foreground font-medium uppercase">Full Price</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">{stockTotals.fullPrice.toLocaleString()} uds</p>
                  <p className="text-sm text-emerald-600 font-medium">{stockTotals.fullPct.toFixed(1)}%</p>
                </button>
                <button
                  onClick={() => setPriceFilter(priceFilter === "rebajado" ? "all" : "rebajado")}
                  className={cn(
                    "glass-card p-4 text-left transition-all border-2",
                    priceFilter === "rebajado" ? "border-orange-500 ring-2 ring-orange-500/20" : "border-transparent hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="h-4 w-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground font-medium uppercase">Rebajado</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">{stockTotals.rebajado.toLocaleString()} uds</p>
                  <p className="text-sm text-orange-500 font-medium">{stockTotals.rebPct.toFixed(1)}%</p>
                </button>
                <button
                  onClick={() => setShowSupplies(true)}
                  className="glass-card p-4 text-left transition-all border-2 border-transparent hover:border-border"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground font-medium uppercase">Insumos</span>
                  </div>
                  <p className="text-xl font-semibold text-foreground">{supplyTotal.toLocaleString()} uds</p>
                  <p className="text-sm text-primary font-medium">{supplyStock.length} SKUs</p>
                </button>
              </div>

              {/* Collection Inventory Composition */}
              <CollectionInventoryCard />

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <MultiSelectFilter label="Canal" options={canalOptions} selected={selCanal} onChange={setSelCanal} />
                <MultiSelectFilter label="Tienda" options={tiendaOptions} selected={selTienda} onChange={setSelTienda} />
                <MultiSelectFilter label="Estado" options={estadoOptions} selected={selEstado} onChange={setSelEstado} />
                {priceFilter !== "all" && (
                  <button onClick={() => setPriceFilter("all")} className="text-xs text-primary underline ml-2">Limpiar filtro precio</button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
                    <Download className="h-4 w-4 mr-1" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categoría</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Total</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Venta Prom/Sem</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">WOS</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">% Full Price</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">% Rebajado</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No hay datos con los filtros seleccionados.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 hover:bg-primary/5 transition-colors cursor-pointer"
                          onClick={() => setSelectedCategoria(row.categoria)}
                        >
                          <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.tienda}</td>
                          <td className="px-4 py-2.5 text-xs text-primary font-medium underline decoration-primary/30">{row.categoria}</td>
                          <td className="px-4 py-2.5 text-right text-xs">{(row.inventario_total ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-xs">{(row.venta_promedio_semanal ?? 0).toLocaleString()}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: getBarColor(row.semanas_inventario) }}>
                            {row.semanas_inventario == null ? "∞" : row.semanas_inventario > 99 ? "+99w" : `${row.semanas_inventario.toFixed(1)}w`}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs">
                            <span className="text-emerald-600 font-medium">{row.pct_full_price.toFixed(1)}%</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs">
                            <span className="text-orange-500 font-medium">{row.pct_rebajado.toFixed(1)}%</span>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusBadge label={row.estado_salud} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{filtered.length} filas · Click en una categoría para ver productos</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Category Products Drawer */}
      <CategoryProductsDrawer
        categoria={selectedCategoria}
        days={days}
        onClose={() => setSelectedCategoria(null)}
      />

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
    </>
  );
}
