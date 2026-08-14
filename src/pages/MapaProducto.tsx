import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { ProductoDetallePanel } from "@/components/dashboard/ProductoDetallePanel";
import { Button } from "@/components/ui/button";
import { Package, HelpCircle, X, RotateCcw } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Mapa de producto — plano cartesiano donde cada referencia es su propia foto.
 *
 * Ejes:
 *   X = índice meta      (¿evacuó el 70% de lo producido en 120 días?)
 *   Y = % venta sana     (¿vendió sin liquidar?)
 *
 * Los cuatro cuadrantes coinciden con el diagnóstico del módulo:
 *   arriba-derecha  Repetir            · evacuó y con margen
 *   arriba-izquierda Revisar cantidad  · buen producto, se produjo de más
 *   abajo-derecha   Revisar precio     · evacuó liquidando
 *   abajo-izquierda Revisar concepto   · ni evacuó ni vendió sano
 *
 * Solo entran productos con ventana cumplida: los que están en curso tienen
 * pocos días medidos y su índice proyecta alto (llega a 24×), lo que aplastaría
 * la escala del eje.
 */

interface Row {
  product_id: string;
  title: string;
  categoria_padre: string | null;
  genero_norm: string | null;
  coleccion: string;
  image_url: string | null;
  unidades_vendidas: number;
  producido: number;
  sin_evacuar: number;
  indice_meta: number | null;
  pct_venta_sana: number | null;
  pct_venta_full: number | null;
  ventana_completa: boolean;
  diagnostico: string;
  semanas_en_venta: number;
  [k: string]: any;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

// Ejes topados: el índice meta tiene cola larga y sin tope el 95% de los
// productos quedaría amontonado contra el borde.
const X_MAX = 1.5;   // 1,00 = alcanzó la meta
const Y_MIN = 0;
const Y_MAX = 100;
const CORTE_X = 1.0;
const CORTE_Y = 70;  // el mismo 70% que define venta sana en el módulo

const CUADRANTES = [
  { k: "Repetir",          l: "Repetir",          sub: "evacuó y con margen",       cls: "bg-emerald-50/60" },
  { k: "Revisar cantidad", l: "Revisar cantidad", sub: "buen producto, sobró",      cls: "bg-orange-50/50" },
  { k: "Revisar precio",   l: "Revisar precio",   sub: "evacuó liquidando",         cls: "bg-amber-50/50" },
  { k: "Revisar concepto", l: "Revisar concepto", sub: "ni evacuó ni vendió sano",  cls: "bg-rose-50/50" },
];

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Cómo leer el mapa</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1">Eje horizontal — ¿evacuó?</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Ritmo real contra el necesario para vender el 70% de lo producido en 120 días.
            <strong className="text-foreground"> A la derecha de la línea alcanzó la meta.</strong>
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1">Eje vertical — ¿con margen?</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Porcentaje vendido a precio lleno o con activación.
            <strong className="text-foreground"> Arriba de la línea vendió sin liquidar.</strong>
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        El tamaño de la foto es proporcional a lo producido. Solo aparecen productos que ya
        cumplieron sus 120 días: los que siguen en ventana tienen pocos días medidos y su índice
        proyecta alto, lo que distorsionaría la escala.
      </p>
    </div>
  );
}

