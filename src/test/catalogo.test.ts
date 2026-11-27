import { describe, it, expect } from "vitest";
import {
  textoWhatsApp, nombreArchivo, formatCOP, PUBLIC_CATALOG_BASE, catalogoPublicoUrl,
  mensajeCatalogoZenvia, lineaSeleccionCatalogo, agregarProductoAlPedido, cambiarCantidadPedido,
  mensajePedidoWhatsApp, totalPedido, unidadesPedido, type CatalogoProducto, type PedidoItem,
} from "@/lib/catalogo";

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

describe("enlace público del catálogo", () => {
  it("usa siempre el dominio oficial, sin importar desde dónde se abra", () => {
    expect(PUBLIC_CATALOG_BASE).toBe("https://monasterysmart.shop");
    expect(catalogoPublicoUrl("abc123")).toBe("https://monasterysmart.shop/c/abc123");
  });
  it("arma el mensaje con los filtros con que se armó el catálogo", () => {
    expect(mensajeCatalogoZenvia("https://monasterysmart.shop/c/abc123", {
      categorias: ["CROP TOP WOMEN", "T-SHIRT WOMEN", "JEAN WOMEN"],
      tallas: ["S", "M", "L"],
    })).toBe(
      "¡Hola! 👋 Armamos este catálogo Monastery personalizado para ti 🖤\n" +
      "Incluye Crop Top Women, T-Shirt Women y Jean Women en talla S, M y L.\n" +
      "Precios especiales y unidades limitadas.\n" +
      "Elige tus productos y tallas y envíanos tu pedido por aquí mismo.\n" +
      "⏳ Disponible solo por 48 horas: https://monasterysmart.shop/c/abc123",
    );
  });
  it("la línea de selección manda sobre los filtros", () => {
    expect(mensajeCatalogoZenvia("https://monasterysmart.shop/c/abc123", {
      categorias: ["CROP TOP WOMEN"], tallas: ["S"], seleccionados: 12,
    })).toContain("Seleccionamos 12 productos especialmente para ti.");
  });
  it("omite la línea de selección si no hay filtros ni selección", () => {
    expect(mensajeCatalogoZenvia("https://monasterysmart.shop/c/abc123")).toBe(
      "¡Hola! 👋 Armamos este catálogo Monastery personalizado para ti 🖤\n" +
      "Precios especiales y unidades limitadas.\n" +
      "Elige tus productos y tallas y envíanos tu pedido por aquí mismo.\n" +
      "⏳ Disponible solo por 48 horas: https://monasterysmart.shop/c/abc123",
    );
  });
  it("describe solo categorías o solo tallas", () => {
    expect(lineaSeleccionCatalogo({ categorias: ["CROP TOP WOMEN"] })).toBe("Incluye Crop Top Women.");
    expect(lineaSeleccionCatalogo({ tallas: ["S", "M", "L"] })).toBe("Todo disponible en talla S, M y L.");
  });
  it("corta las categorías a 4 y suma el resto", () => {
    expect(lineaSeleccionCatalogo({ categorias: ["A ONE", "B TWO", "C THREE", "D FOUR", "E FIVE", "F SIX"] }))
      .toBe("Incluye A One, B Two, C Three y D Four y 2 más.");
  });
});

describe("pedido del catálogo público", () => {
  const producto = { product_id: "p1", nombre: "ARMINIA T-SHIRT", color: "BLACK", precio: 89900, imagen: null };
  const talla = { sku: "SKU-M", talla: "M", disponible: 2 };
  const item: PedidoItem = { ...producto, sku: "SKU-M", talla: "M", cantidad: 1 };

  it("suma el mismo SKU sin superar el disponible de la talla", () => {
    const primero = agregarProductoAlPedido([], producto, talla);
    const segundo = agregarProductoAlPedido(primero.pedido, producto, talla);
    const tercero = agregarProductoAlPedido(segundo.pedido, producto, talla);
    expect(primero.agregado).toBe(true);
    expect(segundo.pedido[0].cantidad).toBe(2);
    expect(tercero).toEqual({ pedido: segundo.pedido, agregado: false });
  });

  it("mantiene las cantidades entre una unidad y el disponible", () => {
    expect(cambiarCantidadPedido([item], "SKU-M", -1, 2)[0].cantidad).toBe(1);
    expect(cambiarCantidadPedido([item], "SKU-M", 1, 2)[0].cantidad).toBe(2);
    expect(cambiarCantidadPedido([{ ...item, cantidad: 2 }], "SKU-M", 1, 2)[0].cantidad).toBe(2);
  });

  it("calcula unidades, total y mensaje consolidado para WhatsApp", () => {
    const pedido = [item, { ...item, sku: "SKU-L", talla: "L", cantidad: 2 }];
    expect(unidadesPedido(pedido)).toBe(3);
    expect(totalPedido(pedido)).toBe(269700);
    expect(mensajePedidoWhatsApp(pedido, "https://monasterysmart.shop/c/abc123")).toBe(
      "¡Hola! Quiero hacer este pedido del catálogo Monastery:\n" +
      "1. ARMINIA T-SHIRT BLACK – Talla M – 1 und – $ 89.900 c/u (Ref SKU-M)\n" +
      "2. ARMINIA T-SHIRT BLACK – Talla L – 2 und – $ 89.900 c/u (Ref SKU-L)\n" +
      "Total: $ 269.700\nCatálogo: https://monasterysmart.shop/c/abc123",
    );
  });
});
