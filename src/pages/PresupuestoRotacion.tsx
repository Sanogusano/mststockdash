import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Package, Store, ShoppingBag, HelpCircle, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Presupuesto de rotación.
 *
 * Mide cada producto contra SU PROPIO objetivo, no contra otros productos:
 *
 *   producido      = vendido + stock en bodegas + stock en tiendas
 *   objetivo/día   = producido ÷ 120   (ventana comercial de 16 semanas)
 *   ritmo/día      = unidades vendidas dentro de sus primeros 120 días
 *   índice meta    = ritmo ÷ objetivo   →  1,00 = evacúa a tiempo
 *
 * Se muestran DOS indicadores a propósito:
 *   · Índice contra 1,00 — el objetivo declarado. Si toda la operación está
 *     sobreproducida, esto lo hace visible.
 *   · Percentil del catálogo — contexto relativo, para priorizar dentro de ese
 *     universo. Solo el relativo normalizaría la sobreproducción y la
 *     escondería.
 *
 * SEGUNDAS queda fuera del denominador: son productos con defecto que no se
 * venden a precio normal, e incluirlos haría el objetivo inalcanzable.
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
  unidades_vendidas: number;
  stock_bodegas: number;
  stock_tiendas: number;
  stock_segundas?: number;
  producido: number;
  uds_120d: number;
  uds_120d_tienda: number;
  uds_120d_online: number;
  dias_medidos: number;
  ventana_completa: boolean;
  peso_online: number;
  objetivo_dia: number | null;
  objetivo_dia_tienda: number | null;
  objetivo_dia_online: number | null;
  ritmo_dia: number | null;
  ritmo_dia_tienda: number | null;
  ritmo_dia_online: number | null;
  indice_meta: number | null;
  pct_evacuado_120d: number | null;
  pct_evacuado_total: number | null;
  percentil_catalogo: number | null;
  velocidad_meta: string;
  desempeno: string;
  cobertura: string;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function colorMeta(i: number | null) {
  if (i == null) return { t: "text-muted-foreground", b: "bg-muted" };
  if (i >= 1.0)  return { t: "text-emerald-700", b: "bg-emerald-500" };
  if (i >= 0.8)  return { t: "text-amber-700",   b: "bg-amber-500" };
  if (i >= 0.6)  return { t: "text-orange-700",  b: "bg-orange-500" };
  return { t: "text-rose-700", b: "bg-rose-500" };
}

