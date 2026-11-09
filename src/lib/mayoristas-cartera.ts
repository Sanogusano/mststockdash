import type { Database } from "@/integrations/supabase/types";

type Rpc = Database["public"]["Functions"];
export type CarteraRow = Rpc["reporte_mayoristas_cartera"]["Returns"][number];
export type CarteraDetalleRow = Rpc["reporte_mayoristas_cartera_detalle"]["Returns"][number];
export type RecaudoRow = Rpc["reporte_mayoristas_recaudo"]["Returns"][number];

export const carteraColumns = [
  { key: "cliente", label: "Cliente", text: true },
  { key: "vendedora", label: "Vendedora", text: true },
  { key: "facturas", label: "Facturas", count: true },
  { key: "saldo", label: "Saldo" },
  { key: "por_vencer", label: "Por vencer" },
  { key: "vencido_1_30", label: "1–30" },
  { key: "vencido_31_60", label: "31–60" },
  { key: "vencido_61_90", label: "61–90" },
  { key: "vencido_90", label: "+90" },
  { key: "pct_vencido", label: "% vencido", percent: true },
  { key: "dias_max_vencido", label: "Días máx. vencido", count: true },
] satisfies { key: keyof CarteraRow; label: string; text?: boolean; count?: boolean; percent?: boolean }[];

export const tramosCartera = [
  { key: "por_vencer", label: "Por vencer", color: "hsl(var(--cartera-current))", badge: "status-optimal text-success" },
  { key: "vencido_1_30", label: "1–30", color: "hsl(var(--cartera-early))", badge: "bg-warning/5 border-warning/20 text-warning" },
  { key: "vencido_31_60", label: "31–60", color: "hsl(var(--cartera-medium))", badge: "status-warning text-warning" },
  { key: "vencido_61_90", label: "61–90", color: "hsl(var(--cartera-late))", badge: "bg-warning/15 border-danger/30 text-danger" },
  { key: "vencido_90", label: "+90", color: "hsl(var(--cartera-critical))", badge: "status-danger text-danger" },
] as const;

export function totalCartera(rows: CarteraRow[]) {
  const sum = (key: keyof CarteraRow) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const saldo = sum("saldo");
  const vencido = sum("vencido_total");
  return { saldo, vencido, porVencer: sum("por_vencer"), vencido90: sum("vencido_90"), pctVencido: saldo > 0 ? vencido / saldo * 100 : null,
    tramos: Object.fromEntries(tramosCartera.map(t => [t.key, sum(t.key)])) };
}

export const carteraEnRiesgo = (row: Pick<CarteraRow, "pct_vencido">) => Number(row.pct_vencido) > 50;

export function ordenarCartera(rows: CarteraRow[], key: keyof CarteraRow, asc: boolean) {
  const text = key === "cliente" || key === "vendedora";
  return rows.slice().sort((a, b) => {
    if (a[key] == null) return b[key] == null ? 0 : 1;
    if (b[key] == null) return -1;
    const diff = text ? String(a[key]).localeCompare(String(b[key]), "es", { sensitivity: "base" }) : Number(a[key]) - Number(b[key]);
    return asc ? diff : -diff;
  });
}

export function carteraExcel(rows: CarteraRow[]) {
  return rows.map(r => ({
    Cliente: r.cliente, Vendedora: r.vendedora, Facturas: Number(r.facturas), Saldo: Number(r.saldo),
    "Por vencer": Number(r.por_vencer), "1–30": Number(r.vencido_1_30), "31–60": Number(r.vencido_31_60),
    "61–90": Number(r.vencido_61_90), "+90": Number(r.vencido_90), "% vencido": r.pct_vencido == null ? null : Number(r.pct_vencido),
    "Días máx. vencido": r.dias_max_vencido, "Factura más antigua": r.factura_mas_antigua, "Actualizado": r.actualizado_en,
  }));
}

export function recaudoExcel(rows: RecaudoRow[]) {
  return rows.map(r => ({ Cliente: r.cliente, Vendedora: r.vendedora, Recaudo: Number(r.recaudo),
    "Facturas pagadas": Number(r.facturas_pagadas), "Último pago": r.ultimo_pago, "Notas crédito (no es recaudo de caja)": Number(r.notas_credito),
    "Por asiento": Number(r.por_asiento), "Por pago": Number(r.por_pago) }));
}