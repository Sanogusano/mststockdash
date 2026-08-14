import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Download, Package, AlertTriangle, Megaphone, Clock, Layers,
  HelpCircle, X, RotateCcw, ArrowRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Alertas de distribución — riesgos de agotado y mala colocación.
 *
 * Cuatro alertas, nombradas por la ACCIÓN que requieren:
 *   AGOTADO VENDIENDO   · stock 0 donde la tienda vende ≥1 uds/semana
 *   IMPULSAR            · hay stock, cero ventas, pero la línea rota en esa
 *                         tienda y el producto se vende en el resto de la red
 *   QUIEBRE EN 2 SEMANAS · menos de 2 semanas de cobertura
 *   SOBRESTOCK          · más de 20 semanas de cobertura
 *
 * IMPULSAR es la más accionable: el producto ya está en la tienda correcta con
 * demanda probada. No necesita logística ni producción, solo push. El filtro
 * por ritmo de línea es lo que quita el ruido — si la tienda no vende esa
 * categoría en general, que este producto no venda es normal.
 *
 * No se reproduce inventario: cuando un agotado no tiene stock en la red, no
 * hay solución posible. Por eso la etiqueta es "sin reposición".
 */

interface Row {
  sku: string;
  location_id: string;
  tienda: string;
  ciudad: string | null;
  zona: string | null;
  tier: string | null;
  producto: string | null;
  linea: string | null;
  color: string | null;
  talla: string | null;
  image_url: string | null;
  stock: number;
  ritmo_semanal: number;
  uds_28d: number;
  wos: number | null;
  wos_objetivo: number | null;
  stock_red_cedible: number;
  ritmo_linea_tienda: number | null;
  ritmo_red: number | null;
  tiendas_vendiendo: number | null;
  alerta: string;
  severidad: number;
  venta_perdida_semanal: number | null;
  tiene_solucion: boolean;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

const BADGE: Record<string, string> = {
  "AGOTADO VENDIENDO":    "bg-rose-100 text-rose-800",
  "IMPULSAR":             "bg-violet-100 text-violet-800",
  "QUIEBRE EN 2 SEMANAS": "bg-amber-100 text-amber-800",
  "SOBRESTOCK":           "bg-sky-100 text-sky-800",
};

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Qué mira cada alerta</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-rose-700">Agotado vendiendo</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            La tienda vende al menos una unidad por semana y hoy está en cero. Cada semana sin
            producto es venta que no vuelve.
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-violet-700">Impulsar</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Hay stock y cero ventas, pero la tienda sí vende esa línea y el producto sí rota en el
            resto de la red. <strong className="text-foreground">No es falta de demanda: le falta
            push.</strong>
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-amber-700">Quiebre en 2 semanas</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Al ritmo actual el stock se acaba antes de dos semanas. Todavía hay tiempo de reponer.
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-sky-700">Sobrestock</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Más de 20 semanas de cobertura. Ese inventario le sirve más a otra tienda.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        <strong className="text-foreground">"Hay en red" marca los casos que se resuelven moviendo
        inventario existente.</strong> Cuando no lo hay, no existe reposición posible: el producto
        se agotó y no se vuelve a producir.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        El ritmo se calcula sobre los últimos 28 días de venta.
      </p>
    </div>
  );
}

