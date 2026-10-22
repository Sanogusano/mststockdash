import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { CrearLoteDialog, ModoLote } from "@/components/precios/CrearLoteDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LotesLista } from "@/components/precios/LotesLista";
import { LoteDetalle } from "@/components/precios/LoteDetalle";
import { useHasPermission } from "@/hooks/useHasPermission";
import { Download, Tags } from "lucide-react";
import * as XLSX from "xlsx";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { cn } from "@/lib/utils";
import { PreciosFiltros, FILTROS_INICIALES, FiltrosState } from "@/components/precios/PreciosFiltros";
import { PreciosTabla } from "@/components/precios/PreciosTabla";
import { PrecioRow, SUGERENCIAS } from "@/components/precios/types";

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

const haceTexto = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} días`;
};

const CARDS: { key: string; title: string; text: string; ring: string; modo: ModoLote | null }[] = [
  { key: "entrar", title: SUGERENCIAS.entrar.card, text: "text-emerald-700", ring: "ring-emerald-400 bg-emerald-50", modo: "sugerido" },
  { key: "subir", title: SUGERENCIAS.subir.card, text: "text-amber-700", ring: "ring-amber-400 bg-amber-50", modo: "poner" },
  { key: "no_admite", title: SUGERENCIAS.no_admite.card, text: "text-red-700", ring: "ring-red-400 bg-red-50", modo: null },
  { key: "quitar", title: SUGERENCIAS.quitar.card, text: "text-sky-700", ring: "ring-sky-400 bg-sky-50", modo: "quitar" },
];

export default function PreciosEcommercePage() {
  const [f, setF] = useState<FiltrosState>(FILTROS_INICIALES);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<ModoLote | null>(null);
  const [modoAbierto, setModoAbierto] = useState<ModoLote>("poner");
  const qc = useQueryClient();
  const { isAdmin } = useUserRole();
  const puedeEditar = useHasPermission({ module: "ecommerce.precios", action: "edit" });
  const puedeGestionar = isAdmin || puedeEditar;
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "lotes" ? "lotes" : "monitor";
  const loteId = sp.get("lote") ? Number(sp.get("lote")) : null;
  const irTab = (t: "monitor" | "lotes") => { const n = new URLSearchParams(); if (t === "lotes") n.set("tab", "lotes"); setSp(n); };
  const abrirLote = (id: number | null) => { const n = new URLSearchParams(); n.set("tab", "lotes"); if (id) n.set("lote", String(id)); setSp(n); };
  const etiqueta = useDebounced(f.etiqueta.trim());
  const buscar = useDebounced(f.buscar.trim());
  const vidaMin = useDebounced(f.vidaMin);
  const vidaMax = useDebounced(f.vidaMax);

  // Opciones de filtros: resultado sin filtros
  const baseQ = useQuery({
    queryKey: ["precios-monitor-base"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("precios_monitor", {});
      if (error) throw error;
      return (data ?? []) as PrecioRow[];
    },
    staleTime: 5 * 60_000,
  });

  const params = {
    p_coleccion: f.coleccion.length ? f.coleccion : null,
    p_tipo: f.tipo.length ? f.tipo : null,
    p_genero: f.genero.length ? f.genero : null,
    p_etiqueta: etiqueta || null,
    p_buscar: buscar || null,
    p_vida_min_sem: vidaMin !== "" ? Number(vidaMin) : null,
    p_vida_max_sem: vidaMax !== "" ? Number(vidaMax) : null,
    p_estado: f.estado === "todos" ? null : f.estado,
    p_sugerencia: null, // se filtra en cliente para que las tarjetas mantengan sus conteos
  };
  const sinFiltros = Object.values(params).every((v) => v == null);

  const dataQ = useQuery({
    queryKey: ["precios-monitor", params],
    enabled: !sinFiltros,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("precios_monitor", params);
      if (error) throw error;
      return (data ?? []) as PrecioRow[];
    },
  });

  const lecturaQ = useQuery({
    queryKey: ["precios-lectura-shopify"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("proceso_ejecucion_log").select("ultima_ejecucion").eq("proceso", "precios_leer_shopify").maybeSingle();
      if (error) throw error;
      return (data?.ultima_ejecucion as string | null) ?? null;
    },
  });

  const base = baseQ.data ?? [];
  const universo = (sinFiltros ? baseQ.data : dataQ.data) ?? [];
  const loading = sinFiltros ? baseQ.isLoading : dataQ.isLoading;
  const error = (sinFiltros ? baseQ.error : dataQ.error) as Error | null;

  const opciones = useMemo(() => {
    const uniq = (k: keyof PrecioRow) => Array.from(new Set(base.map((r) => r[k] as string | null).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "es"));
    return { coleccion: uniq("coleccion"), tipo: uniq("tipo"), genero: uniq("genero") };
  }, [base]);

  const filtradas = useMemo(() => {
    if (f.sugerencia === "todas") return universo;
    return universo.filter((r) => r.sugerencia === f.sugerencia);
  }, [universo, f.sugerencia]);

  useEffect(() => { setSelected(new Set()); }, [filtradas]);

  const resumen = useMemo(() => CARDS.map((c) => {
    const rows = universo.filter((r) => r.sugerencia === c.key);
    return { ...c, productos: rows.length, uds: rows.reduce((s, r) => s + Number(r.stock_guayabal ?? 0), 0) };
  }), [universo]);

  const selRows = useMemo(() => filtradas.filter((r) => selected.has(r.product_id)), [filtradas, selected]);
  const haySugerido = selRows.some((r) => r.dcto_sugerido != null);
  const modoSugerido = CARDS.find((c) => c.key === f.sugerencia)?.modo ?? null;
  const abrir = (m: ModoLote) => { setModoAbierto(m); setModo(m); };

  const exportar = () => {
    const rows = filtradas.map((r) => ({
      Producto: r.producto, "Colección": r.coleccion, Tipo: r.tipo, "Género": r.genero,
      "Vida (sem)": r.semanas_vida, "Precio lista": r.precio_lista, "Precio actual": r.precio_actual,
      "Dcto actual": r.dcto_actual, "Precio uniforme": r.precio_uniforme === false ? "No" : "Sí",
      "Etiqueta HT": r.etiqueta_ht, "Stock Guayabal": r.stock_guayabal, "Venta 28d": r.venta_28d, "Venta 7d": r.venta_7d,
      WOS: r.wos, "Margen actual": r.margen_actual, Efecto: r.efecto,
      Sugerencia: r.sugerencia ? SUGERENCIAS[r.sugerencia]?.label ?? r.sugerencia : "",
      "Dcto sugerido": r.dcto_sugerido, "Precio sugerido": r.precio_sugerido, "Margen sugerido": r.margen_sugerido,
      Costo: r.costo, Etiquetas: (r.etiquetas ?? []).join(", "), Alertas: (r.alertas ?? []).join(" | "),
    }));
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const headers = Object.keys(rows[0]);
    const pctCols = ["Dcto actual", "Margen actual", "Dcto sugerido", "Margen sugerido"];
    const copCols = ["Precio lista", "Precio actual", "Precio sugerido", "Costo"];
    headers.forEach((h, ci) => {
      const fmt = pctCols.includes(h) ? "0%" : copCols.includes(h) ? '"$" #,##0' : h === "WOS" ? "0.0" : null;
      if (!fmt) return;
      for (let ri = 1; ri <= rows.length; ri++) {
        const cell = ws[XLSX.utils.encode_cell({ r: ri, c: ci })];
        if (cell && cell.t === "n") cell.z = fmt;
      }
    });
    ws["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Precios");
    const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    XLSX.writeFile(wb, `precios_ecommerce_${fecha}.xlsx`);
  };

  return (
    <TooltipProvider delayDuration={150}>
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <Tags className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-foreground">Precios Ecommerce</h1>
                <p className="text-xs text-muted-foreground">
                  {lecturaQ.data ? `Precios de Shopify leídos hace ${haceTexto(lecturaQ.data)}` : "Sin registro de lectura de precios de Shopify"}
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={exportar} disabled={!filtradas.length}>
              <Download className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
          </header>

          <div className="px-4 sm:px-6 pt-4">
            <div role="tablist" className="flex gap-1 border-b-2 border-border">
              {([["monitor", "Monitor"], ["lotes", "Lotes"]] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => irTab(k)}
                  className={cn("px-4 py-2 text-sm font-medium rounded-t-md border-2 border-b-0 transition",
                    tab === k ? "relative top-[2px] bg-background border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {tab === "lotes" ? (
            <div className="p-4 sm:p-6">
              {loteId ? <LoteDetalle loteId={loteId} puedeGestionar={puedeGestionar} onBack={() => abrirLote(null)} />
                : <LotesLista onOpen={(id) => abrirLote(id)} />}
            </div>
          ) : (
          <div className="p-4 sm:p-6 space-y-5 pb-24">
            <PreciosFiltros value={f} onChange={setF} opciones={opciones} />

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {resumen.map((c) => {
                const active = f.sugerencia === c.key;
                const toggleCard = () => setF({ ...f, sugerencia: active ? "todas" : c.key });
                return (
                  <Card key={c.key} role="button" tabIndex={0} onClick={toggleCard}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleCard(); }}
                    className={cn("cursor-pointer transition-shadow hover:shadow-md", active && `ring-2 ${c.ring}`)}>
                    <CardHeader className="pb-2"><CardTitle className={cn("text-sm font-medium", c.text)}>{c.title}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-3xl font-semibold tabular-nums">{c.productos.toLocaleString("es-CO")}</div>
                      <p className="text-xs text-muted-foreground mt-1 tabular-nums">productos · {c.uds.toLocaleString("es-CO")} uds en Guayabal</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {f.sugerencia !== "todas" && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setF({ ...f, sugerencia: "todas" })}>Quitar filtro de sugerencia</Button>
            )}


            {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div>
              : loading ? <LoadingState />
              : <PreciosTabla rows={filtradas} selected={selected} onSelectedChange={setSelected} selectable={puedeGestionar} />}
          </div>
          )}

          {tab === "monitor" && puedeGestionar && selected.size > 0 && (
            <div className="sticky bottom-0 mt-auto z-30 shadow-[0_-4px_12px_hsl(var(--foreground)/0.06)] border-t bg-background/95 backdrop-blur px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{selected.size.toLocaleString("es-CO")} productos seleccionados</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpiar</Button>
                <Button size="sm" variant={modoSugerido === "poner" ? "default" : "outline"} onClick={() => abrir("poner")}>Poner o subir descuento</Button>
                <Button size="sm" variant={modoSugerido === "quitar" ? "default" : "outline"} onClick={() => abrir("quitar")}>Quitar descuento</Button>
                <Button size="sm" variant={modoSugerido === "sugerido" ? "default" : "outline"} disabled={!haySugerido} onClick={() => abrir("sugerido")}>Aplicar sugerido</Button>
              </div>
            </div>
          )}
          <CrearLoteDialog open={modo != null} onOpenChange={(o) => { if (!o) setModo(null); }} modo={modoAbierto} rows={selRows}
            onCreated={(id) => { setSelected(new Set()); qc.invalidateQueries({ queryKey: ["precio-lotes"] }); abrirLote(id); }} />
        </main>
      </div>
    </SidebarProvider>
    </TooltipProvider>
  );
}
