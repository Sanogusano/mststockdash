import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { toast } from "sonner";
import { Target, TrendingUp, TrendingDown, Minus, Clock, UserRound, Gauge, CheckCircle2 } from "lucide-react";

/**
 * Estrategias comerciales: sugerencias por entidad, aplicación y seguimiento.
 * Regla del módulo: el seguimiento no juzga una estrategia antes de que se
 * cumpla su horizonte (ya_deberia_verse = false → gris, sin juicio de valor).
 */

export interface EstrategiaSugerida {
  codigo: string;
  palanca: string;
  nombre: string;
  descripcion: string;
  acciones: string[] | null;
  riesgo_margen: number;
  esfuerzo: string;
  horizonte_dias: number;
  responsable: string;
  relevancia: number;
  motivo: string;
}

export interface SeguimientoRow {
  id: string;
  entidad: string;
  codigo: string;
  estrategia: string;
  palanca: string;
  aplicada_at: string;
  dias_desde: number;
  estado: string;
  venta_al_aplicar: number;
  venta_hoy: number;
  avance: number;
  ritmo_al_aplicar: number;
  ritmo_hoy: number;
  var_ritmo_pct: number;
  horizonte_dias: number;
  ya_deberia_verse: boolean;
}

const money = (v: number | null | undefined) => {
  if (v == null || !isFinite(Number(v))) return "—";
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (a >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  if (a >= 1_000) return `$${(n / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}K`;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
};

const nf = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

function riesgoTono(r: number) {
  if (r >= 3) return { label: "Riesgo alto de margen", className: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" };
  if (r === 2) return { label: "Riesgo medio de margen", className: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" };
  return { label: "Riesgo bajo de margen", className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" };
}

/* ─────────── Sugerencias ─────────── */

export function EstrategiasSugeridas({
  clave, fecha, onAplicada,
}: { clave: string; fecha: string; onAplicada?: () => void }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<EstrategiaSugerida[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<EstrategiaSugerida | null>(null);
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("estrategias_sugeridas" as any, { p_clave: clave, p_fecha: fecha });
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      const list = ((data as any[]) ?? []).map((r) => ({
        ...r,
        acciones: Array.isArray(r.acciones) ? r.acciones : [],
        riesgo_margen: Number(r.riesgo_margen ?? 1),
        horizonte_dias: Number(r.horizonte_dias ?? 0),
        relevancia: Number(r.relevancia ?? 0),
      })) as EstrategiaSugerida[];
      list.sort((a, b) => b.relevancia - a.relevancia);
      setRows(list);
    }
    setLoading(false);
  }, [clave, fecha]);

  useEffect(() => { cargar(); }, [cargar]);

  const aplicar = async () => {
    if (!target) return;
    setSaving(true);
    const por =
      (session?.user?.user_metadata?.full_name as string | undefined) ??
      session?.user?.email ??
      "Sistema";
    const { error } = await supabase.rpc("estrategia_aplicar" as any, {
      p_clave: clave,
      p_codigo: target.codigo,
      p_por: por,
      p_nota: nota.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Estrategia aplicada: ${target.nombre}`);
    setTarget(null);
    setNota("");
    onAplicada?.();
    cargar();
  };

  if (loading) return <LoadingState rows={3} />;
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>;
  if (rows.length === 0) return <EmptyState message="Sin estrategias sugeridas para esta entidad" />;

  return (
    <div className="space-y-3">
      {rows.map((e) => {
        const r = riesgoTono(e.riesgo_margen);
        return (
          <div key={e.codigo} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{e.nombre}</span>
                </h4>
                <span className="mt-1 inline-block rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 border border-sky-100">
                  {e.palanca}
                </span>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${r.className}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${r.dot}`} />
                {r.label}
              </span>
            </div>

            {e.motivo && (
              <p className="mt-3 rounded-lg bg-amber-50 border border-amber-100 p-2.5 text-xs font-medium text-amber-900">
                {e.motivo}
              </p>
            )}

            <p className="mt-2 text-xs text-muted-foreground">{e.descripcion}</p>

            {(e.acciones ?? []).length > 0 && (
              <ul className="mt-2 space-y-1">
                {(e.acciones ?? []).map((a, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{e.responsable}</span>
              <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />Esfuerzo {e.esfuerzo}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Resultado esperado en {e.horizonte_dias} días</span>
            </div>

            <div className="mt-3">
              <Button size="sm" onClick={() => { setTarget(e); setNota(""); }}>Aplicar estrategia</Button>
            </div>
          </div>
        );
      })}

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aplicar estrategia</DialogTitle>
            <DialogDescription>
              {target ? `${target.nombre} en ${clave}. Se guardará el estado actual para medir el efecto en ${target.horizonte_dias} días.` : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Nota (opcional)"
            value={nota}
            onChange={(ev) => setNota(ev.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={aplicar} disabled={saving}>{saving ? "Aplicando…" : "Aplicar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────── Seguimiento ─────────── */

export function EstrategiasSeguimiento({
  anio, mes, refreshKey = 0,
}: { anio: number; mes: number; refreshKey?: number }) {
  const [rows, setRows] = useState<SeguimientoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("estrategias_seguimiento" as any, { p_anio: anio, p_mes: mes });
      if (cancel) return;
      if (error) { setError(error.message); setRows([]); }
      else {
        setRows(((data as any[]) ?? []).map((r) => ({
          ...r,
          dias_desde: Number(r.dias_desde ?? 0),
          venta_al_aplicar: Number(r.venta_al_aplicar ?? 0),
          venta_hoy: Number(r.venta_hoy ?? 0),
          avance: Number(r.avance ?? 0),
          ritmo_al_aplicar: Number(r.ritmo_al_aplicar ?? 0),
          ritmo_hoy: Number(r.ritmo_hoy ?? 0),
          var_ritmo_pct: Number(r.var_ritmo_pct ?? 0),
          horizonte_dias: Number(r.horizonte_dias ?? 0),
          ya_deberia_verse: Boolean(r.ya_deberia_verse),
        })) as SeguimientoRow[]);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [anio, mes, refreshKey]);

  if (loading) return <LoadingState rows={2} />;
  if (error) return <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>;
  if (rows.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold mb-2">Estrategias en seguimiento</h2>
      <div className="rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Entidad</th>
              <th className="px-3 py-2 text-left font-medium">Estrategia</th>
              <th className="px-3 py-2 text-left font-medium">Palanca</th>
              <th className="px-3 py-2 text-right font-medium">Días</th>
              <th className="px-3 py-2 text-right font-medium">Venta al aplicar</th>
              <th className="px-3 py-2 text-right font-medium">Venta hoy</th>
              <th className="px-3 py-2 text-right font-medium">Avance</th>
              <th className="px-3 py-2 text-right font-medium">Ritmo/día</th>
              <th className="px-3 py-2 text-right font-medium">Variación ritmo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const faltan = Math.max(0, r.horizonte_dias - r.dias_desde);
              const positivo = r.var_ritmo_pct > 0;
              const Icono = !r.ya_deberia_verse ? Minus : positivo ? TrendingUp : TrendingDown;
              const color = !r.ya_deberia_verse
                ? "text-muted-foreground"
                : positivo ? "text-emerald-600" : "text-rose-600";
              return (
                <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">{r.entidad}</td>
                  <td className="px-3 py-2">{r.estrategia}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 border border-sky-100">
                      {r.palanca}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.dias_desde}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.venta_al_aplicar)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.venta_hoy)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(r.avance)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {money(r.ritmo_hoy)}
                    <div className="text-[11px] text-muted-foreground">antes {money(r.ritmo_al_aplicar)}</div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className={`flex items-center justify-end gap-1 tabular-nums font-medium ${color}`}>
                      <Icono className="h-3.5 w-3.5" />
                      {`${r.var_ritmo_pct > 0 ? "+" : ""}${nf(r.var_ritmo_pct, 1)}%`}
                    </div>
                    {!r.ya_deberia_verse && (
                      <div className="text-[11px] text-muted-foreground">en curso · faltan {faltan} días</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
