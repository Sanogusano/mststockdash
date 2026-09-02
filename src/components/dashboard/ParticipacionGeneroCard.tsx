import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Users } from "lucide-react";

interface GeneroRow {
  genero: string;
  uds_vendidas: number;
  pct_venta_uds: number;
  venta_neta: number;
  pct_venta_valor: number;
  stock: number;
  pct_stock: number;
  sell_through: number;
  brecha_pp: number;
}

const toNumber = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/** Paleta estable por género, usando tokens de gráfico del design system */
const GENERO_COLORS: Record<string, string> = {
  HOMBRE: "hsl(var(--chart-1))",
  MUJER: "hsl(var(--chart-4))",
  UNISEX: "hsl(var(--chart-2))",
  "SIN GENERO": "hsl(var(--muted-foreground))",
};
const colorFor = (g: string, i: number) =>
  GENERO_COLORS[g?.toUpperCase()] ?? `hsl(var(--chart-${(i % 5) + 1}))`;

const fmtPct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
const fmtPp = (n: number) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1).replace(".", ",")} pp`;
const fmtCOP = (n: number) =>
  `$ ${Math.round(n).toLocaleString("es-CO")}`;

function StackedBar({
  label,
  rows,
  pctKey,
}: {
  label: string;
  rows: GeneroRow[];
  pctKey: "pct_venta_valor" | "pct_stock";
}) {
  const total = rows.reduce((a, r) => a + r[pctKey], 0);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex h-6 w-full overflow-hidden rounded-md bg-muted">
        {rows.map((r, i) => {
          const w = total > 0 ? (r[pctKey] / total) * 100 : 0;
          if (w <= 0) return null;
          return (
            <Tooltip key={r.genero}>
              <TooltipTrigger asChild>
                <div
                  className="h-full transition-opacity hover:opacity-80 cursor-default"
                  style={{ width: `${w}%`, backgroundColor: colorFor(r.genero, i) }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold">{r.genero}</div>
                  <div>Unidades: {r.uds_vendidas.toLocaleString("es-CO")}</div>
                  <div>Venta neta: {fmtCOP(r.venta_neta)}</div>
                  <div>Sell-through: {fmtPct(r.sell_through)}</div>
                  <div>Stock: {r.stock.toLocaleString("es-CO")} uds</div>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {rows.map((r, i) => (
          <span key={r.genero} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorFor(r.genero, i) }} />
            {r.genero} {fmtPct(r[pctKey])}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ParticipacionGeneroCard({ days, canal }: { days: number; canal?: string | null }) {
  const [rows, setRows] = useState<GeneroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      setError(null);
      // La RPC espera 'Online' | 'OUTLET' | 'TIENDA' (o null para toda la red)
      const canalParam =
        canal === "digital" || canal === "online" ? "Online"
        : canal === "outlets" || canal === "OUTLET" ? "OUTLET"
        : canal === "tiendas" || canal === "TIENDA" ? "TIENDA"
        : null;

      const { data, error: err } = await supabase.rpc("reporte_participacion_genero" as any, {
        p_dias: resolveDays(days),
        p_canal: canalParam,
      });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        const parsed: GeneroRow[] = ((data as any[]) ?? []).map((r) => ({
          genero: String(r.genero ?? "SIN GENERO"),
          uds_vendidas: toNumber(r.uds_vendidas),
          pct_venta_uds: toNumber(r.pct_venta_uds),
          venta_neta: toNumber(r.venta_neta),
          pct_venta_valor: toNumber(r.pct_venta_valor),
          stock: toNumber(r.stock),
          pct_stock: toNumber(r.pct_stock),
          sell_through: toNumber(r.sell_through),
          brecha_pp: toNumber(r.brecha_pp),
        }));
        // Omitir SIN GENERO cuando es marginal (< 1% en venta y en stock)
        setRows(
          parsed.filter(
            (r) =>
              r.genero.toUpperCase() !== "SIN GENERO" ||
              r.pct_venta_valor >= 1 ||
              r.pct_stock >= 1
          )
        );
      }
      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [days, canal]);

  if (loading) return <LoadingState rows={2} />;
  if (error) return <EmptyState message={`Error: ${error}`} />;
  if (rows.length === 0) return <EmptyState message="Sin datos de participación por género" />;

  return (
    <TooltipProvider delayDuration={100}>
      <div className="bg-card rounded-lg border border-border p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Participación por Género</h3>
        </div>

        <div className="space-y-4">
          <StackedBar label="Venta" rows={rows} pctKey="pct_venta_valor" />
          <StackedBar label="Stock" rows={rows} pctKey="pct_stock" />
        </div>

        <div className="border-t border-border pt-3 space-y-1">
          {rows.map((r, i) => {
            const sobre = r.brecha_pp > 0;
            const neutro = Math.abs(r.brecha_pp) < 0.05;
            return (
              <div key={r.genero} className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colorFor(r.genero, i) }} />
                  <span className="truncate font-medium text-foreground">{r.genero}</span>
                </span>
                <span
                  className={
                    neutro
                      ? "text-muted-foreground"
                      : sobre
                        ? "text-destructive font-semibold"
                        : "text-emerald-600 font-semibold"
                  }
                >
                  {fmtPp(r.brecha_pp)}{" "}
                  <span className="font-normal">
                    {neutro ? "en línea" : sobre ? "sobreinvertido" : "subinvertido"}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Brecha = participación en stock menos participación en venta. Positiva significa más inventario del que la venta justifica.
        </p>
      </div>
    </TooltipProvider>
  );
}
