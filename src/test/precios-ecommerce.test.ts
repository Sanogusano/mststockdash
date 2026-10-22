import { describe, it, expect } from "vitest";
import { precioConDcto, margenDe, dctoNuevo, cambioRdv } from "@/components/precios/types";

describe("precios ecommerce", () => {
  it("redondea el precio nuevo a miles", () => {
    expect(precioConDcto(189900, 0.3)).toBe(133000);
  });
  it("margen sobre precio sin IVA", () => {
    expect(margenDe(50000, 119000)).toBeCloseTo(0.5);
  });
  it("subir suma puntos al descuento actual", () => {
    expect(dctoNuevo({ dcto_actual: 0.2, dcto_sugerido: null }, "subir", 10)).toBeCloseTo(0.3);
    expect(dctoNuevo({ dcto_actual: 0.2, dcto_sugerido: null }, "sugerido", 0)).toBeNull();
  });
  it("cambio de ritmo", () => {
    const base = { dcto_actual: 0.2, efecto: null, inicio_rebaja: "2026-01-01" };
    expect(cambioRdv({ ...base, rdv_antes: 2, rdv_desde: 3 })).toEqual({ tipo: "pct", v: 0.5 });
    expect(cambioRdv({ ...base, rdv_antes: 0, rdv_desde: 1 })).toEqual({ tipo: "nuevo" });
    expect(cambioRdv({ ...base, efecto: "muy_pronto", rdv_antes: 2, rdv_desde: 3 })).toEqual({ tipo: "pronto" });
    expect(cambioRdv({ ...base, dcto_actual: 0, rdv_antes: 2, rdv_desde: 3 })).toEqual({ tipo: "na" });
  });
});
