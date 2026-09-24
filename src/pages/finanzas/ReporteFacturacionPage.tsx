import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, CheckCircle2, AlertTriangle, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

type Row = {
  canal: string | null; zona: string | null; pedido: string | null; sucursal: string | null; fecha_pedido: string | null;
  estado_pago: string | null; colaborador: string | null; numero_factura: string | null;
  fecha_factura: string | null; numero_pos: string | null; cufe: string | null; emitida_dian: boolean | null;
  nota_credito: string | null; fecha_nota: string | null; tiene_nota: boolean | null;
  venta_bruta: number | null; descuento: number | null; venta_neta: number | null; impuesto: number | null;
  venta_total: number | null; articulos: number | null; estado_facturacion: string | null; dias_sin_facturar: number | null;
  metodo_pago: string | null; estado_despacho: string | null; es_gift_card: boolean | null;
  valor_facturado: number | null; diferencia_facturacion: number | null;
};

type CardKey = "pendiente" | "diferencia" | "fallo_dian" | "esperando" | "facturado";
type SortKey = "estado_facturacion" | "fecha_pedido" | "venta_total" | "diferencia_facturacion";
type SortDir = "asc" | "desc";

const comparar = (a: Row, b: Row, campo: SortKey, dir: SortDir) => {
  const va = a?.[campo];
  const vb = b?.[campo];

  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;

  let resultado: number;
  if (campo === "fecha_pedido") {
    resultado = String(va).localeCompare(String(vb));
  } else if (typeof va === "number" || !Number.isNaN(Number(va))) {
    resultado = Number(va) - Number(vb);
  } else {
    resultado = String(va).localeCompare(String(vb));
  }

  return dir === "asc" ? resultado : -resultado;
};

const CARD_ESTADO: Record<CardKey, (e: string) => boolean> = {
  pendiente: (e) => e === "PENDIENTE POR FACTURAR",
  diferencia: (e) => e === "Descuadre de valor",
  fallo_dian: (e) => e === "Fallo la emision a DIAN",
  esperando: (e) => e === "Esperando despacho",
  facturado: (e) => e === "Facturado",
};

const ESTADO_POR_TARJETA: Record<CardKey, string> = {
  pendiente: "PENDIENTE POR FACTURAR",
  diferencia: "Descuadre de valor",
  fallo_dian: "Fallo la emision a DIAN",
  esperando: "Esperando despacho",
  facturado: "Facturado",
};

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PAGE = 100;

function badgeClass(e: string) {
  if (e === "PENDIENTE POR FACTURAR" || e === "Descuadre de valor") return "bg-destructive/10 text-destructive border-destructive/30";
  if (e === "Fallo la emision a DIAN" || e === "Emision en proceso") return "bg-amber-100 text-amber-800 border-amber-300";
  if (e === "Esperando despacho" || e.startsWith("No facturable")) return "bg-muted text-muted-foreground border-border";
  if (e === "Anulado por nota credito") return "bg-muted text-muted-foreground border-border";
  if (e === "Facturado") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  return "bg-secondary text-secondary-foreground border-border";
}

// Fechas sin hora ('2026-09-24'): partir el string para no caer al día anterior por UTC→Bogotá.
const fechaLocal = (s: string | null | undefined) => {
  if (!s) return null;
  const [a, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
};

const fmtFechaSolo = (s: string | null | undefined) => {
  const d = fechaLocal(s);
  return d ? d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
};

const fmtDateTime = (value: string | null | undefined) => value
  ? new Date(value).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })
  : "—";

