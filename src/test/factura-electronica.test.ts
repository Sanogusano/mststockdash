import { describe, it, expect } from "vitest";
import { calcularAlerta, ordenarPorAlerta } from "@/lib/factura-electronica";

describe("alerta de documento", () => {
  it("sin documento es rojo", () => expect(calcularAlerta("", "123")).toBe("sin_documento"));
  it("documentos distintos es naranja", () => expect(calcularAlerta("123", "456")).toBe("distintos"));
  it("iguales ignorando no dígitos es OK", () => expect(calcularAlerta("1.023-4", "10234")).toBe("ok"));
  it("solo documento es OK", () => expect(calcularAlerta("123", null)).toBe("ok"));
  it("ordena rojo, naranja, verde y luego más antiguo primero", () => {
    const r = ordenarPorAlerta([
      { alerta: "ok" as const, capturado_en: "2026-01-01", id: "a" },
      { alerta: "distintos" as const, capturado_en: "2026-01-02", id: "b" },
      { alerta: "sin_documento" as const, capturado_en: "2026-01-05", id: "c" },
      { alerta: "sin_documento" as const, capturado_en: "2026-01-03", id: "d" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});
