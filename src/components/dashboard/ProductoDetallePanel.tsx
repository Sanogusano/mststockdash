import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Package, Store, ShoppingBag, Warehouse, PauseCircle, Shirt, Flag, Gauge, Zap, Clock, TrendingUp, Ruler, Split } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

/**
 * Panel de detalle de un producto: curva de ciclo + métricas que no caben en
 * la tabla principal.
 *
 * Vive en su propio archivo porque ProductoDetallePanel se abre desde
 * Producto360 y esa pantalla ya es grande; separarlos evita que un reemplazo
 * parcial rompa la tabla.
 *
 * La curva usa SEMANAS DESDE LA PRIMERA VENTA, no fechas calendario: así se
 * compara contra el patrón típico de la cohorte aunque los productos hayan
 * salido en momentos distintos.
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

const VENTANA = 16;

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function BarraCalidad({ full, rebaja, activacion, ancho = 200 }: {
  full: number; rebaja: number; activacion: number; ancho?: number;
}) {
  const t = (full ?? 0) + (rebaja ?? 0) + (activacion ?? 0);
  if (!t) return <span className="text-[10px] text-muted-foreground">—</span>;
  const seg = [
    { n: full, c: "#0ca30c", l: "Precio full" },
    { n: rebaja, c: "#c98500", l: "Rebaja" },
    { n: activacion, c: "#2a78d6", l: "Activación" },
  ];
  return (
    <div style={{ width: ancho }}>
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {seg.map(s => s.n > 0 && (
          <div key={s.l} style={{ width: `${(s.n / t) * 100}%`, background: s.c }}
               title={`${s.l}: ${nf(s.n)} uds (${((s.n / t) * 100).toFixed(0)}%)`} />
        ))}
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
        <span>{nf(full)} full</span>
        <span>{nf(rebaja)} rebaja</span>
        <span>{nf(activacion)} activación</span>
      </div>
    </div>
  );
}

/** Salud de un indicador cuyo objetivo es 1,00. El color hace el trabajo del
 *  semáforo; el icono identifica la métrica, no su estado. Mezclar emojis con
 *  iconos de trazo rompe la consistencia visual. */
function salud(v: number | null) {
  if (v == null)  return { txt: "text-muted-foreground", bg: "", punto: "bg-muted" };
  if (v >= 1.50)  return { txt: "text-blue-700",    bg: "bg-blue-50/60 border-blue-200",       punto: "bg-blue-500" };
  if (v >= 1.00)  return { txt: "text-emerald-700", bg: "bg-emerald-50/60 border-emerald-200", punto: "bg-emerald-500" };
  if (v >= 0.80)  return { txt: "text-amber-700",   bg: "bg-amber-50/60 border-amber-200",     punto: "bg-amber-500" };
  if (v >= 0.60)  return { txt: "text-orange-700",  bg: "bg-orange-50/60 border-orange-200",   punto: "bg-orange-500" };
  return { txt: "text-rose-700", bg: "bg-rose-50/60 border-rose-200", punto: "bg-rose-500" };
}

