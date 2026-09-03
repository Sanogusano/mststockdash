import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { differenceInCalendarDays } from "date-fns";
import { TimeFilter, resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { SalesBreakdownBars } from "@/pages/LineasProducto";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ChevronRight, Store, Globe, Tag, Pause } from "lucide-react";

interface Row {
  nivel: string;
  coleccion: string;
  linea: string;
  producto_id: string | null;
  producto: string | null;
  foto: string | null;
  pvp_promedio: number;
  precio_promedio: number;
  pct_descuento_prom: number;
  und_vendidas: number;
  und_tiendas: number;
  und_online: number;
  und_outlet: number;
  und_full: number;
  und_rebajas: number;
  und_promo: number;
  clasificacion?: string;
  stock_tiendas: number;
  stock_online: number;
  stock_bodega: number;
  stock_total: number;
  pct_evac_0_90: number;
  pct_evac_90_120: number;
  pct_evac_120_150: number;
  pct_evac_150: number;
  uds_evac_0_90: number;
  uds_evac_90_120: number;
  uds_evac_120_150: number;
  productos_maduros: number;
  productos_total: number;
  rdv_semanal: number;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los canales" },
  { value: "TIENDA", label: "🏪 Tiendas" },
  { value: "OUTLET", label: "🏷️ Outlets" },
  { value: "Online", label: "🌐 Online" },
];

const NOTA_PIE =
  "PVP = precio de lista ponderado por unidades. Precio promedio = efectivamente cobrado. Stock = tiendas + online + bodega (requiere conciliación NetSuite del día). Evacuación = tramos incrementales sobre lo producido.";

const money = (n: number | null | undefined) =>
  "$ " + Math.round(Number(n ?? 0)).toLocaleString("es-CO");
const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("es-CO");
const pct = (n: number | null | undefined, d = 1) => `${Number(n ?? 0).toFixed(d)}%`;

const wosColor = (w: number) =>
  w > 12 ? "text-destructive" : w < 4 ? "text-amber-600" : "text-emerald-600";

function UnidadesCell({ r }: { r: Row }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums">{int(r.und_vendidas)}</div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground tabular-nums mt-0.5">
        <span className="inline-flex items-center gap-0.5"><Store className="h-3 w-3" />{int(r.und_tiendas)}</span>
        <span className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" />{int(r.und_online)}</span>
        <span className="inline-flex items-center gap-0.5"><Tag className="h-3 w-3" />{int(r.und_outlet)}</span>
      </div>
    </div>
  );
}

function StockCell({ r }: { r: Row }) {
  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums">{int(r.stock_total)}</div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground tabular-nums mt-0.5">
        <span className="inline-flex items-center gap-0.5"><Store className="h-3 w-3" />{int(r.stock_tiendas)}</span>
        <span className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" />{int(r.stock_online)}</span>
        <span className="inline-flex items-center gap-0.5"><Pause className="h-3 w-3" />{int(r.stock_bodega)}</span>
      </div>
    </div>
  );
}

