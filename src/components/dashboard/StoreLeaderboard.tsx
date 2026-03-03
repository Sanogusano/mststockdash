import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState, EmptyState } from "./LoadingState";
import { Download, FileText, Trophy, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Globe, MapPin } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface RankingRow {
  tienda: string;
  ventas_totales: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  upt: number;
  pct_venta_full_price: number;
  zona: string;
}

interface PrevRow {
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

/* ── Comparison Arrow ── */
function CompArrow({ cur, prev }: { cur: number; prev: number | undefined }) {
  if (prev === undefined || prev === 0) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return null;
  const up = pct > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-emerald-600" : "text-red-500"}`}>
      {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ── UPT Badge ── */
function UptBadge({ upt }: { upt: number }) {
  const cls = upt >= 2.0
    ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30"
    : upt < 1.5
      ? "bg-red-500/15 text-red-600 ring-1 ring-red-500/30"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {upt.toFixed(2)}
    </span>
  );
}

/* ── Store Row ── */
function StoreRow({ row, rank, prev }: { row: RankingRow; rank: number; prev?: PrevRow }) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5 text-center text-base">
        {rank < 3 ? MEDALS[rank] : <span className="text-xs text-muted-foreground font-mono">{rank + 1}</span>}
      </td>
      <td className="px-3 py-2.5 font-medium text-foreground text-sm">{row.tienda}</td>
      <td className="px-3 py-2.5 text-right">
        <span className="font-semibold text-foreground text-sm">{fmt(row.ventas_totales)}</span>
        {prev && <div className="mt-0.5"><CompArrow cur={row.ventas_totales} prev={prev.ventas_totales} /></div>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="text-muted-foreground text-sm">{(row.unidades_vendidas ?? 0).toLocaleString()}</span>
        {prev && <div className="mt-0.5"><CompArrow cur={row.unidades_vendidas} prev={prev.unidades_vendidas} /></div>}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="text-muted-foreground text-sm">{fmt(row.ticket_promedio)}</span>
        {prev && <div className="mt-0.5"><CompArrow cur={row.ticket_promedio} prev={prev.ticket_promedio} /></div>}
      </td>
      <td className="px-3 py-2.5 text-center"><UptBadge upt={row.upt} /></td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-2">
          <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(row.pct_venta_full_price, 100)}%` }} />
          </div>
          <span className="text-xs font-medium text-foreground w-12 text-right">{row.pct_venta_full_price.toFixed(1)}%</span>
          {prev && <CompArrow cur={row.pct_venta_full_price} prev={prev.pct_venta_full_price} />}
        </div>
      </td>
    </tr>
  );
}

const TABLE_HEADER = (
  <tr className="border-b border-border bg-muted/30">
    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground w-10">#</th>
    <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground">Tienda</th>
    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Ventas Netas</th>
    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Uds</th>
    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">Ticket Prom</th>
    <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground">UPT</th>
    <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">% Full Price</th>
  </tr>
);

export function StoreLeaderboard({ days, canal }: { days: number; canal?: string }) {
  const [data, setData] = useState<RankingRow[]>([]);
  const [prevData, setPrevData] = useState<PrevRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function load() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const [curRes, prevRes] = await Promise.all([
        supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: canal || null }),
        supabase.rpc("reporte_ranking_tiendas_anterior" as any, { dias_atras: effectiveDays, p_canal: canal || null }),
      ]);
      if (curRes.data) setData(curRes.data as unknown as RankingRow[]);
      if (prevRes.data) setPrevData(prevRes.data as unknown as PrevRow[]);
      setLoading(false);
    }
    load();
  }, [days, canal]);

  if (loading) return <LoadingState rows={4} />;
  if (!data.length) return <EmptyState message="Sin datos de ranking para este período." />;

  const prevMap = new Map(prevData.map(r => [r.tienda, r]));

  // Group by zone
  const zoneGroups = new Map<string, RankingRow[]>();
  data.forEach(row => {
    const z = row.zona || "Sin Zona";
    if (!zoneGroups.has(z)) zoneGroups.set(z, []);
    zoneGroups.get(z)!.push(row);
  });

  const exportDataRows = data.map((r, i) => ({
    "#": i + 1,
    Tienda: r.tienda,
    Zona: r.zona,
    "Ventas Netas": r.ventas_totales,
    "Unidades Vendidas": r.unidades_vendidas,
    "Ticket Promedio": r.ticket_promedio,
    UPT: r.upt,
    "% Full Price": r.pct_venta_full_price,
  }));

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Top Tiendas — Leaderboard</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => exportToCSV(exportDataRows as unknown as Record<string, unknown>[], `ranking_tiendas_${days}d`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => exportToPDF(exportDataRows as unknown as Record<string, unknown>[], `ranking_tiendas_${days}d`, "Top Tiendas — Leaderboard")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>

      <Tabs defaultValue="pais" className="w-full">
        <div className="px-4 pt-3">
          <TabsList className="h-8">
            <TabsTrigger value="pais" className="text-xs gap-1.5">
              <Globe className="h-3.5 w-3.5" /> Medallero País
            </TabsTrigger>
            <TabsTrigger value="zona" className="text-xs gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Medallero por Zona
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── País Tab ── */}
        <TabsContent value="pais" className="mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>{TABLE_HEADER}</thead>
              <tbody>
                {(expanded ? data : data.slice(0, 10)).map((row, i) => (
                  <StoreRow key={row.tienda} row={row} rank={i} prev={prevMap.get(row.tienda)} />
                ))}
              </tbody>
            </table>
          </div>
          {data.length > 10 && (
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                {expanded ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Mostrar solo Top 10</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Ver las {data.length} tiendas</>
                )}
              </button>
            </div>
          )}
        </TabsContent>

        {/* ── Zona Tab ── */}
        <TabsContent value="zona" className="mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>{TABLE_HEADER}</thead>
              <tbody>
                {[...zoneGroups.entries()]
                  .sort(([, a], [, b]) => b.reduce((s, r) => s + r.ventas_totales, 0) - a.reduce((s, r) => s + r.ventas_totales, 0))
                  .map(([zone, stores]) => {
                    const totalVentas = stores.reduce((s, r) => s + r.ventas_totales, 0);
                    return (
                      <tr key={`zone-${zone}`} className="contents">
                        {/* Zone header row */}
                        <td colSpan={7} className="px-3 py-2 bg-primary/5 border-b border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-bold text-primary">{zone}</span>
                              <span className="text-[10px] text-muted-foreground">({stores.length} tiendas)</span>
                            </div>
                            <span className="text-xs font-semibold text-foreground">{fmt(totalVentas)}</span>
                          </div>
                        </td>
                        {stores.map((row, i) => (
                          <StoreRow key={row.tienda} row={row} rank={i} prev={prevMap.get(row.tienda)} />
                        ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
