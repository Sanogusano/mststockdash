import { describe, expect, it } from "vitest";
import { margenBrutoColor, margenBrutoTooltip } from "@/lib/rentabilidad-kpi";

describe("Tarjeta Rentabilidad: color por margen bruto", () => {
  it("verde desde 55% inclusive", () => {
    expect(margenBrutoColor(62.3)).toBe("text-emerald-600");
    expect(margenBrutoColor(55)).toBe("text-emerald-600");
  });

  it("ámbar entre 45% y menos de 55%", () => {
    expect(margenBrutoColor(54.9)).toBe("text-amber-500");
    expect(margenBrutoColor(45)).toBe("text-amber-500");
  });

  it("rojo por debajo de 45%", () => {
    expect(margenBrutoColor(44.9)).toBe("text-destructive");
    expect(margenBrutoColor(0)).toBe("text-destructive");
    expect(margenBrutoColor(Number.NaN)).toBe("text-destructive");
  });
});

describe("Tooltip de Rentabilidad", () => {
  it("muestra la cobertura de costo con un decimal", () => {
    expect(margenBrutoTooltip(98.8)).toBe(
      "Margen bruto sobre venta neta sin IVA. Costo: costo promedio NetSuite. Cobertura de costo: 98.8%",
    );
  });

  it("usa 0.0% cuando la cobertura no es un número", () => {
    expect(margenBrutoTooltip(Number.NaN)).toContain("Cobertura de costo: 0.0%");
  });
});
