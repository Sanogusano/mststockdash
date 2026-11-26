import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, SlidersHorizontal, X, ImageOff, ShoppingBag, Copy, Download, Trash2, Store, Minus, Plus } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MultiSelect, type Opcion } from "@/components/catalogo/FiltrosDesplegables";
import { formatCOP, compararTallas } from "@/lib/catalogo";
import { CIUDADES, csvTraslado, mensajeTienda, type LineaSolicitud, type ProductoTiendas, type TallaTiendas } from "@/lib/catalogo-tiendas";

const LIMITE = 48;
const LS_KEY = "catalogo_tiendas_solicitud";

const norm = (arr: unknown): Opcion[] =>
  (Array.isArray(arr) ? arr : []).map((o: any) => (typeof o === "string" ? { valor: o } : { valor: String(o.valor ?? o.nombre ?? ""), productos: o.productos }))
    .filter((o) => o.valor);

function haceTexto(iso?: string | null): { txt: string; viejo: boolean } {
  if (!iso) return { txt: "", viejo: false };
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const viejo = min > 24 * 60;
  const txt = min < 1 ? "ahora" : min < 60 ? `${min} min` : min < 48 * 60 ? `${Math.floor(min / 60)} h` : `${Math.floor(min / 1440)} días`;
  return { txt, viejo };
}

