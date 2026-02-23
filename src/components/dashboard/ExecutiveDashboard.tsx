import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { exportToCSV } from "@/lib/csv-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store, Globe, Download, DollarSign, ShoppingBag, Receipt } from "lucide-react";

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
        <p className="text-2xl font-semibold text-foreground mt-0.5">
          {prefix}{value}
        </p>
      </div>
    </div>
  );
}

/* ── Product Table ── */
function ProductTable({ data, title, onExport }: {
  data: ProductRow[]; title: string; onExport: () => void;
}) {
  if (!data.length) return <EmptyState message="Sin datos para mostrar." />;

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar
        </button>
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
                        className="w-9 h-9 rounded-lg object-cover bg-muted"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-sm">
                        👗
                      </div>
                    )}
                    <span className="font-medium text-foreground line-clamp-1 max-w-[200px]">
                      {row.producto ?? "—"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.categoria ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.clasificacion?.includes("Full Price")
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

  // Fetch locations once
  useEffect(() => {
    if (!showLocationFilter) return;
    supabase.from("locations").select("location_id, name").eq("is_active", true)
      .then(({ data }) => {
        if (data) setLocations(data);
      });
  }, [showLocationFilter]);

  // Fetch data
  useEffect(() => {
    async function fetchAll() {
      if (!isValidDays(days)) return;
      setLoading(true);

      const locParam = selectedLocation === "all" ? null : selectedLocation;

      const [kpiRes, topRes, bottomRes] = await Promise.all([
        supabase.rpc("reporte_ejecutivo_kpis", {
          dias_atras: days,
          canal_filtro: canal,
          location_filtro: locParam,
        }),
        supabase.rpc("reporte_ejecutivo_productos", {
          dias_atras: days,
          canal_filtro: canal,
          location_filtro: locParam,
          orden: "TOP",
          limite: 20,
        }),
        supabase.rpc("reporte_ejecutivo_productos", {
          dias_atras: days,
          canal_filtro: canal,
          location_filtro: locParam,
          orden: "BOTTOM",
          limite: 20,
        }),
      ]);

      if (kpiRes.data && kpiRes.data.length > 0) {
        setKpis(kpiRes.data[0] as unknown as KpiData);
      } else {
        setKpis({ ventas_totales: 0, unidades_totales: 0, ticket_promedio: 0 });
      }
      if (topRes.data) setTopProducts(topRes.data as unknown as ProductRow[]);
      if (bottomRes.data) setBottomProducts(bottomRes.data as unknown as ProductRow[]);

      setLoading(false);
    }
    fetchAll();
  }, [days, canal, selectedLocation]);

  if (loading) return <LoadingState rows={6} />;

  return (
    <div className="space-y-6">
      {/* Location filter (POS only) */}
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
                <SelectItem key={loc.location_id} value={loc.location_id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Ventas Totales"
          value={(kpis?.ventas_totales ?? 0).toLocaleString()}
          prefix="$"
          icon={DollarSign}
        />
        <KpiCard
          label="Unidades Vendidas"
          value={(kpis?.unidades_totales ?? 0).toLocaleString()}
          icon={ShoppingBag}
        />
        <KpiCard
          label="Ticket Promedio"
          value={(kpis?.ticket_promedio ?? 0).toLocaleString()}
          prefix="$"
          icon={Receipt}
        />
      </div>

      {/* Top 20 */}
      <ProductTable
        data={topProducts}
        title="Top 20 — Más Vendidos"
        onExport={() => exportToCSV(topProducts as unknown as Record<string, unknown>[], `top20_${canal}_${days}d`)}
      />

      {/* Bottom 20 */}
      <ProductTable
        data={bottomProducts}
        title="Bottom 20 — Menor Rotación"
        onExport={() => exportToCSV(bottomProducts as unknown as Record<string, unknown>[], `bottom20_${canal}_${days}d`)}
      />
    </div>
  );
}

/* ── Main Component ── */
export function ExecutiveDashboard({ days }: Props) {
  return (
    <Tabs defaultValue="pos" className="w-full">
      <TabsList className="w-full grid grid-cols-2 bg-muted/50 rounded-lg p-1 h-11">
        <TabsTrigger
          value="pos"
          className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md"
        >
          <Store className="h-4 w-4" />
          Tiendas
        </TabsTrigger>
        <TabsTrigger
          value="digital"
          className="flex items-center gap-2 text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm rounded-md"
        >
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
