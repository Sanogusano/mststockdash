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
});
