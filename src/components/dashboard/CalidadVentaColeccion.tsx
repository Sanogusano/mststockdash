import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend,
} from "recharts";

interface CurvaRow {
  semana: number;
  dia_desde: number;
  uds_semana: number;
  uds_acumuladas: number;
  pct_acumulado: number;
  producido_total: number;
  productos_activos: number;
}

export interface CalidadVentaRow {
  grupo: string;
  productos: number;
  producido: number;
  vendido_90: number; pct_90: number; cerrada_90: number;
  vendido_120: number; pct_120: number; cerrada_120: number;
  vendido_150: number; pct_150: number; cerrada_150: number;
  vendido_total: number; pct_total: number;
}

const NOTA = "Producido = vendidas + stock actual + stock detenido. No incluye unidades despachadas a mayoristas.";

const fmtNum = (n: number) => Number(n || 0).toLocaleString("es-CO");

function barColor(pct: number) {
  if (pct < 40) return "bg-destructive";
  if (pct < 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function EvacuacionBar({ label, pct, cerrada, productos, vendido }: { label: string; pct: number; cerrada: number; productos: number; vendido: number }) {
  const value = Math.max(0, Math.min(Number(pct || 0), 100));
  const parcial = Number(cerrada || 0) < Number(productos || 0);
  return (
    <div className="flex items-center gap-2" title={parcial ? `Ventana abierta: ${fmtNum(cerrada)} de ${fmtNum(productos)} productos ya cerraron ${label}` : undefined}>
      <span className="text-[10px] text-muted-foreground w-7 shrink-0 tabular-nums">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden min-w-[70px]">
        <div
          className={cn("h-full rounded-full transition-all", barColor(value))}
          style={{ width: `${value}%`, opacity: parcial ? 0.4 : 1 }}
        />
      </div>
      <span className={cn("text-[10px] font-semibold w-10 text-right tabular-nums", parcial && "text-muted-foreground")}>
        {value.toFixed(1)}%
      </span>
      <span className="hidden md:inline text-[10px] text-muted-foreground w-16 text-right tabular-nums">
        {fmtNum(vendido)} uds
      </span>
      <span className="hidden sm:inline text-[10px] text-muted-foreground/70 w-14 text-right tabular-nums shrink-0">
        {fmtNum(cerrada)}/{fmtNum(productos)}
      </span>
    </div>
  );
}

function CalidadTable({ rows, loading, onRowClick }: { rows: CalidadVentaRow[]; loading: boolean; onRowClick?: (r: CalidadVentaRow) => void }) {
  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos para este filtro.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[720px]">
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="min-w-[140px]">Colección</TableHead>
            <TableHead className="text-right">Productos</TableHead>
            <TableHead className="text-right">Producido</TableHead>
            <TableHead className="min-w-[220px]">Evacuación</TableHead>
            <TableHead className="text-right">% Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.grupo}
              className={onRowClick ? "cursor-pointer" : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              <TableCell className="text-sm font-medium">{r.grupo}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">{fmtNum(r.productos)}</TableCell>
              <TableCell className="text-right text-sm tabular-nums">{fmtNum(r.producido)}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <EvacuacionBar label="90d" pct={r.pct_90} cerrada={r.cerrada_90} productos={r.productos} vendido={r.vendido_90} />
                  <EvacuacionBar label="120d" pct={r.pct_120} cerrada={r.cerrada_120} productos={r.productos} vendido={r.vendido_120} />
                  <EvacuacionBar label="150d" pct={r.pct_150} cerrada={r.cerrada_150} productos={r.productos} vendido={r.vendido_150} />
                </div>
              </TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">{Number(r.pct_total || 0).toFixed(1)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

const HITOS = [
  { semana: 13, label: "90d" },
  { semana: 17, label: "120d" },
  { semana: 21, label: "150d" },
];

function HistogramaEvacuacion({ coleccion, canal, totalProductos }: { coleccion: string; canal: string | null; totalProductos: number }) {
  const [data, setData] = useState<(CurvaRow & { label: string; parcial: boolean })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .rpc("reporte_curva_evacuacion_coleccion" as any, {
        p_coleccion: coleccion,
        p_canal: canal,
        p_linea: null,
        p_semanas: 52,
      })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setData([]); setLoading(false); return; }
        const raw = ((data ?? []) as unknown as CurvaRow[]).map(r => ({
          ...r,
          semana: Number(r.semana),
          uds_semana: Number(r.uds_semana || 0),
          uds_acumuladas: Number(r.uds_acumuladas || 0),
          pct_acumulado: Number(r.pct_acumulado || 0),
          productos_activos: Number(r.productos_activos || 0),
        })).sort((a, b) => a.semana - b.semana);

        const base = raw.filter(r => r.semana <= 52);
        const resto = raw.filter(r => r.semana > 52);
        if (resto.length) {
          const ult = base[base.length - 1];
          const acumUds = resto.reduce((s, r) => s + r.uds_semana, 0);
          const last = resto[resto.length - 1];
          if (ult && ult.semana === 52) {
            ult.uds_semana += acumUds;
            ult.uds_acumuladas = last.uds_acumuladas;
            ult.pct_acumulado = last.pct_acumulado;
            ult.productos_activos = Math.min(ult.productos_activos, last.productos_activos);
          } else {
            base.push({ ...last, semana: 52, uds_semana: acumUds });
          }
        }
        const total = totalProductos || Math.max(...base.map(r => r.productos_activos), 0);
        setData(base.map(r => ({
          ...r,
          label: r.semana >= 52 ? "52+" : String(r.semana),
          parcial: r.productos_activos < total,
        })));
        setLoading(false);
      });
    return () => { active = false; };
  }, [coleccion, canal, totalProductos]);

  if (loading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!data.length) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Sin curva de evacuación para esta colección.</p>;
  }

  const hayParcial = data.some(d => d.parcial);

  return (
    <div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => fmtNum(v)} />
            <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} width={40} tickFormatter={(v) => `${v}%`} />
            <RTooltip
              formatter={(value: any, name: any) =>
                name === "% acumulado" ? [`${Number(value).toFixed(1)}%`, name] : [fmtNum(Number(value)), name]
              }
              labelFormatter={(l) => `Semana ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {HITOS.map(h => (
              <ReferenceLine
                key={h.semana}
                yAxisId="left"
                x={String(h.semana)}
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="4 4"
                label={{ value: h.label, position: "top", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              />
            ))}
            <Bar yAxisId="left" dataKey="uds_semana" name="Uds semana" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fillOpacity={d.parcial ? 0.3 : 0.85} />)}
            </Bar>
            <Line yAxisId="right" type="monotone" dataKey="pct_acumulado" name="% acumulado" stroke="hsl(var(--chart-2, var(--foreground)))" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {hayParcial && (
        <p className="text-[10px] text-muted-foreground mt-2">
          Las semanas atenuadas aún no las alcanzan todos los productos de la colección: ese dato va a crecer.
        </p>
      )}
    </div>
  );
}

export function CalidadVentaColeccion({ canal }: { canal: string | null }) {
  const [rows, setRows] = useState<CalidadVentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<CalidadVentaRow[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [openRow, setOpenRow] = useState<CalidadVentaRow | null>(null);
  const openCol = openRow?.grupo ?? null;

  const fetchRows = useCallback(async (coleccion: string | null) => {
    const { data, error } = await supabase.rpc("reporte_calidad_venta_coleccion" as any, {
      p_canal: canal,
      p_coleccion: coleccion,
      p_agrupar_por: coleccion ? "linea" : "coleccion",
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CalidadVentaRow[];
  }, [canal]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRows(null)
      .then(r => { if (active) setRows(r); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchRows]);

  const openDetalle = async (row: CalidadVentaRow) => {
    setOpenRow(row);
    setLoadingDetalle(true);
    try {
      setDetalle(await fetchRows(row.grupo));
    } catch {
      setDetalle([]);
    } finally {
      setLoadingDetalle(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" /> Calidad de Venta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CalidadTable rows={rows} loading={loading} onRowClick={openDetalle} />
          <p className="text-[10px] text-muted-foreground mt-3">{NOTA}</p>
        </CardContent>
      </Card>

      <Sheet open={!!openRow} onOpenChange={(o) => { if (!o) setOpenRow(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Calidad de venta · {openCol}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-6">
            {openRow && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Curva de evacuación (52 semanas)</h3>
                <HistogramaEvacuacion coleccion={openRow.grupo} canal={canal} totalProductos={Number(openRow.productos || 0)} />
              </section>
            )}
            <section>
              <h3 className="text-sm font-semibold mb-2">Desglose por línea</h3>
              <CalidadTable rows={detalle} loading={loadingDetalle} />
              <p className="text-[10px] text-muted-foreground mt-3">{NOTA}</p>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
