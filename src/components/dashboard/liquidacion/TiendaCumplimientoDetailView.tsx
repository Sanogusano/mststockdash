import { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle } from "lucide-react";
import type { CampanaResumen, LiquidacionRow } from "./types";

interface Props {
  campana: CampanaResumen;
  rows: LiquidacionRow[];
  locMap: Map<string, string>;
}

const fmtCOP = (n: number) => "$ " + Math.round(n || 0).toLocaleString("es-CO");
const fmtInt = (n: number) => Math.round(n || 0).toLocaleString("es-CO");
const fmtDec = (n: number, d = 2) => (Number(n) || 0).toFixed(d);

const CANAL_ORDER = ["Tiendas", "Outlets", "Tienda Online", "Personal Shopper"];

const especieLabel = (t: string) => {
  if (t === "almuerzo") return "Bono Almuerzo";
  if (t === "cine") return "Bono Cine";
  if (t === "ropa") return "Bono Ropa";
  return t;
};

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

  return (
    <div className="space-y-4">
      {/* Header chips */}
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
                        return (
                          <TableRow key={r.id}>
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
