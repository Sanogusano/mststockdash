import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Globe, Download, FileText, DollarSign, ShoppingBag, Receipt, Star, Percent, Tag, Trophy, TrendingDown, TrendingUp, CalendarDays, Package, AlertTriangle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { StoreLeaderboard } from "./StoreLeaderboard";

/* ── Constants ── */
const CEDI_ID = "71474315479";
const CEDI_DISPLAY = "Bodega Ecommerce";
const OUTLET_KEYWORDS = ["SOPO", "UNICO", "ÚNICO"];
const isOutlet = (name: string) => OUTLET_KEYWORDS.some(k => name.toUpperCase().includes(k.toUpperCase()));

/* ── Pareto Types ── */
interface ParetoRow {
  categoria: string | null;
  unidades: number | null;
  ingresos: number | null;
  pct_participacion: number | null;
}

const PARETO_COLORS = [
  "hsl(220,70%,55%)", "hsl(260,60%,55%)", "hsl(330,65%,55%)",
  "hsl(160,55%,45%)", "hsl(38,85%,55%)", "hsl(0,65%,55%)",
  "hsl(190,60%,45%)", "hsl(280,50%,55%)", "hsl(45,80%,50%)", "hsl(300,40%,60%)",
  "hsl(220,10%,65%)",
];

/* ── Types ── */
interface KpiData {
  total_pedidos: number;
  unidades_vendidas: number;
  ingresos_netos: number;
  ticket_promedio: number;
  upt: number;
  pct_pedidos_full_price: number;
  pct_pedidos_con_descuento: number;
}

interface ProductRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  clasificacion: string | null;
  unidades_vendidas: number | null;
  precio_promedio: number | null;
  stock_disponible: number | null;
}

interface Location {
  location_id: string;
  name: string;
}

interface Props {
  days: number;
}

