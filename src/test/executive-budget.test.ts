import { describe, expect, it } from "vitest";
import { budgetMatches, budgetProgress, selectedBudget, type BudgetRow } from "@/lib/executive-budget";
import { formatKpiMoney } from "@/lib/kpi-money";

const locations = [
  { location_id: "s", tipo_tienda: "A", zona: "1" },
  { location_id: "o", tipo_tienda: "OUTLET", zona: "2" },
  { location_id: "b", tipo_tienda: "BODEGA", zona: "1" },
];
const row = (location_id: string | null, monto: number, tipo = "tienda", nombre_identificador = "Same name"): BudgetRow => ({ location_id, monto, tipo, nombre_identificador, mes: 10, anio: 2026 });
const rows = [row("s", 3_631_421_387), row("o", 772_000_000), row("b", 999), row(null, 190_000_000, "canal", "Personal Shopper"), row(null, 972_153_474, "canal", "Tienda Online")];
describe("Executive budget selection", () => {
  it("uses only A/B/C store budgets matched by location ID", () => {
    expect(selectedBudget(rows, locations, { channels: ["tiendas"] }, "2026-10-01", "2026-10-31")).toBe(3_631_421_387);
  });
  it("isolates OUTLET budgets, including the October total", () => {
    expect(selectedBudget(rows, locations, { channels: ["outlets"] }, "2026-10-01", "2026-10-31")).toBe(772_000_000);
  });
  it("includes Online and Personal Shopper channel budgets for Digital", () => {
    expect(selectedBudget(rows, locations, { channels: ["digital"] }, "2026-10-01", "2026-10-31")).toBe(1_162_153_474);
  });
  it("limits goals to the selected location rather than matching names", () => {
    expect(selectedBudget(rows, locations, { channels: ["tiendas", "outlets"], locationId: "o" }, "2026-10-01", "2026-10-31")).toBe(772_000_000);
  });
  it("limits goals to the selected zone and excludes digital goals", () => {
    expect(selectedBudget(rows, locations, { channels: ["tiendas", "outlets", "digital"], zona: "1" }, "2026-10-01", "2026-10-31")).toBe(3_631_421_387);
  });
  it("does not infer a budget from a shared name when location ID is absent", () => {
    expect(budgetMatches(row(null, 100), new Map(locations.map(l => [l.location_id, l])), { channels: ["tiendas"] })).toBe(false);
  });
  it("retains inclusive day proration", () => {
    expect(selectedBudget([row("s", 3100)], locations, { channels: ["tiendas"] }, "2026-10-01", "2026-10-10")).toBe(1000);
  });
  it("returns no percentage for a selection without a goal", () => {
    expect(budgetProgress(100, 0).pct).toBeNull();
  });
  it("uses the KPI sales numerator for October stores", () => {
    expect(budgetProgress(3_291_808_084, 3_631_421_387).pct).toBeCloseTo(90.6479, 3);
  });
  it("uses the KPI sales numerator for October outlets", () => {
    expect(budgetProgress(658_256_173, 772_000_000).pct).toBeCloseTo(85.2664, 3);
  });
  it("keeps shortfall and surplus directions", () => {
    expect(budgetProgress(547_000_000, 1_000_000_000).diferencia).toBe(-453_000_000);
    expect(budgetProgress(1_120_000_000, 1_000_000_000).diferencia).toBe(120_000_000);
  });
});
describe("KPI pesos", () => {
  it("formats billions with MM and two decimals", () => expect(formatKpiMoney(5_030_000_000)).toBe("$5,03MM"));
  it("formats millions with M and one decimal", () => expect(formatKpiMoney(657_818_000)).toBe("$657,8M"));
  it("formats smaller values as whole Colombian pesos", () => expect(formatKpiMoney(754_782)).toBe("$754.782"));
  it("switches at one million", () => expect(formatKpiMoney(1_000_000)).toBe("$1M"));
  it("switches at one billion", () => expect(formatKpiMoney(1_000_000_000)).toBe("$1MM"));
});