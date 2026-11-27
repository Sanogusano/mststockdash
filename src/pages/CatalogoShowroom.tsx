import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, SlidersHorizontal, X, Download, CheckSquare, AlertTriangle, ImageOff, Check, FileDown, Copy } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCOP } from "@/lib/catalogo";
import {
  fechaHoraBogota, mostrarPrecioFull, parametrosConsultaShowroom,
  type CatalogoShowroomProducto, type CatalogoShowroomTalla,
} from "@/lib/catalogo-showroom";
import { descargarFichaShowroom, descargarFichasShowroom } from "@/lib/catalogo-showroom-ficha";
import { FiltrosShowroom, type FiltrosShowroomData } from "@/components/catalogo-showroom/FiltrosShowroom";
import { DescargarCatalogoShowroomDialog } from "@/components/catalogo-showroom/DescargarCatalogoShowroomDialog";
import type { Opcion } from "@/components/catalogo/FiltrosDesplegables";

const LIMITE = 48;
const ORDENES = [
  { v: "mas_vendidos", l: "Más vendidos" },
  { v: "mas_nuevos", l: "Más nuevos" },
  { v: "mayor_descuento", l: "Mayor descuento" },
  { v: "precio_menor", l: "Precio menor" },
  { v: "precio_mayor", l: "Precio mayor" },
  { v: "mas_stock", l: "Más stock" },
];
const LISTAS = [
  { key: "cat", label: "Categoría" },
  { key: "col", label: "Colección" },
  { key: "gen", label: "Género" },
  { key: "color", label: "Color" },
  { key: "talla", label: "Talla" },
] as const;

type FiltrosRespuesta = FiltrosShowroomData & { actualizado_en?: string };

