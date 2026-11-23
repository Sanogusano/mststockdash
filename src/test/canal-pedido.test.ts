import { describe, expect, it } from "vitest";
import { canalDesdeSource, CANAL_CONFIG, CANAL_OPCIONES } from "@/lib/canal-pedido";

describe("canalDesdeSource", () => {
  it("mapea Falabella", () => {
    expect(canalDesdeSource("3441759")).toBe("falabella");
  });
  it("mapea Addi Marketplace", () => {
    expect(canalDesdeSource("271832285185")).toBe("addi_marketplace");
  });
  it("mapea pedido manual", () => {
    expect(canalDesdeSource("shopify_draft_order")).toBe("pedido_manual");
  });
  it("cualquier otro source es Web", () => {
    expect(canalDesdeSource("web")).toBe("web");
    expect(canalDesdeSource("123456")).toBe("web");
    expect(canalDesdeSource(null)).toBe("web");
    expect(canalDesdeSource(undefined)).toBe("web");
  });
});

describe("CANAL_CONFIG", () => {
  it("tiene etiqueta para los 4 canales", () => {
    expect(CANAL_CONFIG.falabella.label).toBe("Falabella");
    expect(CANAL_CONFIG.addi_marketplace.label).toBe("Addi Marketplace");
    expect(CANAL_CONFIG.pedido_manual.label).toBe("Pedido manual");
    expect(CANAL_CONFIG.web.label).toBe("Web");
  });
});

describe("CANAL_OPCIONES", () => {
  it("incluye Todos y los 4 canales", () => {
    expect(CANAL_OPCIONES.map((o) => o.key)).toEqual([
      "todos",
      "falabella",
      "addi_marketplace",
      "pedido_manual",
      "web",
    ]);
  });
});
