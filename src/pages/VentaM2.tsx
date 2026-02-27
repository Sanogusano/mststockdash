import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { ArrowLeft, Ruler, Download, FileText, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const CEDI_ID = "71474315479";
const OUTLET_KEYWORDS = ["SOPO", "UNICO", "ÚNICO"];
const isOutlet = (name: string) => OUTLET_KEYWORDS.some(k => name.toUpperCase().includes(k));

interface RankingRow {
  tienda: string;
  ventas_totales: number;
  unidades_vendidas: number;
}

interface LocationM2 {
  location_id: string;
  name: string;
  dimension_m2: number | null;
}

interface StoreM2Row {
  tienda: string;
  ventas_netas: number;
  m2: number;
  venta_m2: number;
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export default function VentaM2Page() {
  const [searchParams] = useSearchParams();
  const initialDays = Number(searchParams.get("days")) || 30;
  const canalParam = searchParams.get("canal") || "";

  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<StoreM2Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [rankTiendasRes, rankOutletsRes, locRes] = await Promise.all([
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: "tiendas" }),
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: "outlets" }),
        supabase.from("locations").select("location_id, name, dimension_m2").eq("is_active", true),
      ]);

      const locMap = new Map<string, LocationM2>();
      if (locRes.data) {
        for (const l of locRes.data as LocationM2[]) {
          locMap.set(l.name, l);
        }
      }

      const allRanking: RankingRow[] = [
        ...((rankTiendasRes.data ?? []) as unknown as RankingRow[]),
        ...((rankOutletsRes.data ?? []) as unknown as RankingRow[]),
      ];

      // Filter by canal if specified
      const filtered = canalParam
        ? allRanking.filter(r => {
            const loc = locMap.get(r.tienda);
            if (!loc) return false;
            if (canalParam === "tiendas") return !isOutlet(loc.name) && loc.location_id !== CEDI_ID;
            if (canalParam === "outlets") return isOutlet(loc.name);
            return true;
          })
        : allRanking;

      const rows: StoreM2Row[] = filtered
        .map(r => {
          const loc = locMap.get(r.tienda);
          const m2 = loc?.dimension_m2 ?? 0;
          return {
            tienda: r.tienda,
            ventas_netas: r.ventas_totales,
            m2,
            venta_m2: m2 > 0 ? r.ventas_totales / m2 : 0,
          };
        })
        .filter(r => r.m2 > 0)
        .sort((a, b) => b.venta_m2 - a.venta_m2);

      setData(rows);
      setLoading(false);
    }
    fetchData();
  }, [days, canalParam]);

  const MEDALS = ["🥇", "🥈", "🥉"];

  const totalVentas = data.reduce((s, r) => s + r.ventas_netas, 0);
  const totalM2 = data.reduce((s, r) => s + r.m2, 0);
  const avgVentaM2 = totalM2 > 0 ? totalVentas / totalM2 : 0;

  const exportData = data.map((r, i) => ({
    "#": i + 1,
    Tienda: r.tienda,
    "Ventas Netas": r.ventas_netas,
    "m²": r.m2,
    "Venta / m²": Math.round(r.venta_m2),
  }));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Venta por Metro Cuadrado</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Ranking de tiendas por eficiencia de superficie</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            {loading ? (
              <LoadingState rows={6} />
            ) : data.length === 0 ? (
              <EmptyState message="Sin datos de venta por m² para este período." />
            ) : (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass-card p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Promedio Venta / m²</p>
                    <p className="text-2xl font-semibold text-foreground mt-0.5">{fmtCurrency(avgVentaM2)}</p>
                  </div>
                  <div className="glass-card p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Superficie</p>
                    <p className="text-2xl font-semibold text-foreground mt-0.5">{totalM2.toLocaleString()} m²</p>
                  </div>
                  <div className="glass-card p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Tiendas Analizadas</p>
                    <p className="text-2xl font-semibold text-foreground mt-0.5">{data.length}</p>
                  </div>
                </div>

                {/* Ranking Table */}
                <div className="glass-card overflow-hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Ranking — Venta por m²</h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => exportToCSV(exportData as unknown as Record<string, unknown>[], `venta_m2_${days}d`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        CSV
                      </button>
                      <button
                        onClick={() => exportToPDF(exportData as unknown as Record<string, unknown>[], `venta_m2_${days}d`, "Ranking Venta por m²")}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-10">#</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ventas Netas</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">m²</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Venta / m²</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">vs Promedio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row, i) => {
                          const vsAvg = avgVentaM2 > 0 ? ((row.venta_m2 - avgVentaM2) / avgVentaM2) * 100 : 0;
                          const isAbove = vsAvg >= 0;
                          return (
                            <tr key={row.tienda} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-center text-base">
                                {i < 3 ? MEDALS[i] : <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>}
                              </td>
                              <td className="px-4 py-3 font-medium text-foreground">{row.tienda}</td>
                              <td className="px-4 py-3 text-right font-semibold text-foreground">{fmtCurrency(row.ventas_netas)}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground">{row.m2} m²</td>
                              <td className="px-4 py-3 text-right font-bold text-foreground">{fmtCurrency(row.venta_m2)}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                                  isAbove ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive"
                                )}>
                                  {isAbove ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {isAbove ? "+" : ""}{vsAvg.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