function CardSalud({ icon: Icon, label, value, sub, v, conSemaforo = false, children }: {
  icon: React.ElementType;
  label: string;
  value?: React.ReactNode;
  sub?: string;
  v: number | null;
  conSemaforo?: boolean;
  children?: React.ReactNode;
}) {
  const s = salud(v);
  const bgClass = conSemaforo ? s.bg : "";
  const txtClass = conSemaforo ? s.txt : "";
  return (
    <div className={`rounded-lg border p-3 ${bgClass}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
        {conSemaforo && <span className={`h-1.5 w-1.5 rounded-full ml-auto ${s.punto}`} />}
      </div>
      {children ? (
        <div className={`mt-1 ${txtClass}`}>{children}</div>
      ) : (
        <div className={`text-xl font-semibold tabular-nums mt-1 ${txtClass}`}>{value}</div>
      )}
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function ProductoDetallePanel({ producto, onClose }: {
  producto: any; onClose: () => void;
}) {
  const [curva, setCurva] = useState<PuntoCurva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [tallas, setTallas] = useState<any[]>([]);
  const [cargandoTallas, setCargandoTallas] = useState(true);


  useEffect(() => {
    if (!producto) return;
    let activo = true;
    (async () => {
      setCargando(true);
      const { data } = await supabase.rpc("reporte_curva_producto", {
        p_product_id: producto.product_id,
        p_modo: "vida",
      });
      if (activo) { setCurva((data ?? []) as PuntoCurva[]); setCargando(false); }
    })();
    return () => { activo = false; };
  }, [producto]);

  useEffect(() => {
    if (!producto) return;
    let activo = true;
    (async () => {
      setCargandoTallas(true);
      const { data } = await supabase
        .from("producto_curva_tallas")
        .select("*")
        .eq("product_id", producto.product_id);
      if (activo) { setTallas((data ?? []) as any[]); setCargandoTallas(false); }
    })();
    return () => { activo = false; };
  }, [producto]);

  if (!producto) return null;


  const bodegas = ([
    { l: "CEDI Principal", v: producto.bod_principal },
    { l: "Reserva mayoristas", v: producto.bod_reserva },
    { l: "Reserva tiendas", v: producto.bod_tiendas },
    { l: "Exportaciones", v: producto.bod_exportaciones },
  ] as { l: string; v: number | null }[]).filter(b => (b.v ?? 0) > 0);

  const estaAgotado = ((producto.stock_disponibilizado ?? 0) + (producto.stock_detenido ?? 0)) === 0;
  const distribucionAgotada = (producto.stock_disponibilizado ?? 0) === 0 && (producto.tiendas_con_venta ?? 0) > 0;

  const subProducido = estaAgotado
    ? "agotado — sin stock en ningún canal"
    : `${nf(producto.stock_bodegas)} bodega · ${nf(producto.stock_tiendas)} tienda`;


  const pico = curva.length ? curva.reduce((a, b) => (b.uds > a.uds ? b : a), curva[0]) : null;
  const al80 = curva.find(p => (p.pct_acumulado ?? 0) >= 80);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div className="bg-background w-full max-w-3xl h-full overflow-y-auto shadow-xl"
           onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-background border-b p-4 flex items-start justify-between z-10">
          <div className="flex items-center gap-3">
            {producto.image_url ? (
              <img src={producto.image_url} alt=""
                   onClick={e => { e.stopPropagation(); setZoom(true); }}
                   className="h-14 w-14 rounded object-cover bg-muted cursor-zoom-in" />

            ) : (
              <div className="h-14 w-14 rounded bg-muted flex items-center justify-center">
                <Package className="h-5 w-5 text-muted-foreground/50" />
              </div>
            )}
            <div>
              <h2 className="font-semibold leading-tight">{producto.title}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {producto.categoria_padre} · {producto.genero_norm} · {producto.coleccion} ·
                Semana {producto.semanas_en_venta}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Cifras gruesas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <CardSalud
              icon={Shirt}
              label="Producido"
              value={nf(producto.producido)}
              sub={subProducido}
              v={null}
            />

            <CardSalud
              icon={Flag}
              label="Vendido"
              v={null}
            >
              <div className="text-xl font-semibold tabular-nums">{nf(producto.unidades_vendidas)}</div>
              <div className="text-[10px] text-muted-foreground">en total</div>
              <div className="text-[11px] mt-1.5 space-y-0.5">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">En sus 120 días</span>
                  <span className="tabular-nums">{nf(producto.uds_120d)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Después de la ventana</span>
                  <span className="tabular-nums">
                    {nf((producto.unidades_vendidas ?? 0) - (producto.uds_120d ?? 0))}
                  </span>
                </div>
              </div>
            </CardSalud>
            <CardSalud
              icon={Gauge}
              label="Ritmo vs. presupuesto"
              value={nf(producto.indice_meta, 2)}
              sub={`${nf(producto.ritmo_dia, 2)} de ${nf(producto.objetivo_dia, 2)} uds/día`}
              v={producto.indice_meta}
              conSemaforo
            />
            <CardSalud
              icon={Zap}
              label="RDV vs. sus pares"
              v={producto.indice_total == null ? null : producto.indice_total / 100}
              conSemaforo
            >
              <div className="text-xl font-semibold tabular-nums">
                {producto.indice_total == null ? "—" : `${nf(producto.indice_total / 100, 2)}×`}
              </div>
              <div className="text-[10px] text-muted-foreground">
                vs. {producto.n_cohorte} de su {producto.base_cohorte}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {producto.pct_venta_sana != null && `${nf(producto.pct_venta_sana, 0)}% de su venta sin liquidar`}
              </div>
            </CardSalud>
          </div>

          {/* Indicadores secundarios */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <CardSalud
              icon={Clock}
              label="Cobertura"
              v={producto.ratio_cobertura == null ? null : 1 / Math.max(producto.ratio_cobertura, 0.1)}
              conSemaforo
            >
              <div className="text-xl font-semibold tabular-nums">
                {nf(Math.min(producto.wos ?? 0, 99), 0)} sem
              </div>
              <div className="text-[10px] text-muted-foreground">de inventario al ritmo actual</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {producto.semanas_restantes > 0
                  ? `Ventana: quedan ${producto.semanas_restantes} sem`
                  : `Ventana: +${Math.abs(producto.semanas_restantes)} sem de más`} · {producto.cobertura}
              </div>
            </CardSalud>
            <CardSalud
              icon={TrendingUp}
              label="Sell-through"
              value={`${nf(producto.st_disponibilizado ?? producto.sell_through_pct, 1)}%`}
              sub={`típico ${nf(producto.med_st_cohorte, 0)}%`}
              v={producto.med_st_cohorte ? (producto.st_disponibilizado ?? producto.sell_through_pct) / producto.med_st_cohorte : null}
              conSemaforo
            />
            <CardSalud
              icon={Ruler}
              label="Tallas con stock"
              value={producto.estado_tallas === "no_aplica" ? "—"
                : `${producto.tallas_con_stock ?? 0}/${producto.tallas_totales ?? 0}`}
              sub={producto.estado_tallas === "destallado_grave" ? "curva rota"
                : producto.estado_tallas === "destallado" ? "incompleta" : ""}
              v={null}
            />
            <CardSalud
              icon={Store}
              label="Distribución"
              v={null}
            >
              <div className="text-sm">
                <span className="font-semibold tabular-nums">{nf((producto.stock_tienda ?? 0) + (producto.stock_outlet ?? 0))}</span> uds en {producto.tiendas_con_stock} tiendas
              </div>
              <div className="text-sm">
                <span className="font-semibold tabular-nums">{nf(producto.stock_online ?? 0)}</span> uds online
              </div>
            </CardSalud>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Split className="h-3.5 w-3.5" />
                <span>Mix de canal</span>
              </div>
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-base font-semibold tabular-nums">
                    {nf(100 - (producto.mix_online_pct ?? 0), 0)}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">Tiendas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-base font-semibold tabular-nums">
                    {nf(producto.mix_online_pct, 0)}%
                  </span>
                  <span className="text-[11px] text-muted-foreground">Online</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5">
                su categoría vende {nf(producto.mix_online_cat, 0)}% online
              </div>
            </div>
          </div>


          {bodegas.length > 0 && (
            <div className="rounded-lg border bg-amber-50/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <PauseCircle className="h-4 w-4 text-amber-700" />
                <Warehouse className="h-4 w-4 text-amber-700" />
                Inventario detenido
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-800">
                {nf(bodegas.reduce((a, b) => a + (b.v ?? 0), 0))}
              </div>
              <div className="mt-2 space-y-1">
                {bodegas.map(b => (
                  <div key={b.l} className="flex justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">{b.l}</span>
                    <span className="tabular-nums font-medium">{nf(b.v)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-amber-800/80 leading-relaxed">
                Inventario que no está visible para vender. El stock de despacho online no cuenta aquí: está disponible.
              </p>
              {producto.fecha_snapshot_bodega && (
                <div className="mt-2 text-[10px] text-muted-foreground">
                  Snapshot {new Date(producto.fecha_snapshot_bodega).toLocaleDateString("es-CO")}
                </div>
              )}
            </div>
          )}


          {/* Curva */}
          <div className="rounded-lg border p-3">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-medium">Ciclo de venta</h3>
              {pico && (
                <span className="text-[11px] text-muted-foreground">
                  Pico en semana {pico.eje}
                  {al80 ? ` · 80% de su venta a la semana ${al80.eje}` : ""}
                </span>
              )}
            </div>
            {cargando ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Cargando curva…
              </div>
            ) : !curva.length ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Sin datos de venta
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={curva} margin={{ top: 8, right: 4, left: -8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="eje" tick={{ fontSize: 10 }}
                         label={{ value: "Semanas desde la primera venta",
                                  position: "insideBottom", offset: -2, fontSize: 10 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip
                    formatter={(v: any, n: string) => n.includes("%") ? [`${v}%`, n] : [nf(Number(v)), n]}
                    labelFormatter={(l: any) => {
                      const p = curva.find(c => c.eje === l);
                      return `Semana ${l}${p ? ` · ${p.semana}` : ""}`;
                    }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <ReferenceLine x={VENTANA} yAxisId="l" stroke="#d03b3b" strokeDasharray="4 4"
                                 label={{ value: "cierre", fontSize: 9, fill: "#d03b3b" }} />
                  <Bar yAxisId="l" dataKey="uds_tienda" stackId="a" fill="#7c5cd6" name="Tienda" />
                  <Bar yAxisId="l" dataKey="uds_online" stackId="a" fill="#2a9dd6" name="Online" />
                  <Line yAxisId="r" type="monotone" dataKey="pct_semana" stroke="#0ca30c"
                        strokeWidth={2} dot={false} name="% de su venta" />
                  <Line yAxisId="r" type="monotone" dataKey="pct_cohorte" stroke="#898781"
                        strokeWidth={1.5} strokeDasharray="5 4" dot={false}
                        name="% típico de su cohorte" />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Curva de tallas */}
          <div className="rounded-lg border p-3">
            <h3 className="text-sm font-medium mb-2">Curva de tallas</h3>
            {cargandoTallas ? (
              <div className="text-sm text-muted-foreground">Cargando curva de tallas…</div>
            ) : !tallas.length
                 || Number(tallas[0].total_producto ?? 0) < 30
                 || Number(tallas[0].n_prod_linea ?? 0) < 5
                 || Number(tallas[0].uds_linea ?? 0) < 200 ? (
              <div className="text-sm text-muted-foreground">
                No hay suficiente historial en esta línea para comparar la curva de tallas.
              </div>
            ) : (
              (() => {
                const ORDEN_TALLAS = ["XXS","XS","S","M","L","XL","XXL","XXXL","U"];
                const ordenTalla = (t: string) => {
                  const i = ORDEN_TALLAS.indexOf(t?.toUpperCase());
                  if (i >= 0) return i;
                  const n = parseFloat(t);
                  return isNaN(n) ? 999 : 100 + n;
                };
                const filas = [...tallas].sort((a, b) => ordenTalla(a.talla) - ordenTalla(b.talla));
                const maxDesvio = Math.max(1, ...filas.map(f => Math.abs(Number(f.desvio_pts ?? 0))));
                const sts = filas.map(f => f.sell_through_talla).filter((v): v is number => v != null);
                const rango = sts.length ? Math.max(...sts) - Math.min(...sts) : 0;
                const curvaPropia = maxDesvio >= 5 && rango <= 20;

                const stMin = sts.length ? Math.min(...sts) : 0;
                const stMax = sts.length ? Math.max(...sts) : 0;
                const bg = (st: number | null) => {
                  if (st == null || rango < 5) return "bg-slate-100 text-slate-600";
                  const pos = (st - stMin) / rango;
                  if (pos >= 0.75) return "bg-emerald-200 text-emerald-900";
                  if (pos >= 0.50) return "bg-emerald-100 text-emerald-800";
                  if (pos >= 0.25) return "bg-amber-100 text-amber-800";
                  return "bg-rose-100 text-rose-800";
                };

                return (
                  <>
                    <div className="space-y-1">
                      {/* Header: size labels */}
                      <div className="flex gap-1">
                        <div className="w-24 shrink-0 p-2 text-xs font-medium text-muted-foreground flex items-end" />
                        {filas.map((t: any) => (
                          <div key={t.talla} className="flex-1 p-2 text-center text-xs font-medium tabular-nums rounded">
                            {t.talla}
                          </div>
                        ))}
                      </div>

                      {/* Cargado */}
                      <div className="flex gap-1">
                        <div className="w-24 shrink-0 p-2 text-xs font-medium text-muted-foreground flex items-center">Cargado</div>
                        {filas.map((t: any) => {
                          const desvio = Number(t.desvio_pts ?? 0);
                          const udsSob = Number(t.uds_sobrantes ?? 0);
                          const tooltip = `${t.talla}: cargado ${Number(t.pct_cargado ?? 0).toFixed(1)}% · desvío ${desvio > 0 ? '+' : ''}${desvio.toFixed(1)} pts${udsSob > 0 ? ` · ${udsSob} uds sobrantes` : ''}`;
                          return (
                            <div key={t.talla} className="relative flex-1 p-2 text-center text-xs tabular-nums rounded bg-muted/40" title={tooltip}>
                              {nf(t.pct_cargado, 1)}%
                              {desvio >= 3 && (
                                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" />
                              )}
                              {desvio <= -3 && (
                                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Demanda línea */}
                      <div className="flex gap-1">
                        <div className="w-24 shrink-0 p-2 text-xs font-medium text-muted-foreground flex items-center">Demanda línea</div>
                        {filas.map((t: any) => (
                          <div key={t.talla} className="flex-1 p-2 text-center text-xs tabular-nums rounded text-muted-foreground">
                            {nf(t.pct_demanda_linea, 1)}%
                          </div>
                        ))}
                      </div>

                      {/* Sell-through */}
                      <div className="flex gap-1">
                        <div className="w-24 shrink-0 p-2 text-xs font-medium text-muted-foreground flex items-center">Sell-through</div>
                        {filas.map((t: any) => {
                          const st = t.sell_through_talla == null ? null : Number(t.sell_through_talla);
                          const cls = bg(st);
                          return (
                            <div key={t.talla} className={`flex-1 p-2 text-center text-xs tabular-nums rounded ${cls}`}>
                              {st == null ? '—' : `${st.toFixed(0)}%`}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Legend */}
                    <p className="text-[11px] text-muted-foreground mt-3">
                      El color muestra qué tallas rotan más rápido dentro de este producto.
                      El punto marca desviación respecto a la curva de su línea.
                    </p>

                    {curvaPropia && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Este producto vende con una curva distinta a la de su línea: todas sus tallas
                        rotan a un ritmo parecido, así que la comparación es solo referencial.
                      </p>
                    )}
                  </>
                );
              })()
            )}
          </div>

          {/* Calidad de la venta */}
          <div className="rounded-lg border p-3">
            <h3 className="text-sm font-medium mb-2">Calidad de la venta</h3>
            <BarraCalidad full={producto.unidades_full} rebaja={producto.unidades_rebaja}
                          activacion={producto.unidades_activacion} ancho={300} />
            <div className="text-[11px] text-muted-foreground mt-2">
              {nf(producto.pct_venta_full, 1)}% a precio full ·
              típico de su cohorte {nf(producto.med_pctfull_cohorte, 0)}%
              {producto.profundidad_desc_pct != null &&
                ` · descuento promedio ${nf(producto.profundidad_desc_pct, 0)}%`}
            </div>
          </div>

          {/* Por canal */}
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { i: Store, l: "Tienda física",
                vend: (producto.uds_tienda ?? 0) + (producto.uds_outlet ?? 0),
                stock: (producto.stock_tienda ?? 0) + (producto.stock_outlet ?? 0),
                st: producto.st_tienda_pct,
                obj: producto.objetivo_dia_tienda, real: producto.ritmo_dia_tienda,
                full: producto.uds_tie_full, reb: producto.uds_tie_rebaja, act: producto.uds_tie_activacion,
                desc_activacion: producto.desc_activacion_tienda_pct },
              { i: ShoppingBag, l: "Online",
                vend: producto.uds_online, stock: producto.stock_online,
                st: producto.st_online_pct,
                obj: producto.objetivo_dia_online, real: producto.ritmo_dia_online,
                full: producto.uds_onl_full, reb: producto.uds_onl_rebaja, act: producto.uds_onl_activacion,
                desc_activacion: producto.desc_activacion_online_pct },
            ].map(c => (
              <div key={c.l} className="rounded-lg border p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                  <c.i className="h-3.5 w-3.5" />{c.l}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vendido</span>
                    <span className="tabular-nums">{nf(c.vend)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Stock</span>
                    <span className="tabular-nums">{nf(c.stock)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sell-through</span>
                    <span className="tabular-nums">{nf(c.st, 1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Ritmo / objetivo</span>
                    <span className={`tabular-nums ${(c.real ?? 0) >= (c.obj ?? 0) ? "text-emerald-700 font-medium" : ""}`}>
                      {nf(c.real, 2)} / {nf(c.obj, 2)}
                    </span>
                  </div>
                  {c.desc_activacion != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Descuento en activación</span>
                      <span className="tabular-nums text-amber-700">−{nf(c.desc_activacion, 0)}%</span>
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <BarraCalidad full={c.full} rebaja={c.reb} activacion={c.act} ancho={150} />
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {zoom && producto.image_url && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
             onClick={e => { e.stopPropagation(); setZoom(false); }}>
          <button className="absolute top-4 right-4 rounded-full p-2 text-white/80 hover:text-white"
                  onClick={e => { e.stopPropagation(); setZoom(false); }} aria-label="Cerrar">
            <X className="h-6 w-6" />
          </button>
          <img src={producto.image_url} alt={producto.title ?? ""}
               className="max-h-full max-w-full object-contain"
               onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>

  );
}

export default ProductoDetallePanel;
