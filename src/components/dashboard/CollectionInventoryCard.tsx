import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "./LoadingState";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Layers } from "lucide-react";

const COLORS = [
  "hsl(220,70%,55%)", "hsl(160,55%,45%)", "hsl(330,65%,55%)",
  "hsl(38,85%,55%)", "hsl(260,60%,55%)", "hsl(0,65%,55%)",
  "hsl(190,60%,45%)", "hsl(280,50%,55%)", "hsl(45,80%,50%)", "hsl(300,40%,60%)",
  "hsl(220,10%,65%)",
];

interface Row { coleccion: string; unidades: number; pct: number; }

interface Props {
  locationId?: string | null;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
        <p className="font-medium text-foreground mb-1">{d.coleccion}</p>
        <p className="text-primary">{d.unidades?.toLocaleString()} uds ({d.pct}%)</p>
      </div>
    );
  }
  return null;
};

export function CollectionInventoryCard({ locationId }: Props) {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const { data: res } = await supabase.rpc("reporte_composicion_inventario_coleccion" as any, {
        p_location_id: locationId || null,
      });
      if (res) setData(res as unknown as Row[]);
      setLoading(false);
    }
    fetch();
  }, [locationId]);

  if (loading) return <LoadingState rows={2} />;
  if (!data.length) return null;

  const total = data.reduce((s, r) => s + (r.unidades ?? 0), 0);

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Inventario por Colección</h3>
        <span className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} uds totales</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 32)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="coleccion"
            tick={{ fill: "hsl(220,10%,40%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={100}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(220,10%,95%)" }} />
          <Bar dataKey="unidades" radius={[0, 6, 6, 0]} maxBarSize={24} label={{ position: "right", fontSize: 10, fill: "hsl(220,10%,50%)", formatter: (v: number) => `${v.toLocaleString()} (${data.find(d => d.unidades === v)?.pct ?? 0}%)` }}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
