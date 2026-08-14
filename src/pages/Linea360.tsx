import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { HeaderTooltip } from "@/components/HeaderTooltip";
import { Button } from "@/components/ui/button";
import { Download, HelpCircle, X, Store, ShoppingBag, PauseCircle, CircleCheck, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Análisis por línea — el mismo marco de Análisis de producto, agregado por
 * categoría padre × género.
 *
 * Los índices NO se promedian entre productos: se recalculan sobre los totales
 * de la línea. Promediar índices de referencias con volúmenes muy distintos da
 * un número sin significado — una de 20 unidades pesaría igual que una de 600.
 *
 * Colección: la vista `linea_360` no tiene ese desglose. Cuando se filtra por
 * colección, la tabla se recalcula en el cliente desde `producto_360` con la
 * misma lógica de totales (no se promedian índices).
 */

interface Row {
  categoria_padre: string;
  genero_norm: string;
  n_productos: number;
  n_con_ventana: number;
  n_colecciones: number;
  producido: number;
  vendido: number;
  vendido_120d: number;
  sin_evacuar: number;
  objetivo_unidades: number;
  pct_evacuado_120d: number | null;
  indice_meta: number | null;
  stock_disponibilizado: number;
  stock_detenido: number;
  stock_total: number;
  stock_tiendas: number;
  stock_online: number;
  bod_principal: number | null;
  bod_reserva: number | null;
  bod_tiendas: number | null;
  bod_exportaciones: number | null;
  st_disponibilizado: number | null;
  st_total: number | null;
  unidades_full: number;
  unidades_rebaja: number;
  unidades_activacion: number;
  pct_venta_full: number | null;
  pct_activacion: number | null;
  pct_rebaja: number | null;
  pct_venta_sana: number | null;
  desc_activacion_pct: number | null;
  uds_tienda: number;
  uds_online: number;
  mix_online_pct: number | null;
  indice_total: number | null;
  semanas_prom: number | null;
  n_repetir: number;
  n_revisar_cantidad: number;
  n_revisar_precio: number;
  n_revisar_concepto: number;
  n_en_curso: number;
  uds_revisar_cantidad: number | null;
  uds_revisar_concepto: number | null;
  wos_prom: number | null;
  n_cobertura_critica: number;
  n_cobertura_ajustada: number;
  fecha_snapshot_bodega: string | null;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function colorMeta(i: number | null) {
  if (i == null) return { t: "text-muted-foreground", b: "bg-muted" };
  if (i >= 1.0) return { t: "text-emerald-700", b: "bg-emerald-500" };
  if (i >= 0.8) return { t: "text-amber-700", b: "bg-amber-500" };
  if (i >= 0.6) return { t: "text-orange-700", b: "bg-orange-500" };
  return { t: "text-rose-700", b: "bg-rose-500" };
}

function colorRdv(i: number | null) {
  if (i == null) return "#898781";
  if (i >= 130) return "#2a78d6";
  if (i >= 100) return "#0ca30c";
  if (i >= 70) return "#c98500";
  return "#d03b3b";
}

/** Etiqueta de acción -> valor real de `diagnostico`, igual que en Análisis de producto. */
const DIAGNOSTICOS: { label: string; campo: keyof Row; cls: string }[] = [
  { label: "Repetir", campo: "n_repetir", cls: "bg-emerald-100 text-emerald-800" },
  { label: "Revisar cantidad", campo: "n_revisar_cantidad", cls: "bg-orange-100 text-orange-800" },
  { label: "Revisar precio", campo: "n_revisar_precio", cls: "bg-amber-100 text-amber-800" },
  { label: "Revisar concepto", campo: "n_revisar_concepto", cls: "bg-rose-100 text-rose-800" },
  { label: "En curso", campo: "n_en_curso", cls: "bg-sky-100 text-sky-800" },
];

const DIAG_VALOR: Record<string, string> = {
  GANADOR: "Repetir",
  "SE PRODUJO DE MAS": "Revisar cantidad",
  "EVACUO LIQUIDANDO": "Revisar precio",
  "MAL PRODUCTO": "Revisar concepto",
  "EN CURSO": "En curso",
};

const suma = (xs: any[], k: string) => xs.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
/** Promedio ponderado; ignora nulos. */
function ponderado(xs: any[], k: string, peso: string) {
  let num = 0, den = 0;
  for (const r of xs) {
    const v = r[k], w = Number(r[peso]) || 0;
    if (v == null || w <= 0) continue;
    num += Number(v) * w; den += w;
  }
  return den > 0 ? num / den : null;
}

/** Reagrupa producto_360 (ya filtrado por colección) en filas de línea. */
function agregarPorLinea(productos: any[]): Row[] {
  const grupos = new Map<string, any[]>();
  for (const p of productos) {
    if (!p.categoria_padre || !p.genero_norm) continue;
    const k = `${p.categoria_padre}|${p.genero_norm}`;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(p);
  }
  const out: Row[] = [];
  for (const [k, ps] of grupos) {
    const [categoria_padre, genero_norm] = k.split("|");
    const producido = suma(ps, "producido");
    const vendido = suma(ps, "unidades_vendidas");
    const vendido_120d = suma(ps, "uds_120d");
    const objetivo_unidades = suma(ps, "objetivo_unidades");
    const stock_disponibilizado = suma(ps, "stock_disponibilizado");
    const stock_detenido = suma(ps, "stock_detenido");
    const stock_total = suma(ps, "stock_total");
    const unidades_full = suma(ps, "unidades_full");
    const unidades_rebaja = suma(ps, "unidades_rebaja");
    const unidades_activacion = suma(ps, "unidades_activacion");
    const vendUds = unidades_full + unidades_rebaja + unidades_activacion;
    const uds_tienda = suma(ps, "uds_tienda") + suma(ps, "uds_outlet");
    const uds_online = suma(ps, "uds_online");
    const cuenta = (v: string) => ps.filter(p => p.diagnostico === v).length;
    out.push({
      categoria_padre, genero_norm,
      n_productos: ps.length,
      n_con_ventana: ps.filter(p => p.ventana_completa).length,
      n_colecciones: new Set(ps.map(p => p.coleccion).filter(Boolean)).size,
      producido, vendido, vendido_120d,
      sin_evacuar: suma(ps, "sin_evacuar"),
      objetivo_unidades,
      pct_evacuado_120d: pct(vendido_120d, producido),
      indice_meta: objetivo_unidades > 0 ? vendido_120d / objetivo_unidades : null,
      stock_disponibilizado, stock_detenido, stock_total,
      stock_tiendas: suma(ps, "stock_tiendas"),
      stock_online: 0,
      bod_principal: suma(ps, "bod_principal"),
      bod_reserva: suma(ps, "bod_reserva"),
      bod_tiendas: suma(ps, "bod_tiendas"),
      bod_exportaciones: suma(ps, "bod_exportaciones"),
      st_disponibilizado: pct(vendido, vendido + stock_disponibilizado),
      st_total: pct(vendido, vendido + stock_total),
      unidades_full, unidades_rebaja, unidades_activacion,
      pct_venta_full: pct(unidades_full, vendUds),
      pct_activacion: pct(unidades_activacion, vendUds),
      pct_rebaja: pct(unidades_rebaja, vendUds),
      pct_venta_sana: pct(unidades_full + unidades_activacion, vendUds),
      desc_activacion_pct: ponderado(ps, "desc_activacion_pct", "unidades_activacion"),
      uds_tienda, uds_online,
      mix_online_pct: pct(uds_online, uds_tienda + uds_online),
      indice_total: ponderado(ps, "indice_total", "unidades_vendidas"),
      semanas_prom: ponderado(ps, "semanas_en_venta", "producido"),
      n_repetir: cuenta("GANADOR"),
      n_revisar_cantidad: cuenta("SE PRODUJO DE MAS"),
      n_revisar_precio: cuenta("EVACUO LIQUIDANDO"),
      n_revisar_concepto: cuenta("MAL PRODUCTO"),
      n_en_curso: cuenta("EN CURSO"),
      uds_revisar_cantidad: suma(ps.filter(p => p.diagnostico === "SE PRODUJO DE MAS"), "sin_evacuar"),
      uds_revisar_concepto: suma(ps.filter(p => p.diagnostico === "MAL PRODUCTO"), "sin_evacuar"),
      wos_prom: ponderado(ps, "wos", "stock_disponibilizado"),
      n_cobertura_critica: ps.filter(p => p.cobertura === "CRITICA").length,
      n_cobertura_ajustada: ps.filter(p => p.cobertura === "AJUSTADA").length,
      fecha_snapshot_bodega: ps[0]?.fecha_snapshot_bodega ?? null,
    });
  }
  return out;
}

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Cómo leer esta vista</h3>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Es el mismo marco de Análisis de producto, sumado por línea. Los índices no se promedian
        entre referencias: se recalculan sobre los totales, para que una referencia de 20 unidades
        no pese igual que una de 600.
      </p>
      <div className="grid md:grid-cols-2 gap-3 border-t pt-3">
        <div>
          <p className="font-medium text-xs mb-1">Ritmo vs. presupuesto</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Unidades vendidas en la ventana ÷ el 70% de lo producido.{" "}
            <strong className="text-foreground">1,00 = la línea evacuó lo esperado.</strong>
          </p>
        </div>
        <div>
          <p className="font-medium text-xs mb-1">Venta sana</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Porcentaje que salió a precio lleno o con activación. No cuenta la rebaja de catálogo,
            que es liquidación.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        <strong className="text-foreground">Clic en el nombre de la línea</strong> abre Análisis de
        producto con esa línea ya filtrada. <strong className="text-foreground">Clic en un
        contador de diagnóstico</strong> la abre además filtrada por ese diagnóstico. Clic en el
        resto de la fila despliega el detalle de stock.
      </p>
    </div>
  );
}

