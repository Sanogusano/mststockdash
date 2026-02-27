import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Shirt, Percent, Tag, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { MultiSelectFilter } from "./MultiSelectFilter";

interface HealthRow {
  tipo: string | null;
  tienda: string | null;
  inventario_total: number | null;
  venta_promedio_semanal: number | null;
  semanas_inventario: number | null;
  estado_salud: string | null;
}

interface WosCatRow {
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
  pct_pedidos_con_descuento: number;
  pct_pedidos_rebajas: number;
}

interface Props {
  days: number;
}

const getBarColor = (semanas: number | null) => {
  if (!semanas) return "hsl(240,10%,40%)";
  if (semanas > 20) return "hsl(0,72%,51%)";
  if (semanas < 8) return "hsl(38,92%,50%)";
  return "hsl(152,60%,40%)";
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const v = payload[0].value;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-medium text-foreground mb-1">{label}</p>
        <p className="text-primary">{v?.toFixed(1)} semanas de stock</p>
      </div>
    );
  }
  return null;
};

function KpiCard({ label, value, icon: Icon, className }: {
  label: string; value: string; icon: React.ElementType; className?: string;
}) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className={cn("h-5 w-5 text-primary", className)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={cn("text-2xl font-semibold text-foreground mt-0.5", className)}>{value}</p>
      </div>
    </div>
  );
}