const normOpciones = (arr: unknown): Opcion[] =>
  (Array.isArray(arr) ? arr : []).map((o: any) =>
    typeof o === "string" ? { valor: o } : { valor: String(o.valor ?? o.nombre ?? o.color ?? ""), productos: o.productos, hex: o.color_hex ?? o.hex },
  ).filter((o) => o.valor);

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export default function CatalogoShowroomPage() {
  const [sp, setSp] = useSearchParams();
  const getList = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null || v === "") n.delete(k); else n.set(k, v);
    setSp(n, { replace: true });
  };
  const toggleList = (k: string, val: string) => {
    const cur = getList(k);
    setParam(k, (cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]).join(","));
  };

  const [busqueda, setBusqueda] = useState(sp.get("q") ?? "");
  const busqDeb = useDebounced(busqueda, 300);
  useEffect(() => { if ((sp.get("q") ?? "") !== busqDeb) setParam("q", busqDeb.trim() || null); }, [busqDeb]); // eslint-disable-line

  const orden = sp.get("orden") ?? "mas_vendidos";
  const soloRebajados = sp.get("rebajados") === "1";
  const pmin = sp.get("pmin") ? Number(sp.get("pmin")) : null;
  const pmax = sp.get("pmax") ? Number(sp.get("pmax")) : null;
  const soloUltimas = sp.get("ultimas") === "1";

  const filtrosQ = useQuery({
    queryKey: ["catalogo-showroom-filtros"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<FiltrosRespuesta> => {
      const { data, error } = await supabase.rpc("catalogo_showroom_filtros" as any);
      if (error) throw error;
      const d: any = data ?? {};
      return {
        categorias: normOpciones(d.categorias), colecciones: normOpciones(d.colecciones), generos: normOpciones(d.generos),
        colores: normOpciones(d.colores), tallas: normOpciones(d.tallas),
        precio_min: Number(d.precio_min) || 0, precio_max: Number(d.precio_max) || 0, actualizado_en: d.actualizado_en,
      };
    },
  });

  const params = parametrosConsultaShowroom({
    busqueda: sp.get("q"), categorias: getList("cat"), colecciones: getList("col"), generos: getList("gen"),
    tallas: getList("talla"), colores: getList("color"), precioMin: pmin, precioMax: pmax,
    soloRebajados, orden,
  }, LIMITE);

  const prodQ = useInfiniteQuery({
    queryKey: ["catalogo-showroom-productos", params],
    initialPageParam: 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("catalogo_showroom_productos" as any, { ...params, p_offset: pageParam } as any);
      if (error) throw error;
      const d: any = data ?? {};
      return {
        total: Number(d.total) || 0,
        unidades_total: Number(d.unidades_total) || 0,
        actualizado_en: d.actualizado_en as string | undefined,
        productos: (d.productos ?? []) as CatalogoShowroomProducto[],
        offset: pageParam as number,
      };
    },
    getNextPageParam: (last) => (last.offset + last.productos.length < last.total && last.productos.length > 0 ? last.offset + LIMITE : undefined),
  });

  const todos = useMemo(() => prodQ.data?.pages.flatMap((p) => p.productos) ?? [], [prodQ.data]);
  const total = prodQ.data?.pages[0]?.total ?? 0;
  const unidadesTotal = prodQ.data?.pages[0]?.unidades_total ?? 0;
  const actualizado = prodQ.data?.pages[0]?.actualizado_en ?? filtrosQ.data?.actualizado_en;
  const nUltimas = todos.filter((p) => p.alerta === "ULTIMAS UNIDADES").length;
  const visibles = soloUltimas ? todos.filter((p) => p.alerta === "ULTIMAS UNIDADES") : todos;

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && prodQ.hasNextPage && !prodQ.isFetchingNextPage) prodQ.fetchNextPage();
    }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [prodQ.hasNextPage, prodQ.isFetchingNextPage, prodQ.fetchNextPage]);

  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [detalle, setDetalle] = useState<CatalogoShowroomProducto | null>(null);
  const [seleccionando, setSeleccionando] = useState(false);
  const [seleccion, setSeleccion] = useState<Map<string, CatalogoShowroomProducto>>(new Map());
  const [descargando, setDescargando] = useState<string | null>(null);

  const toggleSel = (p: CatalogoShowroomProducto) => {
    const n = new Map(seleccion);
    const k = String(p.product_id);
    if (n.has(k)) n.delete(k); else n.set(k, p);
    setSeleccion(n);
  };
  const bajarSeleccion = async () => {
    const ps = [...seleccion.values()];
    if (!ps.length) return;
    try {
      const r = await descargarFichasShowroom(ps, (i) => setDescargando(`Generando ${i}/${ps.length}…`));
      if (r !== "cancelado") toast.success(r === "compartido" ? "Fichas listas para compartir" : `${ps.length} fichas descargadas`);
      setSeleccion(new Map()); setSeleccionando(false);
    } catch (e: any) {
      toast.error(`No se pudieron generar las fichas: ${e?.message ?? e}`);
    } finally { setDescargando(null); }
  };

  const [cargandoTodo, setCargandoTodo] = useState(false);
  const [avisoTodo, setAvisoTodo] = useState(false);
  const [elegibles, setElegibles] = useState(0);
  const filtroKey = JSON.stringify({ ...params, soloUltimas });
  const filtroKeyPrev = useRef(filtroKey);
  useEffect(() => {
    if (filtroKeyPrev.current !== filtroKey) {
      filtroKeyPrev.current = filtroKey;
      setSeleccion(new Map());
      setElegibles(0);
    }
  }, [filtroKey]);
  const todosSeleccionados = elegibles > 0 && seleccion.size >= elegibles;
  const nTodo = soloUltimas ? nUltimas : total;
  const seleccionarTodo = async () => {
    setAvisoTodo(false); setCargandoTodo(true);
    try {
      const n = new Map<string, CatalogoShowroomProducto>();
      for (let off = 0; off < total; off += 200) {
        const { data, error } = await supabase.rpc("catalogo_showroom_productos" as any, { ...params, p_limite: 200, p_offset: off } as any);
        if (error) throw error;
        const ps = (((data as any)?.productos) ?? []) as CatalogoShowroomProducto[];
        ps.forEach((p) => { if (!soloUltimas || p.alerta === "ULTIMAS UNIDADES") n.set(String(p.product_id), p); });
        if (ps.length < 200) break;
      }
      setSeleccion(n); setElegibles(n.size);
    } catch (e: any) {
      toast.error(`No se pudieron cargar los productos: ${e?.message ?? e}`);
    } finally { setCargandoTodo(false); }
  };
  const onSeleccionarTodo = () => {
    if (todosSeleccionados) { setSeleccion(new Map()); setElegibles(0); return; }
    if (total > 120) setAvisoTodo(true); else seleccionarTodo();
  };

  const chipsActivos: { k: string; v?: string; label: string }[] = [];
  LISTAS.forEach((l) => getList(l.key).forEach((v) => chipsActivos.push({ k: l.key, v, label: v })));
  if (soloRebajados) chipsActivos.push({ k: "rebajados", label: "Solo rebajados" });
  if (pmin !== null || pmax !== null) chipsActivos.push({ k: "precio", label: `${formatCOP(pmin ?? filtrosQ.data?.precio_min)} – ${formatCOP(pmax ?? filtrosQ.data?.precio_max)}` });
  if (soloUltimas) chipsActivos.push({ k: "ultimas", label: "Últimas unidades" });
  const tituloFiltro = [
    ...getList("cat"), ...getList("col"), ...getList("gen"), ...getList("color"), ...getList("talla").map((t) => `Talla ${t}`),
    soloRebajados ? "Rebajados" : "", sp.get("q") ? `"${sp.get("q")}"` : "",
  ].filter(Boolean).join(" · ") || "Todos";
  const quitarChip = (c: { k: string; v?: string }) => {
    if (c.v) return toggleList(c.k, c.v);
    if (c.k === "precio") {
      const n = new URLSearchParams(sp); n.delete("pmin"); n.delete("pmax"); setSp(n, { replace: true }); return;
    }
    setParam(c.k, null);
  };
  const limpiarTodo = () => {
    const n = new URLSearchParams();
    if (sp.get("orden")) n.set("orden", orden);
    setBusqueda(""); setSp(n, { replace: true });
  };

  const setList = (k: string, v: string[]) => setParam(k, v.join(",") || null);
  const filtrosProps = {
    filtros: filtrosQ.data, loading: filtrosQ.isLoading, error: filtrosQ.error as Error | null,
    getList, setList, soloRebajados, setParam, pmin, pmax,
    setPrecio: (a: number, b: number) => {
      const n = new URLSearchParams(sp); const f = filtrosQ.data!;
      if (a <= f.precio_min) n.delete("pmin"); else n.set("pmin", String(a));
      if (b >= f.precio_max) n.delete("pmax"); else n.set("pmax", String(b));
      setSp(n, { replace: true });
    },
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm px-3 sm:px-6 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <h2 className="text-base sm:text-lg font-semibold text-foreground mr-auto">Catálogo Showroom</h2>
              <Button size="sm" variant="outline" onClick={() => setExportOpen(true)} className="h-8 shrink-0">
                <FileDown className="h-4 w-4" />
                <span className="hidden sm:inline ml-1.5">Descargar catálogo</span>
              </Button>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground">
              Inventario Showroom (NetSuite) actualizado: <span className="font-medium text-foreground">{fechaHoraBogota(actualizado)}</span>
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o SKU" className="pl-8 h-9" />
                {busqueda && <button aria-label="Borrar búsqueda" onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
              </div>
              <Select value={orden} onValueChange={(v) => setParam("orden", v === "mas_vendidos" ? null : v)}>
                <SelectTrigger className="h-9 w-[44%] sm:w-48 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>{ORDENES.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-9 lg:hidden shrink-0" onClick={() => setFiltrosOpen(true)} aria-label="Filtros">
                <SlidersHorizontal className="h-4 w-4" />
                {chipsActivos.length > 0 && <span className="ml-1 text-xs">{chipsActivos.length}</span>}
              </Button>
            </div>
          </header>

          <div className="flex min-w-0 flex-1">
            <div className="flex-1 min-w-0 p-3 sm:p-5 space-y-3">
              <div className="hidden lg:block"><FiltrosShowroom {...filtrosProps} /></div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground mr-1">
                  {prodQ.isLoading ? "Cargando…" : `${total.toLocaleString("es-CO")} productos · ${unidadesTotal.toLocaleString("es-CO")} unidades`}
                </span>
                {nUltimas > 0 && (
                  <button onClick={() => setParam("ultimas", soloUltimas ? null : "1")}
                    className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      soloUltimas ? "bg-warning text-warning-foreground border-warning" : "border-warning/50 text-warning-foreground bg-warning/10 hover:bg-warning/20")}>
                    <AlertTriangle className="h-3.5 w-3.5" /> {nUltimas} productos con últimas unidades
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {seleccionando && seleccion.size > 0 && (
                    <Button size="sm" onClick={bajarSeleccion} disabled={!!descargando} className="h-8">
                      <Download className="h-4 w-4 mr-1" />{descargando ?? `Descargar seleccionados (${seleccion.size})`}
                    </Button>
                  )}
                  {seleccionando && (
                    <Button size="sm" variant="outline" className="h-8" onClick={onSeleccionarTodo} disabled={cargandoTodo || total === 0}>
                      {cargandoTodo ? "Cargando…" : todosSeleccionados ? "Quitar selección" : `Seleccionar todo (${nTodo.toLocaleString("es-CO")})`}
                    </Button>
                  )}
                  <Button size="sm" variant={seleccionando ? "secondary" : "outline"} className="h-8"
                    onClick={() => { setSeleccionando(!seleccionando); setSeleccion(new Map()); setElegibles(0); }}>
                    <CheckSquare className="h-4 w-4 mr-1" />{seleccionando ? "Cancelar" : "Seleccionar"}
                  </Button>
                </div>
              </div>

              {chipsActivos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {chipsActivos.map((c) => (
                    <Badge key={c.k + (c.v ?? "")} variant="secondary" className="gap-1 pr-1 font-normal">
                      {c.label}
                      <button aria-label={`Quitar ${c.label}`} onClick={() => quitarChip(c)} className="rounded-full hover:bg-muted-foreground/20 p-0.5"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  <button onClick={limpiarTodo} className="text-xs text-muted-foreground underline underline-offset-2 ml-1">Limpiar todo</button>
                </div>
              )}

              {prodQ.error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  Error al cargar el catálogo Showroom: {(prodQ.error as any)?.message ?? String(prodQ.error)}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {prodQ.isLoading
                  ? Array.from({ length: 12 }).map((_, i) => <TarjetaSkeleton key={i} />)
                  : visibles.map((p) => (
                    <TarjetaProducto key={String(p.product_id)} p={p}
                      seleccionando={seleccionando} seleccionado={seleccion.has(String(p.product_id))}
                      onClick={() => (seleccionando ? toggleSel(p) : setDetalle(p))} />
                  ))}
                {prodQ.isFetchingNextPage && Array.from({ length: 6 }).map((_, i) => <TarjetaSkeleton key={`n${i}`} />)}
              </div>
              {!prodQ.isLoading && !prodQ.error && visibles.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-16">No hay productos con estos filtros.</p>
              )}
              <div ref={sentinel} className="h-4" />
            </div>
          </div>
        </main>
      </div>

      <Drawer open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <DrawerContent className="max-h-[85vh] lg:hidden">
          <DrawerHeader className="flex items-center justify-between py-2">
            <DrawerTitle>Filtros</DrawerTitle>
            <Button size="sm" onClick={() => setFiltrosOpen(false)}>Ver {total.toLocaleString("es-CO")}</Button>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6"><FiltrosShowroom {...filtrosProps} stacked /></div>
        </DrawerContent>
      </Drawer>

      <Dialog open={avisoTodo} onOpenChange={setAvisoTodo}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Seleccionar todo</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Vas a seleccionar {total.toLocaleString("es-CO")} productos; la descarga puede tardar</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAvisoTodo(false)}>Cancelar</Button>
            <Button size="sm" onClick={seleccionarTodo}>Continuar</Button>
          </div>
        </DialogContent>
      </Dialog>
      <DescargarCatalogoShowroomDialog open={exportOpen} onOpenChange={setExportOpen} params={params} total={total}
        seleccionados={[...seleccion.values()]} titulo={tituloFiltro} />
      <DetalleProducto p={detalle} onClose={() => setDetalle(null)} />
    </SidebarProvider>
  );
}

function Foto({ src, alt, className, contain }: { src?: string | null; alt: string; className?: string; contain?: boolean }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}><ImageOff className="h-6 w-6" /></div>;
  if (contain) return <div className={cn("bg-muted/50 p-2", className)}><img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className="h-full w-full object-contain" /></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={cn("object-cover bg-muted", className)} />;
}

