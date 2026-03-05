import { useEffect, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays, resolveComparisonRange, getDateRange, CUSTOM_SENTINEL, type ComparisonPeriod } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Globe, Download, FileText, DollarSign, ShoppingBag, Receipt, Star, Percent, Tag, Trophy, TrendingDown, TrendingUp, CalendarDays, Package, AlertTriangle, Ruler, Crown, ShieldAlert, MapPin } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { StoreLeaderboard } from "./StoreLeaderboard";
import { CollectionBadge } from "./CollectionBadge";
import { CollectionCompositionCard } from "./CollectionCompositionCard";

/* ── Constants ── */
const CEDI_ID = "71474315479";
const CEDI_DISPLAY = "Bodega Ecommerce";

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
  pct_pedidos_rebajas: number;
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
  sell_through_pct: number | null;
  wos: number | null;
  coleccion: string | null;
}

const toNumber = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const normalizeKpiData = (row: any): KpiData => ({
  total_pedidos: toNumber(row?.total_pedidos),
  unidades_vendidas: toNumber(row?.unidades_vendidas),
  ingresos_netos: toNumber(row?.ingresos_netos),
  ticket_promedio: toNumber(row?.ticket_promedio),
  upt: toNumber(row?.upt),
  pct_pedidos_full_price: toNumber(row?.pct_pedidos_full_price),
  pct_pedidos_rebajas: toNumber(row?.pct_pedidos_rebajas),
  pct_pedidos_con_descuento: toNumber(row?.pct_pedidos_con_descuento),
});

interface SkuDetailRow {
  sku: string;
  unidades_vendidas: number;
  stock_disponible: number;
  precio_prom_venta: number | null;
  sell_through_pct: number;
  wos: number;
  clasificacion: string;
}

interface Location {
  location_id: string;
  name: string;
  tipo_tienda: string | null;
  zona: string | null;
}

interface Props {
  days: number;
  comparisonPeriod?: ComparisonPeriod;
}

/** Format a Date as "YYYY-MM-DD" for RPC date params */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/* ── Venta/m² Status Classification ── */
const VENTA_M2_FLOOR = 1_000_000; // $1M COP minimum acceptable baseline

