import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronRight, Download, FileText, Globe, Store } from "lucide-react";
import { exportarExcel, exportarPDF, nombreArchivo, type Celda } from "@/lib/distribucion-export";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Tienda = Database["public"]["Functions"]["reporte_asignacion_tienda"]["Returns"][number];
type LineaRow = Database["public"]["Functions"]["reporte_asignacion_lineas"]["Returns"][number];
type CurvaRow = Database["public"]["Functions"]["reporte_asignacion_curva"]["Returns"][number];
type ResumenRow = Database["public"]["Functions"]["reporte_asignacion_resumen"]["Returns"][number];
type BrechaRow = Database["public"]["Functions"]["reporte_asignacion_brecha"]["Returns"][number];

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const entero = (n: number | string | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
const pct = (n: number | string | null | undefined) =>
  n == null ? "—" : `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const dec = (n: number | string | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 });
const fecha = (v: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function ErrorBox({ error }: { error: unknown }) {
  return (
    <p role="alert" className="border border-destructive/30 p-3 text-sm text-destructive">
      {String((error as { message?: string })?.message ?? error)}
    </p>
  );
}

function Migas({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {items.filter((n) => n.label).map((n, i) => (
        <span key={n.label + i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-4 w-4" />}
          {n.onClick ? (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground" onClick={n.onClick}>
              {n.label}
            </Button>
          ) : (
            <span className="font-medium text-foreground">{n.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Barra de destino: vendido · a outlet · trasladado a otra tienda · en piso. */
function BarraDestino({ row, alto = "h-3" }: { row: Tienda; alto?: string }) {
  const total = Math.max(1, num(row.uds_asignadas));
  const segmentos = [
    { label: "Vendido", uds: num(row.uds_vendidas), color: "bg-success" },
    { label: "A outlet", uds: num(row.uds_a_outlet), color: "bg-warning" },
    { label: "A otra tienda", uds: num(row.uds_a_otra_tienda), color: "bg-[hsl(var(--chart-4))]" },
    { label: "En piso", uds: num(row.uds_en_piso), color: "bg-muted-foreground/40" },
  ];
  return (
    <div className="min-w-[220px] flex-1">
      <div className={cn("flex w-full overflow-hidden rounded bg-muted", alto)}>
        {segmentos.map((s) => (
          <div
            key={s.label}
            className={s.color}
            style={{ width: `${(s.uds / total) * 100}%` }}
            title={`${s.label}: ${entero(s.uds)} (${pct((s.uds / total) * 100)})`}
          />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {segmentos.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={cn("inline-block h-2 w-2 rounded-sm", s.color)} />
            {s.label} {entero(s.uds)}
          </span>
        ))}
      </p>
    </div>
  );
}

function Cubrimiento({ titulo, parte, total }: { titulo: string; parte: number | null; total: number | null }) {
  const p = num(total) > 0 ? (num(parte) / num(total)) * 100 : 0;
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {entero(parte)} <span className="text-sm font-normal text-muted-foreground">/ {entero(total)}</span>
      </p>
      <div className="mt-2 h-2 w-full rounded bg-muted">
        <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, p)}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{pct(p)}</p>
    </div>
  );
}

const colorVeredicto = (v: string | null) => {
  const s = (v ?? "").toUpperCase();
  return s.includes("SOBRA") ? "bg-destructive" : s.includes("AGOTAD") ? "bg-success" : "bg-primary";
};
const textoVeredicto = (v: string | null) => {
  const s = (v ?? "").toUpperCase();
  return s.includes("SOBRA") ? "text-destructive" : s.includes("AGOTAD") ? "text-success" : "text-primary";
};

function Curva({ coleccion, locationId, linea }: { coleccion: string; locationId: string; linea: string }) {
  const q = useQuery({
    queryKey: ["asignacion-curva", coleccion, locationId, linea],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_asignacion_curva", {
        p_coleccion: coleccion,
        p_location_id: locationId,
        p_linea: linea,
      });
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => num(a.orden) - num(b.orden));
    },
    staleTime: 300000,
  });

  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data?.length) return <p className="text-xs text-muted-foreground">Sin curva de tallas para esta línea.</p>;

  const max = Math.max(1, ...q.data.map((r) => num(r.uds_asignadas)));
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {q.data.map((r: CurvaRow) => (
        <div key={r.talla} className="min-w-[54px] shrink-0 text-center">
          <p className="text-[11px] tabular-nums text-muted-foreground">{entero(r.uds_asignadas)}</p>
          <div className="flex h-24 items-end justify-center gap-1">
            <div className="w-3 rounded-t bg-muted" style={{ height: `${(num(r.uds_asignadas) / max) * 100}%` }} title={`Asignadas ${entero(r.uds_asignadas)}`} />
            <div
              className={cn("w-3 rounded-t", colorVeredicto(r.veredicto))}
              style={{ height: `${(num(r.uds_vendidas) / max) * 100}%` }}
              title={`Vendidas ${entero(r.uds_vendidas)} · ${r.veredicto ?? ""}`}
            />
          </div>
          <p className={cn("text-[11px] font-medium tabular-nums", textoVeredicto(r.veredicto))}>{entero(r.uds_vendidas)}</p>
          <p className="text-xs font-medium">{r.talla}</p>
          <p className="text-[10px] text-muted-foreground">{pct(r.sell_through)}</p>
          <p className="text-[10px] text-muted-foreground">quedan {entero(r.uds_en_piso)}</p>
        </div>
      ))}
    </div>
  );
}

function BarraGenero({ label, asig, vend, st }: { label: string; asig: number; vend: number; st: number | null }) {
  if (asig <= 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{entero(vend)} / {entero(asig)} · {pct(st)}</span>
      </div>
      <div className="h-1.5 w-full rounded bg-muted">
        <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, (vend / Math.max(1, asig)) * 100)}%` }} />
      </div>
    </div>
  );
}

