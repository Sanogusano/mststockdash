import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};
const pct = (l: number, m: number) => (m > 0 ? Math.min((l / m) * 100, 100) : 0);

export function CategoriaDetailView({ campana, rows, vendedorMap }: Props) {
  const [exporting, setExporting] = useState(false);
  const [filterCumple, setFilterCumple] = useState<FilterCumple>("todos");

  const categorias = Array.isArray(campana.parametros?.categorias)
    ? campana.parametros.categorias.join(", ")
    : campana.parametros?.categorias ?? "—";
  const metaUnidades = campana.valor_objetivo;
  const recompensa = campana.recompensa;
  const soloFullPrice = rows.some((r) => (r.progreso_actual as any)?.solo_full_price)
    || (!rows.some((r) => (r.progreso_actual as any)?.solo_full_price === false) && !!campana.parametros?.solo_full_price);

  const vendedoresAll = rows
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

  const vendedores = useMemo(
    () =>
      filterCumple === "todos"
        ? vendedoresAll
        : vendedoresAll.filter((v) => (filterCumple === "cumple" ? v.cumple_meta : !v.cumple_meta)),
    [vendedoresAll, filterCumple]
  );

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
      const summaryRows = vendedores.map((v, i) => ({
        "#": i + 1,
        Vendedor: v.nombre,
        Categoría: categorias,
        Desde: campana.fecha_inicio,
        Hasta: campana.fecha_fin,
        Meta: v.meta,
        "Unidades Vendidas": v.unidades,
        "% Avance": Math.round(pct(v.unidades, v.meta)),
        "¿Cumple?": v.cumple_meta ? "Sí" : "No",
        "Monto Ganado": v.monto_ganado,
      }));

      // Pedidos de los vendedores filtrados
      const vendedorIds = [...new Set(vendedores.map((v) => v.vendedor_id).filter(Boolean))];
      let orderRows: Record<string, unknown>[] = [];
      if (vendedorIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("order_number, created_at, total_price, user_id, location_id, financial_status")
          .in("user_id", vendedorIds)
          .gte("created_at", campana.fecha_inicio)
          .lte("created_at", campana.fecha_fin + "T23:59:59")
          .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
          .order("created_at", { ascending: false })
          .limit(10000);

        const vendedorNombre = new Map(vendedores.map((v) => [v.vendedor_id, v.nombre]));
        orderRows = (orders ?? []).map((o) => ({
          Vendedor: vendedorNombre.get(o.user_id ?? "") ?? o.user_id ?? "—",
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
      {/* Header de campaña */}
      <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Categoría</p>
            <p className="font-semibold text-foreground">{categorias}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Criterio</p>
            <p className="font-semibold text-foreground">{soloFullPrice ? "Solo precio pleno" : "Cualquier venta"}</p>
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
