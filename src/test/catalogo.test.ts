import { describe, it, expect } from "vitest";
import { textoWhatsApp, nombreArchivo, formatCOP, type CatalogoProducto } from "@/lib/catalogo";

const base: CatalogoProducto = {
  product_id: 1, nombre: "ARMINIA T-SHIRT", color: "BLACK", precio: 89900, precio_antes: 149900, pct_descuento: 40,
  disponible_total: 5, alerta: "ULTIMAS UNIDADES",
  tallas: [{ sku: "a", talla: "S", disponible: 2, ultimas: true }, { sku: "b", talla: "M", disponible: 0, ultimas: false }, { sku: "c", talla: "L", disponible: 3, ultimas: false }],
};

describe("catálogo WhatsApp", () => {
  it("arma el texto completo solo con tallas con stock", () => {
    expect(textoWhatsApp(base)).toBe("*ARMINIA T-SHIRT* – BLACK\n💰 $ 89.900 (antes $ 149.900, -40%)\n📏 Tallas: S, L\n⚠️ ¡Últimas unidades!");
  });
  it("omite líneas que no aplican", () => {
    expect(textoWhatsApp({ ...base, precio_antes: null, pct_descuento: 0, alerta: null, tallas: [{ sku: "a", talla: "M", disponible: 4, ultimas: false }] }))
      .toBe("*ARMINIA T-SHIRT* – BLACK\n💰 $ 89.900\n📏 Tallas: M");
  });
  it("nombre de archivo NOMBRE-COLOR.jpg y COP sin decimales", () => {
    expect(nombreArchivo(base)).toBe("ARMINIA T-SHIRT-BLACK.jpg");
    expect(formatCOP(1234.6)).toBe("$ 1.235");
  });
});

import { compararTallas, etiquetaFiltro } from "@/lib/catalogo";
describe("filtros del catálogo", () => {
  it("ordena tallas: letras, luego numéricas", () => {
    expect(["10", "L", "06", "XS", "U", "XXL", "4", "M", "S", "XL"].sort(compararTallas)).toEqual(["XS", "S", "M", "L", "XL", "XXL", "4", "06", "10", "U"]);
  });
  it("etiqueta del botón según cantidad elegida", () => {
    expect(etiquetaFiltro("Talla", [])).toBe("Talla");
    expect(etiquetaFiltro("Talla", ["M"])).toBe("Talla: M");
    expect(etiquetaFiltro("Talla", ["M", "L"])).toBe("Talla: M, L");
    expect(etiquetaFiltro("Talla", ["M", "L", "XL"])).toBe("Talla · 3");
  });
});

describe("confirmar antes de vender", () => {
  it("el texto para el cliente omite tallas con vendible 0 e incluye las por confirmar con vendible > 0", () => {
    const p = { ...base, alerta: null, tallas: [
      { sku: "a", talla: "S", disponible: 3, vendible: 0, confirmar: true, ultimas: false },
      { sku: "b", talla: "M", disponible: 5, vendible: 2, confirmar: true, ultimas: false },
      { sku: "c", talla: "L", disponible: 4, vendible: 4, confirmar: false, ultimas: false },
    ] };
    expect(textoWhatsApp(p)).toBe("*ARMINIA T-SHIRT* – BLACK\n💰 $ 89.900 (antes $ 149.900, -40%)\n📏 Tallas: M, L");
  });
});