/* ── Export Buttons ── */
function ExportButtons({ data, filename, title }: {
  data: Record<string, unknown>[]; filename: string; title: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => exportToCSV(data, filename)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        CSV
      </button>
      <button
        onClick={() => exportToPDF(data, filename, title)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        PDF
      </button>
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, prefix = "", icon: Icon, className, onClick }: {
  label: string; value: string; prefix?: string; icon: React.ElementType; className?: string; onClick?: () => void;
}) {
  return (
    <div
      className={cn("glass-card p-5 flex items-start gap-4", onClick && "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all")}
      onClick={onClick}
    >
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

/* ── Product Table ── */
function ProductTable({ data, title, exportFilename }: {
  data: ProductRow[]; title: string; exportFilename: string;
}) {
  if (!data.length) return <EmptyState message="Sin datos para mostrar." />;

  const exportData = data.map(r => ({
    Producto: r.producto ?? "",
    SKU: r.sku ?? "",
    Categoría: r.categoria ?? "",
    Clasificación: r.clasificacion ?? "",
    Unidades: r.unidades_vendidas ?? 0,
    "Precio Prom": r.precio_promedio ?? 0,
    Stock: r.stock_disponible ?? 0,
  }));

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <ExportButtons data={exportData as unknown as Record<string, unknown>[]} filename={exportFilename} title={title} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categoría</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Clasificación</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Uds</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Precio Prom</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.sku ?? i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {row.foto ? (
                      <img
                        src={row.foto}
                        alt={row.producto ?? ""}
                        className="w-16 h-16 rounded-lg object-cover bg-muted"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center text-xl">👗</div>
                    )}
                    <span className="font-medium text-foreground line-clamp-2 max-w-[200px]">{row.producto ?? "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.categoria ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.clasificacion?.includes("Full Price") || row.clasificacion?.includes("Ganador Full")
                      ? "bg-primary/10 text-primary"
                      : "bg-warning/10 text-warning"
                  }`}>
                    {row.clasificacion ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium">{(row.unidades_vendidas ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right">{new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(row.precio_promedio ?? 0)}</td>
                <td className="px-4 py-3 text-right font-medium">{(row.stock_disponible ?? 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Pareto Chart (Top 10 + Otros) ── */
function ParetoChart({ days, canal, locationId }: { days: number; canal: string; locationId?: string | null }) {
  const [data, setData] = useState<ParetoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_pareto_categorias" as any, {
        dias_atras: effectiveDays,
        p_canal: canal === "POS" ? "pos" : "digital",
        p_location_id: locationId || null,
      });
      if (rows) setData(rows as unknown as ParetoRow[]);
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId]);

  if (loading) return <LoadingState rows={3} />;
  if (!data.length) return null;

  const top10 = data.slice(0, 10);
  const rest = data.slice(10);
  const othersPct = rest.reduce((s, r) => s + (r.pct_participacion ?? 0), 0);

  const chartItems = top10.map((r) => ({
    name: r.categoria ?? "—",
    value: Number(r.pct_participacion ?? 0),
  }));
  if (othersPct > 0) {
    chartItems.push({ name: "Otros", value: Number(othersPct.toFixed(1)) });
  }

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4">Participación por Línea</h3>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <ResponsiveContainer width={160} height={160} className="shrink-0">
          <PieChart>
            <Pie data={chartItems} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2} strokeWidth={0}>
              {chartItems.map((_, i) => (
                <Cell key={i} fill={PARETO_COLORS[i % PARETO_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5 max-h-[180px] overflow-y-auto">
          {chartItems.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PARETO_COLORS[i % PARETO_COLORS.length] }} />
                <span className="text-foreground font-medium truncate max-w-[140px]">{r.name}</span>
              </div>
              <span className="text-muted-foreground font-mono">{r.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Comparison indicator ── */
function ComparisonIndicator({ actual, anterior, label }: { actual: number; anterior: number; label?: string }) {
  const pct = anterior > 0 ? ((actual - anterior) / anterior) * 100 : 0;
  const isUp = pct >= 0;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <span className={cn("text-xs font-medium", isUp ? "text-emerald-600" : "text-destructive")}>
        {isUp ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

interface ExtraMetrics {
  mejor_dia_semana: string;
  venta_mejor_dia: number;
  peor_dia_semana: string;
  venta_peor_dia: number;
  venta_promedio_diaria_actual: number;
  venta_promedio_diaria_anterior: number;
  pedidos_promedio_diario_actual: number;
  pedidos_promedio_diario_anterior: number;
  unidades_promedio_diario_actual: number;
  unidades_promedio_diario_anterior: number;
  venta_promedio_semana: number;
  venta_promedio_finde: number;
}

const DAY_MAP: Record<string, string> = {
  Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miércoles",
  Thursday: "Jueves", Friday: "Viernes", Saturday: "Sábado", Sunday: "Domingo",
};
const translateDay = (d: string) => DAY_MAP[d] ?? d;

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

/* ── Performance classification based on avg daily sales vs peers ── */
function getPerformanceClass(storeSales: number, allSales: number[]) {
  if (allSales.length === 0) return { label: "Sin datos", color: "text-muted-foreground" };
  const avg = allSales.reduce((a, b) => a + b, 0) / allSales.length;
  if (avg === 0) return { label: "Sin datos", color: "text-muted-foreground" };
  const ratio = storeSales / avg;
  if (ratio >= 1.3) return { label: "🏆 Excelente", color: "text-emerald-600" };
  if (ratio >= 1.0) return { label: "✅ Bueno", color: "text-primary" };
  if (ratio >= 0.7) return { label: "⚠️ Regular", color: "text-amber-500" };
  return { label: "🔴 Malo", color: "text-destructive" };
}

/* ── Worst 3 lines recommendation from bottom products ── */
function WorstLinesRecommendation({ bottomProducts }: { bottomProducts: ProductRow[] }) {
  if (!bottomProducts.length) return null;

  // Group by category, sum stock
  const catMap = new Map<string, number>();
  for (const p of bottomProducts) {
    const cat = p.categoria ?? "SIN CATEGORÍA";
    catMap.set(cat, (catMap.get(cat) ?? 0) + (p.stock_disponible ?? 0));
  }

  const sorted = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sorted.length === 0) return null;

  return (
    <div className="glass-card p-5 border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">📦 Recomendación: Promocionar o Mover Stock</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">Las 3 líneas con menor rotación y mayor stock disponible:</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {sorted.map(([cat, stock], i) => (
          <div key={cat} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
            <span className="text-lg font-bold text-amber-500">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{cat}</p>
              <p className="text-xs text-muted-foreground">{stock.toLocaleString()} uds en stock</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Store Rank Card (when a specific location is selected) ── */
function StoreRankCard({ days, canal, locationId, locationName }: {
  days: number; canal?: string; locationId: string; locationName: string;
}) {
  const [rank, setRank] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [extraMetrics, setExtraMetrics] = useState<ExtraMetrics | null>(null);
  const [ventasNetas, setVentasNetas] = useState(0);
  const [perfClass, setPerfClass] = useState<{ label: string; color: string }>({ label: "", color: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [rankRes, metricsRes] = await Promise.all([
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: canal || null }),
        supabase.rpc("reporte_metricas_tienda_individual" as any, { dias_atras: effectiveDays, p_location_id: locationId }),
      ]);

      if (rankRes.data) {
        const all = rankRes.data as unknown as RankingRow[];
        setTotal(all.length);
        const idx = all.findIndex(r => r.tienda === locationName);
        if (idx >= 0) {
          setRank(idx + 1);
          setVentasNetas(all[idx].ventas_totales);
          const allDailySales = all.map(r => r.ventas_totales / effectiveDays);
          const storeDailySales = all[idx].ventas_totales / effectiveDays;
          setPerfClass(getPerformanceClass(storeDailySales, allDailySales));
        } else {
          setRank(null);
        }
      }

      if (metricsRes.data && (metricsRes.data as any[]).length > 0) {
        const m = (metricsRes.data as any[])[0];
        setExtraMetrics(m as ExtraMetrics);
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId, locationName]);

  if (loading) return <LoadingState rows={2} />;
  if (rank === null) return <EmptyState message="Esta tienda no aparece en el ranking del período." />;

  const ALERT_THRESHOLD = 60_000_000;
  const showAlert = ventasNetas < ALERT_THRESHOLD;

  return (
    <div className="space-y-4">
      {/* Row: Ranking + Desempeño side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Card 1: Solo posición en ranking */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Posición en Ranking</h3>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-3xl font-bold text-primary">#{rank}</span>
            </div>
            <p className="text-sm text-muted-foreground">de {total} sucursales</p>
            <span className={cn("text-sm font-semibold", perfClass.color)}>{perfClass.label}</span>
          </div>
        </div>

        {/* Card 2: Desempeño Comercial */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Mejor Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{translateDay(extraMetrics?.mejor_dia_semana ?? "N/A")}</p>
              <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_mejor_dia ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Peor Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{translateDay(extraMetrics?.peor_dia_semana ?? "N/A")}</p>
              <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_peor_dia ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prom. L-V</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_semana ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prom. S-D</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_finde ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Venta Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
              <ComparisonIndicator actual={extraMetrics?.venta_promedio_diaria_actual ?? 0} anterior={extraMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Pedidos Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{(extraMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
              <ComparisonIndicator actual={extraMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={extraMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Uds Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{(extraMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
              <ComparisonIndicator actual={extraMetrics?.unidades_promedio_diario_actual ?? 0} anterior={extraMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
            </div>
          </div>
        </div>
      </div>

      {showAlert && (
        <div className="glass-card p-5 border-2 border-destructive/50 bg-destructive/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
              <span className="text-xl">🚨</span>
            </div>
            <div>
              <p className="text-sm font-bold text-destructive">ACTIVAR ACCIONES COMERCIALES</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Las ventas netas ({fmtCurrency(ventasNetas)}) están por debajo del umbral de {fmtCurrency(ALERT_THRESHOLD)}.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Digital Channel Card ── */
function DigitalChannelCard({ days }: { days: number }) {
  const [rank, setRank] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [extraMetrics, setExtraMetrics] = useState<ExtraMetrics | null>(null);
  const [perfClass, setPerfClass] = useState<{ label: string; color: string }>({ label: "", color: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [rankRes, metricsRes] = await Promise.all([
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: null }),
        supabase.rpc("reporte_metricas_tienda_individual" as any, { dias_atras: effectiveDays, p_location_id: CEDI_ID }),
      ]);

      if (rankRes.data) {
        const all = rankRes.data as unknown as RankingRow[];
        setTotal(all.length);
        const idx = all.findIndex(r => r.tienda.toUpperCase().includes("ECOMMERCE") || r.tienda.toUpperCase().includes("BODEGA"));
        if (idx >= 0) {
          setRank(idx + 1);
          const allDailySales = all.map(r => r.ventas_totales / effectiveDays);
          const storeDailySales = all[idx].ventas_totales / effectiveDays;
          setPerfClass(getPerformanceClass(storeDailySales, allDailySales));
        }
      }

      if (metricsRes.data && (metricsRes.data as any[]).length > 0) {
        setExtraMetrics((metricsRes.data as any[])[0] as ExtraMetrics);
      }
      setLoading(false);
    }
    fetch();
  }, [days]);

  if (loading) return <LoadingState rows={2} />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Card 1: Solo posición en ranking */}
        {rank !== null && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Posición en Ranking General</h3>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                <span className="text-3xl font-bold text-primary">#{rank}</span>
              </div>
              <p className="text-sm text-muted-foreground">de {total} sucursales</p>
              <span className={cn("text-sm font-semibold", perfClass.color)}>{perfClass.label}</span>
            </div>
          </div>
        )}

        {/* Card 2: Desempeño Comercial */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Mejor Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{translateDay(extraMetrics?.mejor_dia_semana ?? "N/A")}</p>
              <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_mejor_dia ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Peor Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{translateDay(extraMetrics?.peor_dia_semana ?? "N/A")}</p>
              <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_peor_dia ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prom. L-V</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_semana ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prom. S-D</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_finde ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Venta Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{fmtCurrency(extraMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
              <ComparisonIndicator actual={extraMetrics?.venta_promedio_diaria_actual ?? 0} anterior={extraMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Pedidos Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{(extraMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
              <ComparisonIndicator actual={extraMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={extraMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Uds Prom/Día</p>
              <p className="text-lg font-semibold text-foreground mt-0.5">{(extraMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
              <ComparisonIndicator actual={extraMetrics?.unidades_promedio_diario_actual ?? 0} anterior={extraMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RankingRow {
  tienda: string;
  ventas_totales: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  upt: number;
  pct_venta_full_price: number;
}

/* ── Channel Panel ── */
function ChannelPanel({ days, canal, showLocationFilter, locationFilter }: {
  days: number; canal: string; showLocationFilter: boolean;
  locationFilter?: "tiendas" | "outlets";
}) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [bottomProducts, setBottomProducts] = useState<ProductRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showLocationFilter) return;
    supabase.from("locations").select("location_id, name").eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          const filtered = data
            .filter(l => l.location_id !== CEDI_ID)
            .filter(l => {
              if (locationFilter === "tiendas") return !isOutlet(l.name);
              if (locationFilter === "outlets") return isOutlet(l.name);
              return true;
            })
            .map(l => ({
              ...l,
              name: l.location_id === CEDI_ID ? CEDI_DISPLAY : l.name,
            }));
          setLocations(filtered);
        }
      });
  }, [showLocationFilter, locationFilter]);

  useEffect(() => {
    async function fetchAll() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const locParam = selectedLocation === "all" ? null : selectedLocation;
      const canalFiltro = canal === "digital" ? "DIGITAL" : "POS";

      try {
        const [kpiRes, topRes, bottomRes] = await Promise.all([
          supabase.rpc("reporte_kpis_comerciales", {
            dias_atras: effectiveDays,
            p_canal: canal,
            p_location_id: locParam,
          }),
          supabase.rpc("reporte_ejecutivo_productos", {
            dias_atras: effectiveDays,
            canal_filtro: canalFiltro,
            location_filtro: locParam,
            orden: "TOP",
            limite: 20,
          }),
          supabase.rpc("reporte_ejecutivo_productos", {
            dias_atras: effectiveDays,
            canal_filtro: canalFiltro,
            location_filtro: locParam,
            orden: "BOTTOM",
            limite: 20,
          }),
        ]);

        if (kpiRes.error) console.error(`Error en reporte_kpis_comerciales:`, kpiRes.error);
        if (kpiRes.data && kpiRes.data.length > 0) {
          setKpis(kpiRes.data[0] as unknown as KpiData);
        } else {
          setKpis({ total_pedidos: 0, unidades_vendidas: 0, ingresos_netos: 0, ticket_promedio: 0, upt: 0, pct_pedidos_full_price: 0, pct_pedidos_con_descuento: 0 });
        }

        if (topRes.error) console.error("Error en reporte_ejecutivo_productos (TOP):", topRes.error);
        if (topRes.data) {
          setTopProducts((topRes.data as any[]).map((r: any) => ({
            foto: r.foto ?? null, producto: r.producto ?? "—", sku: r.sku ?? null,
            categoria: r.categoria ?? null, clasificacion: r.clasificacion ?? null,
            unidades_vendidas: r.unidades_vendidas ?? 0, precio_promedio: r.precio_prom_venta ?? 0,
            stock_disponible: r.stock_disponible ?? 0,
          } as ProductRow)));
        }

        if (bottomRes.error) console.error("Error en reporte_ejecutivo_productos (BOTTOM):", bottomRes.error);
        if (bottomRes.data) {
          setBottomProducts((bottomRes.data as any[]).map((r: any) => ({
            foto: r.foto ?? null, producto: r.producto ?? "—", sku: r.sku ?? null,
            categoria: r.categoria ?? null, clasificacion: r.clasificacion ?? null,
            unidades_vendidas: r.unidades_vendidas ?? 0, precio_promedio: r.precio_prom_venta ?? 0,
            stock_disponible: r.stock_disponible ?? 0,
          } as ProductRow)));
        }
      } catch (err) {
        console.error("Error inesperado en fetchAll:", err);
      }

      setLoading(false);
    }
    fetchAll();
  }, [days, canal, selectedLocation]);

  if (loading) return <LoadingState rows={6} />;

  const locParam = selectedLocation === "all" ? null : selectedLocation;

  return (
    <div className="space-y-6">
      {showLocationFilter && locations.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground font-medium">Sucursal:</span>
          <Select value={selectedLocation} onValueChange={setSelectedLocation}>
            <SelectTrigger className="w-[220px] bg-card">
              <SelectValue placeholder="Todas las tiendas" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border shadow-lg z-50">
              <SelectItem value="all">Todas las tiendas</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiCard label="Ventas Netas" value={(kpis?.ingresos_netos ?? 0).toLocaleString()} prefix="$" icon={DollarSign} />
        <KpiCard label="Ticket Promedio" value={(kpis?.ticket_promedio ?? 0).toLocaleString()} prefix="$" icon={Receipt} />
        <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag} />
        <KpiCard label="% Full Price" value={`${(kpis?.pct_pedidos_full_price ?? 0).toFixed(1)}%`} icon={Star} className="text-emerald-600" onClick={() => navigate(`/pedidos?tipo=full_price&canal=${canal}&days=${days}`)} />
        <KpiCard label="% Descuento" value={`${(kpis?.pct_pedidos_con_descuento ?? 0).toFixed(1)}%`} icon={Percent} className="text-orange-500" onClick={() => navigate(`/pedidos?tipo=descuento&canal=${canal}&days=${days}`)} />
      </div>

      {canal === "digital" ? (
        <DigitalChannelCard days={days} />
      ) : selectedLocation === "all" ? (
        <StoreLeaderboard days={days} canal={canal === "outlets" ? "outlets" : "tiendas"} />
      ) : (
        <StoreRankCard
          days={days}
          canal={canal === "outlets" ? "outlets" : "tiendas"}
          locationId={selectedLocation}
          locationName={locations.find(l => l.location_id === selectedLocation)?.name ?? selectedLocation}
        />
      )}

      <ParetoChart days={days} canal={canal === "digital" ? "digital" : "pos"} locationId={locParam} />

      <WorstLinesRecommendation bottomProducts={bottomProducts} />

      <ProductTable
        data={topProducts}
        title="Top 20 — Más Vendidos"
        exportFilename={`top20_${canal}_${days}d`}
      />

      <ProductTable
        data={bottomProducts}
        title="Bottom 20 — Menor Rotación (con stock)"
        exportFilename={`bottom20_${canal}_${days}d`}
      />
    </div>
  );
}

/* ── Main Component ── */
export function ExecutiveDashboard({ days }: Props) {
  return (
    <Tabs defaultValue="tiendas" className="w-full">
      <TabsList className="w-full grid grid-cols-3 bg-muted/50 rounded-lg p-1 h-auto sm:h-11">
        <TabsTrigger value="tiendas" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md px-2 py-1.5 sm:px-3 sm:py-2">
          <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Tiendas de Línea</span>
          <span className="sm:hidden">Tiendas</span>
        </TabsTrigger>
        <TabsTrigger value="outlets" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md px-2 py-1.5 sm:px-3 sm:py-2">
          <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Outlets
        </TabsTrigger>
        <TabsTrigger value="digital" className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md px-2 py-1.5 sm:px-3 sm:py-2">
          <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Digital
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tiendas" className="mt-6">
        <ChannelPanel days={days} canal="tiendas" showLocationFilter={true} locationFilter="tiendas" />
      </TabsContent>
      <TabsContent value="outlets" className="mt-6">
        <ChannelPanel days={days} canal="outlets" showLocationFilter={true} locationFilter="outlets" />
      </TabsContent>
      <TabsContent value="digital" className="mt-6">
        <ChannelPanel days={days} canal="digital" showLocationFilter={false} />
      </TabsContent>
    </Tabs>
  );
}
