import { useMemo, useState } from "react";
import { fetchDetalleSheetRows } from "./IncentivoDetalleTable";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { exportToCSV } from "@/lib/csv-export";
import type { LiquidacionRow, CampanaResumen } from "./types";

type FilterCumple = "todos" | "cumple" | "no_cumple";

interface Props {
  campana: CampanaResumen;
  rows: LiquidacionRow[];
  vendedorMap: Map<string, string>;
  locMap: Map<string, string>;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const pct = (l: number, m: number) => (m > 0 ? Math.min((l / m) * 100, 100) : 0);

/**
 * Vista compartida para reglas basadas en transacciones/pedidos:
 * - ticket_minimo:    progreso { tx_que_cumplen, tx_totales, valor_ticket_minimo, meta_transacciones }
 * - upt_minimo:       progreso { tx_que_cumplen, tx_totales, unidades_minimas, meta_transacciones }
 * - numero_pedidos:   progreso { pedidos_totales, ticket_promedio, ticket_promedio_minimo, meta_pedidos }
 */
export function TransaccionesDetailView({ campana, rows, vendedorMap, locMap }: Props) {
  const [exporting, setExporting] = useState(false);
  const [filterCumple, setFilterCumple] = useState<FilterCumple>("todos");
  const tipo = campana.tipo_regla;
  const isAsesor = campana.alcance === "vendedor" || campana.alcance === "asesor";
  const tipoVenta = campana.parametros?.tipo_venta === "full_price" ? "Full Price" : "Cualquiera";
  const recompensa = campana.recompensa;

  const condicionLabel =
    tipo === "ticket_minimo"
      ? `Ticket ≥ ${fmt(Number(campana.parametros?.valor_ticket_minimo ?? 0))}`
      : tipo === "upt_minimo"
      ? `UPT ≥ ${campana.parametros?.unidades_minimas ?? 0} und/tx`
      : `Ticket prom ≥ ${fmt(Number(campana.parametros?.ticket_promedio_minimo ?? 0))}`;

  const metaLabel =
    tipo === "numero_pedidos"
      ? `${campana.valor_objetivo} pedidos`
      : `${campana.valor_objetivo} transacciones`;

  const recompensaLabel = recompensa
    ? recompensa.tipo_pago === "por_unidad"
      ? `${fmt(recompensa.valor)} c/u`
      : recompensa.tipo_pago === "porcentaje_venta"
      ? `${recompensa.valor}% sobre venta`
      : `${fmt(recompensa.valor)} al cumplir meta`
    : "—";

  const participantesAll = rows
    .map((r) => {
      const p = r.progreso_actual ?? {};
      const id = isAsesor ? r.vendedor_id ?? "" : r.location_id ?? "";
      const nombre = isAsesor ? vendedorMap.get(id) ?? id ?? "—" : locMap.get(id) ?? id ?? "—";

      let logrado = 0;
      let total = 0;
      let extra = "";
      const meta = campana.valor_objetivo;

      if (tipo === "ticket_minimo" || tipo === "upt_minimo") {
        logrado = Number(p.tx_que_cumplen ?? 0);
        total = Number(p.tx_totales ?? 0);
        extra = total > 0 ? `${((logrado / total) * 100).toFixed(0)}% de ${total}` : "—";
      } else {
        logrado = Number(p.pedidos_totales ?? 0);
        total = logrado;
        extra = `Ticket prom: ${fmt(Number(p.ticket_promedio ?? 0))}`;
      }

      return {
        id: r.id,
        refId: id,
        nombre,
        logrado,
        total,
        extra,
        meta,
        cumple_meta: r.cumple_meta,
        monto_ganado: r.monto_ganado ?? 0,
      };
    })
    .sort((a, b) => b.logrado - a.logrado);

  const participantes = useMemo(
    () =>
      filterCumple === "todos"
        ? participantesAll
        : participantesAll.filter((v) => (filterCumple === "cumple" ? v.cumple_meta : !v.cumple_meta)),
    [participantesAll, filterCumple]
  );

  const totalLogrado = participantes.reduce((s, v) => s + v.logrado, 0);
  const cumplen = participantes.filter((v) => v.cumple_meta).length;
  const totalGanado = participantes.reduce((s, v) => s + v.monto_ganado, 0);

  const colLogrado = tipo === "numero_pedidos" ? "Pedidos" : "Tx que cumplen";
  const colExtra = tipo === "numero_pedidos" ? "Ticket Promedio" : "% del total";

  const exportExcel = async () => {
    setExporting(true);
    try {
      const summaryRows = participantes.map((v, i) => ({
        "#": i + 1,
        [isAsesor ? "Vendedor" : "Tienda"]: v.nombre,
        Condición: condicionLabel,
        Desde: campana.fecha_inicio,
        Hasta: campana.fecha_fin,
        Meta: v.meta,
        [colLogrado]: v.logrado,
        [colExtra]: v.extra,
        "¿Cumple?": v.cumple_meta ? "Sí" : "No",
        "Monto Ganado": v.monto_ganado,
      }));

      // Detalle real del incentivo (aplica condiciones de la regla)
      const refIds = [...new Set(participantes.map((p) => p.refId).filter(Boolean))];
      const orderRows = await fetchDetalleSheetRows(
        campana.incentivo_id,
        refIds.map((refId) => ({ refId, isAsesor }))
      );


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
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div><p className="text-muted-foreground">Condición</p><p className="font-semibold">{condicionLabel}</p></div>
          <div><p className="text-muted-foreground">Tipo de Venta</p><p className="font-semibold">{tipoVenta}</p></div>
          <div><p className="text-muted-foreground">Meta por {isAsesor ? "asesor" : "tienda"}</p><p className="font-semibold">{metaLabel}</p></div>
          <div><p className="text-muted-foreground">Pago</p><p className="font-semibold">{recompensaLabel}</p></div>
          <div><p className="text-muted-foreground">Periodo</p><p className="font-semibold">{fmtDate(campana.fecha_inicio)} – {fmtDate(campana.fecha_fin)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{isAsesor ? "Asesores" : "Tiendas"}</p><p className="text-xl font-semibold tabular-nums">{participantes.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Total {colLogrado}</p><p className="text-xl font-semibold tabular-nums">{totalLogrado}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Cumplen Meta</p><p className="text-xl font-semibold tabular-nums">{cumplen}/{participantes.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Total a Pagar</p><p className="text-xl font-semibold tabular-nums">{fmt(totalGanado)}</p></CardContent></Card>
      </div>

      <div className="flex justify-between items-center gap-2">
        <ToggleGroup type="single" value={filterCumple} onValueChange={(v) => v && setFilterCumple(v as FilterCumple)} size="sm">
          <ToggleGroupItem value="todos" className="text-xs">Todos</ToggleGroupItem>
          <ToggleGroupItem value="cumple" className="text-xs">Cumplen</ToggleGroupItem>
          <ToggleGroupItem value="no_cumple" className="text-xs">No cumplen</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToCSV(participantes.map((v, i) => ({ "#": i + 1, Nombre: v.nombre, [colLogrado]: v.logrado, Meta: v.meta, [colExtra]: v.extra, Cumple: v.cumple_meta ? "Sí" : "No", Ganado: v.monto_ganado })), `liquidacion_${campana.nombre}`)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={exporting}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>{isAsesor ? "Vendedor" : "Tienda"}</TableHead>
              <TableHead className="text-center">{colLogrado}</TableHead>
              <TableHead className="text-center">Meta</TableHead>
              <TableHead className="min-w-[180px]">% Avance</TableHead>
              <TableHead>{colExtra}</TableHead>
              <TableHead>¿Cumple?</TableHead>
              <TableHead className="text-right">Ganado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participantes.map((v, i) => {
              const avance = pct(v.logrado, v.meta);
              return (
                <TableRow key={v.id}>
                  <TableCell className="text-sm font-medium tabular-nums">{i + 1}</TableCell>
                  <TableCell className="text-sm">{v.nombre}</TableCell>
                  <TableCell className="text-center tabular-nums font-medium">{v.logrado}</TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">{v.meta}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={avance} className="h-2" indicatorClassName={avance >= 100 ? "bg-[hsl(var(--success))]" : avance >= 70 ? "bg-[hsl(var(--warning))]" : "bg-destructive"} />
                      <p className="text-[10px] text-muted-foreground text-right">{avance.toFixed(1)}%</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{v.extra}</TableCell>
                  <TableCell>
                    {v.cumple_meta
                      ? <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                      : <Badge variant="secondary">No</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-sm">{fmt(v.monto_ganado)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
