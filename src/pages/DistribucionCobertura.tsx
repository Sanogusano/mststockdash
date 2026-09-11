import { Fragment, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowDown, ChevronDown, ChevronRight, Download, FileText } from "lucide-react";
import { exportarExcel, exportarPDF, nombreArchivo, type Celda } from "@/lib/distribucion-export";
import { cn } from "@/lib/utils";

type Embudo = Database["public"]["Functions"]["reporte_distribucion_embudo"]["Returns"][number];
type Tienda = Database["public"]["Functions"]["reporte_distribucion_tiendas"]["Returns"][number];
type Curva = Database["public"]["Functions"]["reporte_distribucion_curva_tallas"]["Returns"][number];
const entero = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
const pct = (n: number | null | undefined) => n == null ? "—" : `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const cop = (n: number | null | undefined) => n == null ? "—" : `$ ${entero(n)}`;
const fecha = (v: string) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ventanas = [60, 90, 120, 180];
const salud = (n: number | null) => n == null ? "text-muted-foreground" : n > 75 ? "text-success" : n >= 60 ? "text-warning" : "text-destructive";
function Badge({ value }: { value: string }) {
  const s = (value ?? "").toUpperCase();
  const color = s.includes("SUBIR") || s === "FALTA" ? "text-destructive bg-destructive/10" : s.includes("BAJAR") || s === "SOBRA" ? "text-warning bg-warning/10" : s.includes("REVISAR") ? "distribution-mix" : s.includes("MANTENER") ? "text-success bg-success/10" : "text-muted-foreground bg-muted";
  return <span className={cn("inline-flex rounded px-2 py-1 text-xs font-medium", color)}>{value || "—"}</span>;
}
function Barra({ row }: { row: Tienda }) {
  return <div className="min-w-[180px]"><div className="flex h-3"><div className="flex w-1/2 justify-end border-r border-border bg-muted"><div className="bg-destructive" style={{ width: `${Math.min(100, Math.max(0, row.pct_agotados ?? 0))}%` }} /></div><div className="w-1/2 bg-muted"><div className="h-full bg-muted-foreground" style={{ width: `${Math.min(100, Math.max(0, row.pct_parados ?? 0))}%` }} /></div></div><div className="mt-1 flex justify-between gap-3 text-[10px]"><span className="text-destructive">{pct(row.pct_agotados)} agotados</span><span className="text-muted-foreground">{pct(row.pct_parados)} parados</span></div></div>;
}
function ErrorBox({ error }: { error: unknown }) {
  return <p role="alert" className="border border-destructive/30 p-3 text-sm text-destructive">{String((error as { message?: string })?.message ?? error)}</p>;
}
function Migas({ coleccion, tienda, onClick }: { coleccion: string | null; tienda: string | null; onClick: (key: "coleccion" | "tienda") => void }) {
  type Nivel = { label: string; key?: "coleccion" | "tienda"; active: boolean };
  const niveles: Nivel[] = ([
    { label: "Colecciones", active: !coleccion },
    { label: coleccion ?? "", key: "coleccion", active: !!coleccion && !tienda },
    { label: tienda ?? "", key: "tienda", active: !!tienda },
  ] as Nivel[]).filter((n) => n.label);
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {niveles.map((n, i) => (
        <span key={n.label + i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-4 w-4" />}
          {n.key && !n.active ? (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground" onClick={() => onClick(n.key!)}>{n.label}</Button>
          ) : (
            <span className={cn("font-medium", n.active && "text-foreground")}>{n.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
function Recorrido({ row }: { row: Embudo }) {
  const totalExistencias = (row.stock_tienda ?? 0) + (row.stock_online ?? 0) + (row.stock_outlet ?? 0) + (row.stock_bodega ?? 0);
  const items: [string, number, string?, boolean?, boolean?][] = [
    ["Producido", row.producido], ["Distribuido", row.distribuido, `a ${entero(row.tiendas_alcanzadas)} tiendas`],
    ["Vendido", row.vendido_total, pct(row.pct_vendido)], ["Precio pleno", row.vendido_full, undefined, true],
    ["Promoción", row.vendido_promo, undefined, true], ["Rebajado", row.vendido_rebaja, undefined, true],
    ["En tienda", row.stock_tienda, `${cop(row.valor_parado)} parados`], ["En online", row.stock_online],
    ["En outlet", row.stock_outlet], ["En bodega", row.stock_bodega],
    ["Total existencias", totalExistencias, undefined, false, true],
  ];
  return <dl className="space-y-2 text-sm">{items.map(([label, value, hint, child, total], i) => <div key={label} className={cn("grid grid-cols-[1fr_auto] gap-x-3", i > 0 && !total && "border-l border-border pl-3", child && "ml-4 text-xs text-muted-foreground", total && "border-t border-border pt-2 mt-2 font-semibold")}><dt>{label}</dt><dd className="font-medium tabular-nums">{entero(value)}</dd>{hint && <dd className="col-span-2 text-right text-[11px] text-muted-foreground">{hint}</dd>}</div>)}</dl>;
}
const embudoColumns: [keyof Embudo, string][] = [["coleccion", "Colección"], ["producido", "Producido"], ["distribuido", "Distribuido"], ["tiendas_alcanzadas", "Tiendas"], ["vendido_total", "Vendido"], ["pct_vendido", "% Vendido"], ["pct_sin_rebaja", "% Sin rebaja"], ["vendido_full", "Precio pleno"], ["vendido_promo", "Promoción"], ["vendido_rebaja", "Rebajado"], ["stock_tienda", "En tienda"], ["valor_parado", "Valor parado ($ COP)"], ["stock_online", "En online"], ["stock_outlet", "En outlet"], ["stock_bodega", "En bodega"], ["antiguedad_ponderada", "Días ponderados"], ["n_drops", "Drops"], ["primer_drop", "Primer drop"], ["ultimo_drop", "Último drop"]];
const tiendaColumns: [keyof Tienda, string][] = [["tienda", "Tienda"], ["conclusion", "Conclusión"], ["accion", "Acción"], ["valor_parado", "Valor parado ($ COP)"], ["pct_agotados", "% Agotados"], ["pct_parados", "% Parados"], ["uds_recibidas", "Recibidas"], ["uds_vendidas", "Vendidas"], ["uds_salieron", "Salieron"], ["uds_a_outlet", "A outlet"], ["stock_actual", "Stock"], ["sell_through", "Sell-through (%)"]];
const curvaColumns: [keyof Curva, string][] = [["talla", "Talla"], ["skus", "SKU"], ["uds_recibidas", "Recibidas"], ["uds_vendidas", "Vendidas"], ["stock_actual", "Stock"], ["sell_through", "Sell-through (%)"], ["pct_agotada", "% agotada"], ["veredicto", "Veredicto"], ["sugerencia", "Sugerencia"]];
function Exportaciones({ title, columns, rows, subtitle }: { title: string; columns: [string, string][]; rows: object[]; subtitle: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = async (pdf: boolean) => {
    setBusy(true); setError(null);
    try {
      const body: Celda[][] = rows.map(r => columns.map(([key]) => (r as Record<string, Celda>)[key] ?? null));
      const args = { titulo: title, subtitulo: subtitle, head: columns.map(c => c[1]), body, archivo: nombreArchivo(`Distribución ${title}`) };
      await (pdf ? exportarPDF(args) : exportarExcel(args));
    } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-center gap-2"><Button variant="outline" size="sm" disabled={busy || !rows.length} onClick={() => void run(false)}><Download className="mr-2 h-4 w-4" />Excel</Button><Button variant="outline" size="sm" disabled={busy || !rows.length} onClick={() => void run(true)}><FileText className="mr-2 h-4 w-4" />PDF</Button>{error != null && <ErrorBox error={error} />}</div>;
}
export default function DistribucionCoberturaPage() {
  const [params, setParams] = useSearchParams();
  const coleccion = params.get("coleccion") || "all";
  const linea = params.get("linea") || "all";
  const rawWindow = Number(params.get("ventana") || 120);
  const ventana = ventanas.includes(rawWindow) ? rawWindow : 120;
  const location = params.get("tienda");
  const [expanded, setExpanded] = useState<string | null>(null);
  const tiendasRef = useRef<HTMLElement>(null);
  const args = { p_coleccion: coleccion === "all" ? null : coleccion, p_linea: linea === "all" ? null : linea };
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all" || !value) next.delete(key); else next.set(key, value);
    if (key !== "tienda") { next.delete("tienda"); setExpanded(null); }
    setParams(next);
  };
  const embudoQ = useQuery({ queryKey: ["distribucion-embudo", args], queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_embudo", args); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => Number(b.producido) - Number(a.producido));
  }, staleTime: 300000 });
  const opcionesQ = useQuery({ queryKey: ["distribucion-filtros-catalogo"], queryFn: async () => {
    const collections = new Set<string>(); const lines = new Set<string>();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("product_catalog").select("collection_season,category,categoria_padre").order("sku").range(from, from + 999);
      if (error) throw error;
      (data ?? []).forEach(r => { if (r.collection_season) collections.add(r.collection_season); if (r.category && !["BOLSA", "INSUMOS", "FRAGANCE", "GIFT CARDS", "NFT"].includes(r.category.toUpperCase())) lines.add(r.categoria_padre ?? r.category.toUpperCase()); });
      if (!data || data.length < 1000) break;
    }
    return { colecciones: [...collections].sort(), lineas: [...lines].sort() };
  }, staleTime: 600000 });
  const tiendasQ = useQuery({ queryKey: ["distribucion-tiendas", args, ventana], queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_tiendas", { ...args, p_dias_ventana: ventana }); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => Number(b.valor_parado) - Number(a.valor_parado));
  }, staleTime: 300000 });
  const curvaQ = useQuery({ queryKey: ["distribucion-curva", location, args], enabled: !!location, queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_curva_tallas", { ...args, p_location_id: location }); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.talla.localeCompare(b.talla, "es", { numeric: true }));
  }, staleTime: 300000 });
  const subtitle = `${coleccion === "all" ? "Todas las colecciones" : coleccion} · ${linea === "all" ? "Todas las líneas" : linea} · ${ventana} días`;
  const selectedStore = tiendasQ.data?.find(t => t.location_id === location);
  return <SidebarProvider><div className="flex min-h-screen w-full bg-background"><AppSidebar /><main className="min-w-0 flex-1">
    <header className="flex items-center gap-3 border-b border-border p-4 sm:px-6"><SidebarTrigger /><h1 className="text-lg font-semibold">Distribución</h1></header>
    <div className="px-4 pb-2 pt-3 sm:px-6">
      <Migas coleccion={coleccion === "all" ? null : coleccion} tienda={location ? (selectedStore?.tienda ?? location) : null} onClick={key => update(key, key === "coleccion" ? "all" : "")} />
    </div>
    <div className="space-y-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">{([["coleccion", "Colección", coleccion, [...new Set([...(opcionesQ.data?.colecciones ?? []), ...(embudoQ.data ?? []).map(r => r.coleccion), ...(coleccion !== "all" ? [coleccion] : [])])]], ["linea", "Línea", linea, [...new Set([...(opcionesQ.data?.lineas ?? []), ...(linea !== "all" ? [linea] : [])])]]] as [string, string, string, string[]][]).map(([key, label, value, options]) => <div key={key} className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor={`filter-${key}`}>{label}</label><Select value={value} onValueChange={v => update(key, v)}><SelectTrigger id={`filter-${key}`} className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{key === "coleccion" ? "Todas las colecciones" : "Todas las líneas"}</SelectItem>{options.filter(Boolean).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>)}
        <div className="space-y-1"><label htmlFor="filter-window" className="text-xs text-muted-foreground">Ventana</label><Select value={String(ventana)} onValueChange={v => update("ventana", v)}><SelectTrigger id="filter-window" className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{ventanas.map(v => <SelectItem key={v} value={String(v)}>{v} días</SelectItem>)}</SelectContent></Select></div>
      </div>
      {opcionesQ.error && <ErrorBox error={opcionesQ.error} />}
      {location ? <section className="space-y-4"><Button variant="ghost" onClick={() => update("tienda", "")}><ArrowLeft className="mr-2 h-4 w-4" />Volver a tiendas</Button><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Curva de tallas · {selectedStore?.tienda ?? location}</h2><Exportaciones title="Curva de tallas" columns={curvaColumns} rows={curvaQ.data ?? []} subtitle={`${selectedStore?.tienda ?? location} · ${subtitle}`} /></div>
        {curvaQ.isLoading ? <LoadingState /> : curvaQ.error ? <ErrorBox error={curvaQ.error} /> : !curvaQ.data?.length ? <EmptyState message="Sin tallas con estos filtros" /> : <Table><TableHeader><TableRow>{curvaColumns.map(([, label]) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{curvaQ.data.map(r => <TableRow key={r.talla}><TableCell className="font-semibold">{r.talla}</TableCell><TableCell>{entero(r.skus)}</TableCell><TableCell>{entero(r.uds_recibidas)}</TableCell><TableCell>{entero(r.uds_vendidas)}</TableCell><TableCell>{entero(r.stock_actual)}</TableCell><TableCell>{pct(r.sell_through)}</TableCell><TableCell>{pct(r.pct_agotada)}</TableCell><TableCell><Badge value={r.veredicto} /></TableCell><TableCell className="min-w-[240px] text-sm">{r.sugerencia || "—"}</TableCell></TableRow>)}</TableBody></Table>}
      </section> : <>
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Embudo de colección</h2><Exportaciones title="Embudo de colección" columns={embudoColumns} rows={embudoQ.data ?? []} subtitle={subtitle} /></div>
          {embudoQ.isLoading ? <LoadingState /> : embudoQ.error ? <ErrorBox error={embudoQ.error} /> : !embudoQ.data?.length ? <EmptyState message="Sin colecciones con estos filtros" /> : <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{embudoQ.data.map(r => <article key={r.coleccion} className="rounded-lg border border-border bg-card p-5"><Button variant="ghost" className="h-auto w-full justify-between whitespace-normal p-0 text-left text-base font-semibold" onClick={() => { update("coleccion", r.coleccion); requestAnimationFrame(() => tiendasRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })); }}>{r.coleccion}<ArrowDown className="h-4 w-4 shrink-0" /></Button><p className="mt-2 text-xs text-muted-foreground">{entero(r.antiguedad_ponderada)} días promedio ponderados por unidades</p><p className="mt-1 text-xs text-muted-foreground">{entero(r.n_drops)} drops · {fecha(r.primer_drop)} – {fecha(r.ultimo_drop)}</p><div className="my-5 grid grid-cols-2 gap-4 border-y border-border py-3"><div><p className="text-2xl font-semibold tabular-nums">{pct(r.pct_vendido)}</p><p className="text-xs text-muted-foreground">Vendido</p></div><div><p className={cn("text-2xl font-semibold tabular-nums", salud(r.pct_sin_rebaja))}>{pct(r.pct_sin_rebaja)}</p><p className="text-xs text-muted-foreground">Sin rebaja</p><p className="text-[10px] text-muted-foreground">Precio pleno + promoción</p></div></div><Recorrido row={r} /></article>)}</div>}
        </section>
        <section ref={tiendasRef} className="scroll-mt-4 space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Tiendas{coleccion !== "all" ? ` · ${coleccion}` : ""}</h2><Exportaciones title="Tiendas" columns={tiendaColumns} rows={tiendasQ.data ?? []} subtitle={subtitle} /></div>
          {tiendasQ.isLoading ? <LoadingState /> : tiendasQ.error ? <ErrorBox error={tiendasQ.error} /> : !tiendasQ.data?.length ? <EmptyState message="Sin tiendas con estos filtros" /> : <Table><TableHeader><TableRow><TableHead>Tienda</TableHead><TableHead className="min-w-[300px]">Conclusión</TableHead><TableHead>Acción</TableHead><TableHead>Agotados / parados</TableHead></TableRow></TableHeader><TableBody>{tiendasQ.data.map(r => <Fragment key={r.location_id}><TableRow><TableCell><Button variant="ghost" className="h-auto justify-start whitespace-normal px-0 text-left" aria-expanded={expanded === r.location_id} onClick={() => setExpanded(expanded === r.location_id ? null : r.location_id)}>{expanded === r.location_id ? <ChevronDown className="mr-2 h-4 w-4 shrink-0" /> : <ChevronRight className="mr-2 h-4 w-4 shrink-0" />}{r.tienda}</Button></TableCell><TableCell className="text-sm leading-relaxed">{r.conclusion || "—"}</TableCell><TableCell><Badge value={r.accion} /></TableCell><TableCell><Barra row={r} /></TableCell></TableRow>{expanded === r.location_id && <TableRow><TableCell colSpan={4} className="bg-muted/30"><div className="flex flex-wrap items-center gap-6 py-3">{([["Recibidas", entero(r.uds_recibidas)], ["Vendidas", entero(r.uds_vendidas)], ["Salieron", entero(r.uds_salieron)], ["A outlet", entero(r.uds_a_outlet)], ["Stock", entero(r.stock_actual)], ["Sell-through", pct(r.sell_through)], ["Valor parado", cop(r.valor_parado)]]).map(([label, val]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium tabular-nums">{val}</p></div>)}<Button variant="outline" size="sm" onClick={() => update("tienda", r.location_id)}>Curva de tallas<ChevronRight className="ml-2 h-4 w-4" /></Button></div></TableCell></TableRow>}</Fragment>)}</TableBody></Table>}
        </section>
      </>}
    </div>
  </main></div></SidebarProvider>;
}