export default function ReporteFacturacionPage() {
  const hoy = hoyBogota();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [canal, setCanal] = useState("todos");
  const [zona, setZona] = useState("todos");
  const [locationId, setLocationId] = useState("todos");
  const [soloPend, setSoloPend] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [cardFiltro, setCardFiltro] = useState<CardKey | null>(null);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("fecha_pedido");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { isAdmin } = useUserRole();
  const canExport = useHasPermission({ module: "financiero.reporte_facturacion", action: "export" }) || isAdmin;

  const [exportando, setExportando] = useState<number | null>(null);
  const [canalesVistos, setCanalesVistos] = useState<string[]>([]);
  const pCanal = canal === "todos" ? null : canal;
  const pZona = zona === "todos" ? null : zona;
  const pLocationId = locationId === "todos" ? null : locationId;
  const pEstado = cardFiltro ? ESTADO_POR_TARJETA[cardFiltro] : null;
  const s = busquedaDebounced.trim();
  const TOPE = 500;

  useEffect(() => {
    const timeout = window.setTimeout(() => setBusquedaDebounced(busqueda.trim()), 400);
    return () => window.clearTimeout(timeout);
  }, [busqueda]);

  const resumenQ = useQuery({
    queryKey: ["reporte-facturacion-resumen", desde, hasta, pCanal, pZona, pLocationId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("resumen_pendientes_facturacion", {
        p_desde: desde, p_hasta: hasta, p_canal: pCanal, p_zona: pZona, p_location_id: pLocationId,
      });
      if (error) throw error;
      return (data ?? []) as { estado_facturacion: string; pedidos: number; venta_neta: number; articulos: number; dias_max: number; diferencia: number; gift_cards: number }[];
    },
  });

  const zonasQ = useQuery({
    queryKey: ["zonas-reporte-facturacion", desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("zonas_reporte_facturacion", {
        p_desde: desde,
        p_hasta: hasta,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ubicacionesQ = useQuery({
    queryKey: ["ubicaciones-reporte-facturacion", desde, hasta, pZona],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ubicaciones_reporte_facturacion", {
        p_desde: desde,
        p_hasta: hasta,
        p_zona: pZona,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const buildQuery = () => {
    return (supabase.rpc as any)("reporte_pendientes_facturacion", {
      p_desde: desde, p_hasta: hasta, p_solo_pendientes: soloPend, p_canal: pCanal,
      p_zona: pZona, p_location_id: pLocationId, p_estado: pEstado, p_buscar: s || null,
    });
  };

  const q = useQuery({
    queryKey: ["reporte-facturacion", desde, hasta, soloPend, pCanal, pZona, pLocationId, pEstado, s, page, sortKey, sortDir],
    queryFn: async () => {
      const qb = buildQuery().order(sortKey, { ascending: sortDir === "asc", nullsFirst: false }).order("pedido", { ascending: true });
      const { data, error } = s ? await qb.range(0, TOPE - 1) : await qb.range((page - 1) * PAGE, (page - 1) * PAGE + PAGE - 1);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const corteQ = useQuery({
    queryKey: ["corte-datos-facturacion"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("corte_datos_facturacion");
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  useEffect(() => {
    const nuevos = (q.data ?? []).map((r) => r.canal).filter(Boolean) as string[];
    if (nuevos.some((c) => !canalesVistos.includes(c)))
      setCanalesVistos((prev) => Array.from(new Set([...prev, ...nuevos])).sort());
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const canales = canalesVistos;
  const zonas = zonasQ.data ?? [];
  const tiendas = ubicacionesQ.data ?? [];

  useEffect(() => setLocationId("todos"), [zona]);

  useEffect(() => {
    if (zona !== "todos" && zonasQ.data && !zonasQ.data.some((item) => item.zona === zona)) {
      setZona("todos");
    }
  }, [zona, zonasQ.data]);

  useEffect(() => {
    if (locationId !== "todos" && ubicacionesQ.data && !ubicacionesQ.data.some((item) => item.location_id === locationId)) {
      setLocationId("todos");
    }
  }, [locationId, ubicacionesQ.data]);

  const resumen = useMemo(() => {
    const out = {} as Record<CardKey, { n: number; v: number; d: number }>;
    (Object.keys(CARD_ESTADO) as CardKey[]).forEach((k) => {
      const rows = (resumenQ.data ?? []).filter((r) => CARD_ESTADO[k](r.estado_facturacion ?? ""));
      out[k] = {
        n: rows.reduce((a, r) => a + Number(r.pedidos ?? 0), 0),
        v: rows.reduce((a, r) => a + Number(r.venta_neta ?? 0), 0),
        d: rows.reduce((a, r) => a + Number(r.diferencia ?? 0), 0),
      };
    });
    return out;
  }, [resumenQ.data]);

  const totalPedidos = useMemo(() => {
    if (cardFiltro) return resumen[cardFiltro].n;
    if (soloPend) return resumen.pendiente.n;
    return (resumenQ.data ?? []).reduce((a, r) => a + Number(r.pedidos ?? 0), 0);
  }, [resumen, resumenQ.data, cardFiltro, soloPend]);

  const filasCargadas = q.data ?? [];
  const topeAlcanzado = !!s && filasCargadas.length >= TOPE;

  useEffect(() => setPage(1), [desde, hasta, soloPend, canal, zona, locationId, busqueda, cardFiltro, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(totalPedidos / PAGE));
  const pageRows = useMemo(() => {
    try {
      return [...filasCargadas].sort((a, b) => comparar(a, b, sortKey, sortDir));
    } catch {
      return filasCargadas;
    }
  }, [filasCargadas, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortLabel = ({ field, children }: { field: SortKey; children: string }) => (
    <Button variant="ghost" size="sm" className="h-8 px-1 font-medium" onClick={() => toggleSort(field)}>
      {children}
      {sortKey !== field ? <ArrowUpDown className="ml-1 h-3.5 w-3.5" /> : sortDir === "asc" ? <ArrowUp className="ml-1 h-3.5 w-3.5" /> : <ArrowDown className="ml-1 h-3.5 w-3.5" />}
    </Button>
  );

  const exportar = async () => {
    setExportando(0);
    try {
      const all: Row[] = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await buildQuery()
          .order(sortKey, { ascending: sortDir === "asc", nullsFirst: false })
          .order("pedido", { ascending: true })
          .range(off, off + 999);
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        setExportando(all.length);
        if (!data || data.length < 1000) break;
      }
      exportToXLS(
        all.map((r) => ({
          Estado: r.estado_facturacion ?? "", Pedido: r.pedido ?? "", Canal: r.canal ?? "", Zona: r.zona ?? "", Sucursal: r.sucursal ?? "",
          "Fecha pedido": r.fecha_pedido ?? "", "Método pago": r.metodo_pago ?? "", Despacho: r.estado_despacho ?? "", Colaborador: r.colaborador ?? "", Factura: r.numero_factura ?? "",
          "Fecha factura": r.fecha_factura ?? "", "N° POS": r.numero_pos ?? "",
          DIAN: r.emitida_dian ? "Emitida" : r.numero_factura ? "Sin CUFE" : "", "Nota crédito": r.nota_credito ?? "",
           "Venta total": Number(r.venta_total ?? 0), "Valor facturado": Number(r.valor_facturado ?? 0), Diferencia: Number(r.diferencia_facturacion ?? 0),
          Impuesto: Number(r.impuesto ?? 0), Descuento: Number(r.descuento ?? 0),
          Artículos: Number(r.articulos ?? 0), "Días sin facturar": r.dias_sin_facturar ?? "",
        })),
        `Reporte de facturacion ${hoyBogota()}`,
        "Facturación",
      );
    } catch (e: any) {
      alert(`Error al exportar: ${e?.message ?? e}`);
    } finally {
      setExportando(null);
    }
  };

  const cards: { key: CardKey; title: string; cls: string }[] = [
    { key: "pendiente", title: "Pendientes por facturar", cls: "border-destructive/40 text-destructive" },
    { key: "diferencia", title: "Diferencias de facturación", cls: "border-destructive/40 text-destructive" },
    { key: "fallo_dian", title: "Falló emisión DIAN", cls: "border-amber-400 text-amber-700" },
    { key: "esperando", title: "Esperando despacho", cls: "text-muted-foreground" },
    { key: "facturado", title: "Total facturado", cls: "text-foreground" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <FinanzasLayout
        title="Reporte de Facturación"
        fullWidth
        titleAccessory={q.isFetching && !q.isLoading ? (
          <span className="inline-flex items-center gap-2 text-xs font-normal text-muted-foreground" role="status">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            Actualizando…
          </span>
        ) : null}
      >
        <p className="text-xs text-muted-foreground -mt-4 mb-6">
          Ventas hasta {fmtFechaSolo(corteQ.data?.ultima_venta)} · Facturas hasta {fmtFechaSolo(corteQ.data?.ultima_factura)} · Última sincronización {fmtDateTime(corteQ.data?.ultima_sync_netsuite)}.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 mb-6 items-end">
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {canales.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Zona</Label>
            <Select value={zona} onValueChange={setZona} disabled={zonasQ.isLoading}>
              <SelectTrigger><SelectValue>{zonasQ.isLoading ? "Cargando…" : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {zonas.map((item) => (
                  <SelectItem key={item.zona} value={item.zona}>
                    <span className="flex w-full min-w-48 items-center justify-between gap-4">
                      <span>{item.zona}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtInt(item.pedidos)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tienda</Label>
            <Select value={locationId} onValueChange={setLocationId} disabled={ubicacionesQ.isLoading}>
              <SelectTrigger><SelectValue>{ubicacionesQ.isLoading ? "Cargando…" : undefined}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {tiendas.map((t) => (
                  <SelectItem key={t.location_id} value={t.location_id}>
                    <span className="flex w-full min-w-64 items-center justify-between gap-4">
                      <span>{t.nombre}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">{fmtInt(t.pedidos)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
              <Input className="pl-8" placeholder="Pedido o factura" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3 justify-between">
            <label className="flex items-center gap-2 text-sm"><Switch checked={soloPend} onCheckedChange={setSoloPend} />Solo pendientes</label>
            {canExport && <Button variant="outline" size="sm" onClick={exportar} disabled={filasCargadas.length === 0 || exportando !== null || q.isFetching}><Download className="h-4 w-4 mr-1" />{exportando !== null ? `Preparando… ${fmtInt(exportando)} filas` : "Excel"}</Button>}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-2">
          {resumenQ.isLoading ? (
            <div className="sm:col-span-2 xl:col-span-5">
              <LoadingState rows={0} />
            </div>
          ) : cards.map((c) => (
            <Card key={c.key} onClick={() => {
              setCardFiltro(cardFiltro === c.key ? null : c.key);
              if (c.key !== "pendiente") setSoloPend(false);
            }}
              className={cn("cursor-pointer transition-shadow hover:shadow-md", c.cls, cardFiltro === c.key && "ring-2 ring-primary")}>
              <CardContent className="p-4">
                <p className="text-xs font-medium">{c.title}</p>
                <p className="text-2xl font-semibold tabular-nums">{fmtInt(resumen[c.key].n)}</p>
                 <p className="text-xs text-muted-foreground tabular-nums">{c.key === "diferencia" ? `${fmtCOP(resumen[c.key].d)} en diferencias` : `${fmtCOP(resumen[c.key].v)} venta neta`}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {cardFiltro && <Button variant="link" size="sm" className="h-auto px-0 mb-4" onClick={() => setCardFiltro(null)}>Quitar filtro de estado</Button>}

        {resumenQ.error && <p className="text-sm text-destructive my-4">Error resumen: {(resumenQ.error as any).message}</p>}
        {topeAlcanzado && <p className="text-sm text-amber-700 my-2">La búsqueda alcanzó el tope de {TOPE} filas; refina el texto para ver todos los resultados.</p>}
        {q.error && <p className="text-sm text-destructive my-4">Error: {(q.error as any).message}</p>}
         <div className="overflow-x-auto rounded-md border border-border mt-4">
             <Table className="min-w-[1100px] table-fixed">
              <TableHeader>
                <TableRow>
                   <TableHead className="w-[175px]"><SortLabel field="estado_facturacion">Estado</SortLabel></TableHead>
                   <TableHead className="w-[135px]">Pedido</TableHead>
                   <TableHead className="w-[165px]">Ubicación</TableHead>
                   <TableHead className="w-[130px]"><SortLabel field="fecha_pedido">Fechas</SortLabel></TableHead>
                   <TableHead className="w-[155px]">Factura</TableHead>
                   <TableHead className="w-[135px] text-right"><SortLabel field="venta_total">Venta</SortLabel></TableHead>
                   <TableHead className="w-[160px] text-right"><SortLabel field="diferencia_facturacion">Facturado</SortLabel></TableHead>
                   <TableHead className="w-[165px]">Responsable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  <TableRow>
                     <TableCell colSpan={8} className="p-0">
                      <LoadingState rows={0} />
                    </TableCell>
                  </TableRow>
                ) : pageRows.length === 0 ? (
                   <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Sin pedidos para los filtros seleccionados</TableCell></TableRow>
                ) : pageRows.map((r, i) => {
                  const e = r.estado_facturacion ?? "";
                   const diferencia = Number(r.diferencia_facturacion ?? 0);
                   const superaTolerancia = Math.abs(diferencia) > Math.abs(Number(r.venta_total ?? 0)) * 0.02;
                  return (
                     <TableRow key={(r.pedido ?? "") + i} className="align-top">
                       <TableCell>
                         <span className={cn("inline-block max-w-full text-xs px-2 py-0.5 rounded border", badgeClass(e))}>{e}</span>
                         {r.dias_sin_facturar != null && <p className={cn("mt-1 text-xs text-muted-foreground", r.dias_sin_facturar > 30 && "text-destructive font-medium")}>hace {fmtInt(r.dias_sin_facturar)} días</p>}
                       </TableCell>
                       <TableCell>
                         <div className="flex flex-wrap items-center gap-1.5 font-semibold"><span>{r.pedido ?? "—"}</span>{r.es_gift_card && <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">Gift card</span>}</div>
                         <p className="mt-1 text-xs text-muted-foreground">{r.canal ?? "—"}</p>
                       </TableCell>
                       <TableCell>
                         <p className="font-medium">{r.sucursal ?? "—"}</p>
                         <p className="mt-1 text-xs text-muted-foreground">{r.zona ?? "—"}</p>
                       </TableCell>
                       <TableCell className="whitespace-nowrap">
                         <p><span className="text-xs text-muted-foreground">Pedido</span> {fmtFechaSolo(r.fecha_pedido)}</p>
                         <p className="mt-1 text-xs text-muted-foreground">Factura {r.fecha_factura ? fmtFechaSolo(r.fecha_factura) : "—"}</p>
                       </TableCell>
                       <TableCell>
                         <p className="font-medium">{r.numero_factura ?? "—"}</p>
                         <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                           <span>{r.numero_pos ?? "—"}</span><span>·</span>
                           {r.emitida_dian ? (
                             <Tooltip><TooltipTrigger asChild><span className="inline-flex cursor-help"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /></span></TooltipTrigger>
                               <TooltipContent className="max-w-xs break-all">{r.cufe ? `CUFE: ${r.cufe}` : "Emitida a DIAN"}</TooltipContent></Tooltip>
                           ) : r.numero_factura ? (
                             <Tooltip><TooltipTrigger asChild><span className="inline-flex cursor-help"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" /></span></TooltipTrigger>
                               <TooltipContent>Factura sin CUFE</TooltipContent></Tooltip>
                           ) : <span>—</span>}
                         </div>
                         {r.nota_credito && <p className="mt-1 text-xs text-destructive">NC {r.nota_credito}{r.fecha_nota ? ` · ${fmtFechaSolo(r.fecha_nota)}` : ""}</p>}
                       </TableCell>
                       <TableCell className="text-right tabular-nums">
                         <p className="font-semibold">{fmtCOP(r.venta_total)}</p>
                         <p className="mt-1 text-xs text-muted-foreground">{fmtInt(r.articulos)} art.{Number(r.descuento ?? 0) > 0 ? ` · Dcto. ${fmtCOP(r.descuento)}` : ""}</p>
                       </TableCell>
                       <TableCell className="text-right tabular-nums">
                         <p className="font-medium">{fmtCOP(r.valor_facturado)}</p>
                         {superaTolerancia && <p className="mt-1 text-xs font-medium text-destructive">{diferencia > 0 ? "Falta facturar" : "Facturado de más"} {fmtCOP(Math.abs(diferencia))}</p>}
                       </TableCell>
                       <TableCell>
                         <p className="font-medium">{r.colaborador ?? "—"}</p>
                         <p className="mt-1 text-xs text-muted-foreground">{r.metodo_pago ?? "—"} · {r.estado_despacho ?? "—"}</p>
                       </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

        {!s && totalPedidos > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground">Página {page} · {fmtInt(totalPedidos)} pedidos en total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </FinanzasLayout>
    </TooltipProvider>
  );
}
