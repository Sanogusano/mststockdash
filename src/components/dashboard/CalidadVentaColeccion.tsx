import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";

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
                  <EvacuacionBar label="90d" pct={r.pct_90} cerrada={r.cerrada_90} productos={r.productos} />
                  <EvacuacionBar label="120d" pct={r.pct_120} cerrada={r.cerrada_120} productos={r.productos} />
                  <EvacuacionBar label="150d" pct={r.pct_150} cerrada={r.cerrada_150} productos={r.productos} />
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

export function CalidadVentaColeccion({ canal }: { canal: string | null }) {
  const [rows, setRows] = useState<CalidadVentaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<CalidadVentaRow[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [openCol, setOpenCol] = useState<string | null>(null);

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
    setOpenCol(row.grupo);
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

      <Sheet open={!!openCol} onOpenChange={(o) => { if (!o) setOpenCol(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Calidad de venta por línea · {openCol}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <CalidadTable rows={detalle} loading={loadingDetalle} />
            <p className="text-[10px] text-muted-foreground mt-3">{NOTA}</p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
