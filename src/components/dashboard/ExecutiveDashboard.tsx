import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Globe, Download, FileText, DollarSign, ShoppingBag, Receipt } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

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
  ventas_totales: number;
  unidades_totales: number;
  ticket_promedio: number;
}

interface ProductRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  clasificacion: string | null;
  unidades_vendidas: number | null;
  precio_prom_venta: number | null;
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
function KpiCard({ label, value, prefix = "", icon: Icon }: {
  label: string; value: string; prefix?: string; icon: React.ElementType;
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-semibold text-foreground mt-0.5">{prefix}{value}</p>
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
    "Precio Prom": r.precio_prom_venta ?? 0,
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
                <td className="px-4 py-3 text-right">${(row.precio_prom_venta ?? 0).toLocaleString()}</td>
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
function ParetoChart({ days, canal }: { days: number; canal: string }) {
  const [data, setData] = useState<ParetoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { data: rows } = await supabase.rpc("reporte_pareto_categorias", {
        dias_atras: days,
        p_canal: canal === "POS" ? "pos" : "digital",
      });
      if (rows) setData(rows as unknown as ParetoRow[]);
      setLoading(false);
    }
    fetch();
  }, [days, canal]);

  if (loading) return <LoadingState rows={3} />;
  if (!data.length) return null;

  // Top 10 + group remainder as "Otros"
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
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={180} height={180}>
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

/* ── Channel Panel ── */
function ChannelPanel({ days, canal, showLocationFilter }: {
  days: number; canal: string; showLocationFilter: boolean;
}) {
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [topProducts, setTopProducts] = useState<ProductRow[]>([]);
  const [bottomProducts, setBottomProducts] = useState<ProductRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!showLocationFilter) return;
    supabase.from("locations").select("location_id, name").eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          // Hide CEDI Guayabal from store selector
          setLocations(data.filter(l => l.location_id !== CEDI_ID).map(l => ({
            ...l,
            name: l.location_id === CEDI_ID ? CEDI_DISPLAY : l.name,
          })));
        }
      });
  }, [showLocationFilter]);

  useEffect(() => {
    async function fetchAll() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const locParam = selectedLocation === "all" ? null : selectedLocation;

      const rpcName = canal === "POS" ? "reporte_top_bottom_tiendas" : "reporte_top_bottom_digital";
      const rpcParams = canal === "POS"
        ? { dias_atras: days, ...(locParam ? { p_location_id: locParam } : {}) }
        : { dias_atras: days };

      const [kpiRes, allProductsRes] = await Promise.all([
        supabase.rpc("reporte_ejecutivo_kpis", {
          dias_atras: days,
          canal_filtro: canal,
          location_filtro: locParam,
        }),
        supabase.rpc(rpcName, rpcParams as any),
      ]);

      if (kpiRes.data && kpiRes.data.length > 0) {
        setKpis(kpiRes.data[0] as unknown as KpiData);
      } else {
        setKpis({ ventas_totales: 0, unidades_totales: 0, ticket_promedio: 0 });
      }

      if (allProductsRes.data) {
        const all = allProductsRes.data as unknown as ProductRow[];
        setTopProducts(all.slice(0, 20));
        const bottom = [...all].reverse().filter(r => (r.stock_disponible ?? 0) > 0).slice(0, 20);
        setBottomProducts(bottom);
      }

      setLoading(false);
    }
    fetchAll();
  }, [days, canal, selectedLocation]);

  if (loading) return <LoadingState rows={6} />;

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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Ventas Totales" value={(kpis?.ventas_totales ?? 0).toLocaleString()} prefix="$" icon={DollarSign} />
        <KpiCard label="Unidades Vendidas" value={(kpis?.unidades_totales ?? 0).toLocaleString()} icon={ShoppingBag} />
        <KpiCard label="Ticket Promedio" value={(kpis?.ticket_promedio ?? 0).toLocaleString()} prefix="$" icon={Receipt} />
      </div>

      <ParetoChart days={days} canal={canal} />

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
    <Tabs defaultValue="pos" className="w-full">
      <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-lg p-1 h-11">
        <TabsTrigger value="pos" className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md">
          <Store className="h-4 w-4" />
          Tiendas
        </TabsTrigger>
        <TabsTrigger value="digital" className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md">
          <Globe className="h-4 w-4" />
          Digital
        </TabsTrigger>
      </TabsList>

      <TabsContent value="pos" className="mt-6">
        <ChannelPanel days={days} canal="POS" showLocationFilter={true} />
      </TabsContent>
      <TabsContent value="digital" className="mt-6">
        <ChannelPanel days={days} canal="DIGITAL" showLocationFilter={false} />
      </TabsContent>
    </Tabs>
  );
}
