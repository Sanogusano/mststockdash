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
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";

/**
 * Ciclo de venta de producto.
 *
 * El eje son SEMANAS DESDE LA PRIMERA VENTA, no fechas calendario: así se
 * pueden comparar productos que salieron en momentos distintos y ver la forma
 * del ciclo, no el ruido de la estacionalidad.
 *
 * La línea de referencia es la curva típica de su cohorte (categoría padre ×
 * género): cómo se reparte la venta a lo largo de la vida en productos
 * parecidos. Un producto por debajo de esa curva en las primeras semanas rara
 * vez la recupera.
 *
 * Dato del catálogo: el pico está en la semana 2, y en las primeras 8 semanas
 * se vende ~45% del total de la vida del producto.
 */

interface PuntoCurva {
  eje: number;
  semana: string;
  uds: number;
  uds_tienda: number;
  uds_online: number;
  uds_full: number;
  uds_rebajada: number;
  acumulado: number;
  pct_acumulado: number | null;
  pct_semana: number | null;
  pct_cohorte: number | null;
}

interface ProductoLista {
  product_id: string;
  title: string;
  category: string;
  categoria_padre: string | null;
  coleccion: string;
  image_url: string | null;
  unidades_vendidas: number;
  semanas_en_venta: number;
  indice_total: number | null;
  desempeno: string;
  cobertura: string;
  n_cohorte: number;
  base_cohorte: string;
}

const VENTANA = 16;

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Cómo leer esta curva</h3>
      <p className="text-muted-foreground text-xs leading-relaxed">
        El eje horizontal son <strong className="text-foreground">semanas desde la primera
        venta</strong>, no fechas. Así se puede comparar un producto que salió en febrero con
        uno que salió en julio: ambos empiezan en la semana 0.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        La <strong className="text-foreground">línea punteada</strong> es la curva típica de su
        cohorte: cómo reparte su venta a lo largo de la vida un producto parecido. Si el producto
        va por encima, está vendiendo más rápido de lo normal para su tipo.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        En el catálogo, el pico está en la <strong className="text-foreground">semana 2</strong> y
        en las primeras 8 semanas se vende cerca del 45% del total. Un producto que arranca por
        debajo de su curva rara vez la recupera: la decisión de reponer o descontar se toma
        temprano, no al final.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        La <strong className="text-foreground">línea vertical</strong> marca la semana 16, cierre
        de la ventana comercial.
      </p>
    </div>
  );
}

