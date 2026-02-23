import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { ArrowLeft, DollarSign, Receipt, ShoppingBag, Star, Percent } from "lucide-react";
import { isValidDays } from "@/lib/validation";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    async function fetchData() {
      if (!id || !isValidDays(days)) return;
      setLoading(true);

      const [locRes, wosRes, kpiRes] = await Promise.all([
        supabase.from("locations").select("name").eq("location_id", id).single(),
        supabase.rpc("reporte_wos_categoria_tienda", { dias_atras: days, p_location_id: id }),
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: days, p_canal: "pos", p_location_id: id }),
      ]);

      if (locRes.data) setStoreName(locRes.data.name);
      if (wosRes.data) setData(wosRes.data as unknown as WosCategoryRow[]);
      if (kpiRes.data && kpiRes.data.length > 0) {
        setKpis(kpiRes.data[0] as unknown as KpiData);
      }
      setLoading(false);
    }
    fetchData();
  }, [id, days]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <Link to="/inventarios" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{storeName || "Tienda"}</h2>
                <p className="text-xs text-muted-foreground">Salud de inventario por categoría</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-6 py-6">
            {loading ? (
              <LoadingState rows={6} />
            ) : (
              <div className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <KpiCard label="Ventas Totales" value={(kpis?.ingresos_netos ?? 0).toLocaleString()} prefix="$" icon={DollarSign} />
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
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Stock Total</p>
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

                    {/* Detail table */}
                    <div className="glass-card overflow-hidden">
                      <div className="px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-semibold text-foreground">WOS por Categoría</h3>
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
                            {data.map((row, i) => (
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
                            ))}
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
