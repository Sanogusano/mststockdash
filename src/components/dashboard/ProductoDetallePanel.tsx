import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Package, Store, ShoppingBag } from "lucide-react";
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

export function ProductoDetallePanel({ producto, onClose }: {
  producto: any; onClose: () => void;
}) {
  const [curva, setCurva] = useState<PuntoCurva[]>([]);
  const [cargando, setCargando] = useState(true);

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

  if (!producto) return null;

  const Dato = ({ l, v, sub }: { l: string; v: React.ReactNode; sub?: string }) => (
    <div>
      <div className="text-[11px] text-muted-foreground">{l}</div>
      <div className="text-sm font-medium tabular-nums">{v}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );

  const bodegas = ([
    { l: "Principal", v: producto.bod_principal },
    { l: "Guayabal", v: producto.bod_guayabal },
    { l: "Reserva", v: producto.bod_reserva },
    { l: "Tiendas", v: producto.bod_tiendas },
    { l: "Exportaciones", v: producto.bod_exportaciones },
  ] as { l: string; v: number | null }[]).filter(b => (b.v ?? 0) > 0);

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
                   className="h-14 w-14 rounded object-cover bg-muted" />
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
            <div>
              <div className="text-[11px] text-muted-foreground">Producido</div>
              <div className="text-sm font-medium tabular-nums">{nf(producto.producido)}</div>
              <div className="text-[10px] text-muted-foreground">
                {nf(producto.stock_bodegas)} bodega · {nf(producto.stock_tiendas)} tienda
              </div>
            </div>
            <Dato l="Vendido en 120 días" v={nf(producto.uds_120d)}
                  sub={`${nf(producto.pct_evacuado_120d, 0)}% de lo producido`} />
            <Dato l="Índice vs. meta" v={nf(producto.indice_meta, 2)}
                  sub={`${nf(producto.ritmo_dia, 2)} de ${nf(producto.objetivo_dia, 2)} uds/día`} />
            <Dato l="RDV vs. sus pares"
                  v={producto.indice_total == null ? "—" : `${nf(producto.indice_total / 100, 2)}×`}
                  sub={`vs. ${producto.n_cohorte} de su ${producto.base_cohorte}`} />
          </div>

          {bodegas.length > 0 && (
            <div className="rounded-lg border bg-amber-50/40 p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium">
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
                full: producto.uds_tie_full, reb: producto.uds_tie_rebaja, act: producto.uds_tie_activacion },
              { i: ShoppingBag, l: "Online",
                vend: producto.uds_online, stock: producto.stock_online,
                st: producto.st_online_pct,
                obj: producto.objetivo_dia_online, real: producto.ritmo_dia_online,
                full: producto.uds_onl_full, reb: producto.uds_onl_rebaja, act: producto.uds_onl_activacion },
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
                </div>
                <div className="mt-2">
                  <BarraCalidad full={c.full} rebaja={c.reb} activacion={c.act} ancho={150} />
                </div>
              </div>
            ))}
          </div>

          {/* Cobertura y tallas */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <Dato l="Cobertura" v={`${nf(Math.min(producto.wos ?? 0, 99), 0)} sem`}
                  sub={producto.semanas_restantes > 0
                    ? `quedan ${producto.semanas_restantes} · ${producto.cobertura}`
                    : `+${Math.abs(producto.semanas_restantes)} sem · ${producto.cobertura}`} />
            <Dato l="Sell-through total" v={`${nf(producto.sell_through_pct, 1)}%`}
                  sub={`típico ${nf(producto.med_st_cohorte, 0)}%`} />
            <Dato l="Tallas con stock"
                  v={producto.estado_tallas === "no_aplica" ? "—"
                     : `${producto.tallas_con_stock ?? 0}/${producto.tallas_totales ?? 0}`}
                  sub={producto.estado_tallas === "destallado_grave" ? "curva rota"
                       : producto.estado_tallas === "destallado" ? "incompleta" : undefined} />
            <Dato l="Distribución" v={`${producto.tiendas_con_stock} tiendas`}
                  sub={`${nf(producto.mix_online_pct, 0)}% online · cat ${nf(producto.mix_online_cat, 0)}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductoDetallePanel;
