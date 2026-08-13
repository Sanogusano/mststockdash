import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { HeaderTooltip } from "@/components/HeaderTooltip";
import { ProductoDetallePanel } from "@/components/dashboard/ProductoDetallePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Package, Store, ShoppingBag, HelpCircle, X, RotateCcw, CircleCheck, PauseCircle } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Análisis de producto — pantalla consolidada.
 *
 * Reemplaza tres pantallas que respondían la misma pregunta en momentos
 * distintos: Clasificación de producto (dónde está hoy), Presupuesto de
 * rotación (contra su meta) y Ciclo de venta (cómo llegó ahí).
 *
 * Seis columnas, cada una responde algo distinto:
 *   1. Producido / vendido / sin evacuar  → cuánto hay en juego
 *   2. Índice vs. meta                    → ¿va al ritmo que necesito?
 *   3. RDV vs. pares                      → ¿es buen producto?
 *   4. % venta full                       → ¿vendió con dignidad?
 *   5. Cobertura                          → ¿cuánto le queda?
 *   6. Canal                              → ¿por dónde salió?
 *
 * Las columnas 2 y 3 juntas separan ERROR DE COMPRA de MAL PRODUCTO: un
 * producto puede ir lento contra su meta (se produjo de más) y aun así superar
 * a sus pares (el diseño funcionó).
 *
 * El resto —curva de ciclo, tallas, sell-through por canal, desglose de
 * descuentos— vive en el panel de detalle, al hacer clic en la fila.
 */

interface Row {
  product_id: string;
  title: string;
  category: string;
  categoria_padre: string | null;
  genero_norm: string | null;
  coleccion: string;
  image_url: string | null;
  semanas_en_venta: number;
  semanas_objetivo: number;
  semanas_restantes: number;
  fuera_de_ventana: boolean;
  producido: number;
  uds_120d: number;
  sin_evacuar: number;
  stock_bodegas: number;
  stock_tiendas: number;
  unidades_vendidas: number;
  stock_actual: number;
  objetivo_dia: number | null;
  objetivo_dia_tienda: number | null;
  objetivo_dia_online: number | null;
  ritmo_dia: number | null;
  ritmo_dia_tienda: number | null;
  ritmo_dia_online: number | null;
  indice_meta: number | null;
  percentil_catalogo: number | null;
  velocidad_meta: string;
  pct_evacuado_120d: number | null;
  ventana_completa: boolean;
  indice_total: number | null;
  base_cohorte: string;
  n_cohorte: number;
  desempeno: string;
  pct_venta_full: number | null;
  med_pctfull_cohorte: number | null;
  unidades_full: number;
  unidades_rebaja: number;
  unidades_activacion: number;
  wos: number | null;
  cobertura: string;
  sell_through_pct: number | null;
  uds_tienda: number;
  uds_outlet: number;
  uds_online: number;
  mix_online_pct: number | null;
  mix_online_cat: number | null;
  perfil_canal: string;
  estado_tallas: string;
  tallas_con_stock: number | null;
  tallas_totales: number | null;
  estado_online: string;
  stock_disponibilizado: number | null;
  stock_detenido: number | null;
  stock_total: number | null;
  st_disponibilizado: number | null;
  st_total: number | null;
  bod_principal: number | null;
  bod_guayabal: number | null;
  bod_reserva: number | null;
  bod_tiendas: number | null;
  bod_exportaciones: number | null;
  fecha_snapshot_bodega: string | null;
  indice_rasero: number | null;
  indice_rasero_tienda: number | null;
  indice_rasero_online: number | null;
  rasero_tienda: number | null;
  rasero_online: number | null;
  estado_rasero: string;
  cumple_calidad: boolean;
  rdv_tienda_sano: number | null;
  rdv_online_sano: number | null;
  ros_total: number | null;
  [k: string]: any;
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

const COBERTURA_CLS: Record<string, string> = {
  AJUSTADA: "bg-sky-100 text-sky-700 border-sky-200",
  SANA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ALTA: "bg-amber-100 text-amber-700 border-amber-200",
  CRITICA: "bg-rose-100 text-rose-700 border-rose-200",
  "SIN STOCK": "bg-slate-100 text-slate-600 border-slate-200",
};

const PERFIL: Record<string, string> = {
  fuerte_online: "Gana online",
  fuerte_tienda: "Gana tienda",
  solo_online: "Solo online",
  solo_tienda: "Solo tienda",
  equilibrado: "Parejo",
};

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Las dos preguntas que separa esta tabla</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1">Índice vs. meta — ¿compramos bien?</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ritmo real ÷ (producido ÷ 120 días). <strong className="text-foreground">1,00 significa
            que evacúa justo dentro de la ventana.</strong> Un 0,40 dice que al cerrar quedará el
            60% sin vender. Es un objetivo propio, no una comparación.
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1">RDV — ¿es buen producto?</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Cuántas veces más rápido vende que el producto típico de su cohorte.{" "}
            <strong className="text-foreground">1,00× = al ritmo de sus pares.</strong> No son
            unidades.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        <strong className="text-foreground">Leerlas juntas es lo importante.</strong> Un producto
        con índice 0,45 y RDV 1,80× vendió más rápido que sus pares y aun así no alcanza a evacuar:
        el diseño funcionó, la cantidad fue el error. Uno con índice 0,45 y RDV 0,50× sí es mal
        producto. La acción es distinta en cada caso.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        <strong className="text-foreground">Clic en cualquier fila</strong> abre la curva de ciclo
        del producto, el desglose por canal, las tallas y el detalle de descuentos.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        Mientras el snapshot de NetSuite no incluya todas las bodegas, lo producido queda
        subestimado y el índice sale más alto de lo real.
      </p>
    </div>
  );
}

