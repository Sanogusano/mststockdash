import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, ChevronDown, ChevronRight, Download, Loader2, XCircle } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import type { CampanaResumen, LiquidacionRow } from "./types";

interface Props {
  campana: CampanaResumen;
  rows: LiquidacionRow[];
  locMap: Map<string, string>;
}

const fmtCOP = (n: number) => "$ " + Math.round(n || 0).toLocaleString("es-CO");
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("es-CO");
const fmtDec = (n: number, d = 2) => (Number(n) || 0).toFixed(d);
const fmtDate = (d: string) => new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" });

const CANAL_ORDER = ["Tiendas", "Outlets", "Tienda Online", "Personal Shopper"];

const especieLabel = (t: string) => {
  if (t === "almuerzo") return "Bono Almuerzo";
  if (t === "cine") return "Bono Cine";
  if (t === "ropa") return "Bono Ropa";
  return t;
};

interface PedidoDetalle {
  order_number: string;
  shopify_order_id: string;
  created_at: string;
  total_price: number;
  unidades: number;
}

async function fetchPedidosTienda(
  locationId: string,
  canal: string,
  desde: string,
  hasta: string
): Promise<PedidoDetalle[]> {
  let q = supabase
    .from("orders")
    .select("shopify_order_id, order_number, created_at, total_price, source_name")
    .eq("location_id", locationId)
    .gte("created_at", desde)
    .lte("created_at", hasta + "T23:59:59")
    .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
    .order("created_at", { ascending: false })
    .limit(5000);

  if (canal === "Personal Shopper") q = q.eq("source_name", "shopify_draft_order");
  else if (canal === "Tienda Online") q = q.neq("source_name", "shopify_draft_order");

  const { data: orders, error } = await q;
  if (error || !orders || orders.length === 0) return [];

  const ids = orders.map((o) => o.shopify_order_id).filter(Boolean);
  const unitsById = new Map<string, number>();
  // Chunk in 200s to avoid URI length errors
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: items } = await supabase
      .from("order_items")
      .select("shopify_order_id, quantity, category")
      .in("shopify_order_id", chunk);
    (items ?? []).forEach((it) => {
      const cat = (it.category ?? "").toUpperCase();
      if (cat === "BOLSA" || cat === "INSUMOS") return;
      unitsById.set(
        it.shopify_order_id,
        (unitsById.get(it.shopify_order_id) ?? 0) + (it.quantity ?? 0)
      );
    });
  }

  return orders.map((o) => ({
    order_number: o.order_number ?? "—",
    shopify_order_id: o.shopify_order_id,
    created_at: o.created_at,
    total_price: Number(o.total_price) || 0,
    unidades: unitsById.get(o.shopify_order_id) ?? 0,
  }));
}

