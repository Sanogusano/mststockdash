import { useEffect, useState } from "react";
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
import { Package, Shirt } from "lucide-react";

interface HealthRow {
  tipo: string | null;
  tienda: string | null;
  inventario_total: number | null;
  venta_promedio_semanal: number | null;
  semanas_inventario: number | null;
  estado_salud: string | null;
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
    raw: r,
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
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getBarColor(entry.semanas)} />
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

export function InventoryHealth({ days }: Props) {
  const [data, setData] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationMap, setLocationMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);

      const [healthRes, locsRes] = await Promise.all([
        supabase.rpc("reporte_salud_inventario", { dias_atras: effectiveDays }),
        supabase.from("locations").select("location_id, name").eq("is_active", true),
      ]);

      if (healthRes.data) setData(healthRes.data as HealthRow[]);

      if (locsRes.data) {
        const map: Record<string, string> = {};
        locsRes.data.forEach((l) => { map[l.name] = l.location_id; });
        setLocationMap(map);
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
  );
}
