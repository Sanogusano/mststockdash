import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays, getDateRange } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { Users } from "lucide-react";

interface GeneroRow {
  genero: string;
  uds_vendidas: number;
  venta_neta: number;
  pct_venta_valor: number;
  stock: number;
  pct_stock: number;
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

const fmtPct = (n: number) => `${Math.min(n, 999).toFixed(1).replace(".", ",")}%`;
const fmtCOP = (n: number) => `$ ${Math.round(n).toLocaleString("es-CO")}`;

const fmtRango = (days: number, customFrom?: Date, customTo?: Date) => {
  const { from, to } = getDateRange(days, customFrom, customTo);
  const f = (d: Date) =>
    d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  return `Del ${f(from)} al ${f(to)} de ${to.getFullYear()}`;
};

/** Barra horizontal de escala fija 0–100%, arrancando en cero. */
function BarRow({
  label,
  pct,
  uds,
  color,
  dim,
}: {
  label: string;
  pct: number;
  uds: number;
  color: string;
  dim?: boolean;
}) {
  const w = Math.max(0, Math.min(pct, 100));
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-12 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative h-4 flex-1 min-w-0 overflow-hidden rounded bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded"
          style={{
            width: `${w}%`,
            backgroundColor: color,
            opacity: dim ? 0.45 : 1,
          }}
        />
        {dim && w > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded"
            style={{
              width: `${w}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 3px, transparent 3px 6px)",
            }}
          />
        )}
      </div>
      <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-foreground">
        {fmtPct(pct)}
      </span>
      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {uds.toLocaleString("es-CO")} uds
      </span>
    </div>
  );
}

function GeneroBlock({ r, i }: { r: GeneroRow; i: number }) {
  const color = colorFor(r.genero, i);
  const sobre = r.brecha_pp > 0;
  const neutro = Math.abs(r.brecha_pp) < 0.05;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold uppercase tracking-wide text-foreground">
          {r.genero}
        </span>
      </div>
      <BarRow label="Venta" pct={r.pct_venta_valor} uds={r.uds_vendidas} color={color} />
      <BarRow label="Stock" pct={r.pct_stock} uds={r.stock} color={color} dim />
      <p
        className={
          neutro
            ? "text-[11px] text-muted-foreground"
            : sobre
              ? "text-[11px] font-medium text-destructive"
              : "text-[11px] font-medium text-emerald-600"
        }
      >
        {neutro
          ? "En línea: el stock acompaña a la venta"
          : `${Math.abs(r.brecha_pp).toFixed(1).replace(".", ",")} pp ${
              sobre ? "más" : "menos"
            } stock del que su venta justifica`}
      </p>
    </div>
  );
}

export function ParticipacionGeneroCard({
  days,
  canal,
  zona,
  locationId,
  ambito,
  customFrom,
  customTo,
}: {
  days: number;
  canal?: string | null;
  zona?: string | null;
  locationId?: string | null;
  ambito?: string | null;
  customFrom?: Date;
  customTo?: Date;
}) {
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
        p_zona: zona ?? null,
        p_tienda: locationId ?? null,
      });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        const parsed: GeneroRow[] = ((data as any[]) ?? []).map((r) => ({
          genero: String(r.genero ?? "SIN GENERO"),
          uds_vendidas: toNumber(r.uds_vendidas),
          venta_neta: toNumber(r.venta_neta),
          pct_venta_valor: toNumber(r.pct_venta_valor),
          stock: toNumber(r.stock),
          pct_stock: toNumber(r.pct_stock),
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
  }, [days, canal, zona, locationId]);

  if (loading) return <LoadingState rows={2} />;
  if (error) return <EmptyState message={`Error: ${error}`} />;
  if (rows.length === 0) return <EmptyState message="Sin datos de participación por género" />;

  return (
    <div className="bg-card rounded-lg border border-border p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-bold text-foreground">Participación por Género</h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {ambito ? `${ambito} · ` : ""}{fmtRango(days, customFrom, customTo)}
        </span>
      </div>


      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <GeneroBlock key={r.genero} r={r} i={i} />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
        Barras sobre escala fija de 0 a 100% para comparar géneros. La barra de Stock va atenuada.
        Brecha = participación en stock menos participación en venta.
      </p>
    </div>
  );
}
