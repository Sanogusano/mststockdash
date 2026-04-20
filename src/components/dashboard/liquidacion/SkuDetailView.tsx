import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import type { LiquidacionRow, CampanaResumen } from "./types";

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

export function SkuDetailView({ campana, rows, vendedorMap, locMap }: Props) {
  const [exporting, setExporting] = useState(false);

  const skus = Array.isArray(campana.parametros?.skus)
    ? campana.parametros.skus.join(", ")
    : campana.parametros?.skus ?? "—";
  const tipoVenta = campana.parametros?.tipo_venta === "full_price" ? "Full Price" : "Cualquiera";
  const metaUnidades = campana.valor_objetivo;
  const recompensa = campana.recompensa;
  const isAsesor = campana.alcance === "vendedor" || campana.alcance === "asesor";

  const participantes = rows
    .map((r) => {
      const p = r.progreso_actual ?? {};
      const unidades = p.unidades_vendidas ?? 0;
      const meta = p.meta_unidades ?? metaUnidades;
      const id = isAsesor ? r.vendedor_id ?? "" : r.location_id ?? "";
      const nombre = isAsesor
        ? vendedorMap.get(id) ?? id ?? "—"
        : locMap.get(id) ?? id ?? "—";
      return { id: r.id, nombre, unidades, meta, cumple_meta: r.cumple_meta, monto_ganado: r.monto_ganado ?? 0 };
    })
    .sort((a, b) => b.unidades - a.unidades);

  const totalUnidades = participantes.reduce((s, v) => s + v.unidades, 0);
  const cumplen = participantes.filter((v) => v.cumple_meta).length;
  const totalGanado = participantes.reduce((s, v) => s + v.monto_ganado, 0);

  const recompensaLabel = recompensa
    ? recompensa.tipo_pago === "por_unidad"
      ? `${fmt(recompensa.valor)} por unidad`
      : recompensa.tipo_pago === "porcentaje_venta"
      ? `${recompensa.valor}% sobre venta`
      : `${fmt(recompensa.valor)} al cumplir meta`
    : "—";

  const exportExcel = async () => {
    setExporting(true);
    try {
      const data = participantes.map((v, i) => ({
        "#": i + 1,
        [isAsesor ? "Vendedor" : "Tienda"]: v.nombre,
        "Unidades Vendidas": v.unidades,
        Meta: v.meta,
        "% Avance": Math.round(pct(v.unidades, v.meta)),
        "¿Cumple?": v.cumple_meta ? "Sí" : "No",
        Ganado: v.monto_ganado,
      }));
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Resumen");
      XLSX.writeFile(wb, `liquidacion_${campana.nombre}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-muted/30">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div><p className="text-muted-foreground">SKUs</p><p className="font-semibold text-foreground truncate" title={skus}>{skus}</p></div>
          <div><p className="text-muted-foreground">Tipo de Venta</p><p className="font-semibold">{tipoVenta}</p></div>
          <div><p className="text-muted-foreground">Meta</p><p className="font-semibold">{metaUnidades} unidades</p></div>
          <div><p className="text-muted-foreground">Pago</p><p className="font-semibold">{recompensaLabel}</p></div>
          <div><p className="text-muted-foreground">Periodo</p><p className="font-semibold">{fmtDate(campana.fecha_inicio)} – {fmtDate(campana.fecha_fin)}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">{isAsesor ? "Asesores" : "Tiendas"}</p><p className="text-xl font-semibold tabular-nums">{participantes.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Total Unidades</p><p className="text-xl font-semibold tabular-nums">{totalUnidades}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Cumplen Meta</p><p className="text-xl font-semibold tabular-nums">{cumplen}/{participantes.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-[11px] text-muted-foreground">Total a Pagar</p><p className="text-xl font-semibold tabular-nums">{fmt(totalGanado)}</p></CardContent></Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToCSV(participantes.map((v, i) => ({ "#": i + 1, Nombre: v.nombre, Unidades: v.unidades, Meta: v.meta, Cumple: v.cumple_meta ? "Sí" : "No", Ganado: v.monto_ganado })), `liquidacion_${campana.nombre}`)}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={exporting}>
          <Download className="h-3.5 w-3.5" /> Excel
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead>{isAsesor ? "Vendedor" : "Tienda"}</TableHead>
              <TableHead className="text-center">Unidades</TableHead>
              <TableHead className="text-center">Meta</TableHead>
              <TableHead className="min-w-[180px]">% Avance</TableHead>
              <TableHead>¿Cumple?</TableHead>
              <TableHead className="text-right">Ganado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participantes.map((v, i) => {
              const avance = pct(v.unidades, v.meta);
              return (
                <TableRow key={v.id}>
                  <TableCell className="text-sm font-medium tabular-nums">{i + 1}</TableCell>
                  <TableCell className="text-sm">{v.nombre}</TableCell>
                  <TableCell className="text-center tabular-nums font-medium">{v.unidades}</TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">{v.meta}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress value={avance} className="h-2" indicatorClassName={avance >= 100 ? "bg-[hsl(var(--success))]" : avance >= 70 ? "bg-[hsl(var(--warning))]" : "bg-destructive"} />
                      <p className="text-[10px] text-muted-foreground text-right">{avance.toFixed(1)}%</p>
                    </div>
                  </TableCell>
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