function EvacuacionCell({ r }: { r: Row }) {
  const t1 = Math.max(0, Number(r.pct_evac_0_90 ?? 0));
  const t2 = Math.max(0, Number(r.pct_evac_90_120 ?? 0));
  const t3 = Math.max(0, Number(r.pct_evac_120_150 ?? 0));
  const u1 = Number(r.uds_evac_0_90 ?? 0);
  const u2 = Number(r.uds_evac_90_120 ?? 0);
  const u3 = Number(r.uds_evac_120_150 ?? 0);
  const total = Number(r.pct_evac_150 ?? t1 + t2 + t3);
  const maduros = Number(r.productos_maduros ?? 0);
  const totalProd = Number(r.productos_total ?? 0);
  const incompleta = totalProd > 0 && maduros < totalProd;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const seg = (w: number, uds: number, color: string, dark = false) =>
    w <= 0 ? null : (
      <div
        className={cn("h-full flex items-center justify-center overflow-hidden", color)}
        style={{ width: `${clamp(w)}%` }}
      >
        {w >= 12 && (
          <span className={cn("text-[9px] font-semibold tabular-nums", dark ? "text-foreground/70" : "text-white")}>
            {int(uds)}
          </span>
        )}
      </div>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 min-w-[210px] cursor-help">
          <div
            className={cn(
              "relative h-4 flex-1 rounded-full bg-muted overflow-hidden",
              incompleta && "opacity-40",
            )}
          >
            <div className="absolute inset-0 flex">
              {seg(t1, u1, "bg-emerald-500")}
              {seg(t2, u2, "bg-amber-500")}
              {seg(t3, u3, "bg-amber-300", true)}
            </div>
            {[t1, t1 + t2].map((m, i) =>
              m > 0 && m < 100 ? (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-background/80"
                  style={{ left: `${clamp(m)}%` }}
                />
              ) : null,
            )}
          </div>
          <span className="text-xs font-medium tabular-nums w-16 text-right">{pct(total)} prom.</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 0–90 d: {int(u1)} uds · {pct(t1)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> 90–120 d: {int(u2)} uds · {pct(t2)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> 120–150 d: {int(u3)} uds · {pct(t3)}
        </div>
        <div className="pt-1 border-t border-border/50">
          Total 150 d: {int(u1 + u2 + u3)} uds · {pct(total)} prom.
        </div>
        <div className="text-muted-foreground">
          {int(maduros)}/{int(totalProd)} productos con 150 días cumplidos
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const NoData = () => <span className="text-muted-foreground">—</span>;

function MetricCells({ r }: { r: Row }) {
  const sinVentas = Number(r.und_vendidas ?? 0) === 0;
  return (
    <>
      <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
        {sinVentas ? <NoData /> : money(r.pvp_promedio)}
      </TableCell>
      <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
        {sinVentas ? <NoData /> : money(r.precio_promedio)}
      </TableCell>
      <TableCell
        className={cn(
          "text-right text-sm font-medium",
          !sinVentas && Number(r.pct_descuento_prom) > 50 ? "text-destructive" : "text-foreground",
        )}
      >
        {sinVentas ? <NoData /> : pct(r.pct_descuento_prom)}
      </TableCell>
      <TableCell className="text-right"><UnidadesCell r={r} /></TableCell>
      <TableCell className="text-right"><StockCell r={r} /></TableCell>
      <TableCell>
        <SalesBreakdownBars
          full={Number(r.und_full ?? 0)}
          rebajas={Number(r.und_rebajas ?? 0)}
          promo={Number(r.und_promo ?? 0)}
          total={Number(r.und_vendidas ?? 0)}
        />
      </TableCell>
      <TableCell><EvacuacionCell r={r} /></TableCell>
      <TableCell className="text-right text-sm">
        {sinVentas ? <NoData /> : Number(r.rdv_semanal ?? 0).toFixed(1)}
      </TableCell>

      <TableCell className="text-right text-sm">{pct(r.sell_through_pct)}</TableCell>
      <TableCell className={cn("text-right text-sm font-medium", wosColor(Number(r.wos ?? 0)))}>
        {Number(r.wos ?? 0) >= 999 ? "∞" : `${Number(r.wos ?? 0).toFixed(1)}w`}
      </TableCell>
      <TableCell><StatusBadge label={r.estado_salud ?? "—"} /></TableCell>
    </>
  );
}

function HeadMetrics({ canal }: { canal: string }) {
  return (
    <>
      <TableHead className="text-right">PVP</TableHead>
      <TableHead className="text-right">Precio prom.</TableHead>
      <TableHead className="text-right">Descuento Promedio</TableHead>
      <TableHead className="text-right">Unidades Vendidas</TableHead>
      <TableHead className="text-right">Stock</TableHead>
      <TableHead className="min-w-[150px]">Calidad de Venta</TableHead>
      <TableHead className="min-w-[230px]">Evacuación promedio</TableHead>
      <TableHead className="text-right">
        RDV
        <span className="block text-[9px] font-normal normal-case text-muted-foreground">
          {canal === "Online" ? "uds/semana" : "uds/tienda/semana"}
        </span>
      </TableHead>
      <TableHead className="text-right">Sell-through</TableHead>
      <TableHead className="text-right">WOS</TableHead>
      <TableHead>Salud</TableHead>
    </>
  );
}

function Convenciones() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground border border-border rounded-lg px-3 py-2">
      <span className="font-semibold text-foreground">Convenciones:</span>
      <span className="inline-flex items-center gap-1"><Store className="h-3 w-3" /> Tiendas</span>
      <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Online</span>
      <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> Outlet (ventas)</span>
      <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" /> Bodega / stand by (stock)</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-emerald-500" /> Evacuación 0–90 días</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-amber-500" /> 90–120 días</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-amber-300" /> 120–150 días</span>
      <span>Barra atenuada = aún hay productos sin cumplir 150 días.</span>
    </div>
  );
}

export default function AnalisisLinea360Page() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [days, setDays] = useState<number>(() => Number(searchParams.get("dias") ?? 90) || 90);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [coleccion, setColeccion] = useState(() => searchParams.get("coleccion") ?? "all");
  const [canal, setCanal] = useState(() => searchParams.get("canal") ?? "all");
  const [soloSinVentas, setSoloSinVentas] = useState(() => searchParams.get("sinventas") === "1");

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colOptions, setColOptions] = useState<string[]>([]);
  const colOptionsLoaded = useRef(false);

  const [detail, setDetail] = useState<{ coleccion: string | null; linea: string } | null>(null);
  const [detailRows, setDetailRows] = useState<Row[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const dias = resolveDays(days);
  const canalParam = canal === "all" ? null : canal;

  // Sincronizar filtros con la URL para que sobrevivan y se puedan compartir.
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("dias", String(days));
    if (coleccion !== "all") next.set("coleccion", coleccion);
    if (canal !== "all") next.set("canal", canal);
    if (soloSinVentas) next.set("sinventas", "1");
    setSearchParams(next, { replace: true });
  }, [days, coleccion, canal, soloSinVentas, setSearchParams]);

  const handleDaysChange = (d: number) => {
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setDays(d);
  };
  const handleCustomRangeChange = (from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
    setDays(Math.max(differenceInCalendarDays(to, from), 0));
  };


  useEffect(() => {
    if (colOptionsLoaded.current) return;
    colOptionsLoaded.current = true;
    (async () => {
      const { data } = await supabase
        .from("product_catalog")
        .select("collection_season")
        .not("collection_season", "is", null);
      setColOptions(
        [...new Set((data ?? []).map((r: any) => r.collection_season).filter(Boolean))].sort() as string[],
      );
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("reporte_analisis_linea_coleccion", {
        p_dias: dias,
        p_coleccion: coleccion === "all" ? undefined : coleccion,
        p_linea: undefined,
        p_canal: canalParam ?? undefined,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as Row[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dias, coleccion, canalParam]);


  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      const { data, error } = await supabase.rpc("reporte_analisis_linea_coleccion", {
        p_dias: dias,
        p_coleccion: detail.coleccion ?? undefined,
        p_linea: detail.linea,
        p_canal: canalParam ?? undefined,
      });
      if (cancelled) return;
      if (error) { setDetailError(error.message); setDetailRows([]); }
      else setDetailRows((data ?? []) as unknown as Row[]);
      setDetailLoading(false);
    })();
    return () => { cancelled = true; };
  }, [detail, dias, canalParam]);

  const lineas = useMemo(
    () =>
      [...rows]
        .filter((r) => (soloSinVentas ? Number(r.und_vendidas ?? 0) === 0 : true))
        .sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0)),
    [rows, soloSinVentas],
  );

  const detalle = useMemo(
    () =>
      [...detailRows]
        .filter((r) => (soloSinVentas ? Number(r.und_vendidas ?? 0) === 0 : true))
        .sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0)),
    [detailRows, soloSinVentas],
  );


  return (
    <TooltipProvider delayDuration={100}>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-4 gap-2">
            <SidebarTrigger />
            <h1 className="text-sm font-semibold text-foreground">Análisis por Línea 360</h1>
          </header>

          <main className="flex-1 p-4 md:p-6 space-y-4 min-w-0">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Período
                </label>
                <TimeFilter
                  value={days}
                  onChange={handleDaysChange}
                  customFrom={customFrom}
                  customTo={customTo}
                  onCustomRangeChange={handleCustomRangeChange}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Colección
                </label>
                <Select value={coleccion} onValueChange={setColeccion}>
                  <SelectTrigger className="h-9 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {colOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Canal
                </label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger className="h-9 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Filtro rápido
                </label>
                <button
                  type="button"
                  onClick={() => setSoloSinVentas((v) => !v)}
                  className={cn(
                    "h-9 px-3 rounded-md border text-xs font-medium transition-colors",
                    soloSinVentas
                      ? "bg-destructive/10 border-destructive/40 text-destructive"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Sin ventas en el período
                </button>
              </div>
            </div>


            {/* Tabla */}
            {loading ? (
              <LoadingState rows={8} />
            ) : error ? (
              <EmptyState message={`Error: ${error}`} />
            ) : !lineas.length ? (
              <EmptyState message="Sin datos para los filtros seleccionados." />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1500px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[180px]">Línea</TableHead>
                        <HeadMetrics canal={canal} />
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineas.map((r) => (
                        <TableRow
                          key={r.linea}
                          className="cursor-pointer hover:bg-primary/5"
                          onClick={() => setDetail({ coleccion: coleccion === "all" ? null : coleccion, linea: r.linea })}
                        >
                          <TableCell className="text-sm font-medium whitespace-nowrap">{r.linea}</TableCell>
                          <MetricCells r={r} />
                          <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Convenciones />
            <p className="text-[11px] text-muted-foreground">{NOTA_PIE}</p>
          </main>
        </div>
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <SheetContent className="!max-w-5xl w-full overflow-y-auto p-0" side="right">
          <SheetHeader className="p-6 pb-4 border-b border-border">
            <SheetTitle className="text-base font-semibold">
              {detail?.linea}{detail?.coleccion ? ` · ${detail.coleccion}` : ""}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">Detalle por producto</p>
          </SheetHeader>
          <div className="p-6 space-y-4">
            {detailLoading ? (
              <LoadingState rows={6} />
            ) : detailError ? (
              <EmptyState message={`Error: ${detailError}`} />
            ) : !detalle.length ? (
              <EmptyState message="Sin productos con datos." />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-auto max-h-[70vh]">
                  <Table className="min-w-[1500px]">
                    <TableHeader className="sticky top-0 z-20 bg-background">
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[220px] sticky left-0 z-30 bg-background">Producto</TableHead>
                        <HeadMetrics canal={canal} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.map((r) => (
                          <TableRow key={r.producto_id ?? r.producto ?? Math.random()}>
                            <TableCell className="sticky left-0 z-10 bg-background">

                              <div className="flex items-center gap-2">
                                {r.foto ? (
                                  <img src={r.foto} alt={r.producto ?? ""} className="h-9 w-9 rounded object-cover border border-border shrink-0" />
                                ) : (
                                  <div className="h-9 w-9 rounded bg-muted/50 shrink-0" />
                                )}
                                <span className="text-sm font-medium line-clamp-2">{r.producto ?? "—"}</span>
                              </div>
                            </TableCell>
                            <MetricCells r={r} />
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
            <Convenciones />
            <p className="text-[11px] text-muted-foreground">{NOTA_PIE}</p>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
    </TooltipProvider>
  );
}
