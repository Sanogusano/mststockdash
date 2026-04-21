import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { exportToCSV } from "@/lib/csv-export";
import type { LiquidacionRow, CampanaResumen } from "./types";

type FilterCumple = "todos" | "cumple" | "no_cumple";

interface WeekRow {
  id: string;
  tienda: string;
  location_id: string;
  semana: number;
  semana_inicio: string;
  semana_fin: string;
  meta: number;
  logrado: number;
  tx_requeridas: number;
  tx_logradas: number;
  cumple_meta: boolean | null;
  monto_ganado: number | null;
  ticket_promedio: number;
}

interface StoreGroup {
  tienda: string;
  location_id: string;
  weeks: WeekRow[];
  totalMonto: number;
  ticketPromedio: number;
  semanasCumplidas: number;
}

interface Props {
  campana: CampanaResumen;
  rows: LiquidacionRow[];
  locMap: Map<string, string>;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const pct = (l: number, m: number) => (m > 0 ? Math.min((l / m) * 100, 100) : 0);

export function SemanalDetailView({ campana, rows, locMap }: Props) {
  const [exporting, setExporting] = useState(false);
  const [filterCumple, setFilterCumple] = useState<FilterCumple>("todos");

  const firstProgreso = rows[0]?.progreso_actual as Record<string, unknown> | null;
  const tipoTicket = (firstProgreso?.tipo_ticket as string | undefined) ?? "promedio_esperado";
  const ticketMeta = firstProgreso?.ticket_meta as number | undefined;

  const weekRows: WeekRow[] = rows.map((r) => {
    const p = r.progreso_actual ?? {};
    const meta = p.meta_semanal ?? p.meta_semanal_dinamica ?? 0;
    const logrado = p.venta_lograda ?? 0;
    const txLog = p.tx_logradas ?? 0;
    return {
      id: r.id,
      tienda: locMap.get(r.location_id ?? "") ?? r.location_id ?? "—",
      location_id: r.location_id ?? "",
      semana: p.semana ?? 0,
      semana_inicio: p.semana_inicio ?? "",
      semana_fin: p.semana_fin ?? "",
      meta,
      logrado,
      tx_requeridas: p.tx_requeridas ?? 0,
      tx_logradas: txLog,
      cumple_meta: r.cumple_meta,
      monto_ganado: r.monto_ganado,
      ticket_promedio: txLog > 0 ? logrado / txLog : 0,
    };
  });

  const map = new Map<string, WeekRow[]>();
  weekRows.forEach((r) => {
    if (!map.has(r.location_id)) map.set(r.location_id, []);
    map.get(r.location_id)!.push(r);
  });

  const groupsAll: StoreGroup[] = [];
  map.forEach((weeks) => {
    weeks.sort((a, b) => a.semana - b.semana);
    const totalLogrado = weeks.reduce((s, w) => s + w.logrado, 0);
    const totalTxLog = weeks.reduce((s, w) => s + w.tx_logradas, 0);
    groupsAll.push({
      tienda: weeks[0].tienda,
      location_id: weeks[0].location_id,
      weeks,
      totalMonto: weeks.reduce((s, w) => s + (w.monto_ganado ?? 0), 0),
      ticketPromedio: totalTxLog > 0 ? totalLogrado / totalTxLog : 0,
      semanasCumplidas: weeks.filter((w) => w.cumple_meta).length,
    });
  });
  groupsAll.sort((a, b) => a.tienda.localeCompare(b.tienda));

  const groups = useMemo(() => {
    if (filterCumple === "todos") return groupsAll;
    return groupsAll
      .map((g) => ({
        ...g,
        weeks: g.weeks.filter((w) => (filterCumple === "cumple" ? w.cumple_meta : !w.cumple_meta)),
      }))
      .filter((g) => g.weeks.length > 0);
  }, [groupsAll, filterCumple]);

  const exportCSV = () => {
    const data = groups.flatMap((g) =>
      g.weeks.map((w) => ({
        Tienda: g.tienda,
        Campaña: campana.nombre,
        Semana: w.semana,
        Desde: w.semana_inicio,
        Hasta: w.semana_fin,
        "Meta Semanal": Math.round(w.meta),
        "Venta Lograda": Math.round(w.logrado),
        "% Avance": Math.round(pct(w.logrado, w.meta)),
        "Tx Req": w.tx_requeridas,
        "Tx Log": w.tx_logradas,
        "Ticket Prom": Math.round(w.ticket_promedio),
        "¿Cumple?": w.cumple_meta ? "Sí" : "No",
        "Monto Ganado": w.monto_ganado ?? 0,
      }))
    );
    exportToCSV(data, `liquidacion_${campana.nombre}`);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      // Resumen / Overview con TODAS las columnas pedidas
      const summaryRows = groups.flatMap((g) =>
        g.weeks.map((w) => ({
          Tienda: g.tienda,
          Semana: w.semana,
          Desde: w.semana_inicio,
          Hasta: w.semana_fin,
          "Meta Semanal": Math.round(w.meta),
          "Venta Lograda": Math.round(w.logrado),
          "% Avance": Math.round(pct(w.logrado, w.meta)),
          "Tx Req": w.tx_requeridas,
          "Tx Log": w.tx_logradas,
          "Ticket Prom": Math.round(w.ticket_promedio),
          "¿Cumple?": w.cumple_meta ? "Sí" : "No",
          "Monto Ganado": w.monto_ganado ?? 0,
        }))
      );

      // Detalle de pedidos: SOLO de las semanas que aparecen en la vista filtrada
      // (cuando el filtro es "cumple", solo trae pedidos de semanas cumplidas)
      const ventanas: { location_id: string; tienda: string; desde: string; hasta: string }[] = [];
      groups.forEach((g) => {
        g.weeks.forEach((w) => {
          if (w.semana_inicio && w.semana_fin) {
            ventanas.push({
              location_id: g.location_id,
              tienda: g.tienda,
              desde: w.semana_inicio,
              hasta: w.semana_fin,
            });
          }
        });
      });

      let orderRows: Record<string, unknown>[] = [];
      if (ventanas.length > 0) {
        const locationIds = [...new Set(ventanas.map((v) => v.location_id).filter(Boolean))];
        const minDesde = ventanas.reduce((m, v) => (v.desde < m ? v.desde : m), ventanas[0].desde);
        const maxHasta = ventanas.reduce((m, v) => (v.hasta > m ? v.hasta : m), ventanas[0].hasta);

        const { data: orders } = await supabase
          .from("orders")
          .select("order_number, created_at, total_price, location_id, financial_status")
          .in("location_id", locationIds)
          .gte("created_at", minDesde)
          .lte("created_at", maxHasta + "T23:59:59")
          .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
          .order("created_at", { ascending: false })
          .limit(10000);

        orderRows = (orders ?? [])
          .filter((o) => {
            const fecha = (o.created_at ?? "").substring(0, 10);
            return ventanas.some(
              (v) => v.location_id === o.location_id && fecha >= v.desde && fecha <= v.hasta
            );
          })
          .map((o) => ({
            Tienda: locMap.get(o.location_id ?? "") ?? o.location_id ?? "—",
            Pedido: o.order_number,
            Fecha: new Date(o.created_at).toLocaleDateString("es-CO"),
            Valor: o.total_price,
          }));
      }

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Liquidación");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orderRows), "Pedidos");
      const sufijo = filterCumple === "cumple" ? "_cumplen" : filterCumple === "no_cumple" ? "_no_cumplen" : "";
      XLSX.writeFile(wb, `liquidacion_${campana.nombre}${sufijo}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <ToggleGroup type="single" value={filterCumple} onValueChange={(v) => v && setFilterCumple(v as FilterCumple)} size="sm">
          <ToggleGroupItem value="todos" className="text-xs">Todos</ToggleGroupItem>
          <ToggleGroupItem value="cumple" className="text-xs">Cumplen</ToggleGroupItem>
          <ToggleGroupItem value="no_cumple" className="text-xs">No cumplen</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={exporting}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.location_id} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
              <p className="font-semibold text-sm">{g.tienda}</p>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-muted-foreground">
                  Semanas: <strong className="text-foreground">{g.semanasCumplidas}/{g.weeks.length}</strong>
                </span>
                <span className="text-muted-foreground">
                  Ticket Prom: <strong className="text-foreground tabular-nums">{fmt(g.ticketPromedio)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Total: <strong className="text-foreground tabular-nums">{fmt(g.totalMonto)}</strong>
                </span>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Semana</TableHead>
                  <TableHead className="w-[120px]">Periodo</TableHead>
                  <TableHead className="min-w-[200px]">Avance Venta</TableHead>
                  <TableHead>Transacciones</TableHead>
                  <TableHead>Ticket Prom.</TableHead>
                  <TableHead>¿Cumple?</TableHead>
                  <TableHead className="text-right">Ganado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {g.weeks.map((w) => {
                  const avance = pct(w.logrado, w.meta);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium text-sm">Sem {w.semana}</TableCell>
                      <TableCell className="text-xs text-muted-foreground tabular-nums">
                        {fmtDate(w.semana_inicio)} – {fmtDate(w.semana_fin)}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{fmt(w.logrado)}</span>
                            <span>{fmt(w.meta)}</span>
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
                        {w.tx_logradas} / {w.tx_requeridas}
                      </TableCell>
                      <TableCell className="tabular-nums font-medium text-sm">{fmt(w.ticket_promedio)}</TableCell>
                      <TableCell>
                        {w.cumple_meta ? (
                          <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-sm">
                        {fmt(w.monto_ganado ?? 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>
    </div>
  );
}
