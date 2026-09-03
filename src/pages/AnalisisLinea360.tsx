import { Fragment, useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { differenceInCalendarDays } from "date-fns";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
  und_full: number;
  und_rebajas: number;
  und_promo: number;
  clasificacion: string;
  stock_tiendas: number;
  stock_online: number;
  stock_bodega: number;
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
  "PVP = precio de lista ponderado por unidades. Precio promedio = efectivamente cobrado. Stock Bodega requiere conciliación NetSuite del día.";

const money = (n: number | null | undefined) =>
  "$ " + Math.round(Number(n ?? 0)).toLocaleString("es-CO");
const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("es-CO");
const pct = (n: number | null | undefined, d = 1) => `${Number(n ?? 0).toFixed(d)}%`;

const wosColor = (w: number) =>
  w > 12 ? "text-destructive" : w < 4 ? "text-amber-600" : "text-emerald-600";

function ClasifBadge({ value }: { value: string }) {
  if (!value) return <span className="text-xs text-muted-foreground">—</span>;
  const v = value.toUpperCase();
  const full = v.includes("FULL");
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        full
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : "bg-amber-50 text-amber-700 border-amber-200",
      )}
    >
      {value}
    </span>
  );
}

function MetricCells({ r }: { r: Row }) {
  return (
    <>
      <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">{money(r.pvp_promedio)}</TableCell>
      <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">{money(r.precio_promedio)}</TableCell>
      <TableCell
        className={cn(
          "text-right text-sm font-medium",
          Number(r.pct_descuento_prom) > 50 ? "text-destructive" : "text-foreground",
        )}
      >
        {pct(r.pct_descuento_prom)}
      </TableCell>
      <TableCell className="text-right text-sm font-semibold">{int(r.und_vendidas)}</TableCell>
      <TableCell><ClasifBadge value={r.clasificacion} /></TableCell>
      <TableCell className="text-right text-sm">{int(r.stock_tiendas)}</TableCell>
      <TableCell className="text-right text-sm">{int(r.stock_online)}</TableCell>
      <TableCell className="text-right text-sm">{int(r.stock_bodega)}</TableCell>
      <TableCell className="text-right text-sm">{Number(r.rdv_semanal ?? 0).toFixed(1)}</TableCell>
      <TableCell className="text-right text-sm">{pct(r.sell_through_pct)}</TableCell>
      <TableCell className={cn("text-right text-sm font-medium", wosColor(Number(r.wos ?? 0)))}>
        {Number(r.wos ?? 0) >= 999 ? "∞" : `${Number(r.wos ?? 0).toFixed(1)}w`}
      </TableCell>
      <TableCell><StatusBadge label={r.estado_salud ?? "—"} /></TableCell>
    </>
  );
}

const HEAD_METRICS = (
  <>
    <TableHead className="text-right">PVP</TableHead>
    <TableHead className="text-right">Precio prom.</TableHead>
    <TableHead className="text-right">% Dto</TableHead>
    <TableHead className="text-right">Unidades</TableHead>
    <TableHead>Clasificación</TableHead>
    <TableHead className="text-right">Stock Tiendas</TableHead>
    <TableHead className="text-right">Stock Online</TableHead>
    <TableHead className="text-right">Stock Bodega</TableHead>
    <TableHead className="text-right">RDV</TableHead>
    <TableHead className="text-right">Sell-through</TableHead>
    <TableHead className="text-right">WOS</TableHead>
    <TableHead>Salud</TableHead>
  </>
);

export default function AnalisisLinea360Page() {
  const [days, setDays] = useState<number>(90);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [coleccion, setColeccion] = useState("all");
  const [canal, setCanal] = useState("all");

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
    () => [...rows].sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0)),
    [rows],
  );

  return (
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
                  <Table className="min-w-[1200px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[180px]">Línea</TableHead>
                        {HEAD_METRICS}
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
            ) : !detailRows.length ? (
              <EmptyState message="Sin productos con datos." />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[1200px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[220px]">Producto</TableHead>
                        {HEAD_METRICS}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...detailRows]
                        .sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0))
                        .map((r) => (
                          <TableRow key={r.producto_id ?? r.producto ?? Math.random()}>
                            <TableCell>
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
            <p className="text-[11px] text-muted-foreground">{NOTA_PIE}</p>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
