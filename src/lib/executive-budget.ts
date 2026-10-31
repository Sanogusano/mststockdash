export type BudgetChannel = "tiendas" | "outlets" | "digital";
export interface BudgetLocation { location_id: string; tipo_tienda: string | null; zona: string | null }
export interface BudgetRow { tipo: string; location_id: string | null; nombre_identificador: string; mes: number; anio: number; monto: number }
export interface BudgetSelection { channels: BudgetChannel[]; locationId?: string | null; zona?: string | null }

/** Match physical budgets only by location_id; channel budgets have no physical zone. */
export function budgetMatches(row: BudgetRow, locations: Map<string, BudgetLocation>, selection: BudgetSelection): boolean {
  if (row.tipo === "canal") {
    return selection.channels.includes("digital") && !selection.locationId && !selection.zona &&
      ["Tienda Online", "Personal Shopper"].includes(row.nombre_identificador);
  }
  if (row.tipo !== "tienda" || !row.location_id) return false;
  const loc = locations.get(row.location_id);
  if (!loc || (selection.locationId && loc.location_id !== selection.locationId) || (selection.zona && loc.zona !== selection.zona)) return false;
  const tipo = (loc.tipo_tienda ?? "").toUpperCase();
  return (selection.channels.includes("tiendas") && ["A", "B", "C"].includes(tipo)) ||
    (selection.channels.includes("outlets") && tipo === "OUTLET");
}

/** Preserve the existing inclusive daily proration, including cross-month ranges. */
export function selectedBudget(rows: BudgetRow[], locations: BudgetLocation[], selection: BudgetSelection, desde: string, hasta: string): number {
  const map = new Map(locations.map(l => [l.location_id, l]));
  const from = new Date(`${desde}T00:00:00Z`);
  const to = new Date(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) return 0;
  return Math.round(rows.filter(r => budgetMatches(r, map, selection)).reduce((total, row) => {
    const start = new Date(Date.UTC(row.anio, row.mes - 1, 1));
    const end = new Date(Date.UTC(row.anio, row.mes, 0));
    const overlapStart = Math.max(from.getTime(), start.getTime());
    const overlapEnd = Math.min(to.getTime(), end.getTime());
    if (overlapStart > overlapEnd) return total;
    const days = (overlapEnd - overlapStart) / 86_400_000 + 1;
    return total + Number(row.monto ?? 0) * days / end.getUTCDate();
  }, 0));
}

export function budgetProgress(venta: number, presupuesto: number) {
  return { pct: presupuesto > 0 ? venta / presupuesto * 100 : null, diferencia: venta - presupuesto };
}