export default function AlertasDistribucion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [alerta, setAlerta] = useState("AGOTADO VENDIENDO");
  const [ciudad, setCiudad] = useState("all");
  const [tienda, setTienda] = useState("all");
  const [linea, setLinea] = useState("all");
  const [soloSolucion, setSoloSolucion] = useState("todos");
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
            .from("alertas_distribucion")
            .select("*")
            .order("severidad", { ascending: true })
            .order("ritmo_red", { ascending: false, nullsFirst: false })
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

  const ciudades = useMemo(
    () => Array.from(new Set(rows.map(r => r.ciudad).filter(Boolean) as string[])).sort(), [rows]);
  const tiendas = useMemo(
    () => Array.from(new Set(rows
      .filter(r => ciudad === "all" || r.ciudad === ciudad)
      .map(r => r.tienda).filter(Boolean))).sort(), [rows, ciudad]);
  const lineas = useMemo(
    () => Array.from(new Set(rows.map(r => r.linea).filter(Boolean) as string[])).sort(), [rows]);

  const resumen = useMemo(() => {
    const por = (a: string) => rows.filter(r => r.alerta === a);
    const ag = por("AGOTADO VENDIENDO");
    const im = por("IMPULSAR");
    const so = por("SOBRESTOCK");
    return {
      agotados: ag.length,
      agotadosConStock: ag.filter(r => r.tiene_solucion).length,
      perdidaAgotados: ag.reduce((s, r) => s + (r.venta_perdida_semanal ?? 0), 0),
      impulsar: im.length,
      udsImpulsar: im.reduce((s, r) => s + r.stock, 0),
      perdidaImpulsar: im.reduce((s, r) => s + (r.venta_perdida_semanal ?? 0), 0),
      quiebres: por("QUIEBRE EN 2 SEMANAS").length,
      sobrestock: so.length,
      udsSobrestock: so.reduce((s, r) => s + r.stock, 0),
    };
  }, [rows]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r => {
      if (alerta !== "all" && r.alerta !== alerta) return false;
      if (ciudad !== "all" && r.ciudad !== ciudad) return false;
      if (tienda !== "all" && r.tienda !== tienda) return false;
      if (linea !== "all" && r.linea !== linea) return false;
      if (soloSolucion === "con" && !r.tiene_solucion) return false;
      if (soloSolucion === "sin" && r.tiene_solucion) return false;
      if (q && !(r.producto ?? "").toLowerCase().includes(q)
             && !(r.sku ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, alerta, ciudad, tienda, linea, soloSolucion, busqueda]);

  const limpiar = () => {
    setAlerta("AGOTADO VENDIENDO"); setCiudad("all"); setTienda("all");
    setLinea("all"); setSoloSolucion("todos"); setBusqueda("");
  };

  const exportar = () => {
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Alerta: r.alerta, Producto: r.producto, SKU: r.sku,
      Línea: r.linea, Color: r.color, Talla: r.talla,
      Tienda: r.tienda, Ciudad: r.ciudad, Tier: r.tier,
      Stock: r.stock, "Ritmo semanal": r.ritmo_semanal, "Vendido 28d": r.uds_28d,
      "Semanas de cobertura": r.wos, "WOS objetivo": r.wos_objetivo,
      "Ritmo de la línea en la tienda": r.ritmo_linea_tienda,
      "Ritmo del producto en la red": r.ritmo_red,
      "Tiendas vendiéndolo": r.tiendas_vendiendo,
      "Venta perdida semanal": r.venta_perdida_semanal,
      "Stock disponible en red": r.stock_red_cedible,
      "Hay en red": r.tiene_solucion ? "Sí" : "No",
    }));
    const ws = XLSX.utils.aoa_to_sheet([
      ["Alertas de distribución — agotados, impulso, quiebre y sobrestock"],
      [`Ritmo sobre los últimos 28 días · ${new Date().toLocaleDateString("es-CO")}`],
    ]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    ws["!cols"] = [{ wch: 21 }, { wch: 40 }, { wch: 18 }, ...Array(17).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alertas");
    XLSX.writeFile(wb, "alertas-distribucion.xlsx");
  };

  const Tarjeta = ({ k, icono: Icono, titulo, valor, sub, color, activa }: any) => (
    <button onClick={() => setAlerta(alerta === k ? "all" : k)}
      className={`rounded-lg border p-3 text-left transition-colors ${
        activa ? color.activo : "hover:bg-muted/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icono className={`h-3.5 w-3.5 ${color.icono}`} />{titulo}
      </div>
      <div className={`text-xl font-semibold tabular-nums mt-0.5 ${color.texto}`}>{valor}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </button>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Alertas de distribución</h1>
              <p className="text-xs text-muted-foreground">
                Agotados, impulso, quiebre y sobrestock por tienda · últimos 28 días
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Qué mira
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Tarjeta k="AGOTADO VENDIENDO" icono={AlertTriangle} titulo="Agotado vendiendo"
                    valor={nf(resumen.agotados)}
                    sub={`−${nf(resumen.perdidaAgotados, 0)} uds/sem · ${nf(resumen.agotadosConStock)} con stock en red`}
                    activa={alerta === "AGOTADO VENDIENDO"}
                    color={{ icono: "text-rose-600", texto: "text-rose-700", activo: "bg-rose-50 border-rose-300" }} />

                  <Tarjeta k="IMPULSAR" icono={Megaphone} titulo="Impulsar"
                    valor={nf(resumen.impulsar)}
                    sub={`${nf(resumen.udsImpulsar)} uds paradas · −${nf(resumen.perdidaImpulsar, 0)} uds/sem`}
                    activa={alerta === "IMPULSAR"}
                    color={{ icono: "text-violet-600", texto: "text-violet-700", activo: "bg-violet-50 border-violet-300" }} />

                  <Tarjeta k="QUIEBRE EN 2 SEMANAS" icono={Clock} titulo="Quiebre en 2 semanas"
                    valor={nf(resumen.quiebres)} sub="aún hay tiempo de reponer"
                    activa={alerta === "QUIEBRE EN 2 SEMANAS"}
                    color={{ icono: "text-amber-600", texto: "text-amber-700", activo: "bg-amber-50 border-amber-300" }} />

                  <Tarjeta k="SOBRESTOCK" icono={Layers} titulo="Sobrestock"
                    valor={nf(resumen.sobrestock)}
                    sub={`${nf(resumen.udsSobrestock)} uds inmovilizadas`}
                    activa={alerta === "SOBRESTOCK"}
                    color={{ icono: "text-sky-600", texto: "text-sky-700", activo: "bg-sky-50 border-sky-300" }} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar producto o SKU…" className="pl-8 w-[195px] h-9"
                           value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  </div>

                  <Select value={alerta} onValueChange={setAlerta}>
                    <SelectTrigger className="w-[185px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las alertas</SelectItem>
                      <SelectItem value="AGOTADO VENDIENDO">Agotado vendiendo</SelectItem>
                      <SelectItem value="IMPULSAR">Impulsar</SelectItem>
                      <SelectItem value="QUIEBRE EN 2 SEMANAS">Quiebre en 2 semanas</SelectItem>
                      <SelectItem value="SOBRESTOCK">Sobrestock</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={ciudad} onValueChange={v => { setCiudad(v); setTienda("all"); }}>
                    <SelectTrigger className="w-[145px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las ciudades</SelectItem>
                      {ciudades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={tienda} onValueChange={setTienda}>
                    <SelectTrigger className="w-[185px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      <SelectItem value="all">Todas las tiendas</SelectItem>
                      {tiendas.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={linea} onValueChange={setLinea}>
                    <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-[320px]">
                      <SelectItem value="all">Todas las líneas</SelectItem>
                      {lineas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={soloSolucion} onValueChange={setSoloSolucion}>
                    <SelectTrigger className="w-[165px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Con y sin stock</SelectItem>
                      <SelectItem value="con">Hay stock en red</SelectItem>
                      <SelectItem value="sin">Sin reposición</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
                    <RotateCcw className="h-4 w-4 mr-1.5" />Limpiar
                  </Button>

                  <Button variant="outline" size="sm" className="ml-auto h-9"
                          onClick={exportar} disabled={!filtrados.length}>
                    <Download className="h-4 w-4 mr-1.5" />Excel
                  </Button>
                </div>

                {!filtrados.length ? (
                  <EmptyState message="No hay alertas con estos filtros." />
                ) : (
                  <>
                    <div className="rounded-lg border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                            <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                            <th className="text-left p-2.5 font-medium">Tienda</th>
                            <th className="text-right p-2.5 font-medium">Stock</th>
                            <th className="text-right p-2.5 font-medium">Aquí</th>
                            <th className="text-right p-2.5 font-medium">En la red</th>
                            <th className="text-left p-2.5 font-medium">Alerta</th>
                            <th className="text-left p-2.5 font-medium">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtrados.slice(0, 200).map((r, i) => (
                            <tr key={`${r.sku}-${r.location_id}-${i}`} className="border-b hover:bg-muted/20">
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
                                <div className="font-medium leading-tight line-clamp-1">
                                  {r.producto ?? r.sku}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {[r.linea, r.color, r.talla].filter(Boolean).join(" · ")}
                                </div>
                              </td>
                              <td className="p-2.5">
                                <div className="text-xs">{r.tienda}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {r.ciudad}{r.tier ? ` · ${r.tier}` : ""}
                                </div>
                              </td>
                              <td className="p-2.5 text-right tabular-nums">
                                <span className={r.stock === 0 ? "text-rose-700 font-medium" : ""}>
                                  {nf(r.stock)}
                                </span>
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums">{nf(r.ritmo_semanal, 1)}</div>
                                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {r.wos != null
                                    ? `${nf(Math.min(r.wos, 99), 1)} sem stock`
                                    : r.ritmo_linea_tienda != null
                                      ? `línea ${nf(r.ritmo_linea_tienda, 1)}/sem`
                                      : "uds/sem"}
                                </div>
                              </td>
                              <td className="p-2.5 text-right">
                                {r.ritmo_red != null ? (
                                  <>
                                    <div className="tabular-nums">{nf(r.ritmo_red, 1)}</div>
                                    <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      en {r.tiendas_vendiendo} tiendas
                                    </div>
                                  </>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                              <td className="p-2.5">
                                <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${BADGE[r.alerta] ?? ""}`}>
                                  {r.alerta}
                                </span>
                                {r.venta_perdida_semanal != null && (
                                  <div className="text-[10px] text-rose-700 mt-0.5">
                                    −{nf(r.venta_perdida_semanal, 1)} uds/sem
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5">
                                {r.alerta === "IMPULSAR" ? (
                                  <span className="text-[11px] text-violet-700">
                                    Ya está en tienda · dar push
                                  </span>
                                ) : r.alerta === "SOBRESTOCK" ? (
                                  <span className="text-[11px] text-sky-700">Redistribuir</span>
                                ) : r.tiene_solucion ? (
                                  <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                                    <ArrowRight className="h-3 w-3" />
                                    {nf(r.stock_red_cedible)} uds en red
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">
                                    Sin reposición
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filtrados.length > 200 && (
                        <div className="p-2.5 text-center text-xs text-muted-foreground border-t">
                          Mostrando 200 de {nf(filtrados.length)}. Exporta el Excel para ver el resto.
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                      <span>Ritmo y cobertura sobre los últimos 28 días</span>
                      <span>"Impulsar": la tienda vende la línea y el producto rota en la red, pero aquí no se mueve</span>
                      <span>Sin stock en red no hay reposición: el producto no se vuelve a producir</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
