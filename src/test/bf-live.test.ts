import { describe, expect, it } from "vitest";
import { BF_EVENT_END, BF_REFRESH_INTERVAL, budgetMoney, budgetPace, expectedMonthProgress, canViewBfLive, countdown, isNewOrder, liveMoney } from "@/lib/bf-live";

describe("Black Friday Live rules", () => {
  it("uses the Bogota day divided by the days in the current month", () => {
    expect(expectedMonthProgress(Date.parse("2026-11-27T17:14:00Z"))).toBe(90);
    expect(expectedMonthProgress(Date.parse("2026-12-01T04:59:59Z"))).toBe(100);
    expect(expectedMonthProgress(Date.parse("2026-12-01T05:00:00Z"))).toBeCloseTo(100 / 31);
    expect(expectedMonthProgress(Date.parse("2024-02-29T17:00:00Z"))).toBe(100);
  });
  it("marks percentages at or above expected as green", () => {
    expect(budgetPace(90, 90)).toBe("success");
    expect(budgetPace(110, 90)).toBe("success");
  });
  it("marks percentages up to five points below expected as yellow", () => {
    expect(budgetPace(85, 90)).toBe("warning");
    expect(budgetPace(89.9, 90)).toBe("warning");
  });
  it("marks percentages more than five points below expected as red", () => {
    expect(budgetPace(84.9, 90)).toBe("destructive");
  });
  it("abbreviates all budget amounts in whole millions", () => {
    expect(budgetMoney(3341000000)).toBe("$3.341 M");
    expect(budgetMoney(116400000)).toBe("$116 M");
    expect(budgetMoney(0)).toBe("$0 M");
  });
  it("refreshes every 20 seconds", () => expect(BF_REFRESH_INTERVAL).toBe(20000));
  it("ends December 1 at 23:59:59 in Colombia", () => {
    expect(countdown(BF_EVENT_END, Date.parse("2026-12-01T23:59:58-05:00"))).toEqual([0, 0, 0, 1]);
    expect(countdown(BF_EVENT_END, Date.parse("2026-12-02T00:00:00-05:00"))).toEqual([0, 0, 0, 0]);
  });
  it("allows executive or commercial view permissions, but not unrelated or denied ones", () => {
    const permission = (module_key: string, granted = true, action_key = "view") => [{ module_key, granted, action_key, source: "role" }];
    expect(canViewBfLive(permission("dashboards.resumen_ejecutivo"))).toBe(true);
    expect(canViewBfLive(permission("dashboards.resumen"))).toBe(true);
    expect(canViewBfLive(permission("comercial.catalogo"))).toBe(true);
    expect(canViewBfLive(permission("comercial"))).toBe(true);
    expect(canViewBfLive(permission("ecommerce.precios"))).toBe(false);
    expect(canViewBfLive(permission("comercial.catalogo", false))).toBe(false);
    expect(canViewBfLive(permission("comercial.catalogo", true, "edit"))).toBe(false);
    expect(canViewBfLive([], true)).toBe(true);
  });
  it("alerts only when the first order hour or amount changes, not on initial load", () => {
    const previous = { hora: "11:34", venta: 161345, canal: "Tienda online" };
    expect(isNewOrder(undefined, previous)).toBe(false);
    expect(isNewOrder(previous, { ...previous })).toBe(false);
    expect(isNewOrder(previous, { ...previous, hora: "11:35" })).toBe(true);
    expect(isNewOrder(previous, { ...previous, venta: 180000 })).toBe(true);
    expect(isNewOrder(previous, undefined)).toBe(false);
  });
  it("formats COP without fractional pesos and abbreviates large amounts", () => {
    expect(liveMoney(116400000)).toBe("$116,4 M");
    expect(liveMoney(3376000000)).toBe("$3.376 M");
    expect(liveMoney(161345.4, false)).toBe("$161.345");
  });
});