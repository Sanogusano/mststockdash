import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  fmtMonto, fmtNum, fmtPct, fmtPp, semaforoCumplimiento, Semaforo, tituloNombre, varPct,
} from "@/lib/mayoristas-format";

interface CanalRow {
  venta: number; unidades: number; facturas: number; clientes: number; ticket: number;
  meta: number | null; meta_a_la_fecha: number | null; cumplimiento: number | null; cumplimiento_a_la_fecha: number | null;
  venta_ant: number | null; var_ant: number | null; venta_aa: number | null; var_aa: number | null; facturas_anuladas: number;
}
interface VendedoraRow extends Omit<CanalRow, "facturas_anuladas"> {
  vendedor_id: string | null; vendedora: string; clientes_nuevos: number; clientes_perdidos: number; participacion: number | null;
}
interface IndicadoresRow {
  upt: number; upt_ant: number | null;
  precio_promedio: number; precio_promedio_ant: number | null;
  margen_pct: number; margen_pct_ant: number | null;
  descuento_comercial_pct: number; descuento_comercial_pct_ant: number | null;
  concentracion_top3_pct: number;
}
interface ComposicionRow {
  grupo: string; orden: number | null; venta: number; unidades: number;
  pct_venta: number; pct_unidades: number; margen_pct: number | null;
}
interface TopProductoRow {
  producto_id: number; producto: string; coleccion: string | null; linea: string | null; image_url: string | null;
  unidades: number; venta: number; pct_venta: number; clientes: number;
  precio_mayorista: number; precio_retail_sin_iva: number;
  descuento_comercial_pct: number; margen_pct: number; stock_reserva_distribuidores: number;
}
interface ClienteRow {
  cliente_id: number; cliente: string; vendedora: string; estado: string;
  unidades: number; venta: number; participacion: number;
}

const TXT: Record<Semaforo, string> = {
  verde: "text-success", ambar: "text-warning",
  rojo: "text-danger", neutro: "text-muted-foreground",
};
const BAR: Record<Semaforo, string> = {
  verde: "bg-success", ambar: "bg-warning",
  rojo: "bg-danger", neutro: "bg-muted-foreground",
};

