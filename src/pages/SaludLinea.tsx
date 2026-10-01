import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, buildRpcDateParams } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LineaDetailDrawer, LineaRow, RDV_STYLES, fmtIdx, parseTramos, TRAMO_STYLES } from "@/components/dashboard/LineaDetailDrawer";
import { exportToCSV } from "@/lib/csv-export";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Search, Download, Clock, Gauge, Pause, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PAGE_SIZE = 15;
const DIGITAL_LOCATION_ID = "71474315479";
const nf = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO");
const f1 = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const stColor = (pct: number) => (pct >= 70 ? "bg-success" : pct >= 30 ? "bg-warning" : "bg-danger");

const CANAL_FILTERS = [
  { value: "all", label: "Todos los canales" },
  { value: "tiendas", label: "🏪 Tiendas de Línea" },
  { value: "outlet", label: "🏷️ Outlets" },
  { value: "digital", label: "🌐 Digital" },
];
const WOS_FILTERS = [
  { value: "all", label: "Todos los WOS" },
  { value: "risk", label: "🟡 Riesgo (<4 sem)" },
  { value: "optimal", label: "🟢 Óptimo (4-18 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>18 sem)" },
  { value: "stagnant", label: "🔴 Estancado (0 ventas)" },
];
const ST_FILTERS = [
  { value: "all", label: "Todos los %ST" },
  { value: "high", label: "🟢 Alto (≥70%)" },
  { value: "medium", label: "🟡 Medio (30-69%)" },
  { value: "low", label: "🔴 Bajo (<30%)" },
];
const ESTADO_FILTERS = [
  { value: "all", label: "Todos los estados" },
  { value: "riesgo", label: "🟡 Riesgo agotados" },
  { value: "en_ventana", label: "🟢 En ventana" },
  { value: "excedido", label: "🟠 Excedido" },
  { value: "obsoleto", label: "🔴 Obsoleto" },
  { value: "estancado", label: "🔴 Estancado" },
  { value: "agotado", label: "⚫ Agotado" },
  { value: "en_bodega", label: "🔵 En bodega" },
];
const estadoMatches = (estado: string | null | undefined, filtro: string) => {
  const e = (estado ?? "").toUpperCase();
  switch (filtro) {
    case "riesgo": return e.includes("RIESGO");
    case "en_ventana": return e.includes("EN VENTANA");
    case "excedido": return e.includes("EXCEDIDO");
    case "obsoleto": return e.includes("OBSOLETO");
    case "estancado": return e.includes("ESTANCADO");
    case "agotado": return e.includes("AGOTADO") && !e.includes("RIESGO");
    case "en_bodega": return e.includes("BODEGA");
    default: return true;
  }
};

function StRow({ label, value }: { label: string; value: number | null | undefined }) {
  const v = Number(value ?? 0);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase font-semibold text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", stColor(v))} style={{ width: `${Math.min(Math.max(v, 0), 100)}%` }} />
      </div>
      <span className="text-[10px] font-semibold w-9 text-right tabular-nums">{v}%</span>
    </div>
  );
}

