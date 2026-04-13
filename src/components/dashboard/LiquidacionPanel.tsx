import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { exportToXLS } from "@/lib/xls-export";
import { exportToCSV } from "@/lib/csv-export";

interface LiquidacionRow {
  id: string;
  tienda: string;
  location_id: string;
  campana: string;
  incentivo_id: string;
  meta: number;
  logrado: number;
  tx_requeridas: number;
  tx_logradas: number;
  cumple_meta: boolean | null;
  monto_ganado: number | null;
  ticket_promedio: number;
  fecha_inicio: string;
  fecha_fin: string;
}

export function LiquidacionPanel() {
  const [data, setData] = useState<LiquidacionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: liq } = await supabase
        .from("incentivo_liquidaciones")
        .select("id, incentivo_id, location_id, progreso_actual, cumple_meta, monto_ganado");

      if (!liq || liq.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const incentivoIds = [...new Set(liq.map((r) => r.incentivo_id))];
      const locationIds = [...new Set(liq.map((r) => r.location_id).filter(Boolean))];

      const [incRes, locRes] = await Promise.all([
        supabase.from("incentivos").select("id, nombre, fecha_inicio, fecha_fin").in("id", incentivoIds),
        locationIds.length > 0
          ? supabase.from("locations").select("location_id, name").in("location_id", locationIds)
          : Promise.resolve({ data: [] }),
      ]);

      const incMap = new Map((incRes.data ?? []).map((i) => [i.id, i]));
      const locMap = new Map((locRes.data ?? []).map((l) => [l.location_id, l.name]));

      const rows: LiquidacionRow[] = liq.map((r) => {
        const p = r.progreso_actual as Record<string, number> | null;
        const meta = p?.meta_semanal_dinamica ?? 0;
        const logrado = p?.venta_lograda ?? 0;
        const txLog = p?.tx_logradas ?? 0;
        const txReq = p?.tx_requeridas ?? 0;
        const inc = incMap.get(r.incentivo_id);
        return {
          id: r.id,
          tienda: locMap.get(r.location_id ?? "") ?? r.location_id ?? "—",
          location_id: r.location_id ?? "",
          campana: inc?.nombre ?? r.incentivo_id,
          incentivo_id: r.incentivo_id,
          meta,
          logrado,
          tx_requeridas: txReq,
          tx_logradas: txLog,
          cumple_meta: r.cumple_meta,
          monto_ganado: r.monto_ganado,
          ticket_promedio: txLog > 0 ? logrado / txLog : 0,
          fecha_inicio: inc?.fecha_inicio ?? "",
          fecha_fin: inc?.fecha_fin ?? "",
        };
      });

      setData(rows);
      setLoading(false);
    };
    fetchData();
  }, []);

  const pct = (logrado: number, meta: number) => (meta > 0 ? Math.min((logrado / meta) * 100, 100) : 0);
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

  const handleExportExcel = async () => {
    if (data.length === 0) return;
    setExporting(true);
    try {
      // Fetch order details for all location_ids and date ranges
      const locationIds = [...new Set(data.map((r) => r.location_id).filter(Boolean))];
      const minDate = data.reduce((m, r) => (r.fecha_inicio < m ? r.fecha_inicio : m), data[0].fecha_inicio);
      const maxDate = data.reduce((m, r) => (r.fecha_fin > m ? r.fecha_fin : m), data[0].fecha_fin);

      const { data: orders } = await supabase
        .from("orders")
        .select("order_number, created_at, total_price, location_id")
        .in("location_id", locationIds)
        .gte("created_at", minDate)
        .lte("created_at", maxDate + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(5000);

      const locMap = new Map<string, string>();
      data.forEach((r) => { if (r.location_id) locMap.set(r.location_id, r.tienda); });

      const orderRows = (orders ?? []).map((o) => ({
        "Número de Pedido": o.order_number,
        Fecha: new Date(o.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }),
        Valor: o.total_price,
        Tienda: locMap.get(o.location_id ?? "") ?? o.location_id ?? "—",
      }));

      const summaryRows = data.map((r) => ({
        Tienda: r.tienda,
        Campaña: r.campana,
        "Meta Venta": Math.round(r.meta),
        "Venta Lograda": Math.round(r.logrado),
        "% Avance": Math.round(pct(r.logrado, r.meta)),
        "Tx Requeridas": r.tx_requeridas,
        "Tx Logradas": r.tx_logradas,
        "Ticket Promedio": Math.round(r.ticket_promedio),
        "¿Cumple Meta?": r.cumple_meta ? "Sí" : "No",
        "Monto Ganado": r.monto_ganado ?? 0,
      }));

      // Export both sheets
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.json_to_sheet(summaryRows);
      XLSX.utils.book_append_sheet(wb, ws1, "Resumen");
      const ws2 = XLSX.utils.json_to_sheet(orderRows);
      XLSX.utils.book_append_sheet(wb, ws2, "Detalle Pedidos");
      XLSX.writeFile(wb, "liquidacion_incentivos.xlsx");
    } catch (err) {
      console.error("Export error", err);
    } finally {
      setExporting(false);
    }
  };

  const exportCSVHandler = () => {
    const rows = data.map((r) => ({
      Tienda: r.tienda,
      Campaña: r.campana,
      "Meta Venta": Math.round(r.meta),
      "Venta Lograda": Math.round(r.logrado),
      "% Avance": Math.round(pct(r.logrado, r.meta)),
      "Ticket Promedio": Math.round(r.ticket_promedio),
      "¿Cumple Meta?": r.cumple_meta ? "Sí" : "No",
      "Monto Ganado": r.monto_ganado ?? 0,
    }));
    exportToCSV(rows, "liquidacion_incentivos");
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Liquidación de Incentivos</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSVHandler}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportExcel} disabled={exporting}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay liquidaciones registradas. Usa "Calcular Progreso" en una campaña activa.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tienda</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead className="min-w-[200px]">Avance Venta</TableHead>
                  <TableHead>Transacciones</TableHead>
                  <TableHead>Ticket Prom.</TableHead>
                  <TableHead>¿Cumple?</TableHead>
                  <TableHead className="text-right">Monto Ganado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const avance = pct(row.logrado, row.meta);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.tienda}</TableCell>
                      <TableCell className="text-sm">{row.campana}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{fmt(row.logrado)}</span>
                            <span>{fmt(row.meta)}</span>
                          </div>
                          <Progress
                            value={avance}
                            className="h-2.5"
                            indicatorClassName={
                              avance >= 100
                                ? "bg-[hsl(var(--success))]"
                                : avance >= 70
                                ? "bg-[hsl(var(--warning))]"
                                : "bg-destructive"
                            }
                          />
                          <p className="text-[10px] text-muted-foreground text-right">{avance.toFixed(1)}%</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {row.tx_logradas} / {row.tx_requeridas}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">{fmt(row.ticket_promedio)}</TableCell>
                      <TableCell>
                        {row.cumple_meta ? (
                          <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {fmt(row.monto_ganado ?? 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