export default function Linea360() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [genero, setGenero] = useState("all");
  const [coleccion, setColeccion] = useState("all");
  const [linea, setLinea] = useState("all");
  const [orden, setOrden] = useState<"stock_desc" | "sin_evacuar" | "meta_asc" | "meta_desc" | "producido">("stock_desc");
  const [ayuda, setAyuda] = useState(false);

  /** producto_360 crudo, para poder desglosar por colección (la vista de línea no la tiene). */
  const [productos, setProductos] = useState<any[] | null>(null);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [colecciones, setColecciones] = useState<string[]>([]);

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("linea_360").select("*");
      if (!activo) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, []);

  const cargarProductos = useCallback(async () => {
    if (productos || cargandoProductos) return;
    setCargandoProductos(true);
    const PAGINA = 1000;
    const acc: any[] = [];
    let desde = 0;
    try {
      for (;;) {
        const { data, error } = await supabase
          .from("producto_360").select("*")
          .order("product_id", { ascending: true })
          .range(desde, desde + PAGINA - 1);
        if (error) throw error;
        const lote = data ?? [];
        acc.push(...lote);
        if (lote.length < PAGINA) break;
        desde += PAGINA;
        if (desde > 20000) break;
      }
      setProductos(acc);
      setColecciones(Array.from(new Set(acc.map(p => p.coleccion).filter(Boolean))).sort());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCargandoProductos(false);
    }
  }, [productos, cargandoProductos]);

  // El desglose por colección solo existe en producto_360: se carga en segundo plano.
  useEffect(() => { cargarProductos(); }, [cargarProductos]);

  const generos = useMemo(
    () => Array.from(new Set(rows.map(r => r.genero_norm).filter(Boolean))).sort(), [rows]);
  const lineas = useMemo(
    () => Array.from(new Set(rows.map(r => r.categoria_padre).filter(Boolean))).sort(), [rows]);

  const base = useMemo(() => {
    if (coleccion === "all") return rows;
    if (!productos) return [];
    return agregarPorLinea(productos.filter(p => p.coleccion === coleccion));
  }, [rows, coleccion, productos]);

  const filtrados = useMemo(() => {
    const b = base.filter(r =>
      (genero === "all" || r.genero_norm === genero) &&
      (linea === "all" || r.categoria_padre === linea));
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      stock_desc: (a, b2) => (b2.stock_disponibilizado ?? 0) - (a.stock_disponibilizado ?? 0),
      sin_evacuar: (a, b2) => (b2.sin_evacuar ?? 0) - (a.sin_evacuar ?? 0),
      meta_asc: (a, b2) => (a.indice_meta ?? 99) - (b2.indice_meta ?? 99),
      meta_desc: (a, b2) => (b2.indice_meta ?? 0) - (a.indice_meta ?? 0),
      producido: (a, b2) => (b2.producido ?? 0) - (a.producido ?? 0),
    };
    return [...b].sort(cmp[orden]);
  }, [base, genero, linea, orden]);

  const kpis = useMemo(() => ({
    lineas: filtrados.length,
    productos: filtrados.reduce((s, r) => s + r.n_productos, 0),
    producido: filtrados.reduce((s, r) => s + (r.producido ?? 0), 0),
    sinEvacuar: filtrados.reduce((s, r) => s + (r.sin_evacuar ?? 0), 0),
    detenido: filtrados.reduce((s, r) => s + (r.stock_detenido ?? 0), 0),
  }), [filtrados]);

  const irADetalle = (r: Row, diagnostico?: string) => {
    const p = new URLSearchParams({ categoria: r.categoria_padre, genero: r.genero_norm });
    if (diagnostico) p.set("diagnostico", diagnostico);
    if (coleccion !== "all") p.set("coleccion", coleccion);
    navigate(`/analisis-producto?${p.toString()}`);
  };

  const exportar = () => {
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Línea: r.categoria_padre, Género: r.genero_norm,
      Colección: coleccion === "all" ? "Todas" : coleccion,
      Productos: r.n_productos, "Con ventana cumplida": r.n_con_ventana,
      Producido: r.producido, "Vendido total": r.vendido, "Vendido en 120d": r.vendido_120d,
      "Objetivo (70%)": r.objetivo_unidades, "Sin evacuar": r.sin_evacuar,
      "% evacuado 120d": r.pct_evacuado_120d, "Índice vs. meta": r.indice_meta,
      "Stock disponible": r.stock_disponibilizado, "Stock detenido": r.stock_detenido,
      "ST disponible": r.st_disponibilizado, "ST total": r.st_total,
      "Semanas de stock": r.wos_prom,
      "% venta sana": r.pct_venta_sana, "% full": r.pct_venta_full,
      "% activación": r.pct_activacion, "% rebaja": r.pct_rebaja,
      "Desc. activación": r.desc_activacion_pct,
      "Uds tienda": r.uds_tienda, "Uds online": r.uds_online, "% online": r.mix_online_pct,
      "RDV vs. cohorte": r.indice_total,
      Repetir: r.n_repetir, "Revisar cantidad": r.n_revisar_cantidad,
      "Revisar precio": r.n_revisar_precio, "Revisar concepto": r.n_revisar_concepto,
      "En curso": r.n_en_curso,
    }));
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.sheet_add_aoa(ws, [
      ["Análisis por línea — índice vs. meta (70% de lo producido en 120 días)"],
      [`Índice 1,00 = la línea evacuó lo esperado · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }, ...Array(28).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análisis por línea");
    XLSX.writeFile(wb, "analisis-por-linea.xlsx");
  };

  const claveDe = (r: Row) => `${r.categoria_padre}|${r.genero_norm}`;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Análisis por línea</h1>
              <p className="text-xs text-muted-foreground">
                Evacuación, calidad de venta y stock, agregados por categoría
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo leerla
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[185px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={linea} onValueChange={setLinea}>
                <SelectTrigger className="w-[185px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las líneas</SelectItem>
                  {lineas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={genero} onValueChange={setGenero}>
                <SelectTrigger className="w-[165px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los géneros</SelectItem>
                  {generos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={orden} onValueChange={v => setOrden(v as typeof orden)}>
                <SelectTrigger className="w-[205px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock_desc">Mayor stock disponible</SelectItem>
                  <SelectItem value="sin_evacuar">Más unidades sin evacuar</SelectItem>
                  <SelectItem value="meta_asc">Menor índice vs. meta</SelectItem>
                  <SelectItem value="meta_desc">Mayor índice vs. meta</SelectItem>
                  <SelectItem value="producido">Mayor producción</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="ml-auto h-9"
                      onClick={exportar} disabled={!filtrados.length}>
                <Download className="h-4 w-4 mr-1.5" />Excel
              </Button>
            </div>

            {coleccion !== "all" && (
              <p className="text-[11px] text-muted-foreground">
                Filtrado por colección: los totales se recalculan desde el detalle de producto.
              </p>
            )}

            {loading || (coleccion !== "all" && cargandoProductos) ? (
              <div className="p-6"><LoadingState rows={8} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : !filtrados.length ? (
              <EmptyState message="Ninguna línea cumple estos filtros." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Producido</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.producido)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {kpis.lineas} líneas · {nf(kpis.productos)} productos
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Sin evacuar</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.sinEvacuar)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {nf(kpis.producido ? (kpis.sinEvacuar / kpis.producido) * 100 : 0, 0)}% de lo producido
                    </div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <PauseCircle className="h-3.5 w-3.5" />Stock detenido
                    </div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.detenido)}</div>
                    <div className="text-[11px] text-muted-foreground">en bodega, sin ofrecer</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Evacuación global</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">
                      {nf(kpis.producido ? ((kpis.producido - kpis.sinEvacuar) / kpis.producido) * 100 : 0, 1)}%
                    </div>
                    <div className="text-[11px] text-muted-foreground">meta 70%</div>
                  </div>
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="text-left p-2.5 font-medium">Línea</th>
                        <th className="text-right p-2.5 font-medium">
                          <HeaderTooltip label="Unidades" tip="Unidades vendidas totales, dentro y fuera de la ventana de 120 días" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Ventas por canal" tip="Unidades por tienda y por online" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Ritmo vs. presupuesto" tip="¿Va al ritmo de vender el 70% en 120 días? 1,00 = sí" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="RDV" tip="¿Vende más rápido que líneas parecidas? 1,00× = igual" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Calidad de venta" tip="Qué parte se vendió sin liquidar (precio full o activación)" />
                        </th>
                        <th className="text-right p-2.5 font-medium">
                          <HeaderTooltip label="Stock" tip="Disponible: a la venta. Detenido: en bodega" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Sell-through" tip="Verde: de lo disponible. Gris: incluyendo bodega" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Cobertura" tip="Semanas que dura el stock disponible al ritmo actual" />
                        </th>
                        <th className="text-left p-2.5 font-medium">Diagnóstico</th>
                        <th className="text-right p-2.5 font-medium">
                          <HeaderTooltip label="Sin evacuar" tip="Unidades que no salieron en los 120 días" />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map(r => {
                        const c = colorMeta(r.indice_meta);
                        const cr = colorRdv(r.indice_total);
                        const abierta = expandida === claveDe(r);
                        return (
                          <>
                            <tr key={claveDe(r)}
                                onClick={() => setExpandida(abierta ? null : claveDe(r))}
                                className="border-b hover:bg-muted/30 cursor-pointer">
                              <td className="p-2.5 min-w-[190px]">
                                <div className="flex items-center gap-1">
                                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${abierta ? "rotate-90" : ""}`} />
                                  <div>
                                    <button
                                      onClick={e => { e.stopPropagation(); irADetalle(r); }}
                                      className="font-medium leading-tight text-left hover:underline">
                                      {r.categoria_padre} · {r.genero_norm}
                                    </button>
                                    <div className="text-[11px] text-muted-foreground">
                                      {r.n_productos} refs · {r.n_colecciones} colecciones
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="p-2.5 text-right">
                                <div className="tabular-nums font-medium">{nf(r.vendido)}</div>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  {nf(r.vendido_120d)} en sus 120 días
                                </div>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  {nf((r.vendido ?? 0) - (r.vendido_120d ?? 0))} después de la ventana
                                </div>
                              </td>

                              <td className="p-2.5">
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                  <span className="flex items-center gap-0.5">
                                    <Store className="h-3 w-3" />{nf(r.uds_tienda)}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <ShoppingBag className="h-3 w-3" />{nf(r.uds_online)}
                                  </span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {nf(r.mix_online_pct, 0)}% online
                                </div>
                              </td>

                              <td className="p-2.5">
                                <div className="w-[110px]">
                                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`absolute inset-y-0 left-0 rounded-full ${c.b}`}
                                         style={{ width: `${Math.min(100, ((r.indice_meta ?? 0) / 1.2) * 100)}%` }} />
                                    <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "83.3%" }} />
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-sm font-medium tabular-nums ${c.t}`}>
                                      {nf(r.indice_meta, 2)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {nf(r.pct_evacuado_120d, 0)}% evacuado
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="p-2.5">
                                <div className="w-[92px]">
                                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 rounded-full"
                                         style={{ width: `${Math.min(100, ((r.indice_total ?? 0) / 300) * 100)}%`,
                                                  background: cr }} />
                                    <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "33.3%" }} />
                                  </div>
                                  <div className="text-sm font-medium tabular-nums mt-1" style={{ color: cr }}>
                                    {r.indice_total == null ? "—" : `${nf(r.indice_total / 100, 2)}×`}
                                  </div>
                                </div>
                              </td>

                              <td className="p-2.5">
                                <div className="w-[120px]"
                                     title={`Full ${nf(r.pct_venta_full, 0)}% · Activación ${nf(r.pct_activacion, 0)}% · Rebaja ${nf(r.pct_rebaja, 0)}%`}>
                                  <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                                    <div className="bg-emerald-500" style={{ width: `${r.pct_venta_full ?? 0}%` }} />
                                    <div className="bg-sky-500" style={{ width: `${r.pct_activacion ?? 0}%` }} />
                                    <div className="bg-amber-500" style={{ width: `${r.pct_rebaja ?? 0}%` }} />
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                                    {nf(r.pct_venta_sana, 0)}% sin liquidar
                                    {r.desc_activacion_pct != null && ` · −${nf(r.desc_activacion_pct, 0)}% desc.`}
                                  </div>
                                </div>
                              </td>

                              <td className="p-2.5 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <CircleCheck className="h-3 w-3" />Disponible
                                </div>
                                <div className="tabular-nums font-medium">{nf(r.stock_disponibilizado)}</div>
                                <div className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-amber-700">
                                  <PauseCircle className="h-3 w-3" />Detenido
                                </div>
                                <div className="tabular-nums text-amber-700">{nf(r.stock_detenido)}</div>
                              </td>

                              <td className="p-2.5">
                                <div className="w-[96px] space-y-1.5">
                                  <div>
                                    <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                                           style={{ width: `${Math.min(100, r.st_disponibilizado ?? 0)}%` }} />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                      {nf(r.st_disponibilizado, 0)}% disponible
                                    </div>
                                  </div>
                                  <div>
                                    <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400"
                                           style={{ width: `${Math.min(100, r.st_total ?? 0)}%` }} />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                      {nf(r.st_total, 0)}% total
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="p-2.5 whitespace-nowrap">
                                <div className="text-[11px] tabular-nums">
                                  {r.wos_prom == null ? "—" : `${nf(Math.min(r.wos_prom, 99), 0)} sem`}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  de inventario al ritmo actual
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {r.n_cobertura_critica} críticas · {r.n_cobertura_ajustada} ajustadas
                                </div>
                              </td>

                              <td className="p-2.5">
                                <div className="flex gap-1 text-[10px]">
                                  {DIAGNOSTICOS.map(d => {
                                    const v = Number(r[d.campo] ?? 0);
                                    if (!v) return null;
                                    return (
                                      <button key={d.label} title={d.label}
                                              onClick={e => { e.stopPropagation(); irADetalle(r, d.label); }}
                                              className={`rounded px-1.5 py-0.5 hover:ring-1 hover:ring-foreground/20 ${d.cls}`}>
                                        {v}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>

                              <td className="p-2.5 text-right">
                                <span className="tabular-nums font-medium text-rose-700">
                                  {nf(r.sin_evacuar)}
                                </span>
                              </td>
                            </tr>

                            {abierta && (
                              <tr key={claveDe(r) + "-det"} className="border-b bg-muted/20">
                                <td colSpan={11} className="p-4">
                                  <div className="grid md:grid-cols-3 gap-5">
                                    <div>
                                      <h4 className="text-xs font-medium mb-2">Dónde está el stock</h4>
                                      <div className="space-y-1 text-xs">
                                        {[
                                          { l: "En tiendas", v: r.stock_tiendas },
                                          { l: "Online", v: r.stock_online },
                                          { l: "CEDI Principal", v: r.bod_principal },
                                          { l: "Reserva mayoristas", v: r.bod_reserva },
                                          { l: "Reserva tiendas", v: r.bod_tiendas },
                                          { l: "Exportaciones", v: r.bod_exportaciones },
                                        ].filter(x => (x.v ?? 0) > 0).map(x => (
                                          <div key={x.l} className="flex justify-between">
                                            <span className="text-muted-foreground">{x.l}</span>
                                            <span className="tabular-nums">{nf(x.v)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <h4 className="text-xs font-medium mb-2">Diagnóstico de sus referencias</h4>
                                      <div className="space-y-1 text-xs">
                                        {[
                                          { l: "Repetir", v: r.n_repetir, c: "text-emerald-700" },
                                          { l: "Revisar cantidad", v: r.n_revisar_cantidad, c: "text-orange-700",
                                            sub: r.uds_revisar_cantidad },
                                          { l: "Revisar precio", v: r.n_revisar_precio, c: "text-amber-700" },
                                          { l: "Revisar concepto", v: r.n_revisar_concepto, c: "text-rose-700",
                                            sub: r.uds_revisar_concepto },
                                          { l: "En curso", v: r.n_en_curso, c: "text-sky-700" },
                                        ].filter(x => x.v > 0).map(x => (
                                          <button key={x.l} onClick={() => irADetalle(r, x.l)}
                                                  className="flex justify-between w-full hover:underline">
                                            <span className={x.c}>{x.l}</span>
                                            <span className="tabular-nums">
                                              {x.v} refs
                                              {x.sub != null && (
                                                <span className="text-muted-foreground"> · {nf(x.sub)} uds</span>
                                              )}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <h4 className="text-xs font-medium mb-2">Otros indicadores</h4>
                                      <div className="space-y-1 text-xs">
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Producido</span>
                                          <span className="tabular-nums">{nf(r.producido)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Sell-through disponible</span>
                                          <span className="tabular-nums">{nf(r.st_disponibilizado, 1)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Sell-through total</span>
                                          <span className="tabular-nums">{nf(r.st_total, 1)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Semanas promedio</span>
                                          <span className="tabular-nums">{nf(r.semanas_prom, 1)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Cobertura crítica</span>
                                          <span className="tabular-nums">{r.n_cobertura_critica} refs</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-muted-foreground">Cobertura ajustada</span>
                                          <span className="tabular-nums">{r.n_cobertura_ajustada} refs</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Ritmo vs. presupuesto:</span>
                  <span>1,00 = la línea evacuó el 70% de lo producido en 120 días</span>
                  <span className="ml-2">La marca en la barra es la meta</span>
                  <span className="ml-2">Clic en el nombre o en un diagnóstico abre Análisis de producto ya filtrado</span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