function Variacion({ label, value, invert }: { label: string; value: number | null; invert?: boolean }) {
  if (value === null || value === undefined) return <div className="text-xs text-muted-foreground">— {label}</div>;
  const up = value >= 0;
  const bueno = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex items-center gap-1 text-xs", bueno ? TXT.verde : TXT.rojo)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium tabular-nums">{up ? "+" : ""}{fmtPct(value)}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function VariacionPp({ label, actual, anterior, invert }: { label: string; actual: number | null; anterior: number | null; invert?: boolean }) {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) {
    return <div className="text-xs text-muted-foreground">— {label}</div>;
  }
  const diff = Number(actual) - Number(anterior);
  const up = diff >= 0;
  const bueno = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex items-center gap-1 text-xs", bueno ? TXT.verde : TXT.rojo)}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium tabular-nums">{fmtPp(diff)}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function Cumplimiento({ venta, meta, cumplimiento, aLaFecha, big }: {
  venta: number; meta: number | null; cumplimiento: number | null; aLaFecha: number | null; big?: boolean;
}) {
  if (meta === null || meta === undefined) {
    return <div className={cn("font-semibold text-muted-foreground", big ? "text-3xl" : "text-xl")}>Sin meta</div>;
  }
  const s = semaforoCumplimiento(aLaFecha);
  const diff = Number(meta) - Number(venta);
  return (
    <div className="space-y-2 min-w-0">
      <div className={cn("font-bold tabular-nums", TXT[s], big ? "text-4xl" : "text-2xl")}>{fmtPct(cumplimiento)}</div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full", BAR[s])} style={{ width: `${Math.min(Math.max(Number(cumplimiento) || 0, 0), 100)}%` }} />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm">
        <span className="tabular-nums">{fmtMonto(venta)} de {fmtMonto(meta)}</span>
        {diff > 0
          ? <span className="text-muted-foreground tabular-nums">Faltan {fmtMonto(diff)}</span>
          : <span className={cn("tabular-nums", TXT.verde)}>+{fmtMonto(-diff)} sobre meta</span>}
      </div>
      <div className="text-xs text-muted-foreground">A la fecha: <span className={cn("font-medium", TXT[s])}>{fmtPct(aLaFecha)}</span></div>
    </div>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card className="min-w-0"><CardContent className="p-3 sm:p-4 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg sm:text-2xl font-semibold tabular-nums truncate">{value}</div>
      {children}
    </CardContent></Card>
  );
}

type Dimension = "coleccion" | "linea" | "genero";
const DIMENSIONES: { id: Dimension; label: string }[] = [
  { id: "coleccion", label: "Colección" },
  { id: "linea", label: "Línea" },
  { id: "genero", label: "Género" },
];

function stockSemaforo(stock: number): Semaforo {
  if (stock < 10) return "rojo";
  if (stock < 50) return "ambar";
  return "neutro";
}

function concentracionSemaforo(pct: number): Semaforo {
  if (pct > 70) return "rojo";
  if (pct > 50) return "ambar";
  return "neutro";
}

/** Agrupa líneas: top 8 por venta + "Otras" con la suma del resto (presentación). */
function agruparLineas(rows: ComposicionRow[]): ComposicionRow[] {
  if (rows.length <= 8) return rows;
  const top = rows.slice(0, 8);
  const resto = rows.slice(8);
  const otras: ComposicionRow = {
    grupo: "Otras", orden: null,
    venta: resto.reduce((s, r) => s + Number(r.venta), 0),
    unidades: resto.reduce((s, r) => s + Number(r.unidades), 0),
    pct_venta: resto.reduce((s, r) => s + Number(r.pct_venta), 0),
    pct_unidades: resto.reduce((s, r) => s + Number(r.pct_unidades), 0),
    margen_pct: null,
  };
  return [...top, otras];
}

/** Panel del canal Mayoristas reutilizado en el Resumen Ejecutivo.
 *  Recibe el rango del selector de periodo del Resumen Ejecutivo (YYYY-MM-DD). */
export function MayoristasPanel({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [dimension, setDimension] = useState<Dimension>("coleccion");

  const canalQ = useQuery({
    queryKey: ["mayoristas-canal", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_canal" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return ((data as unknown as CanalRow[]) ?? [])[0] ?? null;
    },
  });
  const vendQ = useQuery({
    queryKey: ["mayoristas-vendedora", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_vendedora" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return [...((data as unknown as VendedoraRow[]) ?? [])].sort((a, b) => Number(b.venta) - Number(a.venta));
    },
  });
  const indQ = useQuery({
    queryKey: ["mayoristas-indicadores", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_indicadores" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return ((data as unknown as IndicadoresRow[]) ?? [])[0] ?? null;
    },
  });
  const compQ = useQuery({
    queryKey: ["mayoristas-composicion", desde, hasta, dimension],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_composicion" as never, { p_desde: desde, p_hasta: hasta, p_dimension: dimension } as never);
      if (error) throw error;
      return (data as unknown as ComposicionRow[]) ?? [];
    },
  });
  const topProdQ = useQuery({
    queryKey: ["mayoristas-top-productos", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_top_productos" as never, { p_desde: desde, p_hasta: hasta, p_limite: 20 } as never);
      if (error) throw error;
      return (data as unknown as TopProductoRow[]) ?? [];
    },
  });
  const clientesQ = useQuery({
    queryKey: ["mayoristas-clientes", desde, hasta],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_clientes" as never, { p_desde: desde, p_hasta: hasta } as never);
      if (error) throw error;
      return (data as unknown as ClienteRow[]) ?? [];
    },
  });
  const c = canalQ.data;
  const ind = indQ.data;
  const compRows = dimension === "linea" ? agruparLineas(compQ.data ?? []) : (compQ.data ?? []);
  const topClientes = (clientesQ.data ?? []).filter((r) => r.estado !== "Perdido").slice(0, 10);

  return (
    <div className="space-y-5 min-w-0">
      <p className="text-xs text-muted-foreground">Venta neta sin IVA · fuente: facturas NetSuite</p>

      {(canalQ.error || vendQ.error || indQ.error || compQ.error || topProdQ.error || clientesQ.error) && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {((canalQ.error || vendQ.error || indQ.error || compQ.error || topProdQ.error || clientesQ.error) as Error)?.message}
        </div>
      )}

      {canalQ.isLoading ? <LoadingState /> : c && (
        <section className="space-y-3">
          <Card><CardContent className="p-4 sm:p-5 space-y-2">
            <div className="text-sm font-medium">Cumplimiento Mayoristas</div>
            <Cumplimiento big venta={c.venta} meta={c.meta} cumplimiento={c.cumplimiento} aLaFecha={c.cumplimiento_a_la_fecha} />
            {Number(c.facturas_anuladas) > 0 && (
              <div className="text-xs text-muted-foreground">{fmtNum(c.facturas_anuladas)} factura(s) anulada(s) excluidas</div>
            )}
          </CardContent></Card>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="col-span-2 lg:col-span-1 min-w-0">
              <Kpi label="Venta neta (sin IVA)" value={fmtMonto(c.venta)}>
                <Variacion label="vs periodo anterior" value={c.var_ant} />
                <Variacion label="vs año anterior" value={c.var_aa} />
              </Kpi>
            </div>
            <Kpi label="Unidades" value={fmtNum(c.unidades)} />
            <Kpi label="Facturas" value={fmtNum(c.facturas)} />
            <Kpi label="Clientes activos" value={fmtNum(c.clientes)} />
            <Kpi label="Ticket promedio por factura" value={fmtMonto(c.ticket)} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Vendedoras</h2>
        {vendQ.isLoading ? <LoadingState /> : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(vendQ.data ?? []).map((v) => {
              const sin = v.vendedora?.startsWith("(");
              return (
                <Card key={v.vendedor_id ?? v.vendedora} className="min-w-0"><CardContent className="p-4 space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className={cn("font-semibold", sin && "text-muted-foreground")}>{tituloNombre(v.vendedora)}</div>
                    <div className="text-xs text-muted-foreground">{fmtPct(v.participacion)} del canal</div>
                  </div>
                  {sin
                    ? <div className="text-sm text-muted-foreground tabular-nums">{fmtMonto(v.venta)}</div>
                    : <Cumplimiento venta={v.venta} meta={v.meta} cumplimiento={v.cumplimiento} aLaFecha={v.cumplimiento_a_la_fecha} />}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div><div className="text-xs text-muted-foreground">Unidades</div><div className="tabular-nums">{fmtNum(v.unidades)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Facturas</div><div className="tabular-nums">{fmtNum(v.facturas)}</div></div>
                    <div>
                      <div className="text-xs text-muted-foreground">Clientes</div>
                      <div className="tabular-nums">{fmtNum(v.clientes)}</div>
                      {Number(v.clientes_nuevos) > 0 && <div className={cn("text-xs", TXT.verde)}>+{fmtNum(v.clientes_nuevos)} nuevos</div>}
                      {Number(v.clientes_perdidos) > 0 && <div className={cn("text-xs", TXT.rojo)}>−{fmtNum(v.clientes_perdidos)} perdidos</div>}
                    </div>
                    <div><div className="text-xs text-muted-foreground">Ticket</div><div className="tabular-nums">{fmtMonto(v.ticket)}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <Variacion label="vs periodo anterior" value={v.var_ant} />
                    <Variacion label="vs año anterior" value={v.var_aa} />
                  </div>
                </CardContent></Card>
              );
            })}
            {(vendQ.data ?? []).length === 0 && <div className="text-sm text-muted-foreground">Sin datos para el periodo.</div>}
          </div>
        )}
      </section>

      {/* Indicadores comerciales del canal */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Indicadores comerciales</h2>
        {indQ.isLoading ? <LoadingState /> : ind && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kpi label="UPT (unidades por factura)" value={Number(ind.upt).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}>
              <Variacion label="vs periodo anterior" value={varPct(ind.upt, ind.upt_ant)} />
            </Kpi>
            <Kpi label="Precio promedio" value={fmtMonto(ind.precio_promedio)}>
              <Variacion label="vs periodo anterior" value={varPct(ind.precio_promedio, ind.precio_promedio_ant)} />
            </Kpi>
            <Kpi label="Margen bruto" value={fmtPct(ind.margen_pct)}>
              <VariacionPp label="vs periodo anterior" actual={ind.margen_pct} anterior={ind.margen_pct_ant} />
            </Kpi>
            <Kpi label="Descuento comercial" value={fmtPct(ind.descuento_comercial_pct)}>
              <div className="text-xs text-muted-foreground">bajo precio retail</div>
              <VariacionPp label="vs periodo anterior" actual={ind.descuento_comercial_pct} anterior={ind.descuento_comercial_pct_ant} invert />
            </Kpi>
            <Kpi label="Concentración top 3 clientes" value={fmtPct(ind.concentracion_top3_pct)}>
              <div className={cn("text-xs", TXT[concentracionSemaforo(Number(ind.concentracion_top3_pct))])}>del canal</div>
            </Kpi>
          </div>
        )}
      </section>

      {/* Composición por colección / línea / género */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Composición de la venta</h2>
        <Card><CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap gap-1">
            {DIMENSIONES.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDimension(d.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  dimension === d.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          {compQ.isLoading ? <LoadingState /> : compRows.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sin datos para el periodo.</div>
          ) : (
            <div className="space-y-2.5">
              {compRows.map((r) => (
                <div key={r.grupo} className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                    <span className="font-medium truncate">{r.grupo}</span>
                    <span className="tabular-nums text-muted-foreground">
                      <span className="font-medium text-foreground">{fmtPct(r.pct_venta)}</span> · {fmtMonto(r.venta)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(Math.max(Number(r.pct_venta) || 0, 0), 100)}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {fmtPct(r.pct_unidades)} de las unidades{r.margen_pct !== null && r.margen_pct !== undefined ? ` · margen ${fmtPct(r.margen_pct)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </section>

      {/* Top productos mayoristas */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Top productos mayoristas</h2>
        {topProdQ.isLoading ? <LoadingState /> : (topProdQ.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin datos para el periodo.</div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Colección</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Venta</TableHead>
                    <TableHead className="text-right">% canal</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Precio may. / retail</TableHead>
                    <TableHead className="text-right">Desc. %</TableHead>
                    <TableHead className="text-right">Margen %</TableHead>
                    <TableHead className="text-right">Stock Reserva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topProdQ.data ?? []).map((p) => {
                    const s = stockSemaforo(Number(p.stock_reserva_distribuidores));
                    return (
                      <TableRow key={p.producto_id}>
                        <TableCell>
                          {p.image_url
                            ? <img src={p.image_url} alt={p.producto} loading="lazy" className="h-10 w-10 rounded object-cover" />
                            : <div className="h-10 w-10 rounded bg-muted" />}
                        </TableCell>
                        <TableCell className="font-medium">{p.producto}</TableCell>
                        <TableCell className="text-muted-foreground">{p.coleccion ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(p.unidades)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtMonto(p.venta)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(p.pct_venta)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtNum(p.clientes)}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtMonto(p.precio_mayorista)} / {fmtMonto(p.precio_retail_sin_iva)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(p.descuento_comercial_pct)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtPct(p.margen_pct)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums font-medium", TXT[s])}>{fmtNum(p.stock_reserva_distribuidores)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-3">
              {(topProdQ.data ?? []).map((p) => {
                const s = stockSemaforo(Number(p.stock_reserva_distribuidores));
                return (
                  <Card key={p.producto_id} className="min-w-0"><CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.producto} loading="lazy" className="h-12 w-12 rounded object-cover shrink-0" />
                        : <div className="h-12 w-12 rounded bg-muted shrink-0" />}
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{p.producto}</div>
                        <div className="text-xs text-muted-foreground">{p.coleccion ?? "—"}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-xs text-muted-foreground">Unidades</div><div className="tabular-nums">{fmtNum(p.unidades)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Venta</div><div className="tabular-nums">{fmtMonto(p.venta)}</div></div>
                      <div><div className="text-xs text-muted-foreground">% canal</div><div className="tabular-nums">{fmtPct(p.pct_venta)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Clientes</div><div className="tabular-nums">{fmtNum(p.clientes)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Desc. / Margen</div><div className="tabular-nums">{fmtPct(p.descuento_comercial_pct)} / {fmtPct(p.margen_pct)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Stock Reserva</div><div className={cn("tabular-nums font-medium", TXT[s])}>{fmtNum(p.stock_reserva_distribuidores)}</div></div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">Precio {fmtMonto(p.precio_mayorista)} / {fmtMonto(p.precio_retail_sin_iva)}</div>
                  </CardContent></Card>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Top clientes */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Top clientes</h2>
        {clientesQ.isLoading ? <LoadingState /> : topClientes.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin datos para el periodo.</div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedora</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Valor facturado</TableHead>
                    <TableHead className="text-right">% canal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topClientes.map((r) => (
                    <TableRow key={r.cliente_id}>
                      <TableCell className="font-medium">{r.cliente}</TableCell>
                      <TableCell className="text-muted-foreground">{tituloNombre(r.vendedora)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtNum(r.unidades)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMonto(r.venta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtPct(r.participacion)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="md:hidden space-y-3">
              {topClientes.map((r) => (
                <Card key={r.cliente_id} className="min-w-0"><CardContent className="p-3 space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-medium text-sm min-w-0">{r.cliente}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{fmtPct(r.participacion)} del canal</div>
                  </div>
                  <div className="text-xs text-muted-foreground">{tituloNombre(r.vendedora)}</div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><div className="text-xs text-muted-foreground">Unidades</div><div className="tabular-nums">{fmtNum(r.unidades)}</div></div>
                    <div><div className="text-xs text-muted-foreground">Valor facturado</div><div className="tabular-nums">{fmtMonto(r.venta)}</div></div>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