export default function Producto360() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Row | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [coleccion, setColeccion] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [foco, setFoco] = useState("all");
  const [orden, setOrden] = useState<"sin_evacuar" | "meta_asc" | "meta_desc" | "rdv_desc" | "producido">("sin_evacuar");
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      const PAGINA = 1000;
      const acc: Row[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("producto_360")
            .select("*")
            .order("product_id", { ascending: true })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 20000) break;
        }
        if (activo) setRows(acc);
      } catch (e: any) {
        if (activo) setError(e?.message ?? String(e));
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const colecciones = useMemo(
    () => Array.from(new Set(rows.map(r => r.coleccion).filter(Boolean))).sort(), [rows]);
  const categorias = useMemo(
    () => Array.from(new Set(rows
      .map(r => r.categoria_padre && r.genero_norm ? `${r.categoria_padre} · ${r.genero_norm}` : null)
      .filter(Boolean) as string[])).sort(), [rows]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = rows.filter(r => {
      if (coleccion !== "all" && r.coleccion !== coleccion) return false;
      if (categoria !== "all" && `${r.categoria_padre} · ${r.genero_norm}` !== categoria) return false;
      if (q && !r.title?.toLowerCase().includes(q)) return false;
      // Focos: cruces que responden una decisión concreta
      if (foco === "sobrecompra")
        return (r.indice_meta ?? 9) < 0.6 && (r.indice_total ?? 0) >= 100;
      if (foco === "mal_producto")
        return (r.indice_meta ?? 9) < 0.6 && (r.indice_total ?? 999) < 70;
      if (foco === "ganadores")
        return (r.indice_meta ?? 0) >= 0.8 && (r.pct_venta_full ?? 0) >= (r.med_pctfull_cohorte ?? 0);
      if (foco === "reponer")
        return r.cobertura === "AJUSTADA" && (r.indice_total ?? 0) >= 100;
      if (foco === "liquidar")
        return r.cobertura === "CRITICA" && (r.indice_total ?? 999) < 70;
      if (foco === "solo_con_descuento")
        return r.estado_rasero === "SOLO CON DESCUENTO";
      return true;
    });
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      sin_evacuar: (a, b) => (b.sin_evacuar ?? 0) - (a.sin_evacuar ?? 0),
      meta_asc: (a, b) => (a.indice_meta ?? 99) - (b.indice_meta ?? 99),
      meta_desc: (a, b) => (b.indice_meta ?? 0) - (a.indice_meta ?? 0),
      rdv_desc: (a, b) => (b.indice_total ?? 0) - (a.indice_total ?? 0),
      producido: (a, b) => (b.producido ?? 0) - (a.producido ?? 0),
    };
    return [...base].sort(cmp[orden]);
  }, [rows, coleccion, categoria, foco, busqueda, orden]);

  const kpis = useMemo(() => {
    const sobrecompra = filtrados.filter(r => (r.indice_meta ?? 9) < 0.6 && (r.indice_total ?? 0) >= 100);
    const malProducto = filtrados.filter(r => (r.indice_meta ?? 9) < 0.6 && (r.indice_total ?? 999) < 70);
    return {
      productos: filtrados.length,
      producido: filtrados.reduce((s, r) => s + (r.producido ?? 0), 0),
      sinEvacuar: filtrados.reduce((s, r) => s + (r.sin_evacuar ?? 0), 0),
      sobrecompra: { n: sobrecompra.length, uds: sobrecompra.reduce((s, r) => s + (r.sin_evacuar ?? 0), 0) },
      malProducto: { n: malProducto.length, uds: malProducto.reduce((s, r) => s + (r.sin_evacuar ?? 0), 0) },
    };
  }, [filtrados]);

  const limpiar = () => {
    setColeccion("all"); setCategoria("all"); setFoco("all"); setBusqueda("");
  };

  const exportar = () => {
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Producto: r.title, Categoría: r.categoria_padre, Género: r.genero_norm,
      Colección: r.coleccion, "Semanas en venta": r.semanas_en_venta,
      Producido: r.producido, "Vendido 120d": r.uds_120d, "Sin evacuar": r.sin_evacuar,
      "Stock bodegas": r.stock_bodegas, "Stock tiendas": r.stock_tiendas,
      "Objetivo uds/día": r.objetivo_dia, "Ritmo uds/día": r.ritmo_dia,
      "Índice vs. meta": r.indice_meta, "Percentil catálogo": r.percentil_catalogo,
      "RDV × el típico": r.indice_total == null ? null : Number((r.indice_total / 100).toFixed(2)),
      Cohorte: `${r.n_cohorte} · ${r.base_cohorte}`,
      "% venta full": r.pct_venta_full, "% full típico": r.med_pctfull_cohorte,
      "Uds full": r.unidades_full, "Uds rebaja": r.unidades_rebaja,
      "Uds activación": r.unidades_activacion,
      "Semanas de stock": r.wos, "Semanas restantes": r.semanas_objetivo, Cobertura: r.cobertura,
      "Sell-through %": r.sell_through_pct,
      "Uds tienda": (r.uds_tienda ?? 0) + (r.uds_outlet ?? 0), "Uds online": r.uds_online,
      "Perfil canal": r.perfil_canal, "Estado tallas": r.estado_tallas,
      "Estado online": r.estado_online,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" } as XLSX.JSON2SheetOpts);
    XLSX.utils.sheet_add_aoa(ws, [
      ["Análisis de producto — índice vs. meta (producido ÷ 120 días) y RDV vs. cohorte"],
      [`Índice 1,00 = evacúa a tiempo · RDV 1,00× = al ritmo de sus pares · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 42 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, ...Array(24).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Análisis de producto");
    XLSX.writeFile(wb, "analisis-producto.xlsx");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Análisis de producto</h1>
              <p className="text-xs text-muted-foreground">
                Ritmo contra su meta y contra sus pares · clic en la fila para ver la curva
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo leerla
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar producto…" className="pl-8 w-[185px]"
                       value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[155px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-[195px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={foco} onValueChange={setFoco}>
                <SelectTrigger className="w-[195px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  <SelectItem value="sobrecompra">Error de compra</SelectItem>
                  <SelectItem value="mal_producto">Mal producto</SelectItem>
                  <SelectItem value="ganadores">Ganadores</SelectItem>
                  <SelectItem value="reponer">Reponer</SelectItem>
                  <SelectItem value="liquidar">Liquidar</SelectItem>
                  <SelectItem value="solo_con_descuento">Solo con descuento</SelectItem>
                </SelectContent>
              </Select>

              <Select value={orden} onValueChange={v => setOrden(v as typeof orden)}>
                <SelectTrigger className="w-[185px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_evacuar">Más unidades sin evacuar</SelectItem>
                  <SelectItem value="meta_asc">Más lentos vs. meta</SelectItem>
                  <SelectItem value="meta_desc">Más rápidos vs. meta</SelectItem>
                  <SelectItem value="rdv_desc">Mejor RDV</SelectItem>
                  <SelectItem value="producido">Mayor producción</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={limpiar}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Limpiar
              </Button>

              <Button variant="outline" size="sm" className="ml-auto"
                      onClick={exportar} disabled={!filtrados.length}>
                <Download className="h-4 w-4 mr-1.5" />Excel
              </Button>
            </div>

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Producido</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.producido)}</div>
                    <div className="text-[11px] text-muted-foreground">{nf(kpis.productos)} productos</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Sin evacuar</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.sinEvacuar)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {nf(kpis.producido ? (kpis.sinEvacuar / kpis.producido) * 100 : 0, 0)}% de lo producido
                    </div>
                  </div>
                  <button onClick={() => setFoco(foco === "sobrecompra" ? "all" : "sobrecompra")}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      foco === "sobrecompra" ? "border-amber-300 bg-amber-50" : "hover:bg-muted/40"}`}>
                    <div className="text-xs text-muted-foreground">Error de compra</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.sobrecompra.n)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      buen RDV, no evacúa · {nf(kpis.sobrecompra.uds)} uds
                    </div>
                  </button>
                  <button onClick={() => setFoco(foco === "mal_producto" ? "all" : "mal_producto")}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      foco === "mal_producto" ? "border-rose-300 bg-rose-50" : "hover:bg-muted/40"}`}>
                    <div className="text-xs text-muted-foreground">Mal producto</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.malProducto.n)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      lento vs. meta y vs. pares · {nf(kpis.malProducto.uds)} uds
                    </div>
                  </button>
                </div>

                {!filtrados.length ? (
                  <EmptyState message="Ningún producto cumple estos filtros." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                          <th className="text-right p-2.5 font-medium">Unidades</th>
                          <th className="text-left p-2.5 font-medium">Ventas por canal</th>
                          <th className="text-left p-2.5 font-medium">Ritmo vs Presupuesto</th>
                          <th className="text-left p-2.5 font-medium">RDV</th>
                          <th className="text-right p-2.5 font-medium">Calidad de venta</th>
                          <th className="text-left p-2.5 font-medium">Cobertura</th>
                          <th className="text-right p-2.5 font-medium">Stock</th>
                          <th className="text-right p-2.5 font-medium">Sell-through</th>
                          <th className="text-right p-2.5 font-medium">Sin evacuar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtrados.slice(0, 200).map(r => {
                          const cm = colorMeta(r.indice_meta);
                          const cr = colorRdv(r.indice_total);
                          const fullOk = (r.pct_venta_full ?? 0) >= (r.med_pctfull_cohorte ?? 0);
                          return (
                            <tr key={r.product_id}
                                onClick={() => setDetalle(r)}
                                className="border-b hover:bg-muted/30 cursor-pointer">
                              <td className="p-2 w-[52px]">
                                {r.image_url ? (
                                  <img src={r.image_url} alt="" loading="lazy"
                                       className="h-11 w-11 rounded object-cover bg-muted" />
                                ) : (
                                  <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                                    <Package className="h-4 w-4 text-muted-foreground/50" />
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 min-w-[185px]">
                                <div className="font-medium leading-tight line-clamp-1">{r.title}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {r.categoria_padre} · {r.coleccion} · Semana {r.semanas_en_venta}
                                  {!r.ventana_completa && <span className="text-sky-700"> · en curso</span>}
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums font-medium">{nf(r.producido)}</div>
                                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {nf(r.uds_120d)} vendidas
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="text-[11px] whitespace-nowrap">
                                  {PERFIL[r.perfil_canal] ?? ""}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                  <span className="flex items-center gap-0.5">
                                    <Store className="h-2.5 w-2.5" />{nf((r.uds_tienda ?? 0) + (r.uds_outlet ?? 0))}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <ShoppingBag className="h-2.5 w-2.5" />{nf(r.uds_online)}
                                  </span>
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="w-[104px]">
                                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`absolute inset-y-0 left-0 rounded-full ${cm.b}`}
                                         style={{ width: `${Math.min(100, ((r.indice_meta ?? 0) / 1.2) * 100)}%` }} />
                                    <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "83.3%" }} />
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-sm font-medium tabular-nums ${cm.t}`}>
                                      {nf(r.indice_meta, 2)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {nf(r.ritmo_dia, 2)}/{nf(r.objetivo_dia, 2)}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="w-[98px]">
                                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                                    <div className="absolute inset-y-0 left-0 rounded-full"
                                         style={{ width: `${Math.min(100, ((r.indice_total ?? 0) / 300) * 100)}%`,
                                                  background: cr }} />
                                    <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: "33.3%" }} />
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className="text-sm font-medium tabular-nums" style={{ color: cr }}>
                                      {r.indice_total == null ? "—" : `${nf(r.indice_total / 100, 2)}×`}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      n={r.n_cohorte}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {r.indice_rasero == null ? "—" : `${nf(r.indice_rasero, 2)}× vs. objetivo de línea`}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground tabular-nums">
                                    {r.ros_total == null ? "—" : `${nf(r.ros_total, 2)} uds/t/sem`}
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 text-right whitespace-nowrap">
                                <div className={`tabular-nums ${fullOk ? "text-emerald-700 font-medium" : ""}`}>
                                  {nf(r.pct_venta_full, 0)}% <span className="text-[10px] text-muted-foreground">a precio full</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">típico {nf(r.med_pctfull_cohorte, 0)}%</div>
                              </td>
                              <td className="p-2.5">
                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                                  COBERTURA_CLS[r.cobertura] ?? ""}`}>
                                  {r.cobertura}
                                </span>
                                {r.wos != null && r.cobertura !== "SIN STOCK" && (
                                  <>
                                    <div className="text-[11px] text-foreground mt-0.5 whitespace-nowrap tabular-nums">
                                      {nf(Math.min(r.wos, 99), 0)} sem de inventario al ritmo actual
                                    </div>
                                    <div className="text-[10px] whitespace-nowrap">
                                      {r.semanas_restantes > 0
                                        ? <span className="text-muted-foreground">Ventana: quedan {r.semanas_restantes} sem</span>
                                        : <span className="text-amber-700">Ventana: +{Math.abs(r.semanas_restantes)} sem de más</span>}
                                      <span className="text-muted-foreground"> · {r.cobertura}</span>
                                    </div>
                                  </>
                                )}
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
                                      {nf(r.st_disponibilizado,0)}% disponible
                                    </div>
                                  </div>
                                  <div>
                                    <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-400"
                                           style={{ width: `${Math.min(100, r.st_total ?? 0)}%` }} />
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                                      {nf(r.st_total,0)}% total
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <span className={`tabular-nums font-medium ${
                                  (r.sin_evacuar ?? 0) > 0 ? "text-rose-700" : "text-muted-foreground"}`}>
                                  {nf(Math.max(0, r.sin_evacuar ?? 0))}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filtrados.length > 200 && (
                      <div className="p-2.5 text-center text-xs text-muted-foreground border-t">
                        Mostrando 200 de {nf(filtrados.length)}. Exporta el Excel para ver el resto.
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Índice vs. meta:</span>
                  <span>1,00 = evacúa dentro de la ventana de 120 días</span>
                  <span className="font-medium text-foreground ml-2">RDV:</span>
                  <span>1,00× = al ritmo del producto típico de su cohorte</span>
                  <span className="ml-2">La marca en cada barra es el objetivo</span>
                  <span className="font-medium text-foreground ml-2">Sell-through:</span>
                  <span>verde sobre lo disponibilizado, gris sobre el total (incluye bodega). La diferencia es el inventario detenido.</span>
                </div>
              </>
            )}
          </div>

          {detalle && (
            <ProductoDetallePanel producto={detalle} onClose={() => setDetalle(null)} />
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}