export default function CicloVenta() {
  const [productos, setProductos] = useState<ProductoLista[]>([]);
  const [seleccionado, setSeleccionado] = useState<ProductoLista | null>(null);
  const [curva, setCurva] = useState<PuntoCurva[]>([]);
  const [cargandoLista, setCargandoLista] = useState(true);
  const [cargandoCurva, setCargandoCurva] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [coleccion, setColeccion] = useState("all");
  const [ayuda, setAyuda] = useState(false);
  const [vista, setVista] = useState<"unidades" | "acumulado">("unidades");

  // Lista de productos
  useEffect(() => {
    let activo = true;
    (async () => {
      setCargandoLista(true);
      const PAGINA = 1000;
      const acc: ProductoLista[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("mv_producto_clasificacion")
            .select("product_id,title,category,categoria_padre,coleccion,image_url,unidades_vendidas,semanas_en_venta,indice_total,desempeno,cobertura,n_cohorte,base_cohorte")
            .order("unidades_vendidas", { ascending: false })
            .order("product_id", { ascending: true })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as ProductoLista[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 20000) break;
        }
        if (!activo) return;
        setProductos(acc);
        if (acc.length > 0) setSeleccionado(acc[0]);
      } catch (e: any) {
        if (activo) setError(e?.message ?? String(e));
      } finally {
        if (activo) setCargandoLista(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  // Curva del producto seleccionado
  useEffect(() => {
    if (!seleccionado) return;
    let activo = true;
    (async () => {
      setCargandoCurva(true);
      const { data, error } = await supabase.rpc("reporte_curva_producto", {
        p_product_id: seleccionado.product_id,
        p_modo: "vida",
      });
      if (!activo) return;
      if (error) setError(error.message);
      else setCurva((data ?? []) as PuntoCurva[]);
      setCargandoCurva(false);
    })();
    return () => { activo = false; };
  }, [seleccionado]);

  const colecciones = useMemo(
    () => Array.from(new Set(productos.map(p => p.coleccion).filter(Boolean))).sort(),
    [productos]
  );

  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos
      .filter(p =>
        (coleccion === "all" || p.coleccion === coleccion) &&
        (!q || p.title?.toLowerCase().includes(q))
      )
      .slice(0, 150);
  }, [productos, coleccion, busqueda]);

  // Hitos: pico, semanas al 50% y al 80% de la venta
  const hitos = useMemo(() => {
    if (!curva.length) return null;
    const pico = curva.reduce((a, b) => (b.uds > a.uds ? b : a), curva[0]);
    const al50 = curva.find(p => (p.pct_acumulado ?? 0) >= 50);
    const al80 = curva.find(p => (p.pct_acumulado ?? 0) >= 80);
    const primeras8 = curva.filter(p => p.eje < 8).reduce((s, p) => s + p.uds, 0);
    const total = curva.reduce((s, p) => s + p.uds, 0);
    return {
      pico,
      al50: al50?.eje ?? null,
      al80: al80?.eje ?? null,
      pctPrimeras8: total ? (primeras8 / total) * 100 : 0,
      semanasSinVenta: curva.filter(p => p.uds === 0).length,
    };
  }, [curva]);

  const exportar = () => {
    if (!curva.length || !seleccionado) return;
    const datos = curva.map(p => ({
      "Semana de vida": p.eje,
      "Semana calendario": p.semana,
      "Uds vendidas": p.uds,
      "Uds tienda": p.uds_tienda,
      "Uds online": p.uds_online,
      "Uds precio full": p.uds_full,
      "Uds rebajadas": p.uds_rebajada,
      Acumulado: p.acumulado,
      "% acumulado": p.pct_acumulado,
      "% de su venta esa semana": p.pct_semana,
      "% típico de la cohorte": p.pct_cohorte,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws, [
      [`Ciclo de venta — ${seleccionado.title}`],
      [`${seleccionado.categoria_padre ?? seleccionado.category} · ${seleccionado.coleccion} · cohorte de ${seleccionado.n_cohorte} productos (${seleccionado.base_cohorte})`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 15 }, { wch: 18 }, ...Array(9).fill({ wch: 14 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ciclo de venta");
    XLSX.writeFile(wb, `ciclo-venta-${seleccionado.title.slice(0, 30)}.xlsx`);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Ciclo de venta</h1>
              <p className="text-xs text-muted-foreground">
                Curva semanal desde la primera venta, contra el patrón típico de su cohorte
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo leerla
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            )}

            <div className="grid lg:grid-cols-[300px_1fr] gap-4">
              {/* Selector de producto */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar producto…" className="pl-8"
                         value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                </div>
                <Select value={coleccion} onValueChange={setColeccion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>

                {cargandoLista ? (
                  <LoadingState rows={8} />
                ) : (
                  <div className="rounded-lg border divide-y max-h-[calc(100vh-260px)] overflow-y-auto">
                    {listaFiltrada.map(p => (
                      <button
                        key={p.product_id}
                        onClick={() => setSeleccionado(p)}
                        className={`w-full flex items-center gap-2.5 p-2 text-left transition-colors ${
                          seleccionado?.product_id === p.product_id
                            ? "bg-primary/10" : "hover:bg-muted/40"
                        }`}
                      >
                        {p.image_url ? (
                          <img src={p.image_url} alt="" loading="lazy"
                               className="h-9 w-9 rounded object-cover bg-muted shrink-0" />
                        ) : (
                          <div className="h-9 w-9 rounded bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-3.5 w-3.5 text-muted-foreground/50" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium line-clamp-1">{p.title}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {nf(p.unidades_vendidas)} uds · sem {p.semanas_en_venta}
                          </div>
                        </div>
                      </button>
                    ))}
                    {listaFiltrada.length === 0 && (
                      <div className="p-4 text-xs text-muted-foreground text-center">
                        Sin resultados
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Curva */}
              <div className="space-y-4">
                {!seleccionado ? (
                  <EmptyState message="Elige un producto de la lista." />
                ) : (
                  <>
                    <div className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {seleccionado.image_url ? (
                            <img src={seleccionado.image_url} alt=""
                                 className="h-14 w-14 rounded object-cover bg-muted" />
                          ) : (
                            <div className="h-14 w-14 rounded bg-muted flex items-center justify-center">
                              <Package className="h-5 w-5 text-muted-foreground/50" />
                            </div>
                          )}
                          <div>
                            <h2 className="font-semibold">{seleccionado.title}</h2>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {seleccionado.categoria_padre ?? seleccionado.category} ·{" "}
                              {seleccionado.coleccion} · Semana {seleccionado.semanas_en_venta} ·{" "}
                              {nf(seleccionado.unidades_vendidas)} uds vendidas
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              Comparado con {seleccionado.n_cohorte} productos de su{" "}
                              {seleccionado.base_cohorte}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="inline-flex rounded-md border p-0.5">
                            <button onClick={() => setVista("unidades")}
                              className={`px-2.5 py-1 text-xs rounded ${
                                vista === "unidades" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                              Semanal
                            </button>
                            <button onClick={() => setVista("acumulado")}
                              className={`px-2.5 py-1 text-xs rounded ${
                                vista === "acumulado" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                              Acumulado
                            </button>
                          </div>
                          <Button variant="outline" size="sm" onClick={exportar} disabled={!curva.length}>
                            <Download className="h-4 w-4 mr-1.5" />Excel
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Hitos del ciclo */}
                    {hitos && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { l: "Semana pico", v: `Sem ${hitos.pico.eje}`, s: `${nf(hitos.pico.uds)} uds` },
                          { l: "Mitad de su venta", v: hitos.al50 != null ? `Sem ${hitos.al50}` : "—", s: "50% acumulado" },
                          { l: "80% de su venta", v: hitos.al80 != null ? `Sem ${hitos.al80}` : "—", s: "80% acumulado" },
                          { l: "Primeras 8 semanas", v: `${nf(hitos.pctPrimeras8, 0)}%`, s: `típico ~45%` },
                        ].map(k => (
                          <div key={k.l} className="rounded-lg border p-3">
                            <div className="text-[11px] text-muted-foreground">{k.l}</div>
                            <div className="text-lg font-semibold tabular-nums mt-0.5">{k.v}</div>
                            <div className="text-[10px] text-muted-foreground">{k.s}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="rounded-lg border p-4">
                      {cargandoCurva ? (
                        <LoadingState rows={6} />
                      ) : !curva.length ? (
                        <EmptyState message="Sin datos de venta para este producto." />
                      ) : (
                        <ResponsiveContainer width="100%" height={340}>
                          <ComposedChart data={curva} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                            <XAxis dataKey="eje" tick={{ fontSize: 11 }}
                                   label={{ value: "Semanas desde la primera venta",
                                            position: "insideBottom", offset: -4, fontSize: 11 }} />
                            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                                   unit="%" />
                            <Tooltip
                              formatter={(value: any, name: string) =>
                                name.includes("%") ? [`${value}%`, name] : [nf(Number(value)), name]}
                              labelFormatter={(l: any) => {
                                const p = curva.find(c => c.eje === l);
                                return `Semana ${l}${p ? ` · ${p.semana}` : ""}`;
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <ReferenceLine x={VENTANA} yAxisId="left" stroke="#d03b3b"
                                           strokeDasharray="4 4"
                                           label={{ value: "cierre ventana", fontSize: 10, fill: "#d03b3b" }} />

                            {vista === "unidades" ? (
                              <>
                                <Bar yAxisId="left" dataKey="uds_tienda" stackId="a"
                                     fill="#7c5cd6" name="Tienda" />
                                <Bar yAxisId="left" dataKey="uds_online" stackId="a"
                                     fill="#2a9dd6" name="Online" />
                                <Line yAxisId="right" type="monotone" dataKey="pct_semana"
                                      stroke="#0ca30c" strokeWidth={2} dot={false}
                                      name="% de su venta" />
                                <Line yAxisId="right" type="monotone" dataKey="pct_cohorte"
                                      stroke="#898781" strokeWidth={1.5} strokeDasharray="5 4"
                                      dot={false} name="% típico de su cohorte" />
                              </>
                            ) : (
                              <>
                                <Bar yAxisId="left" dataKey="acumulado" fill="#7c5cd6"
                                     name="Unidades acumuladas" />
                                <Line yAxisId="right" type="monotone" dataKey="pct_acumulado"
                                      stroke="#0ca30c" strokeWidth={2} dot={false}
                                      name="% acumulado" />
                              </>
                            )}
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Desglose por canal del período */}
                    {curva.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          { i: Store, l: "Tienda", v: curva.reduce((s, p) => s + p.uds_tienda, 0) },
                          { i: ShoppingBag, l: "Online", v: curva.reduce((s, p) => s + p.uds_online, 0) },
                          { i: Package, l: "Precio full", v: curva.reduce((s, p) => s + p.uds_full, 0) },
                          { i: Package, l: "Rebajado", v: curva.reduce((s, p) => s + p.uds_rebajada, 0) },
                        ].map(k => (
                          <div key={k.l} className="rounded-lg border p-3">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <k.i className="h-3.5 w-3.5" />{k.l}
                            </div>
                            <div className="text-lg font-semibold tabular-nums mt-0.5">{nf(k.v)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