export default function MapaProducto() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Row | null>(null);
  const [hover, setHover] = useState<Row | null>(null);

  const [linea, setLinea] = useState("all");
  const [coleccion, setColeccion] = useState("all");
  const [minUds, setMinUds] = useState("50");
  const [topN, setTopN] = useState("60");
  const [ayuda, setAyuda] = useState(false);

  const areaRef = useRef<HTMLDivElement>(null);

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
            .eq("ventana_completa", true)
            .order("unidades_vendidas", { ascending: false })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 10000) break;
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

  const lineas = useMemo(
    () => Array.from(new Set(rows
      .map(r => r.categoria_padre && r.genero_norm ? `${r.categoria_padre} · ${r.genero_norm}` : null)
      .filter(Boolean) as string[])).sort(), [rows]);

  const colecciones = useMemo(
    () => Array.from(new Set(rows.map(r => r.coleccion).filter(Boolean))).sort(), [rows]);

  const puntos = useMemo(() => {
    const min = parseInt(minUds, 10);
    const top = parseInt(topN, 10);
    return rows
      .filter(r => {
        if (r.indice_meta == null || r.pct_venta_sana == null) return false;
        if (r.unidades_vendidas < min) return false;
        if (linea !== "all" && `${r.categoria_padre} · ${r.genero_norm}` !== linea) return false;
        if (coleccion !== "all" && r.coleccion !== coleccion) return false;
        return true;
      })
      .slice(0, top);
  }, [rows, linea, coleccion, minUds, topN]);

  // El tamaño de la foto comunica el volumen producido
  const maxProd = useMemo(
    () => Math.max(1, ...puntos.map(p => p.producido ?? 0)), [puntos]);

  const tamano = (prod: number) => {
    const rel = Math.sqrt((prod ?? 0) / maxProd);   // raíz: el área crece proporcional
    return Math.round(26 + rel * 34);               // entre 26 y 60 px
  };

  const posX = (v: number) => Math.min(100, Math.max(0, (Math.min(v, X_MAX) / X_MAX) * 100));
  const posY = (v: number) => Math.min(100, Math.max(0, ((v - Y_MIN) / (Y_MAX - Y_MIN)) * 100));

  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    puntos.forEach(p => { c[p.diagnostico] = (c[p.diagnostico] ?? 0) + 1; });
    return c;
  }, [puntos]);

  const limpiar = () => { setLinea("all"); setColeccion("all"); setMinUds("50"); setTopN("60"); };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Mapa de producto</h1>
              <p className="text-xs text-muted-foreground">
                Evacuación contra calidad de venta · clic en una foto para el detalle
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo leerlo
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <Select value={linea} onValueChange={setLinea}>
                <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las líneas</SelectItem>
                  {lineas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[165px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={minUds} onValueChange={setMinUds}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sin mínimo</SelectItem>
                  <SelectItem value="30">Mínimo 30 uds</SelectItem>
                  <SelectItem value="50">Mínimo 50 uds</SelectItem>
                  <SelectItem value="100">Mínimo 100 uds</SelectItem>
                  <SelectItem value="200">Mínimo 200 uds</SelectItem>
                </SelectContent>
              </Select>

              <Select value={topN} onValueChange={setTopN}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 productos</SelectItem>
                  <SelectItem value="60">60 productos</SelectItem>
                  <SelectItem value="100">100 productos</SelectItem>
                  <SelectItem value="200">200 productos</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Limpiar
              </Button>

              <span className="ml-auto text-xs text-muted-foreground">
                {puntos.length} productos en el mapa
              </span>
            </div>

            {loading ? (
              <div className="p-6"><LoadingState rows={8} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : !puntos.length ? (
              <EmptyState message="Ningún producto cumple estos filtros." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CUADRANTES.map(c => (
                    <div key={c.k} className={`rounded-lg border p-3 ${c.cls}`}>
                      <div className="text-xs font-medium">{c.l}</div>
                      <div className="text-xl font-semibold tabular-nums mt-0.5">
                        {conteo[c.k] ?? 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{c.sub}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border p-4">
                  {/* Etiquetas de los ejes */}
                  <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span>Vendió sin liquidar ↑</span>
                    <span>Alcanzó la meta de evacuación →</span>
                  </div>

                  <div ref={areaRef}
                       className="relative w-full rounded-md border bg-muted/10"
                       style={{ height: 520 }}>
                    {/* Fondos de cuadrante */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute bg-emerald-50/50"
                           style={{ left: `${posX(CORTE_X)}%`, right: 0, top: 0, bottom: `${posY(CORTE_Y)}%` }} />
                      <div className="absolute bg-orange-50/40"
                           style={{ left: 0, right: `${100 - posX(CORTE_X)}%`, top: 0, bottom: `${posY(CORTE_Y)}%` }} />
                      <div className="absolute bg-amber-50/40"
                           style={{ left: `${posX(CORTE_X)}%`, right: 0, top: `${100 - posY(CORTE_Y)}%`, bottom: 0 }} />
                      <div className="absolute bg-rose-50/40"
                           style={{ left: 0, right: `${100 - posX(CORTE_X)}%`, top: `${100 - posY(CORTE_Y)}%`, bottom: 0 }} />
                    </div>

                    {/* Ejes de corte */}
                    <div className="absolute inset-y-0 border-l border-dashed border-foreground/30 pointer-events-none"
                         style={{ left: `${posX(CORTE_X)}%` }} />
                    <div className="absolute inset-x-0 border-t border-dashed border-foreground/30 pointer-events-none"
                         style={{ bottom: `${posY(CORTE_Y)}%` }} />

                    {/* Rótulos de cuadrante */}
                    <div className="absolute top-2 right-3 text-[11px] font-medium text-emerald-800/70 pointer-events-none">
                      Repetir
                    </div>
                    <div className="absolute top-2 left-3 text-[11px] font-medium text-orange-800/70 pointer-events-none">
                      Revisar cantidad
                    </div>
                    <div className="absolute bottom-2 right-3 text-[11px] font-medium text-amber-800/70 pointer-events-none">
                      Revisar precio
                    </div>
                    <div className="absolute bottom-2 left-3 text-[11px] font-medium text-rose-800/70 pointer-events-none">
                      Revisar concepto
                    </div>

                    {/* Productos */}
                    {puntos.map(p => {
                      const size = tamano(p.producido);
                      const x = posX(p.indice_meta ?? 0);
                      const y = posY(p.pct_venta_sana ?? 0);
                      const activo = hover?.product_id === p.product_id;
                      return (
                        <button
                          key={p.product_id}
                          onClick={() => setDetalle(p)}
                          onMouseEnter={() => setHover(p)}
                          onMouseLeave={() => setHover(null)}
                          className={`absolute rounded-md overflow-hidden border-2 transition-all ${
                            activo ? "border-primary z-20 shadow-lg scale-110" : "border-white/80 z-10 hover:z-20"
                          }`}
                          style={{
                            left: `${x}%`, bottom: `${y}%`,
                            width: size, height: size,
                            transform: "translate(-50%, 50%)",
                          }}
                          title={p.title}
                        >
                          {p.image_url ? (
                            <img src={p.image_url} alt="" loading="lazy"
                                 className="w-full h-full object-cover bg-muted" />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              <Package className="h-3 w-3 text-muted-foreground/50" />
                            </div>
                          )}
                        </button>
                      );
                    })}

                    {/* Tarjeta del producto bajo el cursor */}
                    {hover && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none
                                      rounded-lg border bg-background/95 shadow-lg px-3 py-2 max-w-[320px]">
                        <div className="text-xs font-medium leading-tight">{hover.title}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {hover.categoria_padre} · {hover.coleccion} · Semana {hover.semanas_en_venta}
                        </div>
                        <div className="flex gap-3 text-[11px] mt-1.5 tabular-nums">
                          <span>Produjo <strong>{nf(hover.producido)}</strong></span>
                          <span>Evacuó <strong>{nf(hover.indice_meta, 2)}</strong></span>
                          <span>Sano <strong>{nf(hover.pct_venta_sana, 0)}%</strong></span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between text-[11px] text-muted-foreground mt-1.5">
                    <span>← No alcanzó la meta</span>
                    <span>Liquidó ↓</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                  <span>El tamaño de la foto es proporcional a lo producido</span>
                  <span>Solo productos con sus 120 días cumplidos</span>
                  <span>Corte vertical: alcanzó el 70% de evacuación · Corte horizontal: 70% de venta sin liquidar</span>
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