export function TiendaCumplimientoDetailView({ campana, rows, locMap }: Props) {
  const grouped = useMemo(() => {
    const g = new Map<string, LiquidacionRow[]>();
    rows.forEach((r) => {
      const canal = ((r.progreso_actual as Record<string, unknown> | null)?.canal as string) || "Otros";
      if (!g.has(canal)) g.set(canal, []);
      g.get(canal)!.push(r);
    });
    return g;
  }, [rows]);

  const canales = Array.from(grouped.keys()).sort((a, b) => {
    const ia = CANAL_ORDER.indexOf(a);
    const ib = CANAL_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const totalCumplen = rows.filter((r) => r.cumple_meta).length;
  const totalMonto = rows.reduce((s, r) => s + (r.monto_ganado ?? 0), 0);
  const tipoPago = campana.recompensa?.tipo_pago ?? "";
  const parametrosPago = (rows[0]?.progreso_actual as Record<string, unknown> | null)?.parametros_pago as
    | Record<string, unknown>
    | undefined;
  const especie = typeof parametrosPago?.tipo_especie === "string" ? parametrosPago.tipo_especie : null;

  const metas = (rows[0]?.progreso_actual as Record<string, unknown> | null)?.metas as
    | Record<string, number>
    | undefined;
  const activas = ((rows[0]?.progreso_actual as Record<string, unknown> | null)?.condiciones_activas as string[]) || [];
  const operador = ((rows[0]?.progreso_actual as Record<string, unknown> | null)?.operador as string) || "AND";

  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pedidosCache, setPedidosCache] = useState<Map<string, PedidoDetalle[]>>(new Map());
  const [loadingRow, setLoadingRow] = useState<Set<string>>(new Set());

  const toggleExpand = async (rowId: string, locationId: string | null, canal: string) => {
    if (!locationId) return;
    const isOpen = expanded.has(rowId);
    const next = new Set(expanded);
    if (isOpen) {
      next.delete(rowId);
      setExpanded(next);
      return;
    }
    next.add(rowId);
    setExpanded(next);
    if (!pedidosCache.has(rowId)) {
      setLoadingRow((s) => new Set(s).add(rowId));
      try {
        const pedidos = await fetchPedidosTienda(locationId, canal, campana.fecha_inicio, campana.fecha_fin);
        setPedidosCache((m) => new Map(m).set(rowId, pedidos));
      } finally {
        setLoadingRow((s) => {
          const n = new Set(s);
          n.delete(rowId);
          return n;
        });
      }
    }
  };

  const buildExportRows = () => {
    return canales.flatMap((canal) => {
      const rowsCanal = grouped.get(canal)!;
      return rowsCanal.map((r) => {
        const p = (r.progreso_actual ?? {}) as Record<string, unknown>;
        const tienda = locMap.get(r.location_id ?? "") ?? r.location_id ?? "—";
        const cpp = Number(p.cumplimiento_presupuesto_pct);
        return {
          Canal: canal,
          Tienda: tienda,
          Campaña: campana.nombre,
          "% Cumpl. Presup.": Number.isFinite(cpp) ? Number(cpp.toFixed(2)) : "",
          Presupuesto: Math.round(Number(p.presupuesto) || 0),
          UPT: Number((Number(p.upt) || 0).toFixed(2)),
          "% Full Price": Number((Number(p.full_price_pct) || 0).toFixed(1)),
          "Ticket Promedio": Math.round(Number(p.ticket_promedio) || 0),
          Pedidos: Math.round(Number(p.pedidos) || 0),
          Unidades: Math.round(Number(p.unidades) || 0),
          "Venta Neta": Math.round(Number(p.venta_neta) || 0),
          "¿Cumple?": r.cumple_meta ? "Sí" : "No",
          Recompensa:
            r.cumple_meta && tipoPago === "bono_especie"
              ? especieLabel(especie ?? "")
              : Math.round(r.monto_ganado ?? 0),
        };
      });
    });
  };

  const buildPedidosExport = async () => {
    const detalle: Record<string, unknown>[] = [];
    for (const canal of canales) {
      const rowsCanal = grouped.get(canal)!.filter((r) => r.cumple_meta && r.location_id);
      for (const r of rowsCanal) {
        const tienda = locMap.get(r.location_id ?? "") ?? r.location_id ?? "—";
        const cached = pedidosCache.get(r.id);
        const pedidos = cached ?? (await fetchPedidosTienda(r.location_id!, canal, campana.fecha_inicio, campana.fecha_fin));
        if (!cached) setPedidosCache((m) => new Map(m).set(r.id, pedidos));
        pedidos.forEach((p) => {
          detalle.push({
            Canal: canal,
            Tienda: tienda,
            Pedido: p.order_number,
            Fecha: fmtDate(p.created_at),
            Unidades: p.unidades,
            Valor: Math.round(p.total_price),
          });
        });
      }
    }
    return detalle;
  };

  const exportCSV = () => {
    exportToCSV(buildExportRows(), `liquidacion_${campana.nombre}`);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const resumen = buildExportRows();
      const pedidos = await buildPedidosExport();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), "Resumen");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pedidos), "Pedidos (Cumplen)");
      XLSX.writeFile(wb, `liquidacion_${campana.nombre}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header chips + export */}
      <div className="flex flex-wrap gap-2 items-center">
        <Badge variant="secondary" className="text-xs">Operador: {operador}</Badge>
        {activas.includes("cumplimiento_presupuesto_pct") && metas && (
          <Badge variant="outline" className="text-xs">% Presup. ≥ {fmtDec(metas.cumplimiento_presupuesto_pct ?? 0, 0)}%</Badge>
        )}
        {activas.includes("upt") && metas && (
          <Badge variant="outline" className="text-xs">UPT ≥ {fmtDec(metas.upt ?? 0, 1)}</Badge>
        )}
        {activas.includes("full_price_pct") && metas && (
          <Badge variant="outline" className="text-xs">%FP ≥ {fmtDec(metas.full_price_pct ?? 0, 0)}%</Badge>
        )}
        {activas.includes("ticket_promedio") && metas && (
          <Badge variant="outline" className="text-xs">Ticket ≥ {fmtCOP(metas.ticket_promedio ?? 0)}</Badge>
        )}
        <div className="flex-1" />
        <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
          {totalCumplen} de {rows.length} cumplen
        </Badge>
        {tipoPago === "bono_especie" && especie ? (
          <Badge variant="secondary">Recompensa: {especieLabel(especie)}</Badge>
        ) : (
          <Badge variant="secondary">Total a pagar: {fmtCOP(totalMonto)}</Badge>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportCSV} disabled={rows.length === 0}>
          <Download className="h-3.5 w-3.5" /> CSV
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportExcel} disabled={exporting || rows.length === 0}>
          {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Excel
        </Button>
      </div>

      {canales.map((canal) => {
        const rowsCanal = grouped.get(canal)!;
        const cumplen = rowsCanal.filter((r) => r.cumple_meta).length;
        return (
          <Card key={canal}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">{canal}</h3>
                <span className="text-xs text-muted-foreground">
                  {cumplen} / {rowsCanal.length} tiendas cumplen
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Tienda</TableHead>
                      <TableHead className="text-right">% Presup.</TableHead>
                      <TableHead className="text-right">UPT</TableHead>
                      <TableHead className="text-right">%FP</TableHead>
                      <TableHead className="text-right">Ticket Prom</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Venta Neta</TableHead>
                      <TableHead className="text-center">¿Cumple?</TableHead>
                      <TableHead className="text-right">Ganado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rowsCanal
                      .sort((a, b) => (b.monto_ganado ?? 0) - (a.monto_ganado ?? 0))
                      .map((r) => {
                        const p = (r.progreso_actual ?? {}) as Record<string, unknown>;
                        const res = (p.resultados as Record<string, boolean | null>) || {};
                        const tienda = locMap.get(r.location_id ?? "") ?? r.location_id ?? "—";
                        const isEspecie = tipoPago === "bono_especie";
                        const isOpen = expanded.has(r.id);
                        const pedidos = pedidosCache.get(r.id);
                        const loading = loadingRow.has(r.id);
                        return (
                          <>
                            <TableRow key={r.id} className={r.cumple_meta ? "cursor-pointer hover:bg-muted/40" : ""}
                              onClick={() => r.cumple_meta && toggleExpand(r.id, r.location_id, canal)}>
                              <TableCell className="w-8">
                                {r.cumple_meta ? (
                                  isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium">{tienda}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {(() => {
                                  const val = Number(p.cumplimiento_presupuesto_pct);
                                  if (!Number.isFinite(val)) return <span className="text-muted-foreground">—</span>;
                                  return (
                                    <span className={res.cumplimiento_presupuesto_pct === false ? "text-destructive" : res.cumplimiento_presupuesto_pct ? "text-[hsl(var(--success))]" : ""}>
                                      {fmtDec(val, 1)}%
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={res.upt === false ? "text-destructive" : res.upt ? "text-[hsl(var(--success))]" : ""}>
                                  {fmtDec(Number(p.upt) || 0, 2)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={res.full_price_pct === false ? "text-destructive" : res.full_price_pct ? "text-[hsl(var(--success))]" : ""}>
                                  {fmtDec(Number(p.full_price_pct) || 0, 1)}%
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                <span className={res.ticket_promedio === false ? "text-destructive" : res.ticket_promedio ? "text-[hsl(var(--success))]" : ""}>
                                  {fmtCOP(Number(p.ticket_promedio) || 0)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{fmtInt(Number(p.pedidos) || 0)}</TableCell>
                              <TableCell className="text-right tabular-nums">{fmtCOP(Number(p.venta_neta) || 0)}</TableCell>
                              <TableCell className="text-center">
                                {r.cumple_meta ? (
                                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] mx-auto" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {r.cumple_meta && isEspecie
                                  ? especieLabel(especie ?? "")
                                  : fmtCOP(r.monto_ganado ?? 0)}
                              </TableCell>
                            </TableRow>
                            {isOpen && (
                              <TableRow key={r.id + "-detail"} className="bg-muted/20">
                                <TableCell colSpan={10} className="p-3">
                                  <IncentivoDetalleTable
                                    incentivoId={campana.incentivo_id}
                                    locationId={r.location_id}
                                  />
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aún no hay resultados. Usa "Calcular Progreso" en esta campaña.
        </p>
      )}
    </div>
  );
}
