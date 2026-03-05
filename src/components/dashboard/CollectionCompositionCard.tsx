import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "./TimeFilter";
import { LoadingState } from "./LoadingState";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Layers } from "lucide-react";

const COLORS = [
  "hsl(220,70%,55%)", "hsl(160,55%,45%)", "hsl(330,65%,55%)",
  "hsl(38,85%,55%)", "hsl(260,60%,55%)", "hsl(0,65%,55%)",
  "hsl(190,60%,45%)", "hsl(280,50%,55%)", "hsl(45,80%,50%)", "hsl(300,40%,60%)",
  "hsl(220,10%,65%)",
];

interface Row {
  coleccion: string;
  unidades: number;
}

interface Props {
  days: number;
  canal?: string | null;
  locationId?: string | null;
  zona?: string | null;
}

export function CollectionCompositionCard({ days, canal, locationId, zona }: Props) {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_composicion_coleccion" as any, {
        dias_atras: effectiveDays,
        p_canal: canal || null,
        p_location_id: locationId || null,
        p_zona: zona || null,
      });
      if (rows) setData(rows as unknown as Row[]);
      setLoading(false);
    }
    fetch();
  }, [days, canal, locationId, zona]);

  if (loading) return <LoadingState rows={2} />;
  if (!data.length) return null;

  const total = data.reduce((s, r) => s + (r.unidades ?? 0), 0);
  const chartItems = data.map((r) => ({
    name: r.coleccion ?? "Otros",
    value: r.unidades ?? 0,
    pct: total > 0 ? ((r.unidades ?? 0) / total) * 100 : 0,
  }));

  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Composición por Colección</h3>
        <span className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} uds totales</span>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
        <ResponsiveContainer width={140} height={140} className="shrink-0">
          <PieChart>
            <Pie data={chartItems} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
              {chartItems.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number, name: string) => [`${v.toLocaleString()} uds (${((v / total) * 100).toFixed(1)}%)`, name]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5 max-h-[200px] overflow-y-auto w-full">
          {chartItems.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-foreground font-medium truncate max-w-[160px]">{r.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-muted-foreground">{r.value.toLocaleString()} uds</span>
                <span className="text-foreground font-mono font-semibold">{r.pct.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
