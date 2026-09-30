import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Gauge, Store, ArrowRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface WosTramo {
  tramo: string;
  orden: number;
  rango: string;
  productos: number;
  unidades: number;
  pct_uds: number;
}

export interface LineaRow {
  linea: string;
  productos: number;
  productos_activos: number;
  pct_uds_en_ventana: number | null;
  cobertura_tallas_pct: number | null;
  distribucion_wos: WosTramo[] | null;
  distribuido: number;
  dist_tiendas: number;
  dist_online: number;
  dist_standby: number;
  dist_mayoristas: number;
  dias_en_venta: number;
  semanas_en_venta: number;
  ritmo_semanal: number | null;
  ritmo_pdv: number | null;
  ritmo_tienda: number | null;
  ritmo_online: number | null;
  rdv_indice: number | null;
  rdv_estado: string | null;
  und_vendidas: number;
  und_vendidas_vida: number;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  stock_tiendas: number;
  stock_digital: number;
  stock_standby: number;
  stock_total: number;
  bod_principal: number;
  bod_reserva: number;
  bod_tiendas: number;
  bod_exportaciones: number;
  clasificacion: string;
  st_120d: number | null;
  sell_through_pct: number | null;
  base_st: string | null;
  wos: number | null;
  wos_total: number | null;
  estado_salud: string;
}

interface LineaTiendaRow {
  orden: number;
  zona: string | null;
  tienda: string;
  es_bodega: boolean;
  dias_en_tienda: number | null;
  semanas_en_tienda: number | null;
  recibido: number;
  und_vendidas: number;
  stock_actual: number;
  productos_con_stock: number;
  productos_vendidos: number;
  ritmo_semanal: number | null;
  pct_full: number | null;
  pct_rebaja: number | null;
  pct_promo: number | null;
  st_120d: number | null;
  st_acum: number | null;
  base_st: string | null;
  wos: number | null;
  estado_salud: string;
}

export const RDV_STYLES: Record<string, { text: string; chip: string | null }> = {
  DETENIDO: { text: "text-red-600", chip: "bg-red-100 text-red-700" },
  BAJO: { text: "text-orange-600", chip: "bg-orange-100 text-orange-700" },
  REGULAR: { text: "text-amber-600", chip: "bg-amber-100 text-amber-700" },
  BUENO: { text: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700" },
  EXCELENTE: { text: "text-blue-600", chip: "bg-blue-100 text-blue-700" },
  AGOTADO: { text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  "SOLO ONLINE": { text: "text-muted-foreground", chip: null },
  "SIN COMPARABLES": { text: "text-muted-foreground", chip: null },
};
export const fmtIdx = (v: number) => (v >= 999 ? "+10×" : `${(v / 100).toFixed(1).replace(".", ",")}×`);
const fmtWos = (v: number | null | undefined) => (v == null || v > 90 ? "+99" : String(v));
const nf = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO");
const pf = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 1 });