const colorST = (v: number | null) => {
  const n = num(v);
  return n >= 60 ? "text-success" : n >= 40 ? "text-primary" : n >= 25 ? "text-warning" : "text-destructive";
};

const estiloVeredicto = (v: string | null) => {
  const s = (v ?? "").toUpperCase();
  if (s.includes("EXCESO") || s.includes("SOBRA")) return "border-destructive/40 bg-destructive/10 text-destructive";
  if (s.includes("FALTA")) return "border-warning/40 bg-warning/10 text-warning";
  if (s.includes("SANO") || s.includes("AJUST") || s.includes("EQUILIBR")) return "border-success/40 bg-success/10 text-success";
  return "border-border bg-muted text-muted-foreground";
};

/** Mezcla de precios: full (azul) · promo (verde) · rebaja (ámbar). */
function BarraPrecios({ r }: { r: ResumenRow }) {
  const segmentos = [
    { label: "Full", p: num(r.pct_full), uds: num(r.uds_full), color: "bg-primary" },
    { label: "Promo", p: num(r.pct_promo), uds: num(r.uds_promo), color: "bg-success" },
    { label: "Rebaja", p: num(r.pct_rebaja), uds: num(r.uds_rebaja), color: "bg-warning" },
  ];
  if (segmentos.every((s) => s.p <= 0)) return null;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded bg-muted">
        {segmentos.map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${Math.max(0, s.p)}%` }} title={`${s.label}: ${entero(s.uds)} (${pct(s.p)})`} />
        ))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {segmentos.filter((s) => s.p > 0).map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className={cn("inline-block h-2 w-2 rounded-sm", s.color)} />
            {s.label} {pct(s.p)}
          </span>
        ))}
      </p>
    </div>
  );
}

function TarjetaTienda({ r, onClick }: { r: ResumenRow; onClick: () => void }) {
  const esOnline = (r.tipo_tienda ?? "").toLowerCase() === "online";
  const Icono = esOnline ? Globe : Store;
  const asig = Math.max(1, num(r.uds_asignadas));
  const acumPct = ((num(r.uds_vendidas) + num(r.uds_fuera_ventana)) / asig) * 100;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-muted/40"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded bg-muted p-2 text-muted-foreground"><Icono className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.tienda}</p>
          <p className="text-[11px] text-muted-foreground">
            {[r.tipo_tienda, r.zona].filter(Boolean).join(" · ") || "—"} · {entero(r.colecciones)} colecciones
          </p>
        </div>
        <div className="text-right">
          <div className="flex items-start justify-end gap-4">
            <div>
              <p className={cn("text-3xl font-semibold leading-none tabular-nums", colorST(r.sell_through))}>{pct(r.sell_through)}</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1 inline-block cursor-help text-[11px] font-medium text-foreground underline decoration-muted-foreground/30 underline-offset-2">ST 120d</p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                  Sell-through 120 días: vendido dentro de la ventana comercial.
                </TooltipContent>
              </Tooltip>
            </div>
            {num(r.uds_asignadas) > 0 && (
              <div>
                <p className={cn("text-xl font-semibold leading-none tabular-nums", colorST(acumPct))}>{pct(acumPct)}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <p className="mt-1 inline-block cursor-help text-[11px] font-medium text-foreground underline decoration-muted-foreground/30 underline-offset-2">ST acum.</p>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                    Sell-through acumulado: incluye la venta posterior a los 120 días.
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>
        </div>
      </div>

      {r.veredicto_brecha && (
        <span className={cn("inline-flex w-fit items-center gap-2 rounded border px-2 py-0.5 text-[11px] font-medium", estiloVeredicto(r.veredicto_brecha))}>
          {r.veredicto_brecha}
          <span className="tabular-nums">{pct(r.pct_brecha)}</span>
        </span>
      )}

      <BarraPrecios r={r} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5" title="Unidades vendidas dentro de los 120 días">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" />
          <span className="tabular-nums font-medium">{entero(r.uds_vendidas)}</span>
          <span className="text-muted-foreground">en ventana</span>
        </span>
        <span className="flex items-center gap-1.5" title="Unidades vendidas después de los 120 días">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning" />
          <span className="tabular-nums font-medium">{entero(r.uds_fuera_ventana)}</span>
          <span className="text-muted-foreground">fuera de ventana</span>
        </span>
        <span className="flex items-center gap-1.5" title="Unidades aún en piso">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
          <span className="tabular-nums font-medium">{entero(r.uds_en_piso)}</span>
          <span className="text-muted-foreground">en piso</span>
        </span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
          de <span className="tabular-nums font-medium text-foreground">{entero(r.uds_asignadas)}</span> asignadas
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <p>Refs {entero(r.refs_asignadas)}/{entero(r.refs_universo)} · {pct(r.pct_refs)}</p>
        <p>Líneas {entero(r.lineas_asignadas)}/{entero(r.lineas_universo)}</p>
        <p>Uds/ref {dec(r.uds_por_referencia)}</p>
        <p>RDV {dec(r.rdv_semanal)}/sem</p>
        <p>Exceso {entero(r.uds_exceso)}</p>
        <p>Faltante {entero(r.uds_faltante)}</p>
        <p className="col-span-2">
          Refs: {entero(r.refs_sanas)} sanas · {entero(r.refs_agotadas)} agotadas · {entero(r.refs_sobradas)} sobradas de {entero(r.refs_evaluadas)}
        </p>
        {r.mejor_coleccion && (
          <p className="col-span-2">Mejor: <span className="text-foreground">{r.mejor_coleccion}</span> <span className="font-medium text-success tabular-nums">{pct(r.mejor_st)}</span></p>
        )}
        {r.peor_coleccion && (
          <p className="col-span-2">Peor: <span className="text-foreground">{r.peor_coleccion}</span> <span className="font-medium text-warning tabular-nums">{pct(r.peor_st)}</span></p>
        )}
      </div>

      <div className="space-y-1.5">
        <BarraGenero label="Hombre" asig={num(r.hombre_asig)} vend={num(r.hombre_vend)} st={r.hombre_st} />
        <BarraGenero label="Mujer" asig={num(r.mujer_asig)} vend={num(r.mujer_vend)} st={r.mujer_st} />
        <BarraGenero label="Unisex" asig={num(r.unisex_asig)} vend={num(r.unisex_vend)} st={r.unisex_st} />
      </div>
    </button>
  );
}

const DIMENSIONES: { key: string; label: string }[] = [
  { key: "linea", label: "Por línea" },
  { key: "genero", label: "Por género" },
  { key: "coleccion", label: "Por colección" },
];

const brechaColumns: [string, string][] = [
  ["valor", "Valor"], ["uds_asignadas", "Asignadas"], ["uds_vendidas", "Vendidas"], ["uds_en_piso", "En piso"],
  ["sell_through", "Sell-through (%)"], ["uds_exceso", "Exceso"], ["uds_faltante", "Faltante"],
  ["brecha", "Brecha"], ["pct_brecha", "% Brecha"], ["veredicto", "Veredicto"],
  ["refs_evaluadas", "Refs evaluadas"], ["refs_sanas", "Refs sanas"], ["refs_agotadas", "Refs agotadas"], ["refs_sobradas", "Refs sobradas"],
];

function BloqueBrecha({ coleccion, locationId, subtitle }: { coleccion: string; locationId: string | null; subtitle: string }) {
  const [dimension, setDimension] = useState("linea");
  const q = useQuery({
    queryKey: ["asignacion-brecha", dimension, coleccion, locationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_asignacion_brecha", {
        p_dimension: dimension,
        p_location_id: locationId ?? undefined,
        p_coleccion: coleccion || undefined,
        p_minimo: 50,
      });
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => num(b.uds_exceso) - num(a.uds_exceso));
    },
    staleTime: 300000,
  });

  const max = Math.max(1, ...(q.data ?? []).map((r) => Math.max(num(r.uds_exceso), num(r.uds_faltante))));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Dónde está el exceso</h2>
          <p className="text-xs text-muted-foreground">Unidades sobrantes frente a unidades que hicieron falta.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {DIMENSIONES.map((d) => (
              <Button
                key={d.key}
                variant={dimension === d.key ? "secondary" : "ghost"}
                size="sm"
                className="h-7"
                onClick={() => setDimension(d.key)}
              >
                {d.label}
              </Button>
            ))}
          </div>
          <Exportaciones title="Brecha" columns={brechaColumns} rows={q.data ?? []} subtitle={subtitle} />
        </div>
      </div>

      {q.isLoading ? <LoadingState /> : q.error ? <ErrorBox error={q.error} /> : !q.data?.length ? (
        <EmptyState message="Sin datos de brecha para esta selección" />
      ) : (
        <ul className="space-y-3">
          {q.data.map((r: BrechaRow) => {
            const exceso = num(r.uds_exceso);
            const faltante = num(r.uds_faltante);
            const razon = faltante > 0 ? exceso / faltante : null;
            return (
              <li key={r.valor} className="flex flex-wrap items-center gap-4 rounded-lg border border-border p-3">
                <div className="min-w-[220px] flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.valor}</p>
                    <span className={cn("rounded border px-2 py-0.5 text-[11px] font-medium", estiloVeredicto(r.veredicto))}>
                      {r.veredicto} · {pct(r.pct_brecha)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[11px] text-muted-foreground">Exceso</span>
                      <div className="h-2.5 flex-1 rounded bg-muted">
                        <div className="h-full rounded bg-destructive" style={{ width: `${(exceso / max) * 100}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs font-medium tabular-nums text-destructive">{entero(exceso)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-[11px] text-muted-foreground">Faltante</span>
                      <div className="h-2.5 flex-1 rounded bg-muted">
                        <div className="h-full rounded bg-warning" style={{ width: `${(faltante / max) * 100}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs font-medium tabular-nums text-warning">{entero(faltante)}</span>
                    </div>
                  </div>
                </div>
                <div className="min-w-[150px] text-right text-xs text-muted-foreground">
                  <p className="text-sm font-medium tabular-nums text-foreground">{pct(r.sell_through)}</p>
                  <p>sell-through</p>
                  {razon != null && (
                    <p className="mt-1">Exceso vs faltante <span className="font-medium text-foreground tabular-nums">{dec(razon)} a 1</span></p>
                  )}
                  <p className="mt-1">{entero(r.uds_vendidas)} de {entero(r.uds_asignadas)} · {entero(r.uds_en_piso)} en piso</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const resumenColumns: [string, string][] = [
  ["tienda", "Tienda"], ["tipo_tienda", "Tipo"], ["zona", "Zona"], ["colecciones", "Colecciones"],
  ["refs_asignadas", "Refs asignadas"], ["refs_universo", "Refs universo"], ["pct_refs", "% Referencias"],
  ["lineas_asignadas", "Líneas asignadas"], ["lineas_universo", "Líneas universo"],
  ["uds_asignadas", "Asignadas"], ["uds_vendidas", "Vendidas"], ["uds_en_piso", "En piso"],
  ["sell_through", "Sell-through (%)"], ["uds_por_referencia", "Uds/ref"], ["rdv_semanal", "RDV semanal"],
  ["mejor_coleccion", "Mejor colección"], ["mejor_st", "Mejor ST (%)"], ["peor_coleccion", "Peor colección"], ["peor_st", "Peor ST (%)"],
  ["uds_full", "Uds full"], ["pct_full", "% Full"], ["uds_promo", "Uds promo"], ["pct_promo", "% Promo"],
  ["uds_rebaja", "Uds rebaja"], ["pct_rebaja", "% Rebaja"], ["uds_fuera_ventana", "Fuera de ventana"],
  ["refs_evaluadas", "Refs evaluadas"], ["refs_sanas", "Refs sanas"], ["refs_agotadas", "Refs agotadas"], ["refs_sobradas", "Refs sobradas"],
  ["uds_exceso", "Exceso"], ["uds_faltante", "Faltante"], ["brecha", "Brecha"], ["pct_brecha", "% Brecha"], ["veredicto_brecha", "Veredicto"],
];

const lineaColumns: [string, string][] = [
  ["linea", "Línea"], ["referencias", "Referencias"], ["drops", "Drops"], ["uds_por_referencia", "Uds/ref"],
  ["uds_asignadas", "Asignadas"], ["uds_vendidas", "Vendidas"], ["sell_through", "Sell-through (%)"],
  ["uds_en_piso", "En piso"], ["uds_a_outlet", "A outlet"],
];

function Exportaciones({ title, columns, rows, subtitle }: { title: string; columns: [string, string][]; rows: object[]; subtitle: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (pdf: boolean) => {
    setBusy(true); setError(null);
    try {
      const body: Celda[][] = rows.map((r) => columns.map(([key]) => (r as Record<string, Celda>)[key] ?? null));
      const args = { titulo: title, subtitulo: subtitle, head: columns.map((c) => c[1]), body, archivo: nombreArchivo(`Asignación ${title}`) };
      await (pdf ? exportarPDF(args) : exportarExcel(args));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" disabled={busy || !rows.length} onClick={() => void run(false)}><Download className="mr-2 h-4 w-4" />Excel</Button>
      <Button variant="outline" size="sm" disabled={busy || !rows.length} onClick={() => void run(true)}><FileText className="mr-2 h-4 w-4" />PDF</Button>
      {error != null && <ErrorBox error={error} />}
    </div>
  );
}

export default function AsignacionTiendaPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { locationId: rutaLocationId } = useParams<{ locationId: string }>();
  const coleccion = params.get("coleccion") || "";
  const locationId = rutaLocationId || "";

  const setKeys = (entries: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(entries).forEach(([k, v]) => { if (!v || v === "all") next.delete(k); else next.set(k, v); });
    setParams(next);
  };

  const irATienda = (id: string | null) => {
    const qs = params.toString();
    navigate(`/asignacion${id ? `/${id}` : ""}${qs ? `?${qs}` : ""}`);
  };

  const coleccionesQ = useQuery({
    queryKey: ["asignacion-colecciones-embudo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_distribucion_embudo", { p_coleccion: null, p_linea: null });
      if (error) throw error;
      return [...(data ?? [])]
        .sort((a, b) => num(a.antiguedad_ponderada) - num(b.antiguedad_ponderada))
        .map((r) => r.coleccion)
        .filter((c): c is string => !!c);
    },
    staleTime: 600000,
  });

  const resumenQ = useQuery({
    queryKey: ["asignacion-resumen", coleccion],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_asignacion_resumen", { p_coleccion: coleccion || null });
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => num(b.uds_asignadas) - num(a.uds_asignadas));
    },
    staleTime: 300000,
  });

  const tiendasQ = useQuery({
    queryKey: ["asignacion-tiendas", coleccion],
    enabled: !!coleccion,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_asignacion_tienda", { p_coleccion: coleccion, p_location_id: null });
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => num(b.uds_asignadas) - num(a.uds_asignadas));
    },
    staleTime: 300000,
  });

  const detalle = (tiendasQ.data ?? []).find((t) => t.location_id === locationId) ?? null;
  const resumenTienda = (resumenQ.data ?? []).find((t) => t.location_id === locationId) ?? null;
  const acumPctDetalle = resumenTienda && num(resumenTienda.uds_asignadas) > 0
    ? ((num(resumenTienda.uds_vendidas) + num(resumenTienda.uds_fuera_ventana)) / num(resumenTienda.uds_asignadas)) * 100
    : null;

  const lineasQ = useQuery({
    queryKey: ["asignacion-lineas", coleccion, locationId],
    enabled: !!coleccion && !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_asignacion_lineas", { p_coleccion: coleccion, p_location_id: locationId, p_limite: 6 });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300000,
  });

  const nombreTienda =
    detalle?.tienda ?? (resumenQ.data ?? []).find((t) => t.location_id === locationId)?.tienda ?? "";
  const subtitle = `${coleccion || "Todas las colecciones"}${nombreTienda ? ` · ${nombreTienda}` : ""}`;
  const migas = [
    { label: "Tiendas", onClick: locationId ? () => irATienda(null) : undefined },
    ...(locationId ? [{ label: nombreTienda || "Detalle de tienda" }] : []),
  ];

  const maxLinea = Math.max(1, ...(lineasQ.data ?? []).map((r) => num(r.uds_asignadas)));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="min-w-0 flex-1">
          <header className="flex items-center gap-3 border-b border-border p-4 sm:px-6">
            <SidebarTrigger />
            <div>
              <h1 className="text-lg font-semibold">Asignación por Tienda</h1>
              <p className="text-xs text-muted-foreground">Qué proporción del surtido de la colección recibió cada tienda y qué hizo con eso.</p>
            </div>
          </header>

          <div className="px-4 pb-2 pt-3 sm:px-6"><Migas items={migas} /></div>

          <div className="space-y-8 p-4 sm:p-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="filtro-coleccion">Colección</label>
                <Select value={coleccion || "all"} onValueChange={(v) => setKeys({ coleccion: v, tienda: null })}>
                  <SelectTrigger id="filtro-coleccion" className="w-[220px]"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Selecciona una colección</SelectItem>
                    {(coleccionesQ.data ?? []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground" htmlFor="filtro-tienda">Tienda</label>
                <Select value={locationId || "all"} onValueChange={(v) => irATienda(v === "all" ? null : v)}>
                  <SelectTrigger id="filtro-tienda" className="w-[220px]"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las tiendas</SelectItem>
                    {(resumenQ.data ?? []).map((t) => <SelectItem key={t.location_id} value={t.location_id}>{t.tienda}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {coleccionesQ.error && <ErrorBox error={coleccionesQ.error} />}

            {!locationId ? (
              resumenQ.isLoading ? (
                <LoadingState />
              ) : resumenQ.error ? (
                <ErrorBox error={resumenQ.error} />
              ) : !resumenQ.data?.length ? (
                <EmptyState message="Sin tiendas con asignación" />
              ) : (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold">Tiendas · {coleccion || "Todas las colecciones"}</h2>
                    <Exportaciones title="Resumen tiendas" columns={resumenColumns} rows={resumenQ.data} subtitle={subtitle} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {resumenQ.data.map((r) => (
                      <TarjetaTienda key={r.location_id} r={r} onClick={() => irATienda(r.location_id)} />
                    ))}
                  </div>
                </section>
              )
            ) : !coleccion ? (
              <EmptyState message="Selecciona una colección para ver el detalle de esta tienda" />
            ) : tiendasQ.isLoading ? (
              <LoadingState />
            ) : tiendasQ.error ? (
              <ErrorBox error={tiendasQ.error} />
            ) : !tiendasQ.data?.length ? (
              <EmptyState message="Sin tiendas con asignación en esta colección" />
            ) : detalle ? (
              <div className="space-y-8">
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">{detalle.tienda}</h2>
                      <p className="text-xs text-muted-foreground">
                        {entero(detalle.drops)} drops · {fecha(detalle.primer_drop)} – {fecha(detalle.ultimo_drop)}
                      </p>
                    </div>
                    <Exportaciones title="Líneas" columns={lineaColumns} rows={lineasQ.data ?? []} subtitle={subtitle} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Cubrimiento titulo="Referencias asignadas" parte={detalle.refs_asignadas} total={detalle.refs_coleccion} />
                    <Cubrimiento titulo="SKU asignados" parte={detalle.skus_asignados} total={detalle.skus_coleccion} />
                    <Cubrimiento titulo="Líneas asignadas" parte={detalle.lineas_asignadas} total={detalle.lineas_coleccion} />
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Destino de las {entero(detalle.uds_asignadas)} unidades asignadas</h3>
                  <BarraDestino row={detalle} alto="h-6" />
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-semibold">Líneas más vendidas y su curva de tallas</h3>
                  {lineasQ.isLoading ? <LoadingState /> : lineasQ.error ? <ErrorBox error={lineasQ.error} /> : !lineasQ.data?.length ? (
                    <EmptyState message="Sin líneas asignadas a esta tienda" />
                  ) : (
                    <ul className="space-y-6">
                      {lineasQ.data.map((l: LineaRow) => (
                        <li key={l.linea} className="space-y-3 rounded-lg border border-border p-4">
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="min-w-[200px] flex-1">
                              <p className="font-medium">{l.linea}</p>
                              <p className="text-xs text-muted-foreground">
                                {entero(l.referencias)} referencias · {entero(l.drops)} drops · {dec(l.uds_por_referencia)} uds/ref
                              </p>
                              <div className="relative mt-2 h-3 w-full rounded bg-muted">
                                <div className="absolute inset-y-0 left-0 rounded bg-muted-foreground/30" style={{ width: `${(num(l.uds_asignadas) / maxLinea) * 100}%` }} title={`Asignadas ${entero(l.uds_asignadas)}`} />
                                <div className="absolute inset-y-0 left-0 rounded bg-success" style={{ width: `${(num(l.uds_vendidas) / maxLinea) * 100}%` }} title={`Vendidas ${entero(l.uds_vendidas)}`} />
                              </div>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {entero(l.uds_vendidas)} vendidas de {entero(l.uds_asignadas)} asignadas
                              </p>
                            </div>
                            <div className="min-w-[130px] text-right">
                              <p className="text-sm font-medium tabular-nums">{pct(l.sell_through)}</p>
                              <p className="text-xs text-muted-foreground">sell-through</p>
                              <p className="mt-1 text-xs text-muted-foreground">{entero(l.uds_en_piso)} en piso</p>
                            </div>
                          </div>
                          <Curva coleccion={coleccion} locationId={locationId} linea={l.linea} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : (
              <EmptyState message="Esta tienda no tiene asignación en la colección seleccionada" />
            )}

            <BloqueBrecha coleccion={coleccion} locationId={locationId || null} subtitle={subtitle} />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