function Tallas({ p, size = "sm" }: { p: CatalogoShowroomProducto; size?: "sm" | "lg" }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(p.tallas ?? []).map((t) => {
        const disponible = Number(t.disponible) || 0;
        const agotada = disponible <= 0;
        return (
          <div key={t.sku || t.talla} className="flex flex-col items-center">
            <span className={cn("inline-flex flex-col items-center justify-center rounded-md border leading-tight",
              size === "lg" ? "min-w-[52px] px-2 py-1.5" : "min-w-[34px] px-1.5 py-0.5",
              agotada ? "border-border text-muted-foreground/60 line-through opacity-60"
                : t.ultimas ? "border-warning bg-warning/10 text-warning-foreground" : "border-border text-foreground")}
              aria-disabled={agotada}>
              <span className={cn("font-semibold", size === "lg" ? "text-sm" : "text-[11px]")}>{t.talla}</span>
              {!agotada && <span className="text-[9px] text-muted-foreground no-underline">{t.ultimas ? "Últimas" : disponible}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TallasChips({ p }: { p: CatalogoShowroomProducto }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(p.tallas ?? []).map((t) => {
        const disponible = Number(t.disponible) || 0;
        const agotada = disponible <= 0;
        return (
          <span key={t.sku || t.talla} aria-disabled={agotada}
            className={cn("inline-flex h-7 min-w-[36px] items-center justify-center gap-1 rounded-md border px-1.5 text-[11px] leading-none whitespace-nowrap",
              agotada ? "border-border bg-muted text-muted-foreground line-through"
                : t.ultimas ? "border-warning bg-warning/15 text-foreground" : "border-border text-foreground")}>
            <span className="font-semibold">{t.talla}</span>
            {!agotada && <span className={cn("text-[10px]", t.ultimas ? "font-bold" : "text-muted-foreground")}>· {disponible}</span>}
          </span>
        );
      })}
    </div>
  );
}

function AccionDescargar({ p, compact }: { p: CatalogoShowroomProducto; compact?: boolean }) {
  const [bajando, setBajando] = useState(false);
  const bajar = async (e: React.MouseEvent) => {
    e.stopPropagation(); setBajando(true);
    try { await descargarFichaShowroom(p); } catch (err: any) { toast.error(`No se pudo generar la imagen: ${err?.message ?? err}`); } finally { setBajando(false); }
  };
  if (compact) return (
    <div className="flex justify-end">
      <Tooltip><TooltipTrigger asChild>
        <Button size="icon" variant="outline" onClick={bajar} disabled={bajando} className="h-8 w-8" aria-label="Descargar JPG">
          <Download className={cn("h-4 w-4", bajando && "animate-pulse")} />
        </Button>
      </TooltipTrigger><TooltipContent>Descargar JPG</TooltipContent></Tooltip>
    </div>
  );
  return <Button size="sm" variant="outline" onClick={bajar} disabled={bajando} className="h-9 w-full"><Download className="h-4 w-4 mr-1.5" />{bajando ? "Generando…" : "Descargar JPG"}</Button>;
}

function Precio({ p, big }: { p: CatalogoShowroomProducto; big?: boolean }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">
      {mostrarPrecioFull(p) && (
        <>
          <span className="text-[10px] sm:text-xs text-muted-foreground">Precio full</span>
          <span className={cn("text-right text-muted-foreground", big ? "text-base" : "text-xs sm:text-sm")}>{formatCOP(p.precio_full)}</span>
        </>
      )}
      <span className="text-[10px] sm:text-xs font-medium text-foreground">Precio página</span>
      <span className={cn("text-right font-bold text-foreground", big ? "text-2xl" : "text-base sm:text-lg")}>{formatCOP(p.precio_pagina)}</span>
    </div>
  );
}

function Badges({ p }: { p: CatalogoShowroomProducto }) {
  const pct = Math.round(Number(p.pct_descuento) || 0);
  return (
    <>
      {pct > 0 && <span className="absolute left-1.5 top-1.5 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold text-destructive-foreground">-{pct}%</span>}
      {p.alerta === "ULTIMAS UNIDADES" && <span className="absolute left-1.5 bottom-1.5 rounded bg-warning px-1.5 py-0.5 text-[11px] font-bold text-warning-foreground shadow-sm">ÚLTIMAS UNIDADES</span>}
      {p.alerta === "AGOTADO" && <span className="absolute right-1.5 top-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">AGOTADO</span>}
    </>
  );
}

function TarjetaProducto({ p, seleccionando, seleccionado, onClick }: { p: CatalogoShowroomProducto; seleccionando: boolean; seleccionado: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={cn("group flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground cursor-pointer transition-shadow hover:shadow-md",
        seleccionado ? "border-primary ring-2 ring-primary" : "border-border")}>
      <div className="relative aspect-[4/5]">
        <Foto src={p.imagen} alt={p.nombre} className="h-full w-full" contain />
        <Badges p={p} />
        {seleccionando && (
          <span className={cn("absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2",
            seleccionado ? "bg-primary border-primary text-primary-foreground" : "bg-background/90 border-border")}>
            {seleccionado && <Check className="h-4 w-4" />}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2 sm:p-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-semibold leading-tight line-clamp-2">{p.nombre}</p>
          {p.color && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground truncate">
              {p.color_hex && <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ background: p.color_hex }} />}{p.color}
            </p>
          )}
        </div>
        <Precio p={p} />
        <TallasChips p={p} />
        {!seleccionando && <div className="mt-auto pt-1"><AccionDescargar p={p} compact /></div>}
      </div>
    </div>
  );
}

function TarjetaSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Skeleton className="aspect-[4/5] w-full rounded-none" />
      <div className="space-y-2 p-3"><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-5 w-2/5" /><Skeleton className="h-6 w-full" /></div>
    </div>
  );
}

