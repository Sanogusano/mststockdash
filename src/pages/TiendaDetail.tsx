import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ArrowLeft, DollarSign, Receipt, ShoppingBag, Star, Percent, Package, Filter } from "lucide-react";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface WosCategoryRow {
  categoria: string | null;
  inventario_total: number | null;
  venta_promedio_semanal: number | null;
  semanas_inventario: number | null;
  estado_salud: string | null;
}

interface KpiData {
  total_pedidos: number;
  unidades_vendidas: number;
  ingresos_netos: number;
  ticket_promedio: number;
  upt: number;
  pct_pedidos_full_price: number;
  pct_pedidos_con_descuento: number;
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
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [supplyStock, setSupplyStock] = useState<SupplyStockRow[]>([]);

  // WOS table filters
  const [filterCategoria, setFilterCategoria] = useState<string>("all");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [filterStock, setFilterStock] = useState<string>("all");

  useEffect(() => {
    async function fetchData() {
      if (!id || !isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [locRes, wosRes, kpiRes, supplyRes] = await Promise.all([
        supabase.from("locations").select("name").eq("location_id", id).single(),
        supabase.rpc("reporte_wos_categoria_tienda", { dias_atras: effectiveDays, p_location_id: id }),
        // Fix: pass null for p_canal so outlets/all stores show correct KPIs
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_location_id: id }),
        // Fetch supply stock (Bolsas & Empaques) for this location
        supabase
          .from("inventory_snapshot")
          .select("sku, available, product_catalog!inner(title, category)")
          .eq("location_id", id)
          .or("category.ilike.%bolsa%,category.ilike.%insumo%", { referencedTable: "product_catalog" }),
      ]);

      if (locRes.data) setStoreName(locRes.data.name);
      if (wosRes.data) setData(wosRes.data as unknown as WosCategoryRow[]);
      if (kpiRes.data && kpiRes.data.length > 0) {
        setKpis(kpiRes.data[0] as unknown as KpiData);
      }
      
      if (supplyRes.data) {
        const mapped = (supplyRes.data as any[]).map((r) => ({
          sku: r.sku,
          title: (r.product_catalog as any)?.title ?? r.sku,
          available: r.available ?? 0,
        }));
        // Aggregate by SKU in case of duplicates
        const aggregated: Record<string, SupplyStockRow> = {};
        mapped.forEach((r) => {
          if (aggregated[r.sku]) {
            aggregated[r.sku].available += r.available;
          } else {
            aggregated[r.sku] = { ...r };
          }
        });
        setSupplyStock(Object.values(aggregated).sort((a, b) => b.available - a.available));
      }
      setLoading(false);
    }
    fetchData();
  }, [id, days]);

  // Filtered WOS data
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (filterCategoria !== "all" && row.categoria !== filterCategoria) return false;
      if (filterEstado !== "all" && !row.estado_salud?.includes(filterEstado)) return false;
      if (filterStock === "con_stock" && (row.inventario_total ?? 0) === 0) return false;
      if (filterStock === "sin_stock" && (row.inventario_total ?? 0) > 0) return false;
      if (filterStock === "alto" && (row.inventario_total ?? 0) < 100) return false;
      if (filterStock === "bajo" && (row.inventario_total ?? 0) >= 100) return false;
      return true;
    });
  }, [data, filterCategoria, filterEstado, filterStock]);

  const uniqueCategories = useMemo(() => [...new Set(data.map((r) => r.categoria).filter(Boolean))], [data]);
  const uniqueEstados = useMemo(() => [...new Set(data.map((r) => r.estado_salud).filter(Boolean))], [data]);

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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <KpiCard label="Ventas Netas" value={(kpis?.ingresos_netos ?? 0).toLocaleString()} prefix="$" icon={DollarSign} />
                  <KpiCard label="Ticket Promedio" value={(kpis?.ticket_promedio ?? 0).toLocaleString()} prefix="$" icon={Receipt} />
                  <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag} />
                  <KpiCard label="% Full Price" value={`${(kpis?.pct_pedidos_full_price ?? 0).toFixed(1)}%`} icon={Star} className="text-green-600" />
                  <KpiCard label="% Descuento" value={`${(kpis?.pct_pedidos_con_descuento ?? 0).toFixed(1)}%`} icon={Percent} className="text-orange-500" />
                </div>

                {/* Summary cards */}
                {data.length === 0 ? (
                  <EmptyState message="Sin datos de categoría para esta tienda." />
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="glass-card p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Categorías</p>
                        <p className="text-2xl font-semibold text-foreground mt-0.5">{data.length}</p>
                      </div>
                      <div className="glass-card p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Stock Total (Prendas)</p>
                        <p className="text-2xl font-semibold text-foreground mt-0.5">
                          {data.reduce((s, r) => s + (r.inventario_total ?? 0), 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="glass-card p-5">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Venta Semanal</p>
                        <p className="text-2xl font-semibold text-foreground mt-0.5">
                          {data.reduce((s, r) => s + (r.venta_promedio_semanal ?? 0), 0).toLocaleString()} uds
                        </p>
                      </div>
                    </div>

                    {/* Bolsas & Empaques Stock */}
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

                    {/* Detail table with filters */}
                    <div className="glass-card overflow-hidden">
                      <div className="px-5 py-4 border-b border-border space-y-3">
                        <h3 className="text-sm font-semibold text-foreground">WOS por Categoría</h3>
                        <div className="flex flex-wrap items-center gap-2">
                          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
                            <SelectTrigger className="h-8 w-[160px] text-xs">
                              <SelectValue placeholder="Categoría" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas las categorías</SelectItem>
                              {uniqueCategories.map((c) => (
                                <SelectItem key={c!} value={c!}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={filterStock} onValueChange={setFilterStock}>
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue placeholder="Stock" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todo el stock</SelectItem>
                              <SelectItem value="con_stock">Con stock</SelectItem>
                              <SelectItem value="sin_stock">Sin stock</SelectItem>
                              <SelectItem value="alto">Stock alto (≥100)</SelectItem>
                              <SelectItem value="bajo">Stock bajo (&lt;100)</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={filterEstado} onValueChange={setFilterEstado}>
                            <SelectTrigger className="h-8 w-[180px] text-xs">
                              <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todos los estados</SelectItem>
                              {uniqueEstados.map((e) => (
                                <SelectItem key={e!} value={e!}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredData.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                                  No hay datos con los filtros seleccionados.
                                </td>
                              </tr>
                            ) : (
                              filteredData.map((row, i) => (
                                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3 font-medium text-foreground">{row.categoria ?? "—"}</td>
                                  <td className="px-4 py-3 text-right">{(row.inventario_total ?? 0).toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right">{(row.venta_promedio_semanal ?? 0).toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right font-medium" style={{ color: getBarColor(row.semanas_inventario) }}>
                                    {row.semanas_inventario == null ? "∞" : row.semanas_inventario > 99 ? "+99w" : `${row.semanas_inventario.toFixed(1)}w`}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <StatusBadge label={row.estado_salud ?? ""} />
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
