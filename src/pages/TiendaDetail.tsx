import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";
import { ArrowLeft, DollarSign, Receipt, ShoppingBag, Star, Percent, Package, Filter, Tag } from "lucide-react";
import { CollectionInventoryCard } from "@/components/dashboard/CollectionInventoryCard";
import { isValidDays } from "@/lib/validation";
import { resolveDays, needsDateRange, getDateRange, toDateStr, getFilterEndDate } from "@/components/dashboard/TimeFilter";
import { cn } from "@/lib/utils";
import { CategoryProductsDrawer } from "@/components/dashboard/CategoryProductsDrawer";

interface WosCategoryRow {
  categoria: string | null;
  inventario_total: number | null;
  venta_promedio_semanal: number | null;
  semanas_inventario: number | null;
  estado_salud: string | null;
}

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

interface KpiData {
  total_pedidos: number;
  unidades_vendidas: number;
  ingresos_netos: number;
  ticket_promedio: number;
  upt: number;
  pct_pedidos_full_price: number;
  pct_pedidos_con_descuento: number;
  pct_pedidos_rebajas: number;
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

function KpiCard({ label, value, prefix = "", icon: Icon, className }: {
  label: string; value: string; prefix?: string; icon: React.ElementType; className?: string;
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className={cn("h-5 w-5 text-primary", className)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={cn("text-2xl font-semibold text-foreground mt-0.5", className)}>{prefix}{value}</p>
      </div>
    </div>
  );
}

export default function TiendaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<WosCategoryRow[]>([]);
  const [wosCatData, setWosCatData] = useState<WosCatGlobalRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [supplyStock, setSupplyStock] = useState<SupplyStockRow[]>([]);

  // WOS global table filters
  const [selEstados, setSelEstados] = useState<string[]>([]);
  const [selStock, setSelStock] = useState<string[]>([]);
  const [priceFilter, setPriceFilter] = useState<"all" | "full_price" | "rebajado">("all");
  const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!id || !isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [locRes, wosRes, kpiRes, supplyRes, wosCatRes] = await Promise.all([
        supabase.from("locations").select("name").eq("location_id", id).single(),
        supabase.rpc("reporte_wos_categoria_tienda", { dias_atras: effectiveDays, p_location_id: id }),
        needsDateRange(days)
          ? supabase.rpc("reporte_kpis_por_rango" as any, (() => { const r = getDateRange(days); return { p_desde: toDateStr(r.from), p_hasta: toDateStr(r.to), p_location_id: id }; })())
          : supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_location_id: id }),
        supabase
          .from("product_catalog")
          .select("sku, title, category, variant_id")
          .or("category.ilike.%bolsa%,category.ilike.%insumo%"),
        supabase.rpc("reporte_wos_categoria_global", { dias_atras: effectiveDays, p_location_ids: [id] }),
      ]);

      if (locRes.data) setStoreName(locRes.data.name);
      if (wosRes.data) setData(wosRes.data as unknown as WosCategoryRow[]);
      if (kpiRes.data && kpiRes.data.length > 0) {
        setKpis(kpiRes.data[0] as unknown as KpiData);
      }
      if (wosCatRes.data) setWosCatData(wosCatRes.data as unknown as WosCatGlobalRow[]);
      
      // Get supply SKUs from catalog, then fetch their inventory for this location
      if (supplyRes.data && supplyRes.data.length > 0) {
        const supplySkus = (supplyRes.data as any[]).map((r: any) => r.sku);
        const supplyTitleMap: Record<string, string> = {};
        (supplyRes.data as any[]).forEach((r: any) => {
          supplyTitleMap[r.sku] = r.title ?? r.sku;
        });
        // Fetch inventory for these SKUs at this location
        const { data: invData } = await supabase
          .from("inventory_snapshot")
          .select("sku, available")
          .eq("location_id", id)
          .in("sku", supplySkus);
        if (invData) {
          const aggregated: Record<string, SupplyStockRow> = {};
          (invData as any[]).forEach((r: any) => {
            const sku = r.sku;
            const available = r.available ?? 0;
            if (aggregated[sku]) {
              aggregated[sku].available += available;
            } else {
              aggregated[sku] = { sku, title: supplyTitleMap[sku] ?? sku, available };
            }
          });
          setSupplyStock(Object.values(aggregated).sort((a, b) => b.available - a.available));
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [id, days]);

  // Compute stock-based % full price and % rebajado from WOS global data
  const stockPcts = useMemo(() => {
    if (wosCatData.length === 0) return { fullPrice: 0, rebajado: 0, fullUnits: 0, rebUnits: 0 };
    const totalStock = wosCatData.reduce((s, r) => s + (r.inventario_total ?? 0), 0);
    if (totalStock === 0) return { fullPrice: 0, rebajado: 0, fullUnits: 0, rebUnits: 0 };
    const weightedFull = wosCatData.reduce((s, r) => s + (r.pct_full_price ?? 0) * (r.inventario_total ?? 0), 0) / totalStock;
    const weightedReb = wosCatData.reduce((s, r) => s + (r.pct_rebajado ?? 0) * (r.inventario_total ?? 0), 0) / totalStock;
    const fullUnits = Math.round(totalStock * weightedFull / 100);
    const rebUnits = totalStock - fullUnits;
    return { fullPrice: weightedFull, rebajado: weightedReb, fullUnits, rebUnits };
  }, [wosCatData]);

  // Filtered WOS global data
  const stockOptions = ["Con stock", "Sin stock", "Stock alto (≥100)", "Stock bajo (<100)"];
  const uniqueEstados = useMemo(() => [...new Set(wosCatData.map((r) => r.estado_salud))], [wosCatData]);

  const filteredWosCat = useMemo(() => {
    return wosCatData.filter((row) => {
      if (selEstados.length > 0 && !selEstados.some((e) => row.estado_salud.includes(e))) return false;
      if (selStock.length > 0) {
        const stock = row.inventario_total ?? 0;
        const pass = selStock.some((s) => {
          if (s === "Con stock") return stock > 0;
          if (s === "Sin stock") return stock === 0;
          if (s === "Stock alto (≥100)") return stock >= 100;
          if (s === "Stock bajo (<100)") return stock < 100;
          return true;
        });
        if (!pass) return false;
      }
      if (priceFilter === "full_price" && row.pct_full_price < 50) return false;
      if (priceFilter === "rebajado" && row.pct_rebajado < 50) return false;
      return true;
    });
  }, [wosCatData, selEstados, selStock, priceFilter]);

  const supplyTotal = supplyStock.reduce((s, r) => s + r.available, 0);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <Link to="/inventarios" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">{storeName || "Tienda"}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Salud de inventario por categoría</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            {loading ? (
              <LoadingState rows={6} />
            ) : (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <KpiCard label="Ventas Netas" value={(kpis?.ingresos_netos ?? 0).toLocaleString()} prefix="$" icon={DollarSign} />
                  <KpiCard label="Ticket Promedio" value={(kpis?.ticket_promedio ?? 0).toLocaleString()} prefix="$" icon={Receipt} />
                  <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag} />
                </div>

                {/* Price Filter & Supply Cards */}
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
                    <p className="text-xl font-semibold text-foreground">{stockPcts.fullUnits.toLocaleString()} uds</p>
                    <p className="text-sm text-emerald-600 font-medium">{stockPcts.fullPrice.toFixed(1)}%</p>
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
                    <p className="text-xl font-semibold text-foreground">{stockPcts.rebUnits.toLocaleString()} uds</p>
                    <p className="text-sm text-orange-500 font-medium">{stockPcts.rebajado.toFixed(1)}%</p>
                  </button>
                  {supplyStock.length > 0 && (
                    <div className="glass-card p-4 text-left">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-primary" />
                        <span className="text-xs text-muted-foreground font-medium uppercase">Insumos</span>
                      </div>
                      <p className="text-xl font-semibold text-foreground">{supplyTotal.toLocaleString()} uds</p>
                      <p className="text-sm text-primary font-medium">{supplyStock.length} SKUs</p>
                    </div>
                  )}
                </div>


                {/* Collection Inventory Composition */}
                <CollectionInventoryCard locationId={id} />

                {/* WOS by Category with multi-select filters */}
                {wosCatData.length > 0 && (
                  <div className="glass-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">WOS por Categoría</h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                        <MultiSelectFilter label="Stock" options={stockOptions} selected={selStock} onChange={setSelStock} />
                        <MultiSelectFilter label="Estado" options={uniqueEstados} selected={selEstados} onChange={setSelEstados} />
                        {priceFilter !== "all" && (
                          <button onClick={() => setPriceFilter("all")} className="text-xs text-primary underline ml-2">Limpiar filtro precio</button>
                        )}
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
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
                          {filteredWosCat.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                No hay datos con los filtros seleccionados.
                              </td>
                            </tr>
                          ) : (
                            filteredWosCat.map((row, i) => (
                              <tr key={i} className="border-b border-border/50 hover:bg-primary/5 transition-colors cursor-pointer" onClick={() => setSelectedCategoria(row.categoria)}>
                                <td className="px-4 py-3 font-medium text-primary underline decoration-primary/30">{row.categoria}</td>
                                <td className="px-4 py-3 text-right">{(row.inventario_total ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right">{(row.venta_promedio_semanal ?? 0).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right font-medium" style={{ color: getBarColor(row.semanas_inventario) }}>
                                  {row.semanas_inventario == null ? "∞" : row.semanas_inventario > 99 ? "+99w" : `${row.semanas_inventario.toFixed(1)}w`}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-emerald-600 font-medium">{row.pct_full_price.toFixed(1)}%</span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="text-orange-500 font-medium">{row.pct_rebajado.toFixed(1)}%</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatusBadge label={row.estado_salud} />
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Bolsas & Empaques Stock - moved after WOS */}
                {supplyStock.length > 0 && (
                  <div className="glass-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">
                        Bolsas & Empaques — Stock Total: {supplyTotal.toLocaleString()} uds
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
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
                              <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                                {row.available.toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <CategoryProductsDrawer
        categoria={selectedCategoria}
        days={days}
        locationId={id}
        storeName={storeName}
        onClose={() => setSelectedCategoria(null)}
      />
    </SidebarProvider>
  );
}