function DetalleProducto({ p, onClose }: { p: CatalogoShowroomProducto | null; onClose: () => void }) {
  const copiarSku = async (sku: string) => {
    try { await navigator.clipboard.writeText(sku); toast.success(`SKU ${sku} copiado`); } catch { toast.error("No se pudo copiar"); }
  };
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[92vh] overflow-y-auto">
        {p && (
          <div className="grid md:grid-cols-2">
            <div className="relative aspect-square md:aspect-auto md:min-h-full">
              <Foto src={p.imagen} alt={p.nombre} className="h-full w-full" />
              <Badges p={p} />
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-lg leading-tight pr-6">{p.nombre}</DialogTitle>
                {p.color && <p className="flex items-center gap-1.5 text-sm text-muted-foreground">{p.color_hex && <span className="h-3 w-3 rounded-full border border-border" style={{ background: p.color_hex }} />}{p.color}</p>}
                <p className="text-xs text-muted-foreground">{[p.categoria, p.coleccion, p.genero].filter(Boolean).join(" · ")}</p>
              </DialogHeader>
              <Precio p={p} big />
              <Tallas p={p} size="lg" />
              <div className="rounded-lg border border-border divide-y divide-border">
                {(p.tallas ?? []).map((t: CatalogoShowroomTalla) => (
                  <div key={t.sku || t.talla} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="w-10 font-semibold">{t.talla}</span>
                    <button onClick={() => copiarSku(t.sku)} className="flex-1 min-w-0 truncate text-left font-mono text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                      {t.sku}<Copy className="h-3 w-3 shrink-0" />
                    </button>
                    <span className={cn("text-xs tabular-nums", (Number(t.disponible) || 0) <= 0 ? "text-muted-foreground" : t.ultimas ? "text-warning-foreground font-medium" : "")}>
                      {(Number(t.disponible) || 0) <= 0 ? "Agotada" : `${Number(t.disponible)} und`}
                    </span>
                  </div>
                ))}
              </div>
              <AccionDescargar p={p} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