function InventorySection({
  data,
  tipo,
  locationMap,
}: {
  data: HealthRow[];
  tipo: string;
  locationMap: Record<string, string>;
}) {
  const navigate = useNavigate();
  const isPrendas = tipo === "PRENDAS";

  const handleStoreClick = (storeName: string) => {
    const locId = locationMap[storeName];
    if (locId) navigate(`/tienda/${locId}`);
  };

  const chartData = data.map((r) => ({
    name: r.tienda?.replace("Monastery ", "") ?? "—",
    semanas: Number(r.semanas_inventario ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* Bar Chart */}
      <div className="glass-card rounded-xl p-6">
        <h3 className="font-display text-base font-semibold text-foreground mb-6">
          {isPrendas ? "Semanas de Inventario (WOS) por Tienda" : "Semanas de Stock · Bolsas & Empaques"}
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, "dataMax + 4"]} tick={{ fill: "hsl(240,8%,52%)", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}w`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "hsl(220,10%,40%)", fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220,10%,95%)" }} />
            {isPrendas && (
              <>
                <ReferenceLine x={8} stroke="hsl(38,92%,50%)" strokeDasharray="4 3" />
                <ReferenceLine x={20} stroke="hsl(0,72%,51%)" strokeDasharray="4 3" />
              </>
            )}
            <Bar dataKey="semanas" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((_, index) => (
                <Cell key={index} fill={getBarColor(chartData[index].semanas)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {isPrendas && (
          <div className="flex items-center gap-6 mt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block" style={{ borderTop: "2px dashed hsl(38,92%,50%)" }} />
              &lt; 8 sem: Riesgo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block" style={{ borderTop: "2px dashed hsl(0,72%,51%)" }} />
              &gt; 20 sem: Sobrestock
            </span>
          </div>
        )}
      </div>

      {/* Store cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.map((row, i) => (
          <div
            key={i}
            className="glass-card rounded-xl p-4 space-y-3 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
            onClick={() => handleStoreClick(row.tienda ?? "")}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-foreground leading-tight">{row.tienda}</p>
              <StatusBadge label={row.estado_salud ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Stock total</p>
                <p className="text-lg font-semibold text-foreground">{(row.inventario_total ?? 0).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">WOS</p>
                <p className="text-lg font-semibold" style={{ color: getBarColor(row.semanas_inventario) }}>
                  {row.semanas_inventario?.toFixed(1) ?? "—"}w
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Venta prom. semanal</p>
              <p className="text-sm text-foreground">{(row.venta_promedio_semanal ?? 0).toLocaleString()} uds</p>
            </div>
            {isPrendas && (
              <p className="text-[10px] text-primary text-center font-medium">Clic para ver detalle por categoría →</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── WOS Category Table with Multi-Select Filters ─── */
function WosCategoryTable({ data, locations }: { data: WosCatRow[]; locations: { id: string; name: string }[] }) {
  const [selTiendas, setSelTiendas] = useState<string[]>([]);
  const [selEstados, setSelEstados] = useState<string[]>([]);
  const [selStock, setSelStock] = useState<string[]>([]);

  const stockOptions = ["Con stock", "Sin stock", "Stock alto (≥100)", "Stock bajo (<100)"];
  const uniqueEstados = useMemo(() => [...new Set(data.map((r) => r.estado_salud))], [data]);
  const uniqueTiendas = useMemo(() => locations.map((l) => l.name), [locations]);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      if (selTiendas.length > 0 && !selTiendas.includes(row.tienda)) return false;
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
      return true;
    });
  }, [data, selTiendas, selEstados, selStock]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border space-y-3">
        <h3 className="text-sm font-semibold text-foreground">WOS por Categoría · Todas las Tiendas</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <MultiSelectFilter label="Tienda" options={uniqueTiendas} selected={selTiendas} onChange={setSelTiendas} />
          <MultiSelectFilter label="Stock" options={stockOptions} selected={selStock} onChange={setSelStock} />
          <MultiSelectFilter label="Estado" options={uniqueEstados} selected={selEstados} onChange={setSelEstados} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categoría</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock</th>
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
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.tienda}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground">{row.categoria}</td>
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
    </div>
  );
}

/* ─── Main Component ─── */
export function InventoryHealth({ days }: Props) {
  const [data, setData] = useState<HealthRow[]>([]);
  const [wosCatData, setWosCatData] = useState<WosCatRow[]>([]);
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [healthRes, locsRes, kpiRes, wosCatRes] = await Promise.all([
        supabase.rpc("reporte_salud_inventario", { dias_atras: effectiveDays }),
        supabase.from("locations").select("location_id, name").eq("is_active", true),
        supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays }),
        supabase.rpc("reporte_wos_categoria_global", { dias_atras: effectiveDays }),
      ]);

      if (healthRes.data) setData(healthRes.data as HealthRow[]);
      if (kpiRes.data && kpiRes.data.length > 0) setKpis(kpiRes.data[0] as unknown as KpiData);
      if (wosCatRes.data) setWosCatData(wosCatRes.data as unknown as WosCatRow[]);

      if (locsRes.data) {
        const map: Record<string, string> = {};
        const locs: { id: string; name: string }[] = [];
        locsRes.data.forEach((l) => {
          map[l.name] = l.location_id;
          locs.push({ id: l.location_id, name: l.name });
        });
        setLocationMap(map);
        setLocations(locs);
      }

      setLoading(false);
    }
    fetchData();
  }, [days]);

  if (loading) return <LoadingState rows={5} />;
  if (!data.length) return <EmptyState message="No hay datos de inventario disponibles." />;

  const prendas = data.filter((r) => r.tipo === "PRENDAS");
  const bolsas = data.filter((r) => r.tipo === "BOLSAS Y EMPAQUES");

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <KpiCard
          label="% Descuento Promocional"
          value={`${(kpis?.pct_pedidos_con_descuento ?? 0).toFixed(1)}%`}
          icon={Percent}
          className="text-orange-500"
        />
        <KpiCard
          label="% Rebajas"
          value={`${(kpis?.pct_pedidos_rebajas ?? 0).toFixed(1)}%`}
          icon={Tag}
          className="text-rose-500"
        />
      </div>

      {/* Existing Tabs */}
      <Tabs defaultValue="prendas" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="prendas" className="gap-2">
            <Shirt className="h-4 w-4" />
            Prendas
          </TabsTrigger>
          <TabsTrigger value="bolsas" className="gap-2">
            <Package className="h-4 w-4" />
            Bolsas & Empaques
          </TabsTrigger>
        </TabsList>
        <TabsContent value="prendas">
          {prendas.length ? (
            <InventorySection data={prendas} tipo="PRENDAS" locationMap={locationMap} />
          ) : (
            <EmptyState message="No hay datos de prendas disponibles." />
          )}
        </TabsContent>
        <TabsContent value="bolsas">
          {bolsas.length ? (
            <InventorySection data={bolsas} tipo="BOLSAS Y EMPAQUES" locationMap={locationMap} />
          ) : (
            <EmptyState message="No hay datos de bolsas y empaques." />
          )}
        </TabsContent>
      </Tabs>

      {/* WOS by Category Table */}
      {wosCatData.length > 0 && (
        <WosCategoryTable data={wosCatData} locations={locations} />
      )}
    </div>
  );
}