function SalesBreakdownBars({ full, rebajas, promo, total }: { full: number; rebajas: number; promo: number; total: number }) {
  if (!total) return <span className="text-xs text-muted-foreground">Sin ventas</span>;
  const max = Math.max(full, rebajas, promo, 1);
  const bars = [
    { label: "Full", value: full, color: "bg-emerald-500", text: "text-emerald-600" },
    { label: "Reb.", value: rebajas, color: "bg-destructive", text: "text-destructive" },
    { label: "Promo", value: promo, color: "bg-amber-500", text: "text-amber-600" },
  ];
  return (
    <div className="space-y-1 min-w-[140px]">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-1.5">
          <span className={cn("text-[9px] font-semibold w-8 text-right shrink-0", b.text)}>{b.label}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full rounded-full", b.color)} style={{ width: `${(b.value / max) * 100}%` }} />
          </div>
          <span className={cn("text-[10px] font-semibold w-10 shrink-0 tabular-nums", b.text)}>{nf(b.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function SaludLineaPage() {
  const [days, setDays] = useState(30);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [search, setSearch] = useState("");
  const [canal, setCanal] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [wosFilter, setWosFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");
  const [estadoFilter, setEstadoFilter] = useState("all");
  const [clasif, setClasif] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<LineaRow | null>(null);

  const { dias_atras, p_hasta } = buildRpcDateParams(days, customFrom, customTo);
  const rangeLabel = customFrom && customTo
    ? `${format(customFrom, "dd/MM/yyyy")} – ${format(customTo, "dd/MM/yyyy")}`
    : `Últimos ${days} días`;

  const { data: locations } = useQuery({
    queryKey: ["locations-active-full"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("location_id, name, tipo_tienda").eq("is_active", true).order("name");
      return (data ?? []) as { location_id: string; name: string; tipo_tienda: string | null }[];
    },
    staleTime: 10 * 60 * 1000,
  });
  const filteredLocations = useMemo(() => {
    const all = locations ?? [];
    if (canal === "digital") return all.filter((l) => l.location_id === DIGITAL_LOCATION_ID);
    if (canal === "outlet") return all.filter((l) => (l.tipo_tienda ?? "").toUpperCase() === "OUTLET");
    if (canal === "tiendas") return all.filter((l) => ["A", "B", "C"].includes((l.tipo_tienda ?? "").toUpperCase()));
    return all;
  }, [locations, canal]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["linea-comportamiento", dias_atras, p_hasta, locationId],
    queryFn: async () => {
      const params: { dias_atras: number; p_hasta?: string; p_location_id?: string } = { dias_atras };
      if (p_hasta) params.p_hasta = p_hasta;
      if (locationId !== "all") params.p_location_id = locationId;
      const { data, error } = await supabase.rpc("reporte_comportamiento_linea", params);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LineaRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const clasifOpts = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((r) => { const v = (r.clasificacion ?? "").trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let all = (data ?? []).filter((r) => !q || r.linea?.toLowerCase().includes(q));
    if (clasif !== "all") all = all.filter((r) => (r.clasificacion ?? "").trim() === clasif);
    if (wosFilter !== "all") all = all.filter((r) => {
      const w = r.wos;
      if (wosFilter === "stagnant") return (r.estado_salud ?? "").includes("ESTANCADO");
      if (w == null) return false;
      if (wosFilter === "risk") return w > 0 && w < 4;
      if (wosFilter === "optimal") return w >= 4 && w <= 18;
      return w > 18;
    });
    if (stFilter !== "all") all = all.filter((r) => {
      const s = Number(r.sell_through_pct ?? 0);
      return stFilter === "high" ? s >= 70 : stFilter === "medium" ? s >= 30 && s < 70 : s < 30;
    });
    if (estadoFilter !== "all") all = all.filter((r) => estadoMatches(r.estado_salud, estadoFilter));
    // Orden por defecto: % del inventario dentro de ventana, nulls al final.
    return all.slice().sort((a, b) => (b.pct_uds_en_ventana ?? -1) - (a.pct_uds_en_ventana ?? -1));
  }, [data, search, clasif, wosFilter, stFilter, estadoFilter]);

  useMemo(() => setPage(0), [search, clasif, wosFilter, stFilter, estadoFilter, locationId, canal, dias_atras, p_hasta]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportCSV = () => {
    if (!rows.length) return;
    exportToCSV(rows.map((r) => {
      const t = parseTramos(r.distribucion_wos);
      const tr = (n: string) => t.find((x) => x.tramo === n)?.unidades ?? 0;
      return {
        Línea: r.linea,
        Productos: r.productos,
        "Productos activos": r.productos_activos,
        "% uds en ventana": r.pct_uds_en_ventana ?? "",
        "Und. Vendidas": r.und_vendidas,
        "Und. Full Price": r.und_full_price,
        "Und. Rebajas": r.und_rebajas,
        "Und. Promo": r.und_promo,
        "Antigüedad prom. (sem)": r.semanas_en_venta,
        "RDV Total": Number(r.ritmo_semanal ?? 0),
        "RDV Tienda": Number(r.ritmo_tienda ?? 0),
        "RDV Online": Number(r.ritmo_online ?? 0),
        "RDV Estado": r.rdv_estado ?? "",
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Stock Stand-by": r.stock_standby,
        "Stock Total": r.stock_total,
        "ST 120d": r.st_120d ?? 0,
        "ST Total": r.sell_through_pct ?? 0,
        "Cobertura tallas %": r.cobertura_tallas_pct ?? "",
        WOS: r.wos ?? "SIN ROTACIÓN",
        "WOS total": r.wos_total ?? "SIN ROTACIÓN",
        "Uds Riesgo": tr("Riesgo"),
        "Uds En ventana": tr("En ventana"),
        "Uds Excedido": tr("Excedido"),
        "Uds Obsoleto": tr("Obsoleto"),
        "Uds Sin rotación": tr("Sin rotación"),
        "Estado Salud": r.estado_salud,
      };
    }), "salud_por_linea");
  };

  const fmtW = (v: number | null) => (v == null || v > 90 ? "+99" : f1(v));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Salud por Línea</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Sell-through, ritmo, WOS y salud por línea de producto</p>
              </div>
            </div>
            <TimeFilter
              value={days}
              onChange={(d) => { setCustomFrom(undefined); setCustomTo(undefined); setDays(d); }}
              customFrom={customFrom}
              customTo={customTo}
              onCustomRangeChange={(f, t) => { setCustomFrom(f); setCustomTo(t); setDays(Math.max(differenceInCalendarDays(t, f), 0)); }}
            />
          </header>

          <TooltipProvider delayDuration={200}>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar línea..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-10" />
              </div>
              <Select value={canal} onValueChange={(v) => { setCanal(v); setLocationId("all"); }}>
                <SelectTrigger className="w-full sm:w-[200px] h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{CANAL_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="w-full sm:w-[200px] h-10"><SelectValue placeholder="Todas las tiendas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tiendas</SelectItem>
                  {filteredLocations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={wosFilter} onValueChange={setWosFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{WOS_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={stFilter} onValueChange={setStFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-10"><SelectValue /></SelectTrigger>
                <SelectContent>{ST_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={estadoFilter} onValueChange={setEstadoFilter}>
                <SelectTrigger className="w-full sm:w-[180px] h-10">
                  <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-2 shrink-0">Estado</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{ESTADO_FILTERS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={clasif} onValueChange={setClasif}>
                <SelectTrigger className="w-full sm:w-[200px] h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda la clasificación</SelectItem>
                  {clasifOpts.map(([v, n]) => <SelectItem key={v} value={v}>{v} ({n})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />Full Price</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" />Rebajas</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />Promo</span>
              </div>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={!rows.length}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            </div>

            <div className="glass-card overflow-hidden">
              {isLoading ? <div className="p-6"><LoadingState rows={8} /></div> : error ? (
                <div className="py-16 text-center">
                  <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
                  <p className="text-muted-foreground text-xs mt-1">{(error as Error).message}</p>
                </div>
              ) : !paged.length ? <EmptyState message="No se encontraron líneas para este filtro." /> : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="min-w-[200px]">Línea</TableHead>
                          <TableHead className="text-right">Productos</TableHead>
                          <TableHead className="text-right">Unidades vendidas</TableHead>
                          <TableHead className="min-w-[170px]">Antigüedad y ritmo</TableHead>
                          <TableHead className="min-w-[180px]">Desglose Ventas</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead className="min-w-[160px]">Sell-Through</TableHead>
                          <TableHead className="min-w-[140px]">WOS</TableHead>
                          <TableHead className="min-w-[170px]">
                            <Tooltip>
                              <TooltipTrigger asChild><span className="cursor-help underline decoration-dotted underline-offset-4">En ventana ↓</span></TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">% de las unidades en inventario cuyo WOS está dentro de la ventana comercial. Orden por defecto.</TooltipContent>
                            </Tooltip>
                          </TableHead>
                          <TableHead className="w-36 text-center">Salud</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((r) => {
                          const estado = (r.rdv_estado ?? "SOLO ONLINE").toUpperCase();
                          const st = RDV_STYLES[estado] ?? RDV_STYLES["SOLO ONLINE"];
                          const tramos = parseTramos(r.distribucion_wos).filter((t) => t.tramo !== "Sin rotación");
                          return (
                            <TableRow key={r.linea} className="cursor-pointer" onClick={() => setSelected(r)}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{r.linea}</p>
                                    {r.clasificacion && <p className="text-[11px] text-muted-foreground">{r.clasificacion}</p>}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <p className="text-sm font-semibold tabular-nums">{nf(r.productos_activos)} <span className="font-normal text-muted-foreground">de {nf(r.productos)}</span></p>
                                <p className="text-[10px] text-muted-foreground">activos</p>
                              </TableCell>
                              <TableCell className="text-right"><span className="text-base font-semibold">{nf(r.und_vendidas)}</span></TableCell>
                              <TableCell className="align-top">
                                <div className="flex items-start gap-1.5">
                                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                  <div>
                                    <p className="text-base font-semibold leading-tight tabular-nums">{nf(r.semanas_en_venta)} sem.</p>
                                    <p className="text-xs text-muted-foreground">antigüedad prom.</p>
                                  </div>
                                </div>
                                <div className="border-t border-border/60 my-1.5" />
                                <div className="flex items-center gap-1"><Gauge className="h-3 w-3 text-muted-foreground" /><span className="text-[10px] uppercase tracking-wide text-muted-foreground">RDV</span></div>
                                <p className={cn("text-sm font-semibold tabular-nums", st.text)}>{f1(r.ritmo_semanal)} u/sem</p>
                                {st.chip ? (
                                  <span className={cn("inline-block text-[10px] font-medium px-1.5 rounded", st.chip)}>{estado}{r.rdv_indice != null ? ` (${fmtIdx(r.rdv_indice)})` : ""}</span>
                                ) : <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{estado}</span>}
                                <p className="text-[10px] text-muted-foreground tabular-nums">En tienda {f1(r.ritmo_tienda)} · Online {f1(r.ritmo_online)}</p>
                              </TableCell>
                              <TableCell><SalesBreakdownBars full={r.und_full_price ?? 0} rebajas={r.und_rebajas ?? 0} promo={r.und_promo ?? 0} total={r.und_vendidas ?? 0} /></TableCell>
                              <TableCell>
                                <div className="space-y-0.5 text-sm tabular-nums">
                                  <p>🏪 {nf(r.stock_tiendas)}</p>
                                  <p>📦 {nf(r.stock_digital)}</p>
                                  {locationId === "all" && r.stock_standby > 0 && (
                                    <p className="flex items-center gap-1 text-muted-foreground"><Pause className="h-4 w-4" />{nf(r.stock_standby)}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="w-40 space-y-1.5">
                                  <StRow label="ST 120d" value={r.st_120d} />
                                  <StRow label="ST Total" value={r.sell_through_pct} />
                                </div>
                              </TableCell>
                              <TableCell className="align-top">
                                <span className="inline-block border border-border rounded-md px-2 py-1 text-base font-semibold tabular-nums whitespace-nowrap">{fmtW(r.wos)} Semanas</span>
                                {r.wos == null ? <p className="text-[10px] uppercase text-danger font-bold mt-0.5">SIN ROTACIÓN</p> : <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Lo disponibilizado</p>}
                                <p className="text-sm font-medium tabular-nums mt-2 whitespace-nowrap">{fmtW(r.wos_total)} Semanas</p>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Totalidad de inventario</p>
                              </TableCell>
                              <TableCell className="align-top">
                                <p className="text-base font-semibold tabular-nums">{r.pct_uds_en_ventana == null ? "—" : `${f1(r.pct_uds_en_ventana)}%`}</p>
                                <div className="flex h-2 w-36 overflow-hidden rounded-full bg-muted mt-1">
                                  {tramos.map((t) => t.pct_uds > 0 && (
                                    <div key={t.tramo} className={(TRAMO_STYLES[t.tramo] ?? TRAMO_STYLES["Sin rotación"]).bar} style={{ width: `${t.pct_uds}%` }} title={`${t.tramo}: ${f1(t.pct_uds)}%`} />
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell className="text-center"><StatusBadge label={r.estado_salud} /></TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-muted-foreground">
                    <span>{nf(rows.length)} líneas</span>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                      <span>{page + 1} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          </TooltipProvider>

          <LineaDetailDrawer
            linea={selected}
            onClose={() => setSelected(null)}
            diasAtras={dias_atras}
            pHasta={p_hasta ?? null}
            rangeLabel={rangeLabel}
            days={days}
            customFrom={customFrom}
            customTo={customTo}
            locationId={locationId}
          />
        </main>
      </div>
    </SidebarProvider>
  );
}
