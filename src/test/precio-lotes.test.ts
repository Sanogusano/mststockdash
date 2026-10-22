import { describe, it, expect } from "vitest";
import { csvNetsuite } from "@/components/precios/lotes";

describe("lotes de precio", () => {
  it("CSV NetSuite: encabezado exacto, separador ; y enteros sin miles", () => {
    const csv = csvNetsuite([{ internal_id: "123", b_precio_shopify: 149900.4, parque93_precio_sin_iva: 125966, website_precio_sin_iva: 125966 }]);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toBe("Internal ID;B. Precio Shopify;Parque 93 Precio sin IVA;Website Precio sin IVA");
    expect(csv.split("\r\n")[1]).toBe("123;149900;125966;125966");
  });
});
