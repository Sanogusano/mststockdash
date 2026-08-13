import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Download, HelpCircle, X, Store, ShoppingBag, PauseCircle, ChevronRight } from "lucide-react";
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
 * Las tres preguntas son las mismas:
 *   ¿Evacuó lo esperado?  -> índice meta (70% en 120 días)
 *   ¿Vendió con margen?   -> % venta sana
 *   ¿Dónde está el stock? -> disponible vs. detenido
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
        <strong className="text-foreground">Clic en una línea</strong> para ver el desglose de sus
        productos por diagnóstico y el detalle de dónde está el stock.
      </p>
    </div>
  );
}

export default function Linea360() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [genero, setGenero] = useState("all");
  const [orden, setOrden] = useState<"sin_evacuar" | "meta_asc" | "meta_desc" | "producido">("sin_evacuar");
  const [ayuda, setAyuda] = useState(false);

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

  const generos = useMemo(
    () => Array.from(new Set(rows.map(r => r.genero_norm).filter(Boolean))).sort(), [rows]);

  const filtrados = useMemo(() => {
    const base = rows.filter(r => genero === "all" || r.genero_norm === genero);
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      sin_evacuar: (a, b) => (b.sin_evacuar ?? 0) - (a.sin_evacuar ?? 0),
      meta_asc: (a, b) => (a.indice_meta ?? 99) - (b.indice_meta ?? 99),
      meta_desc: (a, b) => (b.indice_meta ?? 0) - (a.indice_meta ?? 0),
      producido: (a, b) => (b.producido ?? 0) - (a.producido ?? 0),
    };
    return [...base].sort(cmp[orden]);
  }, [rows, genero, orden]);

  const kpis = useMemo(() => ({
    lineas: filtrados.length,
    productos: filtrados.reduce((s, r) => s + r.n_productos, 0),
    producido: filtrados.reduce((s, r) => s + (r.producido ?? 0), 0),
    sinEvacuar: filtrados.reduce((s, r) => s + (r.sin_evacuar ?? 0), 0),
    detenido: filtrados.reduce((s, r) => s + (r.stock_detenido ?? 0), 0),
  }), [filtrados]);

  const exportar = () => {
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Línea: r.categoria_padre, Género: r.genero_norm,
      Productos: r.n_productos, "Con ventana cumplida": r.n_con_ventana,
      Producido: r.producido, "Vendido total": r.vendido, "Vendido en 120d": r.vendido_120d,
      "Objetivo (70%)": r.objetivo_unidades, "Sin evacuar": r.sin_evacuar,
      "% evacuado 120d": r.pct_evacuado_120d, "Índice vs. meta": r.indice_meta,
      "Stock disponible": r.stock_disponibilizado, "Stock detenido": r.stock_detenido,
      "ST disponible": r.st_disponibilizado, "ST total": r.st_total,
      "% venta sana": r.pct_venta_sana, "% full": r.pct_venta_full,
      "% activación": r.pct_activacion, "% rebaja": r.pct_rebaja,
      "Desc. activación": r.desc_activacion_pct,
      "Uds tienda": r.uds_tienda, "Uds online": r.uds_online, "% online": r.mix_online_pct,
      "RDV vs. cohorte": r.indice_total,
      Repetir: r.n_repetir, "Revisar cantidad": r.n_revisar_cantidad,
      "Revisar precio": r.n_revisar_precio, "Revisar concepto": r.n_revisar_concepto,
      "En curso": r.n_en_curso,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws, [
      ["Análisis por línea — índice vs. meta (70% de lo producido en 120 días)"],
      [`Índice 1,00 = la línea evacuó lo esperado · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 24 }, { wch: 12 }, ...Array(26).fill({ wch: 13 })];
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
              <Select value={genero} onValueChange={setGenero}>
                <SelectTrigger className="w-[165px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los géneros</SelectItem>
                  {generos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={orden} onValueChange={v => setOrden(v as typeof orden)}>
                <SelectTrigger className="w-[195px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
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

            {loading ? (
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
                        <th className="text-right p-2.5 font-medium">Producido</th>
                        <th className="text-left p-2.5 font-medium">Ritmo vs. presupuesto</th>
                        <th className="text-left p-2.5 font-medium">Calidad de venta</th>
                        <th className="text-left p-2.5 font-medium">Stock</th>
                        <th className="text-left p-2.5 font-medium">Canal</th>
                        <th className="text-left p-2.5 font-medium">Productos</th>
                        <th className="text-right p-2.5 font-medium">Sin evacuar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map(r => {
                        const c = colorMeta(r.indice_meta);
                        const abierta = expandida === claveDe(r);
                        return (
                          <>
                            <tr key={claveDe(r)}
                                onClick={() => setExpandida(abierta ? null : claveDe(r))}
                                className="border-b hover:bg-muted/30 cursor-pointer">
                              <td className="p-2.5 min-w-[175px]">
                                <div className="flex items-center gap-1">
                                  <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${abierta ? "rotate-90" : ""}`} />
                                  <div>
                                    <div className="font-medium leading-tight">{r.categoria_padre}</div>
                                    <div className="text-[11px] text-muted-foreground">
                                      {r.genero_norm} · {r.n_productos} refs · {r.n_colecciones} colecciones
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums font-medium">{nf(r.producido)}</div>
                                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {nf(r.vendido_120d)} en ventana
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
                                <div className="tabular-nums">{nf(r.pct_venta_sana, 0)}%
                                  <span className="text-[10px] text-muted-foreground ml-1">sin liquidar</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {nf(r.pct_venta_full, 0)}% full · {nf(r.pct_activacion, 0)}% activación
                                  {r.desc_activacion_pct != null && ` · −${nf(r.desc_activacion_pct, 0)}%`}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="tabular-nums text-xs">{nf(r.stock_disponibilizado)}
                                  <span className="text-[10px] text-muted-foreground ml-1">disponible</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs">
                                  <PauseCircle className="h-3 w-3 text-amber-700" />
                                  <span className="tabular-nums text-amber-700">{nf(r.stock_detenido)}</span>
                                  <span className="text-[10px] text-muted-foreground">detenido</span>
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
                                <div className="flex gap-1 text-[10px]">
                                  {r.n_repetir > 0 && (
                                    <span className="rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800"
                                          title="Repetir">{r.n_repetir}</span>
                                  )}
                                  {r.n_revisar_cantidad > 0 && (
                                    <span className="rounded px-1.5 py-0.5 bg-orange-100 text-orange-800"
                                          title="Revisar cantidad">{r.n_revisar_cantidad}</span>
                                  )}
                                  {r.n_revisar_precio > 0 && (
                                    <span className="rounded px-1.5 py-0.5 bg-amber-100 text-amber-800"
                                          title="Revisar precio">{r.n_revisar_precio}</span>
                                  )}
                                  {r.n_revisar_concepto > 0 && (
                                    <span className="rounded px-1.5 py-0.5 bg-rose-100 text-rose-800"
                                          title="Revisar concepto">{r.n_revisar_concepto}</span>
                                  )}
                                  {r.n_en_curso > 0 && (
                                    <span className="rounded px-1.5 py-0.5 bg-sky-100 text-sky-800"
                                          title="En curso">{r.n_en_curso}</span>
                                  )}
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
                                <td colSpan={8} className="p-4">
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
                                          <div key={x.l} className="flex justify-between">
                                            <span className={x.c}>{x.l}</span>
                                            <span className="tabular-nums">
                                              {x.v} refs
                                              {x.sub != null && (
                                                <span className="text-muted-foreground"> · {nf(x.sub)} uds</span>
                                              )}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <h4 className="text-xs font-medium mb-2">Otros indicadores</h4>
                                      <div className="space-y-1 text-xs">
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
                  <span className="ml-2">Clic en una línea para ver el detalle</span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
