import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Download, FileText, Trophy } from "lucide-react";

interface RankingRow {
  tienda: string;
  ventas_totales: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  upt: number;
  pct_venta_full_price: number;
}

const MEDALS = ["🥇", "🥈", "🥉"];

const fmt = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

export function StoreLeaderboard({ days }: { days: number }) {
  const [data, setData] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows } = await supabase.rpc("reporte_ranking_tiendas", {
        dias_atras: effectiveDays,
      });
      if (rows) setData(rows as unknown as RankingRow[]);
      setLoading(false);
    }
    fetch();
  }, [days]);

  if (loading) return <LoadingState rows={4} />;
  if (!data.length) return <EmptyState message="Sin datos de ranking para este período." />;

  const exportData = data.map((r, i) => ({
    "#": i + 1,
    Tienda: r.tienda,
    "Ventas Totales": r.ventas_totales,
    "Unidades Vendidas": r.unidades_vendidas,
    "Ticket Promedio": r.ticket_promedio,
    UPT: r.upt,
    "% Full Price": r.pct_venta_full_price,
  }));

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Top 10 Tiendas — Leaderboard</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => exportToCSV(exportData as unknown as Record<string, unknown>[], `ranking_tiendas_${days}d`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => exportToPDF(exportData as unknown as Record<string, unknown>[], `ranking_tiendas_${days}d`, "Top 10 Tiendas — Leaderboard")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-10">#</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ventas Totales</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Uds</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ticket Prom</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">UPT</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">% Full Price</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={row.tienda} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-center text-base">
                  {i < 3 ? MEDALS[i] : <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>}
                </td>
                <td className="px-4 py-3 font-medium text-foreground">{row.tienda}</td>
                <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(row.ventas_totales)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{(row.unidades_vendidas ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(row.ticket_promedio)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                    row.upt >= 2.0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {row.upt.toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.min(row.pct_venta_full_price, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground w-12 text-right">
                      {row.pct_venta_full_price.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
