import { describe, it, expect } from "vitest";
import { fmtMonto, fmtPct, fmtPp, semaforoCumplimiento, rangoPeriodo, tituloNombre, varPct } from "@/lib/mayoristas-format";

describe("mayoristas format", () => {
  it("montos", () => {
    expect(fmtMonto(4_000_000_000)).toBe("$4,00MM");
    expect(fmtMonto(657_818_000)).toBe("$657,8M");
    expect(fmtMonto(754_782)).toBe("$754.782");
  });
  it("porcentaje 1 decimal coma", () => expect(fmtPct(71.34)).toBe("71,3%"));
  it("semáforo", () => {
    expect(semaforoCumplimiento(100)).toBe("verde");
    expect(semaforoCumplimiento(95)).toBe("ambar");
    expect(semaforoCumplimiento(89.9)).toBe("rojo");
  });
  it("periodos", () => {
    expect(rangoPeriodo("mes", "2026-11-03")).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" });
    expect(rangoPeriodo("mes_ant", "2026-01-10")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(rangoPeriodo("3m", "2026-02-10")).toEqual({ desde: "2025-12-01", hasta: "2026-02-28" });
  });
  it("nombre título", () => {
    expect(tituloNombre("LORENA MORENO BENITEZ")).toBe("Lorena Moreno Benitez");
    expect(tituloNombre("(Sin vendedora)")).toBe("(Sin vendedora)");
  });
  it("puntos porcentuales", () => {
    expect(fmtPp(3.5)).toBe("+3,5 pp");
    expect(fmtPp(-0.4)).toBe("-0,4 pp");
    expect(fmtPp(null)).toBe("—");
  });
  it("variación porcentual", () => {
    expect(varPct(137.2, 85.2)).toBeCloseTo(61.03, 1);
    expect(varPct(100, 0)).toBeNull();
    expect(varPct(100, null)).toBeNull();
  });
});

describe("fmtFecha / fmtMesGrupo", () => {
  it("formatea fechas y grupos de mes", () => {
    expect(fmtFecha("2026-01-15")).toBe("15 ene 2026");
    expect(fmtFecha(null)).toBe("—");
    expect(fmtMesGrupo("2026-01")).toBe("ene 26");
    expect(fmtMesGrupo("LORENA")).toBe("LORENA");
  });
});

describe("semaforoFacturado / semaforoDiasPendiente", () => {
  it("umbrales de pedido vs. facturado: verde >= 97, ambar 90-97, rojo < 90", () => {
    expect(semaforoFacturado(97.3)).toBe("verde");
    expect(semaforoFacturado(93.2)).toBe("ambar");
    expect(semaforoFacturado(88.5)).toBe("rojo");
    expect(semaforoFacturado(null)).toBe("neutro");
  });
  it("días pendiente: rojo > 30, ambar > 15", () => {
    expect(semaforoDiasPendiente(31)).toBe("rojo");
    expect(semaforoDiasPendiente(16)).toBe("ambar");
    expect(semaforoDiasPendiente(15)).toBe("neutro");
  });
});
