import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HealthRow {
  tienda: string | null;
  inventario_total: number | null;
  venta_promedio_semanal: number | null;
  semanas_inventario: number | null;
  estado_salud: string | null;
}

interface WosCategoryRow {
  categoria: string | null;
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

export function InventoryHealth({ days }: Props) {
  const [data, setData] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<{ name: string; locationId: string } | null>(null);
  const [wosDetail, setWosDetail] = useState<WosCategoryRow[]>([]);
  const [wosLoading, setWosLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { data: rows, error } = await supabase.rpc("reporte_salud_inventario", {
        dias_atras: days,
      });
      if (!error && rows) setData(rows as HealthRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days]);

  // Fetch WOS detail when a store is selected
  const handleStoreClick = async (storeName: string) => {
    // Find location_id from locations table
    const { data: locs } = await supabase
      .from("locations")
      .select("location_id, name")
      .eq("is_active", true);

    const loc = locs?.find((l) => l.name === storeName);
    if (!loc) return;

    setSelectedStore({ name: storeName, locationId: loc.location_id });
    setWosLoading(true);

    const { data: rows } = await supabase.rpc("reporte_wos_categoria_tienda", {
      dias_atras: days,
      p_location_id: loc.location_id,
    });

    if (rows) setWosDetail(rows as unknown as WosCategoryRow[]);
    setWosLoading(false);
  };

  if (loading) return <LoadingState rows={5} />;
  if (!data.length) return <EmptyState message="No hay datos de inventario disponibles." />;

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
          Semanas de Inventario (WOS) por Tienda
        </h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
          >
            <XAxis
              type="number"
              domain={[0, "dataMax + 4"]}
              tick={{ fill: "hsl(240,8%,52%)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}w`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: "hsl(220,10%,40%)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220,10%,95%)" }} />
            <ReferenceLine x={8} stroke="hsl(38,92%,50%)" strokeDasharray="4 3" />
            <ReferenceLine x={20} stroke="hsl(0,72%,51%)" strokeDasharray="4 3" />
            <Bar dataKey="semanas" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getBarColor(entry.semanas)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
      </div>

      {/* Detail cards - Clickable */}
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
                <p className="text-lg font-display font-bold text-foreground">
                  {(row.inventario_total ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">WOS</p>
                <p className="text-lg font-display font-bold" style={{ color: getBarColor(row.semanas_inventario) }}>
                  {row.semanas_inventario?.toFixed(1) ?? "—"}w
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Venta prom. semanal</p>
              <p className="text-sm text-foreground">{(row.venta_promedio_semanal ?? 0).toLocaleString()} uds</p>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Clic para ver detalle por categoría</p>
          </div>
        ))}
      </div>

      {/* WOS Drill-down Modal */}
      <Dialog open={!!selectedStore} onOpenChange={(open) => { if (!open) setSelectedStore(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base">
              WOS por Categoría — {selectedStore?.name}
            </DialogTitle>
          </DialogHeader>
          {wosLoading ? (
            <LoadingState rows={4} />
          ) : wosDetail.length === 0 ? (
            <EmptyState message="Sin datos de categoría para esta tienda." />
          ) : (
            <div className="overflow-x-auto max-h-[60vh]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Categoría</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Stock</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Vta Prom/Sem</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">WOS</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {wosDetail.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.categoria ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right">{(row.inventario_total ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right">{(row.venta_promedio_semanal ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-right font-medium" style={{ color: getBarColor(row.semanas_inventario) }}>
                        {row.semanas_inventario?.toFixed(1) ?? "—"}w
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusBadge label={row.estado_salud ?? ""} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