/** Comparación objetivo vs. real de un canal. */
function Canal({ icono: Icono, objetivo, real }: {
  icono: any; objetivo: number | null; real: number | null;
}) {
  const ok = (real ?? 0) >= (objetivo ?? 0);
  const pct = objetivo && objetivo > 0
    ? Math.min(100, ((real ?? 0) / objetivo) * 100) : 0;
  return (
    <div className="w-[92px]">
      <div className="flex items-center gap-1 text-[11px] tabular-nums">
        <Icono className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className={ok ? "text-emerald-700 font-medium" : ""}>{nf(real, 2)}</span>
        <span className="text-muted-foreground">/ {nf(objetivo, 2)}</span>
      </div>
      <div className="relative h-1 rounded-full bg-muted mt-1 overflow-hidden">
        <div className={`absolute inset-y-0 left-0 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-400"}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Cómo se calcula</h3>
      <div className="rounded border bg-background p-3 font-mono text-xs space-y-1">
        <div>producido    = vendido + stock bodegas + stock tiendas</div>
        <div>objetivo/día = producido ÷ 120 días</div>
        <div>ritmo/día    = vendido en sus primeros 120 días ÷ días transcurridos</div>
        <div>índice       = ritmo ÷ objetivo</div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        <strong className="text-foreground">1,00 significa que evacúa justo a tiempo:</strong> a
        ese ritmo, todo lo producido sale en la ventana de 16 semanas. Un 0,50 dice que va a la
        mitad de velocidad y que al cerrar la ventana quedará la mitad sin vender.
      </p>
      <div className="grid md:grid-cols-2 gap-3 border-t pt-3">
        <div>
          <p className="font-medium text-xs mb-1">Índice contra la meta</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Compara el producto con su propio objetivo. Si toda la operación está sobreproducida,
            este número lo deja ver.
          </p>
        </div>
        <div>
          <p className="font-medium text-xs mb-1">Percentil del catálogo</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Dónde queda frente al resto de productos que ya recorrieron su ventana. Sirve para
            priorizar dentro de un universo que puede estar lento en bloque.
          </p>
        </div>
      </div>
      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Objetivo por canal</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          El objetivo diario se reparte según el peso real que online tiene en esa categoría. Un
          producto puede cumplir la meta total y aun así estar desviado: si toda la venta salió
          por web cuando el plan era piso, funcionó por una razón distinta a la prevista.
          Outlet no tiene objetivo propio, pero sus ventas cuentan como evacuación.
        </p>
      </div>
      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Qué no incluye</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Las unidades en SEGUNDAS quedan fuera del denominador: son producto con defecto que no
          se vende a precio normal. Y mientras el snapshot de NetSuite no traiga todas las
          bodegas, lo producido queda subestimado y el índice sale más alto de lo real.
        </p>
      </div>
    </div>
  );
}

export default function PresupuestoRotacion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [coleccion, setColeccion] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [velocidad, setVelocidad] = useState("all");
  const [soloCompletos, setSoloCompletos] = useState("todos");
  const [orden, setOrden] = useState<"indice_asc" | "indice_desc" | "producido" | "faltante">("indice_asc");
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
            .from("producto_rotacion")
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
      if (categoria !== "all" &&
          `${r.categoria_padre} · ${r.genero_norm}` !== categoria) return false;
      if (velocidad !== "all" && r.velocidad_meta !== velocidad) return false;
      if (soloCompletos === "completos" && !r.ventana_completa) return false;
      if (soloCompletos === "en_curso" && r.ventana_completa) return false;
      if (q && !r.title?.toLowerCase().includes(q)) return false;
      return r.producido > 0;
    });
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      indice_asc:  (a, b) => (a.indice_meta ?? 99) - (b.indice_meta ?? 99),
      indice_desc: (a, b) => (b.indice_meta ?? 0) - (a.indice_meta ?? 0),
      producido:   (a, b) => b.producido - a.producido,
      faltante:    (a, b) => (b.producido - b.uds_120d) - (a.producido - a.uds_120d),
    };
    return [...base].sort(cmp[orden]);
  }, [rows, coleccion, categoria, velocidad, soloCompletos, busqueda, orden]);

  const kpis = useMemo(() => {
    const conVentana = filtrados.filter(r => r.ventana_completa);
    const producido = filtrados.reduce((s, r) => s + r.producido, 0);
    const vendido = filtrados.reduce((s, r) => s + r.uds_120d, 0);
    const lentos = filtrados.filter(r => (r.indice_meta ?? 0) < 0.6);
    return {
      productos: filtrados.length,
      producido,
      vendido,
      pctEvacuado: producido ? (vendido / producido) * 100 : 0,
      lentos: lentos.length,
      udsLentos: lentos.reduce((s, r) => s + (r.producido - r.uds_120d), 0),
      indiceMediano: conVentana.length
        ? [...conVentana].map(r => r.indice_meta ?? 0).sort((a, b) => a - b)[Math.floor(conVentana.length / 2)]
        : null,
    };
  }, [filtrados]);

  const exportar = () => {
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Producto: r.title,
      Categoría: r.categoria_padre, Género: r.genero_norm, Colección: r.coleccion,
      "Semanas en venta": r.semanas_en_venta,
      "Ventana completa": r.ventana_completa ? "Sí" : "En curso",
      Producido: r.producido,
      "Stock bodegas": r.stock_bodegas,
      "Stock tiendas": r.stock_tiendas,
      "Stock segundas (excluido)": r.stock_segundas,
      "Vendido en 120 días": r.uds_120d,
      "Vendido tienda 120d": r.uds_120d_tienda,
      "Vendido online 120d": r.uds_120d_online,
      "Objetivo uds/día": r.objetivo_dia,
      "Objetivo tienda/día": r.objetivo_dia_tienda,
      "Objetivo online/día": r.objetivo_dia_online,
      "Ritmo real uds/día": r.ritmo_dia,
      "Ritmo tienda/día": r.ritmo_dia_tienda,
      "Ritmo online/día": r.ritmo_dia_online,
      "Índice vs. meta": r.indice_meta,
      "Percentil catálogo": r.percentil_catalogo,
      "% evacuado en 120 días": r.pct_evacuado_120d,
      "% evacuado total": r.pct_evacuado_total,
      Velocidad: r.velocidad_meta,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" } as any);
    XLSX.utils.sheet_add_aoa(ws, [
      ["Presupuesto de rotación — objetivo = producido ÷ 120 días (ventana de 16 semanas)"],
      [`Índice 1,00 = evacúa a tiempo · SEGUNDAS excluidas del denominador · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" } as any);
    ws["!cols"] = [{ wch: 42 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, ...Array(20).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto rotación");
    XLSX.writeFile(wb, "presupuesto-rotacion.xlsx");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Presupuesto de rotación</h1>
              <p className="text-xs text-muted-foreground">
                Ritmo diario necesario para evacuar lo producido en 120 días
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo se calcula
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar producto…" className="pl-8 w-[190px]"
                       value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
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

              <Select value={velocidad} onValueChange={setVelocidad}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toda velocidad</SelectItem>
                  <SelectItem value="EVACUA A TIEMPO">Evacúa a tiempo</SelectItem>
                  <SelectItem value="RITMO MEDIO">Ritmo medio</SelectItem>
                  <SelectItem value="LENTO">Lento</SelectItem>
                </SelectContent>
              </Select>

              <Select value={soloCompletos} onValueChange={setSoloCompletos}>
                <SelectTrigger className="w-[165px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="completos">Ventana cumplida</SelectItem>
                  <SelectItem value="en_curso">En curso</SelectItem>
                </SelectContent>
              </Select>

              <Select value={orden} onValueChange={v => setOrden(v as typeof orden)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="indice_asc">Más lentos primero</SelectItem>
                  <SelectItem value="indice_desc">Más rápidos primero</SelectItem>
                  <SelectItem value="producido">Mayor producción</SelectItem>
                  <SelectItem value="faltante">Más unidades sin evacuar</SelectItem>
                </SelectContent>
              </Select>

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
                    <div className="text-xs text-muted-foreground">Evacuado en ventana</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">
                      {nf(kpis.pctEvacuado, 1)}%
                    </div>
                    <div className="text-[11px] text-muted-foreground">{nf(kpis.vendido)} uds</div>
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Índice mediano</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">
                      {nf(kpis.indiceMediano, 2)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">meta 1,00</div>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                    <div className="text-xs text-rose-700">Sin evacuar en lentos</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.udsLentos)}</div>
                    <div className="text-[11px] text-muted-foreground">{nf(kpis.lentos)} productos bajo 0,60</div>
                  </div>
                </div>

                {!filtrados.length ? (
                  <EmptyState message="Ningún producto cumple estos filtros." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                          <th className="text-right p-2.5 font-medium">Producido</th>
                          <th className="text-right p-2.5 font-medium">Vendido 120d</th>
                          <th className="text-left p-2.5 font-medium">Índice vs. meta</th>
                          <th className="text-left p-2.5 font-medium">Tienda real/obj</th>
                          <th className="text-left p-2.5 font-medium">Online real/obj</th>
                          <th className="text-right p-2.5 font-medium">Percentil</th>
                          <th className="text-right p-2.5 font-medium">Sin evacuar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtrados.slice(0, 200).map(r => {
                          const c = colorMeta(r.indice_meta);
                          const faltan = r.producido - r.uds_120d;
                          return (
                            <tr key={r.product_id} className="border-b hover:bg-muted/20">
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
                              <td className="p-2.5 min-w-[190px]">
                                <div className="font-medium leading-tight line-clamp-1">{r.title}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {r.categoria_padre} · {r.coleccion} · Semana {r.semanas_en_venta}
                                  {!r.ventana_completa && (
                                    <span className="ml-1 text-sky-700">· en curso</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums font-medium">{nf(r.producido)}</div>
                                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {nf(r.stock_bodegas)} bod · {nf(r.stock_tiendas)} tie
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums">{nf(r.uds_120d)}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {nf(r.pct_evacuado_120d, 0)}%
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="w-[108px]">
                                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                                    <div className={`absolute inset-y-0 left-0 rounded-full ${c.b}`}
                                         style={{ width: `${Math.min(100, ((r.indice_meta ?? 0) / 1.2) * 100)}%` }} />
                                    <div className="absolute inset-y-0 w-px bg-foreground/60"
                                         style={{ left: "83.3%" }} />
                                  </div>
                                  <div className="flex items-baseline gap-1.5 mt-1">
                                    <span className={`text-sm font-medium tabular-nums ${c.t}`}>
                                      {nf(r.indice_meta, 2)}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground tabular-nums">
                                      {nf(r.ritmo_dia, 2)} / {nf(r.objetivo_dia, 2)} uds día
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5">
                                <Canal icono={Store} objetivo={r.objetivo_dia_tienda} real={r.ritmo_dia_tienda} />
                              </td>
                              <td className="p-2.5">
                                <Canal icono={ShoppingBag} objetivo={r.objetivo_dia_online} real={r.ritmo_dia_online} />
                              </td>
                              <td className="p-2.5 text-right">
                                {r.percentil_catalogo != null ? (
                                  <>
                                    <div className="tabular-nums">{r.percentil_catalogo}</div>
                                    <div className="text-[10px] text-muted-foreground">del catálogo</div>
                                  </>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="p-2.5 text-right">
                                <span className={`tabular-nums ${faltan > 0 ? "text-rose-700 font-medium" : "text-muted-foreground"}`}>
                                  {nf(Math.max(0, faltan))}
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
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />≥1,00 evacúa a tiempo</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d9a441" }} />0,80–0,99</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#e08040" }} />0,60–0,79</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d2685f" }} />&lt;0,60 lento</span>
                  <span className="ml-2">
                    La marca en la barra es la meta · SEGUNDAS excluidas del producido
                  </span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