function Foto({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div className={cn("flex items-center justify-center bg-muted text-muted-foreground", className)}><ImageOff className="h-6 w-6" /></div>;
  return <img src={src} alt={alt} loading="lazy" onError={() => setErr(true)} className={cn("object-cover", className)} />;
}

function cargarLS(): LineaSolicitud[] {
  try { const v = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

export function CatalogoTiendas({ tabs }: { tabs: ReactNode }) {
  const [sp, setSp] = useSearchParams();
  const isMobile = useIsMobile();
  const getList = (k: string) => (sp.get(k) ? sp.get(k)!.split(",").filter(Boolean) : []);
  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp);
    if (v === null || v === "") n.delete(k); else n.set(k, v);
    setSp(n, { replace: true });
  };

  const [busqueda, setBusqueda] = useState(sp.get("t_q") ?? "");
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("t_q") ?? "") !== busqueda.trim()) setParam("t_q", busqueda.trim() || null); }, 300);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line

  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [tallaSel, setTallaSel] = useState<{ p: ProductoTiendas; t: TallaTiendas } | null>(null);
  const [solOpen, setSolOpen] = useState(false);
  const [solicitud, setSolicitud] = useState<LineaSolicitud[]>(cargarLS);
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(solicitud)); } catch { /* ignore */ } }, [solicitud]);

  const usuarioQ = useQuery({
    queryKey: ["catalogo-tiendas-usuario"], staleTime: Infinity,
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return "";
      const { data } = await supabase.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      return (data?.full_name as string | null) || (user.user_metadata?.full_name as string | undefined) || user.email || "";
    },
  });
  const usuario = usuarioQ.data ?? "";

  const filtrosQ = useQuery({
    queryKey: ["catalogo-filtros"], staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalogo_filtros" as any);
      if (error) throw error;
      return data as any;
    },
  });
  const opcCat = norm(filtrosQ.data?.categorias);
  const opcTalla = useMemo(() => [...norm(filtrosQ.data?.tallas)].sort((a, b) => compararTallas(a.valor, b.valor)), [filtrosQ.data]);
  const opcGen = norm(filtrosQ.data?.generos);
  const opcCiudad: Opcion[] = CIUDADES.map((c) => ({ valor: c }));

  const params = {
    p_busqueda: sp.get("t_q") || null,
    p_categorias: getList("t_cat").length ? getList("t_cat") : null,
    p_tallas: getList("t_talla").length ? getList("t_talla") : null,
    p_ciudades: getList("t_ciudad").length ? getList("t_ciudad") : null,
    p_generos: getList("t_gen").length ? getList("t_gen") : null,
    p_limite: LIMITE,
  };

  const q = useInfiniteQuery({
    queryKey: ["catalogo-tiendas", params],
    initialPageParam: 0, staleTime: 2 * 60 * 1000,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("catalogo_tiendas" as any, { ...params, p_offset: pageParam } as any);
      if (error) throw error;
      const d: any = data ?? {};
      return { total: Number(d.total) || 0, inv: d.inventario_actualizado_en as string | undefined, productos: (d.productos ?? []) as ProductoTiendas[], offset: pageParam as number };
    },
    getNextPageParam: (l) => (l.offset + l.productos.length < l.total && l.productos.length > 0 ? l.offset + LIMITE : undefined),
  });
  const productos = useMemo(() => q.data?.pages.flatMap((p) => p.productos) ?? [], [q.data]);
  const total = q.data?.pages[0]?.total ?? 0;
  const hace = haceTexto(q.data?.pages[0]?.inv);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }, { rootMargin: "600px" });
    io.observe(el); return () => io.disconnect();
  }, [q.hasNextPage, q.isFetchingNextPage]); // eslint-disable-line

  const defs = [
    { k: "t_ciudad", label: "Ciudad", opc: opcCiudad, buscar: false },
    { k: "t_cat", label: "Categoría", opc: opcCat, buscar: true },
    { k: "t_talla", label: "Talla", opc: opcTalla, buscar: false },
    { k: "t_gen", label: "Género", opc: opcGen, buscar: false },
  ];
  const chips = defs.flatMap((d) => getList(d.k).map((v) => ({ k: d.k, v, label: `${d.label}: ${v}` })));
  const limpiar = () => { const n = new URLSearchParams(sp); defs.forEach((d) => n.delete(d.k)); n.delete("t_q"); setBusqueda(""); setSp(n, { replace: true }); };

  const filtros = (stacked: boolean) => (
    <div className={cn("gap-2", stacked ? "flex flex-col" : "flex flex-wrap items-center")}>
      {defs.map((d) => (
        <MultiSelect key={d.k} label={d.label} opciones={d.opc} seleccion={getList(d.k)} buscar={d.buscar} stacked={stacked}
          onApply={(v) => setParam(d.k, v.join(",") || null)} />
      ))}
    </div>
  );

  const agregar = (p: ProductoTiendas, t: TallaTiendas, tienda: TallaTiendas["tiendas"][number], cantidad: number) => {
    const key = `${t.sku}|${tienda.location_id}`;
    setSolicitud((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) return prev.map((l) => (l.key === key ? { ...l, cantidad: Math.min(l.max, l.cantidad + cantidad) } : l));
      return [...prev, {
        key, product_id: String(p.product_id), nombre: p.nombre, color: p.color ?? null, imagen: p.imagen ?? null, talla: t.talla, sku: t.sku,
        ns_item_id: t.ns_item_id != null ? String(t.ns_item_id) : null, location_id: String(tienda.location_id), tienda: tienda.tienda,
        ciudad: tienda.ciudad, ns_location_id: tienda.ns_location_id != null ? String(tienda.ns_location_id) : null, cantidad, max: tienda.unidades,
      }];
    });
    toast.success(`Agregado: ${p.nombre} talla ${t.talla} (${tienda.tienda})`);
  };

  const nSol = solicitud.reduce((s, l) => s + l.cantidad, 0);

  const panelTiendas = tallaSel && <PanelTiendas p={tallaSel.p} t={tallaSel.t} onAdd={agregar} />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm px-3 sm:px-6 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <h2 className="text-base sm:text-lg font-semibold text-foreground mr-auto">Catálogo</h2>
              {hace.txt && (
                <span className={cn("text-[11px] sm:text-xs whitespace-nowrap", hace.viejo ? "text-destructive font-medium" : "text-muted-foreground")}>
                  Inventario de tiendas actualizado hace {hace.txt}
                </span>
              )}
            </div>
            {tabs}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o SKU" className="pl-8 h-9" />
                {busqueda && <button aria-label="Borrar búsqueda" onClick={() => setBusqueda("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="h-4 w-4" /></button>}
              </div>
              <Button size="sm" variant="outline" className="h-9 lg:hidden shrink-0" onClick={() => setFiltrosOpen(true)} aria-label="Filtros">
                <SlidersHorizontal className="h-4 w-4" />{chips.length > 0 && <span className="ml-1 text-xs">{chips.length}</span>}
              </Button>
            </div>
          </header>

          <div className="flex-1 min-w-0 p-3 sm:p-5 space-y-3">
            <div className="hidden lg:block">{filtros(false)}</div>
            <p className="text-sm text-muted-foreground">
              {q.isLoading ? "Cargando…" : `${total.toLocaleString("es-CO")} productos con tallas disponibles solo en tiendas`}
            </p>
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {chips.map((c) => (
                  <Badge key={c.k + c.v} variant="secondary" className="gap-1 pr-1 font-normal">
                    {c.label}
                    <button aria-label={`Quitar ${c.label}`} onClick={() => setParam(c.k, getList(c.k).filter((x) => x !== c.v).join(",") || null)} className="rounded-full hover:bg-muted-foreground/20 p-0.5"><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
                <button onClick={limpiar} className="text-xs text-muted-foreground underline underline-offset-2 ml-1">Limpiar todo</button>
              </div>
            )}
            {q.error && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Error al cargar inventario de tiendas: {(q.error as any)?.message ?? String(q.error)}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {q.isLoading
                ? Array.from({ length: 12 }).map((_, i) => <div key={i} className="space-y-2"><Skeleton className="aspect-[4/5] w-full rounded-lg" /><Skeleton className="h-4 w-3/4" /></div>)
                : productos.map((p) => <Tarjeta key={String(p.product_id)} p={p} onTalla={(t) => setTallaSel({ p, t })} />)}
            </div>
            {!q.isLoading && !q.error && productos.length === 0 && <p className="text-center text-sm text-muted-foreground py-16">No hay productos con estos filtros.</p>}
            <div ref={sentinel} className="h-16" />
          </div>
        </main>
      </div>

      <Button onClick={() => setSolOpen(true)} className="fixed bottom-5 right-5 z-30 shadow-lg rounded-full h-11">
        <ShoppingBag className="h-4 w-4 mr-1.5" /> Solicitud ({nSol})
      </Button>

      <Drawer open={filtrosOpen} onOpenChange={setFiltrosOpen}>
        <DrawerContent className="max-h-[85vh] lg:hidden">
          <DrawerHeader className="flex items-center justify-between py-2">
            <DrawerTitle>Filtros</DrawerTitle>
            <Button size="sm" onClick={() => setFiltrosOpen(false)}>Ver {total.toLocaleString("es-CO")}</Button>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{filtros(true)}</div>
        </DrawerContent>
      </Drawer>

      {isMobile ? (
        <Drawer open={!!tallaSel} onOpenChange={(o) => !o && setTallaSel(null)}>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="py-2"><DrawerTitle>{tallaSel?.p.nombre} · Talla {tallaSel?.t.talla}</DrawerTitle></DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">{panelTiendas}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!tallaSel} onOpenChange={(o) => !o && setTallaSel(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{tallaSel?.p.nombre} · Talla {tallaSel?.t.talla}</DialogTitle></DialogHeader>
            {panelTiendas}
          </DialogContent>
        </Dialog>
      )}

      <Drawer open={solOpen} onOpenChange={setSolOpen}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="flex items-center justify-between py-2">
            <DrawerTitle>Solicitud ({nSol} und)</DrawerTitle>
            {solicitud.length > 0 && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setSolicitud([])}>
                <Trash2 className="h-4 w-4 mr-1" /> Vaciar solicitud
              </Button>
            )}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6 mx-auto w-full max-w-3xl">
            {solicitud.length === 0
              ? <p className="text-sm text-muted-foreground py-8 text-center">Aún no agregas tallas. Toca una talla en una tarjeta para ver las tiendas.</p>
              : <Solicitud lineas={solicitud} setLineas={setSolicitud} usuario={usuario} />}
          </div>
        </DrawerContent>
      </Drawer>
    </SidebarProvider>
  );
}

function Tarjeta({ p, onTalla }: { p: ProductoTiendas; onTalla: (t: TallaTiendas) => void }) {
  const tallas = (p.tallas ?? []).map((t) => ({ t, u: (t.tiendas ?? []).reduce((s, x) => s + (Number(x.unidades) || 0), 0) })).filter((x) => x.u > 0);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative">
        <Foto src={p.imagen} alt={p.nombre} className="aspect-[4/5] w-full" />
        {!!p.pct_descuento && p.pct_descuento > 0 && (
          <span className="absolute top-2 left-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-semibold text-destructive-foreground">-{Math.round(p.pct_descuento)}%</span>
        )}
        <span className={cn("absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-[11px] font-medium",
          p.agotado_online ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground")}>
          {p.agotado_online ? "Agotado online" : "Talla agotada online"}
        </span>
      </div>
      <div className="p-2.5 space-y-1.5 flex-1">
        <p className="text-sm font-medium leading-tight line-clamp-2">{p.nombre}</p>
        {p.color && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {p.color_hex && <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ backgroundColor: p.color_hex }} />}{p.color}
          </p>
        )}
        <p className="text-sm font-semibold">
          {formatCOP(p.precio)}
          {!!p.precio_antes && p.precio_antes > p.precio && <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">{formatCOP(p.precio_antes)}</span>}
        </p>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {tallas.map(({ t, u }) => (
            <button key={t.sku} onClick={() => onTalla(t)}
              className="rounded border border-border px-1.5 py-0.5 text-xs hover:border-primary hover:bg-primary/10 transition-colors">
              {t.talla} · <span className="font-semibold">{u}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PanelTiendas({ p, t, onAdd }: { p: ProductoTiendas; t: TallaTiendas; onAdd: (p: ProductoTiendas, t: TallaTiendas, tienda: TallaTiendas["tiendas"][number], c: number) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, TallaTiendas["tiendas"]>();
    (t.tiendas ?? []).filter((x) => Number(x.unidades) > 0).forEach((x) => { const c = x.ciudad || "Sin ciudad"; m.set(c, [...(m.get(c) ?? []), x]); });
    return [...m.entries()];
  }, [t]);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">SKU {t.sku}</p>
      {grupos.map(([ciudad, tiendas]) => (
        <div key={ciudad} className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ciudad}</p>
          {tiendas.map((x) => <FilaTienda key={String(x.location_id)} x={x} onAdd={(c) => onAdd(p, t, x, c)} />)}
        </div>
      ))}
    </div>
  );
}

function Stepper({ v, max, onChange }: { v: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-md border border-border">
      <button aria-label="Menos" className="px-1.5 py-1 disabled:opacity-40" disabled={v <= 1} onClick={() => onChange(v - 1)}><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-7 text-center text-sm tabular-nums">{v}</span>
      <button aria-label="Más" className="px-1.5 py-1 disabled:opacity-40" disabled={v >= max} onClick={() => onChange(v + 1)}><Plus className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function FilaTienda({ x, onAdd }: { x: TallaTiendas["tiendas"][number]; onAdd: (c: number) => void }) {
  const [c, setC] = useState(1);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border p-2">
      <Store className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{x.tienda}</p>
        <p className="text-xs text-muted-foreground">{x.unidades} und</p>
      </div>
      <Stepper v={c} max={Number(x.unidades)} onChange={setC} />
      <Button size="sm" className="h-8" onClick={() => onAdd(c)}>Agregar a solicitud</Button>
    </div>
  );
}

function Solicitud({ lineas, setLineas, usuario }: { lineas: LineaSolicitud[]; setLineas: React.Dispatch<React.SetStateAction<LineaSolicitud[]>>; usuario: string }) {
  const grupos = useMemo(() => {
    const m = new Map<string, LineaSolicitud[]>();
    lineas.forEach((l) => m.set(l.location_id, [...(m.get(l.location_id) ?? []), l]));
    return [...m.values()];
  }, [lineas]);

  const copiar = async (ls: LineaSolicitud[]) => {
    try { await navigator.clipboard.writeText(mensajeTienda(ls[0].tienda, ls, usuario)); toast.success("Mensaje copiado"); }
    catch { toast.error("No se pudo copiar al portapapeles"); }
  };
  const descargar = (ls: LineaSolicitud[]) => {
    const r = csvTraslado(ls, usuario);
    if (r.excluidas.length) {
      toast.warning(`Quedaron fuera del CSV (sin ID NetSuite de ${ls[0].ns_location_id ? "artículo" : "tienda"}): ${r.excluidas.map((l) => `${l.sku}`).join(", ")}`, { duration: 8000 });
    }
    if (!r.incluidas.length) { toast.error("Ninguna línea tiene los datos de NetSuite necesarios; no se generó el CSV"); return; }
    const blob = new Blob([r.contenido], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = r.nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="space-y-5">
      {grupos.map((ls) => (
        <div key={ls[0].location_id} className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-sm font-semibold">{ls[0].tienda}{ls[0].ciudad && <span className="font-normal text-muted-foreground"> · {ls[0].ciudad}</span>}</p>
          {ls.map((l) => (
            <div key={l.key} className="flex items-center gap-2">
              <Foto src={l.imagen} alt={l.nombre} className="h-12 w-10 rounded shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{l.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">{l.color ? `${l.color} · ` : ""}Talla {l.talla} · SKU {l.sku}</p>
              </div>
              <Stepper v={l.cantidad} max={l.max} onChange={(n) => setLineas((p) => p.map((x) => (x.key === l.key ? { ...x, cantidad: n } : x)))} />
              <button aria-label="Quitar" className="text-muted-foreground hover:text-destructive p-1" onClick={() => setLineas((p) => p.filter((x) => x.key !== l.key))}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => copiar(ls)}><Copy className="h-4 w-4 mr-1" /> Copiar mensaje para la tienda</Button>
            <Button size="sm" variant="outline" onClick={() => descargar(ls)}><Download className="h-4 w-4 mr-1" /> Descargar CSV traslado</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Primero confirma con la tienda que tiene la unidad física; después descarga el CSV</p>
        </div>
      ))}
    </div>
  );
}
