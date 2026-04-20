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
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const pct = (l: number, m: number) => (m > 0 ? Math.min((l / m) * 100, 100) : 0);

export function CategoriaDetailView({ campana, rows, vendedorMap }: Props) {
  const [exporting, setExporting] = useState(false);

  const categorias = Array.isArray(campana.parametros?.categorias)
    ? campana.parametros.categorias.join(", ")
    : campana.parametros?.categorias ?? "—";
  const metaUnidades = campana.valor_objetivo;
  const recompensa = campana.recompensa;

  const vendedores = rows
    .map((r) => {
      const p = r.progreso_actual ?? {};
      const unidades = p.unidades_vendidas ?? 0;
      const meta = p.meta_unidades ?? metaUnidades;
      return {
        id: r.id,
        vendedor_id: r.vendedor_id ?? "",
        nombre: vendedorMap.get(r.vendedor_id ?? "") ?? r.vendedor_id ?? "—",
        unidades,
        meta,
        cumple_meta: r.cumple_meta,
        monto_ganado: r.monto_ganado ?? 0,
      };
    })
    .sort((a, b) => b.unidades - a.unidades);

  const totalUnidades = vendedores.reduce((s, v) => s + v.unidades, 0);
  const cumplen = vendedores.filter((v) => v.cumple_meta).length;
  const totalGanado = vendedores.reduce((s, v) => s + v.monto_ganado, 0);

  const recompensaLabel = recompensa
    ? recompensa.tipo_pago === "por_unidad"
      ? `${fmt(recompensa.valor)} por unidad`
      : recompensa.tipo_pago === "fijo"
      ? `${fmt(recompensa.valor)} al cumplir meta`
      : `${fmt(recompensa.valor)} (${recompensa.tipo_pago})`
    : "—";

  const exportCSV = () => {
    const data = vendedores.map((v, i) => ({
      "#": i + 1,
      Vendedor: v.nombre,
      "Unidades Vendidas": v.unidades,
      Meta: v.meta,
      "% Avance": Math.round(pct(v.unidades, v.meta)),
      "¿Cumple?": v.cumple_meta ? "Sí" : "No",
      Ganado: v.monto_ganado,
    }));
    exportToCSV(data, `liquidacion_${campana.nombre}`);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const data = vendedores.map((v, i) => ({
        "#": i + 1,
        Vendedor: v.nombre,
        "Unidades Vendidas": v.unidades,
        Meta: v.meta,
        "% Avance": Math.round(pct(v.unidades, v.meta)),
        "¿Cumple?": v.cumple_meta ? "Sí" : "No",
        Ganado: v.monto_ganado,
      }));
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Vendedores");
      XLSX.writeFile(wb, `liquidacion_${campana.nombre}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header de campaña */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Categoría</p>
            <p className="font-semibold text-foreground">{categorias}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Meta por asesor</p>
            <p className="font-semibold text-foreground">{metaUnidades} unidades</p>
          </div>
          <div>
            <p className="text-muted-foreground">Pago</p>
            <p className="font-semibold text-foreground">{recompensaLabel}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Periodo</p>
            <p className="font-semibold text-foreground">
              {fmtDate(campana.fecha_inicio)} – {fmtDate(campana.fecha_fin)}
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground">Asesores</p>
          <p className="text-xl font-semibold tabular-nums">{vendedores.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground">Total Unidades</p>
          <p className="text-xl font-semibold tabular-nums">{totalUnidades}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground">Cumplen Meta</p>
          <p className="text-xl font-semibold tabular-nums">{cumplen}/{vendedores.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] text-muted-foreground">Total a Pagar</p>
          <p className="text-xl font-semibold tabular-nums">{fmt(totalGanado)}</p>
        </CardContent></Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV}>
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
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-center">Unidades</TableHead>
              <TableHead className="text-center">Meta</TableHead>
              <TableHead className="min-w-[180px]">% Avance</TableHead>
              <TableHead>¿Cumple?</TableHead>
              <TableHead className="text-right">Ganado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendedores.map((v, i) => {
              const avance = pct(v.unidades, v.meta);
              return (
                <TableRow key={v.id}>
                  <TableCell className="text-sm font-medium tabular-nums">{i + 1}</TableCell>
                  <TableCell className="text-sm">{v.nombre}</TableCell>
                  <TableCell className="text-center tabular-nums font-medium">{v.unidades}</TableCell>
                  <TableCell className="text-center tabular-nums text-muted-foreground">{v.meta}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Progress
                        value={avance}
                        className="h-2"
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
                  <TableCell>
                    {v.cumple_meta ? (
                      <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-sm">
                    {fmt(v.monto_ganado)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