export const TRAMO_STYLES: Record<string, { bar: string; text: string }> = {
  Riesgo: { bar: "bg-amber-400", text: "text-amber-600" },
  "En ventana": { bar: "bg-emerald-500", text: "text-emerald-600" },
  Excedido: { bar: "bg-amber-700", text: "text-amber-800" },
  Obsoleto: { bar: "bg-destructive", text: "text-destructive" },
  "Sin rotación": { bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

export function parseTramos(v: unknown): WosTramo[] {
  let arr: unknown = v;
  if (typeof v === "string") { try { arr = JSON.parse(v); } catch { return []; } }
  return Array.isArray(arr) ? (arr as WosTramo[]).slice().sort((a, b) => a.orden - b.orden) : [];
}

type Tone = "success" | "danger" | "warning" | "muted";
const TONE_CLASSES: Record<Tone, { box: string; value: string }> = {
  success: { box: "border-success/40 bg-success/5", value: "text-success" },
  danger: { box: "border-destructive/40 bg-destructive/5", value: "text-destructive" },
  warning: { box: "border-warning/40 bg-warning/5", value: "text-warning" },
  muted: { box: "border-border bg-muted/40", value: "text-muted-foreground" },
};

function MetricCard({ label, children, sub, tone, className }: { label: string; children: React.ReactNode; sub?: React.ReactNode; tone?: Tone; className?: string }) {
  const t = tone ? TONE_CLASSES[tone] : null;
  return (
    <div className={cn("rounded-lg border border-border px-3 py-2 min-w-[130px]", t?.box, className)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn("text-sm font-semibold text-foreground tabular-nums", t?.value)}>{children}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CompositionBar({ full, rebaja, promo }: { full: number | null; rebaja: number | null; promo: number | null }) {
  const segs = [
    { label: "Full", v: Number(full ?? 0), bar: "bg-emerald-500", text: "text-emerald-600" },
    { label: "Reb.", v: Number(rebaja ?? 0), bar: "bg-destructive", text: "text-destructive" },
    { label: "Promo", v: Number(promo ?? 0), bar: "bg-amber-500", text: "text-amber-600" },
  ];
  const total = segs.reduce((s, x) => s + x.v, 0);
  if (total <= 0) return <span className="text-xs text-muted-foreground">Sin ventas</span>;
  return (
    <div className="w-36">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((s) => s.v > 0 && <div key={s.label} className={s.bar} style={{ width: `${(s.v / total) * 100}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums">
        {segs.map((s) => <span key={s.label} className={s.text}>{s.label} {Math.round(s.v)}%</span>)}
      </div>
    </div>
  );
}

function WosDistributionCard({ tramos, pctVentana }: { tramos: WosTramo[]; pctVentana: number | null }) {
  const main = tramos.filter((t) => t.tramo !== "Sin rotación");
  const sinRot = tramos.find((t) => t.tramo === "Sin rotación");
  return (
    <div className="rounded-lg border border-border px-3 py-2 min-w-[280px] flex-1 max-w-md">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Distribución WOS</p>
      <div className="mt-1.5 space-y-1">
        {main.map((t) => {
          const s = TRAMO_STYLES[t.tramo] ?? TRAMO_STYLES["Sin rotación"];
          return (
            <div key={t.tramo} className="flex items-center gap-2 text-[11px]">
              <span className={cn("w-20 shrink-0 font-semibold", s.text)}>{t.tramo}</span>
              <span className="w-14 shrink-0 text-[10px] text-muted-foreground">{t.rango}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${Math.min(Number(t.pct_uds ?? 0), 100)}%` }} />
              </div>
              <span className="w-14 text-right tabular-nums">{nf(t.unidades)}</span>
              <span className={cn("w-11 text-right tabular-nums font-semibold", s.text)}>{pf(t.pct_uds)}%</span>
            </div>
          );
        })}
      </div>
      {sinRot && (
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border/60 pt-1.5">
          <span className="w-20 shrink-0 font-semibold">Sin rotación</span>
          <span className="flex-1">{nf(sinRot.unidades)} uds · {pf(sinRot.pct_uds)}%</span>
        </div>
      )}
      <div className="mt-2 border-t border-border/60 pt-2">
        <p className="text-2xl font-bold tabular-nums text-foreground">{pctVentana == null ? "—" : `${pf(pctVentana)}%`}</p>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">% del inventario dentro de ventana</p>
      </div>
      {sinRot && <p className="mt-1 text-[10px] text-muted-foreground">Sin rotación: productos con stock y ritmo 0; no tienen WOS calculable y no entran en los cuatro tramos.</p>}
    </div>
  );
}

const getSellThroughColor = (pct: number) => (pct >= 70 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-danger");

export function LineaDetailDrawer({
  linea, onClose, diasAtras, pHasta, rangeLabel, days, customFrom, customTo, locationId,
}: {
  linea: LineaRow | null;
  onClose: () => void;
  diasAtras: number;
  pHasta: string | null;
  rangeLabel: string;
  days: number;
  customFrom?: Date;
  customTo?: Date;
  locationId: string;
}) {
  const navigate = useNavigate();
  const [storeFilter, setStoreFilter] = useState("all");

  const { data, isLoading, error } = useQuery({
    queryKey: ["linea-detalle-tiendas", linea?.linea, diasAtras, pHasta],
    enabled: !!linea,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_detalle_linea_tiendas", { dias_atras: diasAtras, p_linea: linea!.linea, p_hasta: pHasta ?? undefined });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LineaTiendaRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => {
    const all = (data ?? []).slice().sort((a, b) => a.orden - b.orden);
    return storeFilter === "all" ? all : all.filter((r) => r.tienda === storeFilter);
  }, [data, storeFilter]);

  const goToProducts = () => {
    if (!linea) return;
    const p = new URLSearchParams();
    p.set("linea", linea.linea);
    if (customFrom && customTo) {
      p.set("desde", format(customFrom, "yyyy-MM-dd"));
      p.set("hasta", format(customTo, "yyyy-MM-dd"));
    } else {
      p.set("days", String(days));
    }
    if (locationId !== "all") p.set("location", locationId);
    navigate(`/producto?${p.toString()}`);
  };

  const tramos = parseTramos(linea?.distribucion_wos);

  return (
    <Sheet open={!!linea} onOpenChange={(o) => { if (!o) { onClose(); setStoreFilter("all"); } }}>
      <SheetContent className="!max-w-full w-full overflow-y-auto p-0" side="right">
        {linea && (() => {
          const estado = (linea.rdv_estado ?? "SOLO ONLINE").toUpperCase();
          const st = RDV_STYLES[estado] ?? RDV_STYLES["SOLO ONLINE"];
          const fmtU = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
          const d56 = <span className="text-[10px] font-normal text-muted-foreground">56d</span>;
          const wosCard = (label: string, sub: string, v: number | null | undefined) => {
            const tone: Tone = v == null ? "muted" : v < 4 || v > 18 ? "danger" : "success";
            return (
              <MetricCard label={label} sub={sub} tone={tone}>
                {v == null ? <>+99 <span className="text-[10px] font-bold">SIN ROTACIÓN</span></> : <>{fmtWos(v)} sem. {d56}</>}
              </MetricCard>
            );
          };
          return (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-border">
                <div className="flex items-start justify-between gap-4 pr-8">
                  <div className="min-w-0">
                    <SheetTitle className="text-base font-semibold text-foreground leading-tight">{linea.linea}</SheetTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">{nf(linea.productos)} productos · {nf(linea.productos_activos)} activos</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={goToProducts} className="shrink-0">
                    Ver productos de esta línea <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 items-start">
                  <MetricCard label="Antigüedad promedio" sub={`${nf(linea.dias_en_venta)} días · ponderado por uds.`}>{nf(linea.semanas_en_venta)} sem.</MetricCard>
                  <MetricCard label="Unidades vendidas" sub={rangeLabel}>{nf(linea.und_vendidas)}</MetricCard>
                  <MetricCard label="Ritmo de red" sub="TODA LA RED">
                    <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />{fmtU(linea.ritmo_semanal)} u/sem</span> {d56}
                  </MetricCard>
                  <MetricCard label="Ritmo por tienda" sub={st.chip ? <span className={cn("inline-block text-[10px] font-medium px-1.5 rounded", st.chip)}>{estado}{linea.rdv_indice != null ? ` (${fmtIdx(linea.rdv_indice)})` : ""}</span> : <span className={st.text}>{estado}</span>}>
                    <span className={cn("inline-flex items-center gap-1", st.text)}><Store className="h-3 w-3" />{linea.ritmo_pdv == null ? "—" : `${fmtU(linea.ritmo_pdv)} u/sem`}</span> {d56}
                  </MetricCard>
                  <MetricCard label="Sell-through" sub={`ST acum. ${linea.sell_through_pct ?? 0}%`}>{linea.st_120d ?? 0}% <span className="text-[10px] font-normal text-muted-foreground">120d</span></MetricCard>
                  <MetricCard label="Stock total">{nf(linea.stock_total)}</MetricCard>
                  <MetricCard label="Cobertura de tallas" sub="% tallas con stock sobre totales">{linea.cobertura_tallas_pct == null ? "—" : `${pf(linea.cobertura_tallas_pct)}%`}</MetricCard>
                  {wosCard("WOS general", "LO DISPONIBILIZADO", linea.wos)}
                  {wosCard("WOS total", "TOTALIDAD DE INVENTARIO", linea.wos_total)}
                  <WosDistributionCard tramos={tramos} pctVentana={linea.pct_uds_en_ventana} />
                </div>
              </SheetHeader>

              <div className="px-6 py-4">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-xs font-semibold text-foreground">Distribución por tienda</p>
                  <Select value={storeFilter} onValueChange={setStoreFilter}>
                    <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las tiendas</SelectItem>
                      {(data ?? []).map((r) => <SelectItem key={r.tienda} value={r.tienda}>{r.tienda}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {isLoading ? <LoadingState rows={5} /> : error ? (
                  <p className="text-sm text-destructive">{(error as Error).message}</p>
                ) : !rows.length ? <EmptyState message="Sin datos para este filtro." /> : (
                  <TooltipProvider delayDuration={200}>
                    <div className="border border-border rounded-lg overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="w-10 text-right">#</TableHead>
                            <TableHead>Tienda</TableHead>
                            <TableHead className="text-right">Recibido</TableHead>
                            <TableHead className="text-right">Vendidas</TableHead>
                            <TableHead className="text-right">Stock</TableHead>
                            <TableHead className="text-right">Ref. con stock</TableHead>
                            <TableHead className="text-right">Ref. vendidas</TableHead>
                            <TableHead className="text-right">RDV</TableHead>
                            <TableHead className="min-w-[150px]">Composición</TableHead>
                            <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                            <TableHead>WOS</TableHead>
                            <TableHead>Salud</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row) => {
                            const b = row.es_bodega;
                            const dash = <span className="text-muted-foreground">—</span>;
                            const acum = Number(row.st_acum ?? 0);
                            const est = row.base_st === "estimada" && (
                              <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-help text-warning font-bold ml-0.5">*</span></TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">Sin historial de traslados suficiente. Lo recibido se estima como vendido más stock.</TooltipContent>
                              </Tooltip>
                            );
                            const tiempo = !b && row.semanas_en_tienda != null
                              ? `${Math.floor(Number(row.semanas_en_tienda))} sem. (${Math.floor(Number(row.dias_en_tienda ?? 0))} días)` : null;
                            return (
                              <TableRow key={`${row.orden}-${row.tienda}`}>
                                <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{row.orden}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <p className="text-sm font-medium text-foreground">{row.tienda}</p>
                                  {(row.zona || tiempo) && <p className="text-[11px] text-muted-foreground">{[row.zona, tiempo].filter(Boolean).join(" · ")}</p>}
                                </TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{b ? dash : nf(row.recibido)}</TableCell>
                                <TableCell className="text-right text-sm font-semibold tabular-nums">{b ? dash : nf(row.und_vendidas)}</TableCell>
                                <TableCell className="text-right text-sm font-medium tabular-nums">{nf(row.stock_actual)}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{nf(row.productos_con_stock)}</TableCell>
                                <TableCell className="text-right text-sm tabular-nums">{b ? dash : nf(row.productos_vendidos)}</TableCell>
                                <TableCell className="text-right">
                                  {b || row.ritmo_semanal == null ? dash : <span className="text-sm tabular-nums">{Number(row.ritmo_semanal).toLocaleString("es-CO", { maximumFractionDigits: 2 })} u/sem</span>}
                                </TableCell>
                                <TableCell>{b ? dash : <CompositionBar full={row.pct_full} rebaja={row.pct_rebaja} promo={row.pct_promo} />}</TableCell>
                                <TableCell>
                                  {b ? dash : (
                                    <div className="w-32">
                                      <p className="text-sm font-semibold tabular-nums leading-tight">{row.st_120d == null ? "—" : `${row.st_120d}%`} <span className="text-[10px] font-normal text-muted-foreground">120d</span>{est}</p>
                                      <p className="text-xs tabular-nums text-muted-foreground leading-tight">{row.st_acum == null ? "—" : `${row.st_acum}%`} <span className="text-[10px]">acum.</span>{est}</p>
                                      <Progress value={Math.min(acum, 100)} className="h-2 mt-1 bg-muted" indicatorClassName={getSellThroughColor(acum)} />
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {b ? dash : (
                                    <>
                                      <p className="text-sm font-semibold tabular-nums">{fmtWos(row.wos)}</p>
                                      {row.wos == null && <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">SIN ROTACIÓN</span>}
                                    </>
                                  )}
                                </TableCell>
                                <TableCell><StatusBadge label={row.estado_salud} /></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TooltipProvider>
                )}
              </div>
            </>
          );
        })()}
      </SheetContent>
    </Sheet>
  );
}
