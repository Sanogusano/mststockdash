import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { ArrowDown, ChevronRight, Download, FileText, Store } from "lucide-react";
import { exportarExcel, exportarPDF, nombreArchivo, type Celda } from "@/lib/distribucion-export";
import { cn } from "@/lib/utils";

type Embudo = Database["public"]["Functions"]["reporte_distribucion_embudo"]["Returns"][number];
type Linea = Database["public"]["Functions"]["reporte_distribucion_lineas"]["Returns"][number];
type Producto = Database["public"]["Functions"]["reporte_distribucion_productos"]["Returns"][number];
type Reparto = Database["public"]["Functions"]["reporte_distribucion_reparto"]["Returns"][number];

const entero = (n: number | null | undefined) => n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 0 });
const pct = (n: number | null | undefined) => n == null ? "—" : `${Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;
const cop = (n: number | null | undefined) => n == null ? "—" : `$ ${entero(n)}`;
const fecha = (v: string) => v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ventanas = [90, 120, 180, 365];
const salud = (n: number | null) => n == null ? "text-muted-foreground" : n > 75 ? "text-success" : n >= 60 ? "text-warning" : "text-destructive";

function ErrorBox({ error }: { error: unknown }) {
  return <p role="alert" className="border border-destructive/30 p-3 text-sm text-destructive">{String((error as { message?: string })?.message ?? error)}</p>;
}

function Migas({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {items.filter(n => n.label).map((n, i) => (
        <span key={n.label + i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight className="h-4 w-4" />}
          {n.onClick ? (
            <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-foreground" onClick={n.onClick}>{n.label}</Button>
          ) : (
            <span className="font-medium text-foreground">{n.label}</span>
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

/** Barra verde con tramo final rojo proporcional al % desviado (solo representación visual). */
function BarraDesvio({ despachadas, maximo, pctDesviado }: { despachadas: number | null; maximo: number; pctDesviado: number | null }) {
  const ancho = maximo > 0 ? Math.max(2, (Number(despachadas ?? 0) / maximo) * 100) : 0;
  const rojo = Math.min(100, Math.max(0, Number(pctDesviado ?? 0)));
  return (
    <div className="min-w-[160px]">
      <div className="h-3 w-full bg-muted">
        <div className="flex h-full" style={{ width: `${ancho}%` }}>
          <div className="h-full bg-success" style={{ width: `${100 - rojo}%` }} />
          <div className="h-full bg-destructive" style={{ width: `${rojo}%` }} />
        </div>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{entero(despachadas)} despachadas</p>
    </div>
  );
}

const colorVeredicto = (v: string) => {
  const s = (v ?? "").toUpperCase();
  return s.includes("FALTAR") ? "bg-warning" : s.includes("SOBRAR") ? "bg-destructive" : "bg-primary";
};

/** Barra de recibidas con marca vertical en las unidades que debió recibir. */
function BarraReparto({ row, maximo }: { row: Reparto; maximo: number }) {
  const rec = Number(row.uds_recibidas ?? 0), debio = Number(row.uds_debio ?? 0);
  const w = maximo > 0 ? (rec / maximo) * 100 : 0;
  const marca = maximo > 0 ? (debio / maximo) * 100 : 0;
  return (
    <div className="flex min-w-[220px] items-center gap-2">
      <div className="relative h-4 flex-1 bg-muted">
        <div className={cn("h-full", colorVeredicto(row.veredicto))} style={{ width: `${Math.min(100, w)}%` }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-foreground" style={{ left: `${Math.min(100, marca)}%` }} title={`Debió recibir ${entero(debio)}`} />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{entero(rec)} / {entero(debio)}</span>
    </div>
  );
}

function Veredictos({ faltaron, sobraron, ajustadas }: { faltaron: number | null; sobraron: number | null; ajustadas?: number | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-warning">{entero(faltaron)} faltaron</span> · <span className="text-destructive">{entero(sobraron)} sobraron</span>
      {ajustadas != null && <> · <span>{entero(ajustadas)} ajustadas</span></>}
    </p>
  );
}

const embudoColumns: [string, string][] = [["coleccion", "Colección"], ["producido", "Producido"], ["distribuido", "Distribuido"], ["tiendas_alcanzadas", "Tiendas"], ["vendido_total", "Vendido"], ["pct_vendido", "% Vendido"], ["pct_sin_rebaja", "% Sin rebaja"], ["vendido_full", "Precio pleno"], ["vendido_promo", "Promoción"], ["vendido_rebaja", "Rebajado"], ["stock_tienda", "En tienda"], ["valor_parado", "Valor parado ($ COP)"], ["stock_online", "En online"], ["stock_outlet", "En outlet"], ["stock_bodega", "En bodega"], ["antiguedad_ponderada", "Días ponderados"], ["n_drops", "Drops"], ["primer_drop", "Primer drop"], ["ultimo_drop", "Último drop"]];
const lineaColumns: [string, string][] = [["linea", "Línea"], ["uds_despachadas", "Despachadas"], ["uds_desviadas", "Mal ubicadas"], ["pct_desviado", "% Mal ubicadas"], ["uds_vendidas", "Vendidas"], ["sell_through", "Sell-through (%)"], ["stock_actual", "Stock"], ["valor_parado", "Valor parado ($ COP)"], ["productos", "Productos"], ["tiendas", "Tiendas"], ["tiendas_faltaron", "Faltaron"], ["tiendas_sobraron", "Sobraron"], ["tiendas_ajustadas", "Ajustadas"]];
const productoColumns: [string, string][] = [["producto", "Producto"], ["uds_despachadas", "Despachadas"], ["uds_desviadas", "Mal ubicadas"], ["pct_desviado", "% Mal ubicadas"], ["uds_vendidas", "Vendidas"], ["sell_through", "Sell-through (%)"], ["stock_actual", "Stock"], ["valor_parado", "Valor parado ($ COP)"], ["tiendas", "Tiendas"], ["tiendas_faltaron", "Faltaron"], ["tiendas_sobraron", "Sobraron"], ["dias_en_red", "Días en red"]];
const repartoColumns: [string, string][] = [["tienda", "Tienda"], ["tipo_tienda", "Tipo"], ["uds_recibidas", "Recibidas"], ["uds_debio", "Debió recibir"], ["diferencia", "Diferencia"], ["pct_diferencia", "% Diferencia"], ["veredicto", "Veredicto"], ["uds_vendidas", "Vendidas"], ["sell_through", "Sell-through (%)"], ["stock_actual", "Stock"], ["dias_en_tienda", "Días en tienda"]];

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
  const productId = params.get("producto");
  const productoNombre = params.get("nombre");
  const vistaReparto = params.get("vista") === "reparto" || !!productId;
  const rawWindow = Number(params.get("ventana") || 180);
  const ventana = ventanas.includes(rawWindow) ? rawWindow : 180;
  const siguienteRef = useRef<HTMLElement>(null);

  const update = (next: URLSearchParams) => setParams(next);
  const setKeys = (entries: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(entries).forEach(([k, v]) => { if (!v || v === "all") next.delete(k); else next.set(k, v); });
    update(next);
  };
  const bajar = (entries: Record<string, string | null>) => {
    setKeys(entries);
    requestAnimationFrame(() => siguienteRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  };

  const embudoArgs = { p_coleccion: coleccion === "all" ? null : coleccion, p_linea: linea === "all" ? null : linea };

  const embudoQ = useQuery({ queryKey: ["distribucion-embudo", embudoArgs], queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_embudo", embudoArgs); if (error) throw error;
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

  const lineasQ = useQuery({ queryKey: ["distribucion-lineas", coleccion, ventana], enabled: coleccion !== "all", queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_lineas", { p_coleccion: coleccion, p_dias_peso: ventana }); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => Number(b.uds_desviadas) - Number(a.uds_desviadas));
  }, staleTime: 300000 });

  const productosQ = useQuery({ queryKey: ["distribucion-productos", coleccion, linea, ventana], enabled: coleccion !== "all" && linea !== "all", queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_productos", { p_coleccion: coleccion, p_linea: linea, p_dias_peso: ventana }); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => Number(b.uds_desviadas) - Number(a.uds_desviadas));
  }, staleTime: 300000 });

  const repartoQ = useQuery({ queryKey: ["distribucion-reparto", coleccion, linea, productId, ventana], enabled: coleccion !== "all" && vistaReparto, queryFn: async () => {
    const { data, error } = await supabase.rpc("reporte_distribucion_reparto", { p_coleccion: coleccion, p_linea: linea === "all" ? null : linea, p_product_id: productId ?? null, p_dias_peso: ventana }); if (error) throw error;
    return [...(data ?? [])].sort((a, b) => Number(b.uds_debio) - Number(a.uds_debio));
  }, staleTime: 300000 });

  const subtitle = `${coleccion === "all" ? "Todas las colecciones" : coleccion} · ${linea === "all" ? "Todas las líneas" : linea}${productoNombre ? ` · ${productoNombre}` : ""} · peso ${ventana} días`;

  const migas = [
    { label: "Colecciones", onClick: coleccion !== "all" ? () => setKeys({ coleccion: null, linea: null, producto: null, nombre: null, vista: null }) : undefined },
    ...(coleccion !== "all" ? [{ label: coleccion, onClick: (linea !== "all" || vistaReparto) ? () => setKeys({ linea: null, producto: null, nombre: null, vista: null }) : undefined }] : []),
    ...(linea !== "all" ? [{ label: linea, onClick: (productId || vistaReparto) ? () => setKeys({ producto: null, nombre: null, vista: null }) : undefined }] : []),
    ...(vistaReparto ? [{ label: productoNombre ?? "Reparto por tienda" }] : []),
  ];

  const maxLinea = Math.max(1, ...(lineasQ.data ?? []).map(r => Number(r.uds_despachadas ?? 0)));
  const maxProducto = Math.max(1, ...(productosQ.data ?? []).map(r => Number(r.uds_despachadas ?? 0)));
  const maxReparto = Math.max(1, ...(repartoQ.data ?? []).flatMap(r => [Number(r.uds_recibidas ?? 0), Number(r.uds_debio ?? 0)]));

  const botonReparto = coleccion !== "all" && !vistaReparto
    ? <Button variant="outline" size="sm" onClick={() => setKeys({ vista: "reparto" })}><Store className="mr-2 h-4 w-4" />Ver reparto por tienda</Button>
    : null;

  return <SidebarProvider><div className="flex min-h-screen w-full bg-background"><AppSidebar /><main className="min-w-0 flex-1">
    <header className="flex items-center gap-3 border-b border-border p-4 sm:px-6"><SidebarTrigger /><h1 className="text-lg font-semibold">Distribución</h1></header>
    <div className="px-4 pb-2 pt-3 sm:px-6"><Migas items={migas} /></div>
    <div className="space-y-8 p-4 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        {([["coleccion", "Colección", coleccion, [...new Set([...(opcionesQ.data?.colecciones ?? []), ...(embudoQ.data ?? []).map(r => r.coleccion), ...(coleccion !== "all" ? [coleccion] : [])])]],
           ["linea", "Línea", linea, [...new Set([...(lineasQ.data ?? []).map(r => r.linea), ...(opcionesQ.data?.lineas ?? []), ...(linea !== "all" ? [linea] : [])])]]] as [string, string, string, string[]][])
          .map(([key, label, value, options]) => <div key={key} className="space-y-1"><label className="text-xs text-muted-foreground" htmlFor={`filter-${key}`}>{label}</label>
            <Select value={value} onValueChange={v => setKeys(key === "coleccion" ? { coleccion: v, linea: null, producto: null, nombre: null, vista: null } : { linea: v, producto: null, nombre: null, vista: null })}>
              <SelectTrigger id={`filter-${key}`} className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{key === "coleccion" ? "Todas las colecciones" : "Todas las líneas"}</SelectItem>{options.filter(Boolean).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select></div>)}
        <div className="space-y-1"><label htmlFor="filter-window" className="text-xs text-muted-foreground">Ventana de peso</label>
          <Select value={String(ventana)} onValueChange={v => setKeys({ ventana: v })}><SelectTrigger id="filter-window" className="w-[150px]"><SelectValue /></SelectTrigger><SelectContent>{ventanas.map(v => <SelectItem key={v} value={String(v)}>{v} días</SelectItem>)}</SelectContent></Select></div>
        {botonReparto}
      </div>
      {opcionesQ.error && <ErrorBox error={opcionesQ.error} />}

      {vistaReparto ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-semibold">Reparto por tienda{productoNombre ? ` · ${productoNombre}` : linea !== "all" ? ` · ${linea}` : ""}</h2>
              <p className="text-xs text-muted-foreground">Debió recibir = peso histórico de la tienda en los últimos {ventana} días, ajustado por su sell-through. Umbrales: 15% sobraron · 20% faltaron.</p></div>
            <Exportaciones title="Reparto por tienda" columns={repartoColumns} rows={repartoQ.data ?? []} subtitle={subtitle} />
          </div>
          {repartoQ.isLoading ? <LoadingState /> : repartoQ.error ? <ErrorBox error={repartoQ.error} /> : !repartoQ.data?.length ? <EmptyState message="Sin tiendas con estos filtros" /> :
            <ul className="divide-y divide-border rounded-lg border border-border">
              {repartoQ.data.map(r => <li key={r.location_id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[180px] flex-1"><p className="font-medium">{r.tienda}</p><p className="text-xs text-muted-foreground">{r.tipo_tienda}</p></div>
                <BarraReparto row={r} maximo={maxReparto} />
                <div className="min-w-[150px] text-right">
                  <p className={cn("text-sm font-medium", (r.veredicto ?? "").toUpperCase().includes("SOBRAR") ? "text-destructive" : (r.veredicto ?? "").toUpperCase().includes("FALTAR") ? "text-warning" : "text-muted-foreground")}>
                    {(r.veredicto ?? "").toUpperCase().includes("SOBRAR") ? `sobraron ${entero(Math.abs(Number(r.diferencia ?? 0)))}` : (r.veredicto ?? "").toUpperCase().includes("FALTAR") ? `faltaron ${entero(Math.abs(Number(r.diferencia ?? 0)))}` : "ajustado"}
                  </p>
                  <p className="text-xs text-muted-foreground">Sell-through {pct(r.sell_through)} · Stock {entero(r.stock_actual)}</p>
                </div>
              </li>)}
            </ul>}
        </section>
      ) : coleccion !== "all" && linea !== "all" ? (
        <section ref={siguienteRef} className="scroll-mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Productos · {linea}</h2><Exportaciones title="Productos" columns={productoColumns} rows={productosQ.data ?? []} subtitle={subtitle} /></div>
          {productosQ.isLoading ? <LoadingState /> : productosQ.error ? <ErrorBox error={productosQ.error} /> : !productosQ.data?.length ? <EmptyState message="Sin productos con estos filtros" /> :
            <ul className="divide-y divide-border rounded-lg border border-border">
              {productosQ.data.map((r: Producto) => <li key={r.product_id} className="flex flex-wrap items-center gap-4 p-4">
                {r.foto ? <ProductImageThumb src={r.foto} alt={r.producto} productId={r.product_id} title={r.producto} className="h-14 w-14 shrink-0 rounded object-cover" /> : <div className="h-14 w-14 shrink-0 rounded bg-muted" />}
                <div className="min-w-[180px] flex-1">
                  <Button variant="link" className="h-auto whitespace-normal p-0 text-left font-medium text-foreground" onClick={() => bajar({ producto: r.product_id, nombre: r.producto, vista: "reparto" })}>{r.producto}</Button>
                  <p className="text-xs text-muted-foreground">{entero(r.dias_en_red)} días en red · {entero(r.tiendas)} tiendas</p>
                </div>
                <BarraDesvio despachadas={r.uds_despachadas} maximo={maxProducto} pctDesviado={r.pct_desviado} />
                <div className="min-w-[190px] text-right">
                  <p className="text-sm font-medium tabular-nums">{pct(r.pct_desviado)} mal ubicadas</p>
                  <p className={cn("text-xs", salud(r.sell_through))}>Sell-through {pct(r.sell_through)}</p>
                  <Veredictos faltaron={r.tiendas_faltaron} sobraron={r.tiendas_sobraron} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => bajar({ producto: r.product_id, nombre: r.producto, vista: "reparto" })}><ChevronRight className="h-4 w-4" /></Button>
              </li>)}
            </ul>}
        </section>
      ) : coleccion !== "all" ? (
        <section ref={siguienteRef} className="scroll-mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Líneas · {coleccion}</h2><Exportaciones title="Líneas" columns={lineaColumns} rows={lineasQ.data ?? []} subtitle={subtitle} /></div>
          {lineasQ.isLoading ? <LoadingState /> : lineasQ.error ? <ErrorBox error={lineasQ.error} /> : !lineasQ.data?.length ? <EmptyState message="Sin líneas con estos filtros" /> :
            <ul className="divide-y divide-border rounded-lg border border-border">
              {lineasQ.data.map((r: Linea) => <li key={r.linea} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-[160px] flex-1">
                  <Button variant="link" className="h-auto whitespace-normal p-0 text-left font-medium text-foreground" onClick={() => bajar({ linea: r.linea, producto: null, nombre: null, vista: null })}>{r.linea}</Button>
                  <p className="text-xs text-muted-foreground">{entero(r.productos)} productos · {cop(r.valor_parado)} parados</p>
                </div>
                <BarraDesvio despachadas={r.uds_despachadas} maximo={maxLinea} pctDesviado={r.pct_desviado} />
                <div className="min-w-[210px] text-right">
                  <p className="text-sm font-medium tabular-nums">{pct(r.pct_desviado)} mal ubicadas</p>
                  <p className={cn("text-xs", salud(r.sell_through))}>Sell-through {pct(r.sell_through)}</p>
                  <Veredictos faltaron={r.tiendas_faltaron} sobraron={r.tiendas_sobraron} ajustadas={r.tiendas_ajustadas} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => bajar({ linea: r.linea, producto: null, nombre: null, vista: null })}><ChevronRight className="h-4 w-4" /></Button>
              </li>)}
            </ul>}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Embudo de colección</h2><Exportaciones title="Embudo de colección" columns={embudoColumns} rows={embudoQ.data ?? []} subtitle={subtitle} /></div>
          {embudoQ.isLoading ? <LoadingState /> : embudoQ.error ? <ErrorBox error={embudoQ.error} /> : !embudoQ.data?.length ? <EmptyState message="Sin colecciones con estos filtros" /> :
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{embudoQ.data.map(r => <article key={r.coleccion} className="rounded-lg border border-border bg-card p-5">
              <Button variant="ghost" className="h-auto w-full justify-between whitespace-normal p-0 text-left text-base font-semibold" onClick={() => bajar({ coleccion: r.coleccion, linea: null, producto: null, nombre: null, vista: null })}>{r.coleccion}<ArrowDown className="h-4 w-4 shrink-0" /></Button>
              <p className="mt-2 text-xs text-muted-foreground">{entero(r.antiguedad_ponderada)} días promedio ponderados por unidades</p>
              <p className="mt-1 text-xs text-muted-foreground">{entero(r.n_drops)} drops · {fecha(r.primer_drop)} – {fecha(r.ultimo_drop)}</p>
              <div className="my-5 grid grid-cols-2 gap-4 border-y border-border py-3">
                <div><p className="text-2xl font-semibold tabular-nums">{pct(r.pct_vendido)}</p><p className="text-xs text-muted-foreground">Vendido</p></div>
                <div><p className={cn("text-2xl font-semibold tabular-nums", salud(r.pct_sin_rebaja))}>{pct(r.pct_sin_rebaja)}</p><p className="text-xs text-muted-foreground">Sin rebaja</p><p className="text-[10px] text-muted-foreground">Precio pleno + promoción</p></div>
              </div>
              <Recorrido row={r} />
            </article>)}</div>}
        </section>
      )}
    </div>
  </main></div></SidebarProvider>;
}
