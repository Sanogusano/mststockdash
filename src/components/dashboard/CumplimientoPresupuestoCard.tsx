import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Target } from "lucide-react";

/**
 * Cumplimiento de presupuesto — card del Resumen Ejecutivo.
 *
 * El presupuesto se guarda MENSUAL en presupuestos_config. Para un rango
 * cualquiera se prorratea por día y se suman los tramos: si el rango cruza
 * meses con montos distintos, cada tramo usa su propio valor diario.
 *   Ej: 28-jul a 2-ago = 4 días × (julio/31) + 2 días × (agosto/31)
 *
 * El presupuesto de canal (Tienda Online, Personal Shopper) no tiene zona ni
 * tienda: solo entra cuando no hay esos filtros, o al filtrar canal = online.
 */

interface Props {
  desde: string;                       // YYYY-MM-DD
  hasta: string;
  zona?: string | null;
  canal?: "tienda" | "online" | null;
  locationId?: string | null;
}

interface Cumplimiento {
  presupuesto: number;
  venta: number;
  pct_cumplimiento: number | null;
  diferencia: number;
  dias_periodo: number;
  meses_incluidos: string | null;
}

const money = (v: number) => {
  const m = Math.abs(v);
  if (m >= 1_000_000_000) return `$${(v / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (m >= 1_000_000)     return `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}M`;
  return `$${v.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
};

export function CumplimientoPresupuestoCard({ desde, hasta, zona, canal, locationId }: Props) {
  const [data, setData] = useState<Cumplimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data: res, error } = await supabase.rpc("reporte_cumplimiento_ejecutivo", {
        p_desde: desde,
        p_hasta: hasta,
        p_zona: zona ?? null,
        p_canal: canal ?? null,
        p_location_id: locationId ?? null,
      });
      if (!activo) return;
      if (error) setError(error.message);
      else setData((res as Cumplimiento[])?.[0] ?? null);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, [desde, hasta, zona, canal, locationId]);

  if (loading) {
    return (
      <div className="rounded-lg border px-4 py-3 flex items-center gap-4">
        <div className="h-8 w-20 bg-muted rounded animate-pulse" />
        <div className="h-3 w-48 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (error || !data || !data.presupuesto) {
    return (
      <div className="rounded-lg border px-4 py-3 flex items-center gap-2.5 text-sm text-muted-foreground">
        <Target className="h-4 w-4 shrink-0" />
        <span className="font-medium text-foreground">Cumplimiento presupuesto</span>
        <span>· {error ? "no se pudo calcular" : "sin presupuesto para este filtro"}</span>
      </div>
    );
  }

  const pct = data.pct_cumplimiento ?? 0;
  const cumplio = pct >= 100;
  const cerca = pct >= 90 && pct < 100;
  const color = cumplio ? "text-emerald-600" : cerca ? "text-amber-600" : "text-rose-600";
  const barra = cumplio ? "bg-emerald-500" : cerca ? "bg-amber-500" : "bg-rose-500";
  const cruzaMeses = (data.meses_incluidos ?? "").includes(",");

  return (
    <div
      className={`rounded-lg border px-4 py-2.5 flex items-center gap-4 ${
        cumplio ? "border-emerald-200 bg-emerald-50/40" : ""
      }`}
      title={`Meta proporcional a ${data.dias_periodo} día${data.dias_periodo === 1 ? "" : "s"}${
        cruzaMeses ? ` · ${data.meses_incluidos}` : ""
      } · venta neta sin IVA`}
    >
      <div className="flex items-center gap-2 shrink-0">
        <Target className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Cumplimiento presupuesto
        </span>
      </div>

      <div className={`text-2xl font-semibold tabular-nums shrink-0 ${color}`}>
        {pct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%
      </div>

      <div className="relative h-1.5 rounded-full bg-muted flex-1 min-w-[80px] overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${barra}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>

      <div className="text-xs tabular-nums whitespace-nowrap shrink-0">
        <span className="font-medium">{money(data.venta)}</span>
        <span className="text-muted-foreground"> de {money(data.presupuesto)}</span>
        <span className={`ml-2 ${cumplio ? "text-emerald-600" : "text-muted-foreground"}`}>
          {data.diferencia > 0 ? "+" : ""}{money(data.diferencia)}
        </span>
      </div>
    </div>
  );
}

export default CumplimientoPresupuestoCard;