function getVentaM2Status(ventaM2: number, avgReference?: number): { label: string; icon: React.ElementType; colorClass: string; bgClass: string; borderClass: string } {
  // Use the higher of actual average or $1M floor as baseline
  const baseline = Math.max(avgReference ?? VENTA_M2_FLOOR, VENTA_M2_FLOOR);
  if (ventaM2 >= baseline * 1.3) return { label: "Excelente", icon: Crown, colorClass: "text-amber-500", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" };
  if (ventaM2 >= baseline) return { label: "Bueno", icon: Ruler, colorClass: "text-emerald-600", bgClass: "bg-emerald-500/10", borderClass: "border-emerald-500/30" };
  if (ventaM2 >= baseline * 0.7) return { label: "Regular", icon: ShieldAlert, colorClass: "text-amber-500", bgClass: "bg-amber-500/10", borderClass: "border-amber-500/30" };
  return { label: "Malo", icon: AlertTriangle, colorClass: "text-destructive", bgClass: "bg-destructive/10", borderClass: "border-destructive/30" };
}

/* ── KPI Card with comparison ── */
function KpiCard({ label, value, prefix = "", icon: Icon, className, onClick, actual, anterior, ventaM2Status }: {
  label: string; value: string; prefix?: string; icon: React.ElementType; className?: string; onClick?: () => void;
  actual?: number; anterior?: number;
  ventaM2Status?: { label: string; icon: React.ElementType; colorClass: string; bgClass: string; borderClass: string };
}) {
  return (
    <div
      className={cn("glass-card p-5 flex items-start gap-4", ventaM2Status && `border ${ventaM2Status.borderClass}`, onClick && "cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all")}
      onClick={onClick}
    >
      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", ventaM2Status ? ventaM2Status.bgClass : "bg-primary/10")}>
        {ventaM2Status ? <ventaM2Status.icon className={cn("h-5 w-5", ventaM2Status.colorClass)} /> : <Icon className={cn("h-5 w-5 text-primary", className)} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          {ventaM2Status && (
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold", ventaM2Status.bgClass, ventaM2Status.colorClass)}>
              {ventaM2Status.label === "Excelente" && "👑"} {ventaM2Status.label}
            </span>
          )}
        </div>
        <p className={cn("text-xl sm:text-2xl font-semibold text-foreground mt-0.5 truncate", className)}>{prefix}{value}</p>
        {actual !== undefined && anterior !== undefined && (
          <ComparisonIndicator actual={actual} anterior={anterior} label="vs ant." />
        )}
      </div>
    </div>
  );
}

/* ── Product Table ── */
/* Helper: extract product name and color from title like "PERSEFONE T-SHIRT MEN WHITE" */
function extractNameColor(title: string | null): { name: string; color: string } {
  if (!title) return { name: "—", color: "—" };
  const words = title.trim().split(/\s+/);
  if (words.length <= 1) return { name: title, color: "—" };
  const color = words[words.length - 1];
  const name = words.slice(0, -1).join(" ");
  return { name, color };
}

function getWosStatusColor(wos: number) {
  if (wos === 0) return "text-muted-foreground";
  if (wos < 4) return "text-amber-500";
  if (wos <= 12) return "text-emerald-600";
  return "text-destructive";
}

function ProductTable({ data, title, exportFilename, days, canalFiltro, locationFiltro }: {
  data: ProductRow[]; title: string; exportFilename: string;
  days: number; canalFiltro?: string; locationFiltro?: string | null;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [skuDetails, setSkuDetails] = useState<SkuDetailRow[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);

  if (!data.length) return <EmptyState message="Sin datos para mostrar." />;

  const exportData = data.map((r, i) => {
    const { name } = extractNameColor(r.producto);
    return {
      "#": i + 1,
      Línea: r.categoria ?? "",
      Nombre: name,
      Colección: r.coleccion ?? "Otros",
      "Stock Total": r.stock_disponible ?? 0,
      "Unidades Vendidas": r.unidades_vendidas ?? 0,
      Clasificación: r.clasificacion ?? "",
      "ST%": r.sell_through_pct ?? 0,
      WOS: r.wos ?? 0,
    };
  });

  const handleRowClick = async (productId: string | null) => {
    if (!productId) return;
    if (expandedId === productId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(productId);
    setSkuLoading(true);
    const effectiveDays = resolveDays(days);
    const { data: rows } = await supabase.rpc("reporte_detalle_skus_producto" as any, {
      dias_atras: effectiveDays,
      p_product_id: productId,
      canal_filtro: canalFiltro || null,
      location_filtro: locationFiltro || null,
    });
    setSkuDetails((rows ?? []) as unknown as SkuDetailRow[]);
    setSkuLoading(false);
  };

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <ExportButtons data={exportData as unknown as Record<string, unknown>[]} filename={exportFilename} title={title} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
             <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground w-10">#</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Línea</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Colección</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Stock</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Unidades Vendidas</th>
              <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground min-w-[120px]">Clasif.</th>
              <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground w-32">ST%</th>
              <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">WOS</th>
            </tr>
          </thead>
          <tbody>
          {data.map((row, i) => {
              const { name } = extractNameColor(row.producto);
              const isExpanded = expandedId === row.sku;
              const stVal = row.sell_through_pct ?? 0;
              const stColor = stVal > 70 ? "bg-emerald-500" : stVal >= 30 ? "bg-amber-500" : "bg-destructive";
              return (
                <Fragment key={row.sku ?? i}>
                  <tr
                    className={cn("border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer", isExpanded && "bg-muted/30")}
                    onClick={() => handleRowClick(row.sku)}
                  >
                    <td className="px-3 py-3 text-center font-bold text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {row.foto ? (
                          <img src={row.foto} alt={name} className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center text-sm shrink-0">👗</div>
                        )}
                        <span className="font-medium text-foreground line-clamp-1 max-w-[180px]">{name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{row.categoria ?? "—"}</td>
                    <td className="px-3 py-3"><CollectionBadge coleccion={row.coleccion} /></td>
                    <td className="px-3 py-3 text-right font-medium">{(row.stock_disponible ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-semibold">{(row.unidades_vendidas ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-3 min-w-[120px]">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                        row.clasificacion?.includes("Full Price") ? "bg-emerald-500/10 text-emerald-600"
                        : row.clasificacion?.includes("Rebajas") ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                      }`}>
                        {row.clasificacion ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", stColor)} style={{ width: `${Math.min(stVal, 100)}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground w-10 text-right shrink-0">{stVal.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className={cn("px-3 py-3 text-right text-xs font-semibold", getWosStatusColor(row.wos ?? 0))}>{(row.wos ?? 0).toFixed(1)}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                     <td colSpan={9} className="p-0">
                        <div className="bg-muted/20 border-b border-border px-6 py-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">📦 Desglose por SKU</p>
                          {skuLoading ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">Cargando...</div>
                          ) : !skuDetails.length ? (
                            <div className="py-4 text-center text-xs text-muted-foreground">Sin SKUs</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border/50">
                                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">SKU</th>
                                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Stock</th>
                                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Unidades Vendidas</th>
                                  <th className="px-3 py-2 text-left text-muted-foreground font-medium">Clasif.</th>
                                  <th className="px-3 py-2 text-center text-muted-foreground font-medium w-28">ST%</th>
                                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">WOS</th>
                                </tr>
                              </thead>
                              <tbody>
                                {skuDetails.map((s) => {
                                  const skuSt = s.sell_through_pct ?? 0;
                                  const skuStColor = skuSt > 70 ? "bg-emerald-500" : skuSt >= 30 ? "bg-amber-500" : "bg-destructive";
                                  return (
                                    <tr key={s.sku} className="border-b border-border/30 hover:bg-muted/10">
                                      <td className="px-3 py-2 font-mono">{s.sku}</td>
                                      <td className="px-3 py-2 text-right font-medium">{(s.stock_disponible ?? 0).toLocaleString()}</td>
                                      <td className="px-3 py-2 text-right font-semibold">{(s.unidades_vendidas ?? 0).toLocaleString()}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                                          s.clasificacion?.includes("Full") ? "bg-emerald-500/10 text-emerald-600"
                                          : s.clasificacion?.includes("Rebajas") ? "bg-destructive/10 text-destructive"
                                          : "bg-warning/10 text-warning"
                                        }`}>{s.clasificacion}</span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1.5">
                                          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div className={cn("h-full rounded-full", skuStColor)} style={{ width: `${Math.min(skuSt, 100)}%` }} />
                                          </div>
                                          <span className="text-[10px] text-muted-foreground w-9 text-right shrink-0">{skuSt.toFixed(1)}%</span>
                                        </div>
                                      </td>
                                      <td className={cn("px-3 py-2 text-right font-semibold", getWosStatusColor(s.wos ?? 0))}>{(s.wos ?? 0).toFixed(1)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Ventas por Tipo (line-item level) ── */
interface VentasTipoData {
  pct_full_price: number;
  pct_rebajas: number;
  pct_desc_promo: number;
}

function VentasTipoCards({ days, canal, locationId, zona }: { days: number; canal?: string | null; locationId?: string | null; zona?: string | null }) {
  const [data, setData] = useState<VentasTipoData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_pct_ventas_por_tipo" as any, {
        dias_atras: effectiveDays,
        p_canal: canal || null,
        p_location_id: locationId || null,
        p_zona: zona || null,
      });
      if (rows && (rows as any[]).length > 0) {
        const r = (rows as any[])[0];
        setData({
          pct_full_price: toNumber(r.pct_full_price),
          pct_rebajas: toNumber(r.pct_rebajas),
          pct_desc_promo: toNumber(r.pct_desc_promo),
        });
      } else {
        setData({ pct_full_price: 0, pct_rebajas: 0, pct_desc_promo: 0 });
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId, zona]);

  if (loading) return <LoadingState rows={1} />;

  const canalParam = canal ? `&canal=${canal}` : '';
  const daysParam = resolveDays(days);
  const pctDesc = data?.pct_desc_promo ?? 0;

  return (
    <div className="grid grid-cols-3 gap-4">
      <KpiCard label="% Full Price" value={`${(data?.pct_full_price ?? 0).toFixed(1)}%`} icon={Star} className="text-emerald-600"
        onClick={() => navigate(`/pedidos?tipo=full_price${canalParam}&days=${daysParam}`)} />
      <KpiCard label="% Rebajas" value={`${(data?.pct_rebajas ?? 0).toFixed(1)}%`} icon={Tag} className="text-blue-500"
        onClick={() => navigate(`/pedidos?tipo=rebajas${canalParam}&days=${daysParam}`)} />
      <div className="relative">
        <KpiCard label="% Desc. Promo" value={`${pctDesc.toFixed(1)}%`} icon={Percent} className="text-orange-500"
          onClick={() => navigate(`/pedidos?tipo=descuento${canalParam}&days=${daysParam}`)} />
        {pctDesc > 30 && (
          <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive flex items-center justify-center">
            <AlertTriangle className="h-3 w-3 text-destructive-foreground" />
          </div>
        )}
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
        p_canal: canal || null,
        p_location_id: locationId || null,
      });
      if (rows) {
        const normalized = (rows as any[]).map((r) => ({
          categoria: r.categoria ?? "—",
          unidades: toNumber(r.unidades),
          ingresos: toNumber(r.ingresos),
          pct_participacion: toNumber(r.pct_participacion),
        })) as ParetoRow[];

        const pctTotal = normalized.reduce((s, r) => s + (r.pct_participacion ?? 0), 0);
        const totalIngresos = normalized.reduce((s, r) => s + (r.ingresos ?? 0), 0);

        setData(
          pctTotal > 0 || totalIngresos === 0
            ? normalized
            : normalized.map((r) => ({
                ...r,
                pct_participacion: ((r.ingresos ?? 0) / totalIngresos) * 100,
              })),
        );
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId]);

  if (loading) return <LoadingState rows={3} />;
  if (!data.length) return null;

  const top10 = data.slice(0, 10);
  const rest = data.slice(10);
  const othersPct = rest.reduce((s, r) => s + (r.pct_participacion ?? 0), 0);
  const othersUnits = rest.reduce((s, r) => s + (r.unidades ?? 0), 0);

  const chartItems = top10.map((r) => ({
    name: r.categoria ?? "—",
    value: Number(r.pct_participacion ?? 0),
    units: Number(r.unidades ?? 0),
  }));
  if (othersPct > 0) {
    chartItems.push({ name: "Otros", value: Number(othersPct.toFixed(1)), units: othersUnits });
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
            <Tooltip formatter={(v: number, name: string, entry: any) => [`${v.toFixed(1)}% · ${(entry.payload.units ?? 0).toLocaleString()} uds`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5 max-h-[220px] overflow-y-auto w-full">
          {chartItems.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PARETO_COLORS[i % PARETO_COLORS.length] }} />
                <span className="text-foreground font-medium truncate max-w-[140px]">{r.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground">{r.units.toLocaleString()} uds</span>
                <span className="text-foreground font-mono font-semibold">{r.value.toFixed(1)}%</span>
              </div>
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

/* ── Worst 3 lines recommendation from comportamiento producto data ── */
interface ComportamientoRow {
  categoria: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
  sell_through_pct: number | null;
  und_vendidas: number | null;
}

function WorstLinesRecommendation({ days, canal, locationId }: { days: number; canal: string; locationId?: string | null }) {
  const [data, setData] = useState<ComportamientoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_comportamiento_producto", {
        dias_atras: effectiveDays,
        p_location_id: locationId || null,
      });
      if (rows) setData(rows as unknown as ComportamientoRow[]);
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId]);

  if (loading) return <LoadingState rows={2} />;
  if (!data.length) return null;

  // Group by category: sum stock, avg sell-through, sum units sold
  const catMap = new Map<string, { stock: number; stSum: number; count: number; uds: number }>();
  for (const p of data) {
    const cat = (p.categoria ?? "SIN CATEGORÍA").toUpperCase();
    const prev = catMap.get(cat) ?? { stock: 0, stSum: 0, count: 0, uds: 0 };
    prev.stock += (p.stock_tiendas ?? 0) + (p.stock_digital ?? 0);
    prev.stSum += (p.sell_through_pct ?? 0);
    prev.count += 1;
    prev.uds += (p.und_vendidas ?? 0);
    catMap.set(cat, prev);
  }

  // Worst = lowest sell-through with significant stock (sort by ST asc, then stock desc)
  const sorted = Array.from(catMap.entries())
    .filter(([, v]) => v.stock > 0)
    .map(([cat, v]) => ({
      cat,
      stock: v.stock,
      avgST: v.count > 0 ? v.stSum / v.count : 0,
      uds: v.uds,
    }))
    .sort((a, b) => {
      // Primary: lower %ST is worse
      const stDiff = a.avgST - b.avgST;
      if (Math.abs(stDiff) > 2) return stDiff;
      // Secondary: higher stock is worse
      return b.stock - a.stock;
    })
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
        {sorted.map((item, i) => (
          <div key={item.cat} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
            <span className="text-lg font-bold text-amber-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{item.cat}</p>
              <p className="text-xs text-muted-foreground">{item.stock.toLocaleString()} uds en stock</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={cn("text-xs font-semibold", item.avgST < 20 ? "text-destructive" : item.avgST < 40 ? "text-amber-500" : "text-emerald-600")}>
                  %ST: {item.avgST.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stock-out Alerts Panel ── */
interface AlertRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
  wos: number | null;
  estado_salud: string | null;
  sell_through_pct: number | null;
}

function StockOutAlerts({ days, locationId }: { days: number; locationId?: string | null }) {
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_comportamiento_producto", {
        dias_atras: effectiveDays,
        p_location_id: locationId || null,
      });
      if (rows) {
        const filtered = (rows as unknown as AlertRow[])
          .filter(r => r.estado_salud?.includes("RIESGO AGOTADOS"))
          .filter(r => ((r.stock_tiendas ?? 0) + (r.stock_digital ?? 0)) >= 10)
          .sort((a, b) => (a.wos ?? 999) - (b.wos ?? 999))
          .slice(0, locationId ? 50 : 10);
        setAlerts(filtered);
      }
      setLoading(false);
    }
    fetch();
  }, [days, locationId]);

  if (loading) return <LoadingState rows={2} />;
  if (!alerts.length) return null;

  return (
    <div
      className="glass-card p-5 border border-destructive/30 bg-destructive/5 cursor-pointer hover:ring-2 hover:ring-destructive/30 transition-all"
      onClick={() => navigate(`/producto?salud=riesgo${locationId ? `&location=${locationId}` : ''}&days=${days}`)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">🟡 Alertas de Riesgo de Agotados</h3>
            <p className="text-xs text-muted-foreground">{alerts.length} producto{alerts.length !== 1 ? 's' : ''} con menos de 4 semanas de inventario</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">Ver detalle →</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {alerts.slice(0, 10).map((item, i) => (
          <div key={item.sku ?? i} className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
            {item.foto ? (
              <img src={item.foto} alt="" className="w-8 h-8 rounded object-cover bg-muted shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center text-sm shrink-0">👗</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{item.producto ?? "—"}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-destructive font-semibold">{(item.wos ?? 0).toFixed(1)} sem</span>
                <span className="text-[10px] text-muted-foreground">{((item.stock_tiendas ?? 0) + (item.stock_digital ?? 0)).toLocaleString()} uds</span>
              </div>
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
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial</h3>
          </div>
          <div className="space-y-5">
            {/* Row 1: Días destacados + promedios por tipo de día */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🟢 Mejor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.mejor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_mejor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🔴 Peor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.peor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_peor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Lun-Vie</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_semana ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Sáb-Dom</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_finde ?? 0)}</p>
              </div>
            </div>
            {/* Row 2: Promedios diarios con comparativa */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Venta Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
                <ComparisonIndicator actual={extraMetrics?.venta_promedio_diaria_actual ?? 0} anterior={extraMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pedidos Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={extraMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Uds Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.unidades_promedio_diario_actual ?? 0} anterior={extraMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
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
      <div className={cn("grid grid-cols-1 gap-4", rank !== null && "lg:grid-cols-[280px_1fr]")}>
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
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial</h3>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🟢 Mejor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.mejor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_mejor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🔴 Peor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.peor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_peor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Lun-Vie</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_semana ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Sáb-Dom</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_finde ?? 0)}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Venta Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
                <ComparisonIndicator actual={extraMetrics?.venta_promedio_diaria_actual ?? 0} anterior={extraMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pedidos Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={extraMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Uds Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.unidades_promedio_diario_actual ?? 0} anterior={extraMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
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
function ChannelPanel({ days, canal, showLocationFilter, locationFilter, comparisonPeriod = "previous" }: {
  days: number; canal: string; showLocationFilter: boolean;
  locationFilter?: "tiendas" | "outlets"; comparisonPeriod?: ComparisonPeriod;
}) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [prevKpis, setPrevKpis] = useState<KpiData | null>(null);
  const [channelM2, setChannelM2] = useState<number>(0);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [bottomProducts, setBottomProducts] = useState<ProductRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showLocationFilter) return;
    supabase.from("locations").select("location_id, name, tipo_tienda, zona").eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          const filtered = data
            .filter(l => l.location_id !== CEDI_ID)
            .filter(l => {
              if (locationFilter === "tiendas") return (l.tipo_tienda ?? '').toUpperCase() !== 'OUTLET';
              if (locationFilter === "outlets") return (l.tipo_tienda ?? '').toUpperCase() === 'OUTLET';
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
      const canalFiltro = canal === "digital" ? "DIGITAL" : canal === "outlets" ? "OUTLET" : "TIENDAS";

      try {
        const [kpiRes, prevKpiRes, topRes, bottomRes, m2Res] = await Promise.all([
          supabase.rpc("reporte_kpis_comerciales", {
            dias_atras: effectiveDays,
            p_canal: canal,
            p_location_id: locParam,
          }),
          (() => {
            const compRange = resolveComparisonRange(days, comparisonPeriod);
            return supabase.rpc("reporte_kpis_por_rango" as any, {
              p_desde: toDateStr(compRange.from),
              p_hasta: toDateStr(compRange.to),
              p_canal: canal,
              p_location_id: locParam,
            });
          })(),
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
          // Fetch m² for the selected location or all relevant locations
          locParam
            ? supabase.from("locations").select("dimension_m2").eq("location_id", locParam)
            : supabase.from("locations").select("dimension_m2, name, location_id, tipo_tienda").eq("is_active", true).not("dimension_m2", "is", null),
        ]);

        const emptyKpi = normalizeKpiData({});
        
        if (kpiRes.error) console.error(`Error en reporte_kpis_comerciales:`, kpiRes.error);
        if (kpiRes.data && kpiRes.data.length > 0) {
          setKpis(normalizeKpiData(kpiRes.data[0]));
        } else {
          setKpis(emptyKpi);
        }

        if (prevKpiRes.data && (prevKpiRes.data as any[]).length > 0) {
          setPrevKpis(normalizeKpiData((prevKpiRes.data as any[])[0]));
        } else {
          setPrevKpis(emptyKpi);
        }

        // Calculate total m²
        if (m2Res.data) {
          const relevantLocs = (m2Res.data as any[]).filter((l: any) => {
            if (locParam) return true; // single location
            if (canal === "digital") return false; // no m² for digital
            if (locationFilter === "tiendas") return l.location_id !== CEDI_ID && ((l as any).tipo_tienda ?? '').toUpperCase() !== 'OUTLET';
            if (locationFilter === "outlets") return ((l as any).tipo_tienda ?? '').toUpperCase() === 'OUTLET';
            return l.location_id !== CEDI_ID;
          });
          setChannelM2(relevantLocs.reduce((s: number, r: any) => s + (r.dimension_m2 ?? 0), 0));
        }

        if (topRes.error) console.error("Error en reporte_ejecutivo_productos (TOP):", topRes.error);
        if (topRes.data) {
          setTopProducts((topRes.data as any[]).map((r: any) => ({
            foto: r.foto ?? null, producto: r.producto ?? "—", sku: r.sku ?? null,
            categoria: r.categoria ?? null, clasificacion: r.clasificacion ?? null,
            unidades_vendidas: r.unidades_vendidas ?? 0, precio_promedio: r.precio_prom_venta ?? 0,
            stock_disponible: r.stock_disponible ?? 0,
            sell_through_pct: r.sell_through_pct ?? 0, wos: r.wos ?? 0,
            coleccion: r.coleccion ?? "Otros",
          } as ProductRow)));
        }

        if (bottomRes.error) console.error("Error en reporte_ejecutivo_productos (BOTTOM):", bottomRes.error);
        if (bottomRes.data) {
          setBottomProducts((bottomRes.data as any[]).map((r: any) => ({
            foto: r.foto ?? null, producto: r.producto ?? "—", sku: r.sku ?? null,
            categoria: r.categoria ?? null, clasificacion: r.clasificacion ?? null,
            unidades_vendidas: r.unidades_vendidas ?? 0, precio_promedio: r.precio_prom_venta ?? 0,
            stock_disponible: r.stock_disponible ?? 0,
            sell_through_pct: r.sell_through_pct ?? 0, wos: r.wos ?? 0,
            coleccion: r.coleccion ?? "Otros",
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
      {showLocationFilter && locations.length > 0 && (() => {
        const selectedLoc = locations.find(l => l.location_id === selectedLocation);
        const tipoLabel = selectedLoc?.tipo_tienda;
        const tipoColor = tipoLabel === "A" ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
          : tipoLabel === "B" ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
          : tipoLabel === "C" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
          : "bg-muted text-muted-foreground border-border";
        return (
          <div className="glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 border-2 border-primary/20 bg-primary/5">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Sucursal:</span>
            </div>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[340px] bg-card border-2 border-primary/30 font-medium shadow-sm">
                <SelectValue placeholder="Todas las tiendas" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border shadow-lg z-50">
                <SelectItem value="all">Todas las tiendas</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.location_id} value={loc.location_id}>
                    <span className="flex items-center gap-2">
                      {loc.name}
                      {loc.tipo_tienda && <span className="text-[10px] font-bold opacity-60">({loc.tipo_tienda})</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedLocation !== "all" && selectedLoc && (
              <div className="flex items-center gap-2 ml-0 sm:ml-2 flex-wrap">
                {tipoLabel && (
                  <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border", tipoColor)}>
                    Tipo {tipoLabel}
                  </span>
                )}
                {selectedLoc.zona && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-muted text-muted-foreground border-border">
                    Zona: {selectedLoc.zona}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {(() => {
        const ventaM2 = channelM2 > 0 ? (kpis?.ingresos_netos ?? 0) / channelM2 : 0;
        const prevVentaM2 = channelM2 > 0 ? (prevKpis?.ingresos_netos ?? 0) / channelM2 : 0;
        const showM2 = canal !== "digital" && channelM2 > 0;
        const pctDesc = kpis?.pct_pedidos_con_descuento ?? 0;
        return (
          <div className="space-y-4">
            {/* Row 1: Ventas Netas + Ticket */}
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label="Ventas Netas" value={fmtCurrency(kpis?.ingresos_netos ?? 0)} icon={DollarSign}
                actual={kpis?.ingresos_netos ?? 0} anterior={prevKpis?.ingresos_netos ?? 0} />
              <KpiCard label="Ticket Promedio" value={fmtCurrency(kpis?.ticket_promedio ?? 0)} icon={Receipt}
                actual={kpis?.ticket_promedio ?? 0} anterior={prevKpis?.ticket_promedio ?? 0} />
            </div>
            {/* Row 2: UPT + Venta/m² */}
            <div className={cn("grid gap-4", showM2 ? "grid-cols-2" : "grid-cols-1")}>
              <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag}
                actual={kpis?.upt ?? 0} anterior={prevKpis?.upt ?? 0} />
              {showM2 && (
                <KpiCard label="Venta / m²" value={fmtCurrency(ventaM2)} icon={Ruler}
                  actual={ventaM2} anterior={prevVentaM2}
                  ventaM2Status={getVentaM2Status(ventaM2, ventaM2)}
                  onClick={() => navigate(`/venta-m2?days=${resolveDays(days)}&canal=${canal}`)} />
              )}
            </div>
            {/* Row 3: % Full Price, % Rebajas, % Desc. Promo (line-item level) */}
            <VentasTipoCards days={days} canal={canal} locationId={locParam} />
          </div>
        );
      })()}

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

      <div className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" onClick={() => navigate(`/lineas?canal=${canal}&days=${days}`)}>
        <ParetoChart days={days} canal={canal} locationId={locParam} />
      </div>

      <CollectionCompositionCard days={days} canal={canal} locationId={locParam} />

      <WorstLinesRecommendation days={days} canal={canal} locationId={locParam} />

      <StockOutAlerts days={days} locationId={locParam} />

      <ProductTable
        data={topProducts}
        title="Top 20 — Más Vendidos"
        exportFilename={`top20_${canal}_${days}d`}
        days={days}
        canalFiltro={canal === "digital" ? "DIGITAL" : "POS"}
        locationFiltro={locParam}
      />

      <ProductTable
        data={bottomProducts}
        title="Bottom 20 — Menor Rotación (con stock)"
        exportFilename={`bottom20_${canal}_${days}d`}
        days={days}
        canalFiltro={canal === "digital" ? "DIGITAL" : "POS"}
        locationFiltro={locParam}
      />
    </div>
  );
}

/* ── Brand Top/Bottom Product Row ── */
interface GlobalProductRow {
  foto: string | null;
  producto: string | null;
  categoria: string | null;
  und_total: number;
  clasificacion: string | null;
  coleccion: string | null;
}

function BrandTopBottomProducts({ days }: { days: number }) {
  const [top5, setTop5] = useState<GlobalProductRow[]>([]);
  const [bottom5, setBottom5] = useState<GlobalProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const [topRes, bottomRes] = await Promise.all([
        supabase.rpc("reporte_top_productos_global" as any, { dias_atras: effectiveDays, p_orden: "TOP", p_limite: 5 }),
        supabase.rpc("reporte_top_productos_global" as any, { dias_atras: effectiveDays, p_orden: "BOTTOM", p_limite: 5 }),
      ]);
      if (topRes.data) setTop5(topRes.data as unknown as GlobalProductRow[]);
      if (bottomRes.data) setBottom5(bottomRes.data as unknown as GlobalProductRow[]);
      setLoading(false);
    }
    fetch();
  }, [days]);

  if (loading) return <LoadingState rows={2} />;

  const renderList = (items: GlobalProductRow[], icon: React.ReactNode, title: string, color: string) => (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">{title}</h4>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={`${item.producto}-${i}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors">
            <span className={cn("text-sm font-bold w-5 text-center", color)}>{i + 1}</span>
            {item.foto ? (
              <img src={item.foto} alt="" className="w-8 h-8 rounded object-cover bg-muted shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div className="w-8 h-8 rounded bg-muted/50 flex items-center justify-center text-sm shrink-0">👗</div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">{item.producto ?? "—"}</p>
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] text-muted-foreground">{item.categoria ?? "—"}</p>
                <CollectionBadge coleccion={item.coleccion} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold text-foreground">{(item.und_total ?? 0).toLocaleString()} uds</p>
              <span className={`text-[10px] font-medium ${
                item.clasificacion?.includes("Full Price") ? "text-emerald-600" 
                : item.clasificacion?.includes("Rebajas") ? "text-destructive" 
                : "text-warning"
              }`}>
                {item.clasificacion ?? "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-2 gap-4 cursor-pointer"
      onClick={() => navigate(`/desempeno-productos?days=${resolveDays(days)}`)}
    >
      {renderList(top5, <TrendingUp className="h-4 w-4 text-emerald-600" />, "Top 5 Más Vendidos", "text-emerald-600")}
      {renderList(bottom5, <TrendingDown className="h-4 w-4 text-destructive" />, "Top 5 Menor Rotación", "text-destructive")}
    </div>
  );
}

/* ── Channel Contribution Chart ── */
function ChannelContributionChart({ channelData }: {
  channelData: { name: string; actual: number; anterior: number }[];
}) {
  if (!channelData.length) return null;

  const fmtMillions = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;

  return (
    <div className="glass-card p-5 mt-4">
      <h3 className="text-sm font-semibold text-foreground mb-4">💰 Aporte por Canal</h3>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Bar Chart */}
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channelData} barGap={4} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={55} />
              <Tooltip
                formatter={(v: number, name: string) => [fmtMillions(v), name === "actual" ? "Período actual" : "Período anterior"]}
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="actual" name="actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="anterior" name="anterior" fill="hsl(var(--muted-foreground) / 0.3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Summary Cards */}
        <div className="flex flex-col gap-3 lg:w-[260px]">
          {channelData.map((ch) => {
            const diff = ch.anterior > 0 ? ((ch.actual - ch.anterior) / ch.anterior) * 100 : 0;
            const isUp = diff >= 0;
            return (
              <div key={ch.name} className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground font-medium mb-1">{ch.name}</p>
                <p className="text-base font-semibold text-foreground">{fmtMillions(ch.actual)}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn("text-xs font-medium", isUp ? "text-emerald-600" : "text-destructive")}>
                    {isUp ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">vs {fmtMillions(ch.anterior)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />
          Período actual
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--muted-foreground) / 0.3)" }} />
          Período anterior
        </div>
      </div>
    </div>
  );
}

/* ── Brand-wide KPI Panel ── */
function BrandOverviewPanel({ days, comparisonPeriod = "previous" }: { days: number; comparisonPeriod?: ComparisonPeriod }) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [prevKpis, setPrevKpis] = useState<KpiData | null>(null);
  const [storeVentas, setStoreVentas] = useState(0);
  const [prevStoreVentas, setPrevStoreVentas] = useState(0);
  const [totalM2, setTotalM2] = useState<number>(0);
  const [channelData, setChannelData] = useState<{ name: string; actual: number; anterior: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const [currentRes, prevRes, kpiTiendasRes, kpiOutletsRes, kpiDigitalRes, prevTiendasRes, prevOutletsRes, prevDigitalRes, m2Res] = await Promise.all([
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: null, p_location_id: null }),
        supabase.rpc("reporte_kpis_periodo_anterior" as any, { dias_atras: effectiveDays, p_canal: null, p_location_id: null }),
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: "tiendas", p_location_id: null }),
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: "outlets", p_location_id: null }),
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: "digital", p_location_id: null }),
        supabase.rpc("reporte_kpis_periodo_anterior" as any, { dias_atras: effectiveDays, p_canal: "tiendas", p_location_id: null }),
        supabase.rpc("reporte_kpis_periodo_anterior" as any, { dias_atras: effectiveDays, p_canal: "outlets", p_location_id: null }),
        supabase.rpc("reporte_kpis_periodo_anterior" as any, { dias_atras: effectiveDays, p_canal: "digital", p_location_id: null }),
        supabase.from("locations").select("dimension_m2, name, location_id").eq("is_active", true).not("dimension_m2", "is", null),
      ]);

      const emptyKpi = normalizeKpiData({});
      if (currentRes.data && currentRes.data.length > 0) setKpis(normalizeKpiData(currentRes.data[0]));
      else setKpis(emptyKpi);
      if (prevRes.data && (prevRes.data as any[]).length > 0) setPrevKpis(normalizeKpiData((prevRes.data as any[])[0]));
      else setPrevKpis(emptyKpi);

      // Sum tiendas + outlets ventas for m² calc
      const vTiendas = (kpiTiendasRes.data && kpiTiendasRes.data.length > 0) ? (kpiTiendasRes.data[0] as any).ingresos_netos ?? 0 : 0;
      const vOutlets = (kpiOutletsRes.data && kpiOutletsRes.data.length > 0) ? (kpiOutletsRes.data[0] as any).ingresos_netos ?? 0 : 0;
      const vDigital = (kpiDigitalRes.data && kpiDigitalRes.data.length > 0) ? (kpiDigitalRes.data[0] as any).ingresos_netos ?? 0 : 0;
      setStoreVentas(vTiendas + vOutlets);

      const pvTiendas = (prevTiendasRes.data && (prevTiendasRes.data as any[]).length > 0) ? (prevTiendasRes.data as any[])[0].ingresos_netos ?? 0 : 0;
      const pvOutlets = (prevOutletsRes.data && (prevOutletsRes.data as any[]).length > 0) ? (prevOutletsRes.data as any[])[0].ingresos_netos ?? 0 : 0;
      const pvDigital = (prevDigitalRes.data && (prevDigitalRes.data as any[]).length > 0) ? (prevDigitalRes.data as any[])[0].ingresos_netos ?? 0 : 0;
      setPrevStoreVentas(pvTiendas + pvOutlets);

      setChannelData([
        { name: "Tiendas", actual: vTiendas, anterior: pvTiendas },
        { name: "Outlets", actual: vOutlets, anterior: pvOutlets },
        { name: "Digital", actual: vDigital, anterior: pvDigital },
      ]);

      if (m2Res.data) {
        const storeLocations = (m2Res.data as any[]).filter((l: any) => l.location_id !== CEDI_ID);
        setTotalM2(storeLocations.reduce((s: number, r: any) => s + (r.dimension_m2 ?? 0), 0));
      }
      setLoading(false);
    }
    fetch();
  }, [days]);

  if (loading) return <LoadingState rows={4} />;

  const ventaM2 = totalM2 > 0 ? storeVentas / totalM2 : 0;
  const prevVentaM2 = totalM2 > 0 ? prevStoreVentas / totalM2 : 0;

  return (
    <div className="space-y-4 mb-6">
      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">📊 DESEMPEÑO COMERCIAL VENTA DIRECTA</h3>
        </div>
        {/* Row 1: Ventas Netas + Ticket */}
        <div className="grid grid-cols-2 gap-4">
          <KpiCard label="Ventas Netas" value={fmtCurrency(kpis?.ingresos_netos ?? 0)} icon={DollarSign}
            actual={kpis?.ingresos_netos ?? 0} anterior={prevKpis?.ingresos_netos ?? 0} />
          <KpiCard label="Ticket Promedio" value={fmtCurrency(kpis?.ticket_promedio ?? 0)} icon={Receipt}
            actual={kpis?.ticket_promedio ?? 0} anterior={prevKpis?.ticket_promedio ?? 0} />
        </div>
        {/* Row 2: UPT + Venta m² Tienda */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag}
            actual={kpis?.upt ?? 0} anterior={prevKpis?.upt ?? 0} />
          <KpiCard label="Venta m² Tienda" value={fmtCurrency(ventaM2)} icon={Ruler}
            actual={ventaM2} anterior={prevVentaM2}
            ventaM2Status={totalM2 > 0 ? getVentaM2Status(ventaM2, ventaM2) : undefined}
            onClick={() => navigate(`/venta-m2?days=${resolveDays(days)}`)} />
        </div>
        {/* Row 3: % Full Price, % Rebajas, % Desc. Promo (line-item level) */}
        <div className="mt-4">
          <VentasTipoCards days={days} />
        </div>
        {/* Channel Contribution Chart */}
        <ChannelContributionChart channelData={channelData} />
      </div>
      <CollectionCompositionCard days={days} />
      <BrandTopBottomProducts days={days} />
    </div>
  );
}

/* ── Brand Pareto (all channels, clickable) ── */
function BrandParetoPreview({ days }: { days: number }) {
  const navigate = useNavigate();
  return (
    <div
      className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all mb-6"
      onClick={() => navigate(`/lineas?days=${days}`)}
    >
      <ParetoChart days={days} canal="" locationId={null} />
    </div>
  );
}

/* ── Zone Panel ── */
function ZonePanel({ days, locationFilter, comparisonPeriod = "previous" }: { days: number; locationFilter: "tiendas" | "outlets"; comparisonPeriod?: ComparisonPeriod }) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [prevKpis, setPrevKpis] = useState<KpiData | null>(null);
  const [channelM2, setChannelM2] = useState(0);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [bottomProducts, setBottomProducts] = useState<ProductRow[]>([]);
  const [zoneMetrics, setZoneMetrics] = useState<ExtraMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const canal = locationFilter === "outlets" ? "outlets" : "tiendas";
  const canalFiltro = locationFilter === "outlets" ? "OUTLET" : "TIENDAS";

  useEffect(() => {
    supabase.from("locations").select("location_id, name, tipo_tienda, zona, dimension_m2").eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          const filtered = data
            .filter(l => l.location_id !== CEDI_ID)
            .filter(l => {
              if (locationFilter === "tiendas") return (l.tipo_tienda ?? '').toUpperCase() !== 'OUTLET';
              if (locationFilter === "outlets") return (l.tipo_tienda ?? '').toUpperCase() === 'OUTLET';
              return true;
            });
          setLocations(filtered as Location[]);
        }
      });
  }, [locationFilter]);

  const zones = [...new Set(locations.map(l => l.zona).filter(Boolean))] as string[];
  const zoneLocations = selectedZone === "all" ? locations : locations.filter(l => l.zona === selectedZone);

  useEffect(() => { setSelectedLocation("all"); }, [selectedZone]);

  useEffect(() => {
    async function fetchAll() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const locParam = selectedLocation !== "all" ? selectedLocation : null;
      const zonaParam = selectedZone !== "all" ? selectedZone : null;

      const [kpiRes, prevKpiRes, rankRes, topRes, bottomRes, m2Res, zoneMetricsRes] = await Promise.all([
        supabase.rpc("reporte_kpis_comerciales" as any, {
          dias_atras: effectiveDays, p_canal: canal, p_location_id: locParam, p_zona: zonaParam,
        }),
        supabase.rpc("reporte_kpis_periodo_anterior" as any, {
          dias_atras: effectiveDays, p_canal: canal, p_location_id: locParam, p_zona: zonaParam,
        }),
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: canal }),
        supabase.rpc("reporte_ejecutivo_productos" as any, {
          dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locParam, orden: "TOP", limite: 20, zona_filtro: zonaParam,
        }),
        supabase.rpc("reporte_ejecutivo_productos" as any, {
          dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locParam, orden: "BOTTOM", limite: 20, zona_filtro: zonaParam,
        }),
        locParam
          ? supabase.from("locations").select("dimension_m2").eq("location_id", locParam)
          : supabase.from("locations").select("dimension_m2, location_id, tipo_tienda, zona").eq("is_active", true).not("dimension_m2", "is", null),
        locParam
          ? supabase.rpc("reporte_metricas_tienda_individual" as any, { dias_atras: effectiveDays, p_location_id: locParam })
          : supabase.rpc("reporte_metricas_zona" as any, { dias_atras: effectiveDays, p_canal: canal, p_zona: zonaParam }),
      ]);

      const emptyKpi = normalizeKpiData({});
      if (kpiRes.data && (kpiRes.data as any[]).length > 0) setKpis(normalizeKpiData((kpiRes.data as any[])[0]));
      else setKpis(emptyKpi);
      if (prevKpiRes.data && (prevKpiRes.data as any[]).length > 0) setPrevKpis(normalizeKpiData((prevKpiRes.data as any[])[0]));
      else setPrevKpis(emptyKpi);

      if (rankRes.data) setRanking(rankRes.data as unknown as RankingRow[]);

      if (m2Res.data) {
        const relevant = (m2Res.data as any[]).filter((l: any) => {
          if (locParam) return true;
          // Filter m² by zone if selected
          if (zonaParam) return l.zona === zonaParam;
          if (locationFilter === "tiendas") return l.location_id !== CEDI_ID && ((l.tipo_tienda ?? '').toUpperCase() !== 'OUTLET');
          if (locationFilter === "outlets") return (l.tipo_tienda ?? '').toUpperCase() === 'OUTLET';
          return l.location_id !== CEDI_ID;
        });
        setChannelM2(relevant.reduce((s: number, r: any) => s + (r.dimension_m2 ?? 0), 0));
      }

      if (zoneMetricsRes.data && (zoneMetricsRes.data as any[]).length > 0) {
        setZoneMetrics((zoneMetricsRes.data as any[])[0] as ExtraMetrics);
      } else {
        setZoneMetrics(null);
      }

      const mapProduct = (r: any): ProductRow => ({
        foto: r.foto ?? null, producto: r.producto ?? "—", sku: r.sku ?? null,
        categoria: r.categoria ?? null, clasificacion: r.clasificacion ?? null,
        unidades_vendidas: r.unidades_vendidas ?? 0, precio_promedio: r.precio_prom_venta ?? 0,
        stock_disponible: r.stock_disponible ?? 0, sell_through_pct: r.sell_through_pct ?? 0, wos: r.wos ?? 0,
        coleccion: r.coleccion ?? "Otros",
      });
      if (topRes.data) setTopProducts((topRes.data as any[]).map(mapProduct));
      if (bottomRes.data) setBottomProducts((bottomRes.data as any[]).map(mapProduct));
      setLoading(false);
    }
    fetchAll();
  }, [days, canal, selectedLocation, selectedZone]);

  if (loading) return <LoadingState rows={6} />;

  const locParam = selectedLocation !== "all" ? selectedLocation : null;
  const zonaParam = selectedZone !== "all" ? selectedZone : null;
  const allRanking = ranking;
  const zoneRanking = selectedZone === "all"
    ? allRanking
    : allRanking.filter(r => {
        const loc = locations.find(l => l.name === r.tienda);
        return loc && loc.zona === selectedZone;
      });

  const ventaM2 = channelM2 > 0 ? (kpis?.ingresos_netos ?? 0) / channelM2 : 0;
  const prevVentaM2 = channelM2 > 0 ? (prevKpis?.ingresos_netos ?? 0) / channelM2 : 0;

  const selectedLoc = selectedLocation !== "all" ? locations.find(l => l.location_id === selectedLocation) : null;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Zona:</span>
        </div>
        <Select value={selectedZone} onValueChange={setSelectedZone}>
          <SelectTrigger className="w-[220px] bg-card border-2 border-primary/30 font-medium shadow-sm">
            <SelectValue placeholder="Todas las zonas" />
          </SelectTrigger>
          <SelectContent className="bg-popover border border-border shadow-lg z-50">
            <SelectItem value="all">Todas las Zonas</SelectItem>
            {zones.sort().map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedZone !== "all" && (
          <>
            <div className="flex items-center gap-2 ml-2">
              <Store className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Sucursal:</span>
            </div>
            <Select value={selectedLocation} onValueChange={setSelectedLocation}>
              <SelectTrigger className="w-[340px] bg-card border-2 border-primary/30 font-medium shadow-sm">
                <SelectValue placeholder="Todas las sucursales" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border shadow-lg z-50">
                <SelectItem value="all">Todas las Sucursales</SelectItem>
                {zoneLocations.map(l => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* KPI Cards */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MapPin className="h-4 w-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">📊 DESEMPEÑO POR ZONA</h3>
        </div>
        {/* Row 1 */}
        <div className="grid grid-cols-2 gap-4">
          <KpiCard label="Ventas Netas" value={fmtCurrency(kpis?.ingresos_netos ?? 0)} icon={DollarSign}
            actual={kpis?.ingresos_netos ?? 0} anterior={prevKpis?.ingresos_netos ?? 0} />
          <KpiCard label="Ticket Promedio" value={fmtCurrency(kpis?.ticket_promedio ?? 0)} icon={Receipt}
            actual={kpis?.ticket_promedio ?? 0} anterior={prevKpis?.ticket_promedio ?? 0} />
        </div>
        {/* Row 2 */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <KpiCard label="UPT" value={(kpis?.upt ?? 0).toFixed(2)} icon={ShoppingBag}
            actual={kpis?.upt ?? 0} anterior={prevKpis?.upt ?? 0} />
          <KpiCard label="Venta / m²" value={fmtCurrency(ventaM2)} icon={Ruler}
            actual={ventaM2} anterior={prevVentaM2}
            ventaM2Status={channelM2 > 0 ? getVentaM2Status(ventaM2, ventaM2) : undefined}
            onClick={() => navigate(`/venta-m2?days=${resolveDays(days)}&canal=${canal}`)} />
        </div>
        {/* Row 3: % Full Price, % Rebajas, % Desc. Promo */}
        <div className="mt-4">
          <VentasTipoCards days={days} canal={canal} locationId={locParam} zona={zonaParam} />
        </div>
      </div>

      {/* Desempeño Comercial por Zona — always visible when no store selected */}
      {!(selectedLocation !== "all" && selectedLoc) && (
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial {selectedZone !== "all" ? `— ${selectedZone}` : "— Todas las Zonas"}</h3>
          </div>
          <div className="space-y-5">
            {/* Row 1: Mejor/Peor Día + Weekday/Weekend */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🟢 Mejor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(zoneMetrics?.mejor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(zoneMetrics?.venta_mejor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🔴 Peor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(zoneMetrics?.peor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(zoneMetrics?.venta_peor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Lun-Vie</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(zoneMetrics?.venta_promedio_semana ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Sáb-Dom</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(zoneMetrics?.venta_promedio_finde ?? 0)}</p>
              </div>
            </div>
            {/* Row 2: Daily averages with comparison */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Venta Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{fmtCurrency(zoneMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
                <ComparisonIndicator actual={zoneMetrics?.venta_promedio_diaria_actual ?? 0} anterior={zoneMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pedidos Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(zoneMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={zoneMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={zoneMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Uds Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(zoneMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={zoneMetrics?.unidades_promedio_diario_actual ?? 0} anterior={zoneMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Store-specific rank + commercial card */}
      {selectedLocation !== "all" && selectedLoc ? (
        <ZoneStoreRankCard
          days={days}
          canal={canal}
          locationId={selectedLocation}
          locationName={selectedLoc.name}
          allRanking={allRanking}
          zoneRanking={zoneRanking}
          zoneName={selectedZone}
        />
      ) : null}

      {/* Top Tiendas Table */}
      {!(selectedLocation !== "all" && selectedLoc) && (
        <div className="glass-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Top Tiendas</h3>
            </div>
            <ExportButtons
              data={zoneRanking.map((r, i) => ({
                "# Zona": i + 1,
                "# País": allRanking.findIndex(a => a.tienda === r.tienda) + 1,
                Tienda: r.tienda,
                "Ventas Netas": r.ventas_totales,
                "Uds Vendidas": r.unidades_vendidas,
                "Ticket Prom": r.ticket_promedio,
                UPT: r.upt,
                "% Full Price": r.pct_venta_full_price,
              }))}
              filename={`top_tiendas_zona_${days}d`}
              title="Top Tiendas por Zona"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground"># Zona</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-muted-foreground"># País</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Ventas Netas</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Uds Vendidas</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">Ticket Prom</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">UPT</th>
                  <th className="px-3 py-3 text-right text-xs font-medium text-muted-foreground">% Full Price</th>
                </tr>
              </thead>
              <tbody>
                {zoneRanking.map((row, i) => {
                  const countryIdx = allRanking.findIndex(r => r.tienda === row.tienda);
                  return (
                    <tr key={row.tienda} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-3 text-center font-bold text-primary">{i + 1}</td>
                      <td className="px-3 py-3 text-center font-bold text-muted-foreground">{countryIdx + 1}</td>
                      <td className="px-3 py-3 font-medium text-foreground">{row.tienda}</td>
                      <td className="px-3 py-3 text-right font-semibold">{fmtCurrency(row.ventas_totales)}</td>
                      <td className="px-3 py-3 text-right">{(row.unidades_vendidas ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-3 text-right">{fmtCurrency(row.ticket_promedio)}</td>
                      <td className="px-3 py-3 text-right">{(row.upt ?? 0).toFixed(2)}</td>
                      <td className="px-3 py-3 text-right">
                        <span className={cn("font-medium", (row.pct_venta_full_price ?? 0) >= 60 ? "text-emerald-600" : "text-amber-500")}>
                          {(row.pct_venta_full_price ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {zoneRanking.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">Sin datos para esta zona</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pareto */}
      <div className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" onClick={() => navigate(`/lineas?canal=${canal}&days=${days}`)}>
        <ParetoChart days={days} canal={canal} locationId={locParam} />
      </div>

      <CollectionCompositionCard days={days} canal={canal} locationId={locParam} zona={zonaParam} />

      {/* Top/Bottom Products */}
      <ProductTable data={topProducts} title="Top 20 — Más Vendidos" exportFilename={`top20_zona_${canal}_${days}d`}
        days={days} canalFiltro={canalFiltro} locationFiltro={locParam} />
      <ProductTable data={bottomProducts} title="Bottom 20 — Menor Rotación (con stock)" exportFilename={`bottom20_zona_${canal}_${days}d`}
        days={days} canalFiltro={canalFiltro} locationFiltro={locParam} />
    </div>
  );
}

/* ── Zone Store Rank Card (with zone + national ranking) ── */
function ZoneStoreRankCard({ days, canal, locationId, locationName, allRanking, zoneRanking, zoneName }: {
  days: number; canal: string; locationId: string; locationName: string;
  allRanking: RankingRow[]; zoneRanking: RankingRow[]; zoneName: string;
}) {
  const [extraMetrics, setExtraMetrics] = useState<ExtraMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const nationalIdx = allRanking.findIndex(r => r.tienda === locationName);
  const zoneIdx = zoneRanking.findIndex(r => r.tienda === locationName);
  const nationalRank = nationalIdx >= 0 ? nationalIdx + 1 : null;
  const zoneRank = zoneIdx >= 0 ? zoneIdx + 1 : null;
  const ventasNetas = nationalIdx >= 0 ? allRanking[nationalIdx].ventas_totales : 0;

  const effectiveDays = resolveDays(days);
  const allDailySales = allRanking.map(r => r.ventas_totales / effectiveDays);
  const storeDailySales = nationalIdx >= 0 ? allRanking[nationalIdx].ventas_totales / effectiveDays : 0;
  const perfClassNational = getPerformanceClass(storeDailySales, allDailySales);

  const zoneDailySales = zoneRanking.map(r => r.ventas_totales / effectiveDays);
  const perfClassZone = getPerformanceClass(storeDailySales, zoneDailySales);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { data: metricsData } = await supabase.rpc("reporte_metricas_tienda_individual" as any, {
        dias_atras: effectiveDays, p_location_id: locationId,
      });
      if (metricsData && (metricsData as any[]).length > 0) {
        setExtraMetrics((metricsData as any[])[0] as ExtraMetrics);
      }
      setLoading(false);
    }
    fetch();
  }, [days, locationId]);

  if (loading) return <LoadingState rows={2} />;

  const ALERT_THRESHOLD = 60_000_000;
  const showAlert = ventasNetas < ALERT_THRESHOLD;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Card 1: Posición en Ranking (Zone + National) */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Posición en Ranking</h3>
          </div>
          <div className="space-y-4">
            {/* National Position */}
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-muted/30 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Posición General</p>
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">#{nationalRank ?? "—"}</span>
              </div>
              <p className="text-xs text-muted-foreground">de {allRanking.length} sucursales</p>
              <span className={cn("text-xs font-semibold", perfClassNational.color)}>{perfClassNational.label}</span>
            </div>
            {/* Zone Position */}
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Posición en Zona ({zoneName})</p>
              <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center">
                <span className="text-2xl font-bold text-primary">#{zoneRank ?? "—"}</span>
              </div>
              <p className="text-xs text-muted-foreground">de {zoneRanking.length} sucursales</p>
              <span className={cn("text-xs font-semibold", perfClassZone.color)}>{perfClassZone.label}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Desempeño Comercial */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Desempeño Comercial</h3>
          </div>
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🟢 Mejor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.mejor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_mejor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">🔴 Peor Día</p>
                <p className="text-sm font-semibold text-foreground">{translateDay(extraMetrics?.peor_dia_semana ?? "N/A")}</p>
                <p className="text-xs text-muted-foreground">{fmtCurrency(extraMetrics?.venta_peor_dia ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Lun-Vie</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_semana ?? 0)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Prom. Sáb-Dom</p>
                <p className="text-sm font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_finde ?? 0)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Venta Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{fmtCurrency(extraMetrics?.venta_promedio_diaria_actual ?? 0)}</p>
                <ComparisonIndicator actual={extraMetrics?.venta_promedio_diaria_actual ?? 0} anterior={extraMetrics?.venta_promedio_diaria_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pedidos Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.pedidos_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.pedidos_promedio_diario_actual ?? 0} anterior={extraMetrics?.pedidos_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Uds Prom/Día</p>
                <p className="text-base font-semibold text-foreground">{(extraMetrics?.unidades_promedio_diario_actual ?? 0).toFixed(1)}</p>
                <ComparisonIndicator actual={extraMetrics?.unidades_promedio_diario_actual ?? 0} anterior={extraMetrics?.unidades_promedio_diario_anterior ?? 0} label="vs ant." />
              </div>
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

/* ── Main Component ── */
export function ExecutiveDashboard({ days, comparisonPeriod = "previous" }: Props) {
  return (
    <Tabs defaultValue="venta-directa" className="w-full">
      <TabsList className="w-full grid grid-cols-3 bg-muted/50 rounded-xl p-1 h-auto border border-border mb-6">
        <TabsTrigger value="venta-directa" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
          <Package className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">Desempeño Comercial Venta Directa</span>
          <span className="sm:hidden">Venta Directa</span>
        </TabsTrigger>
        <TabsTrigger value="por-zona" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
          <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">Desempeño por Zona</span>
          <span className="sm:hidden">Por Zona</span>
        </TabsTrigger>
        <TabsTrigger value="por-canal" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
          <Store className="h-4 w-4 sm:h-5 sm:w-5" />
          <span className="hidden sm:inline">Desempeño por Canal</span>
          <span className="sm:hidden">Por Canal</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="venta-directa">
        <BrandOverviewPanel days={days} comparisonPeriod={comparisonPeriod} />
        <BrandParetoPreview days={days} />
      </TabsContent>

      <TabsContent value="por-zona">
        <Tabs defaultValue="tiendas" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-xl p-1 h-auto border border-border">
            <TabsTrigger value="tiendas" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Store className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Tiendas de Línea</span>
              <span className="sm:hidden">Tiendas</span>
            </TabsTrigger>
            <TabsTrigger value="outlets" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Tag className="h-4 w-4 sm:h-5 sm:w-5" />
              Outlets
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tiendas" className="mt-6">
            <ZonePanel days={days} locationFilter="tiendas" comparisonPeriod={comparisonPeriod} />
          </TabsContent>
          <TabsContent value="outlets" className="mt-6">
            <ZonePanel days={days} locationFilter="outlets" comparisonPeriod={comparisonPeriod} />
          </TabsContent>
        </Tabs>
      </TabsContent>

      <TabsContent value="por-canal">
        <Tabs defaultValue="tiendas" className="w-full">
          <TabsList className="w-full grid grid-cols-3 bg-muted/50 rounded-xl p-1 h-auto border border-border">
            <TabsTrigger value="tiendas" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Store className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">Tiendas de Línea</span>
              <span className="sm:hidden">Tiendas</span>
            </TabsTrigger>
            <TabsTrigger value="outlets" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Tag className="h-4 w-4 sm:h-5 sm:w-5" />
              Outlets
            </TabsTrigger>
            <TabsTrigger value="digital" className="flex items-center justify-center gap-2 sm:gap-2.5 text-sm sm:text-base font-medium rounded-lg px-4 py-2.5 sm:py-3 transition-all duration-200 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm text-muted-foreground hover:text-foreground hover:bg-muted">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5" />
              Digital
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tiendas" className="mt-6">
            <ChannelPanel days={days} canal="tiendas" showLocationFilter={true} locationFilter="tiendas" comparisonPeriod={comparisonPeriod} />
          </TabsContent>
          <TabsContent value="outlets" className="mt-6">
            <ChannelPanel days={days} canal="outlets" showLocationFilter={true} locationFilter="outlets" comparisonPeriod={comparisonPeriod} />
          </TabsContent>
          <TabsContent value="digital" className="mt-6">
            <ChannelPanel days={days} canal="digital" showLocationFilter={false} comparisonPeriod={comparisonPeriod} />
          </TabsContent>
        </Tabs>
      </TabsContent>
    </Tabs>
  );
}
