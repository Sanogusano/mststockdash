import { describe, expect, it } from "vitest";
import {
  fechaHoraBogota, mostrarPrecioFull, parametrosConsultaShowroom,
  type CatalogoShowroomProducto,
} from "@/lib/catalogo-showroom";
import { mosaicoShowroomHtml } from "@/lib/catalogo-showroom-export";

const producto: CatalogoShowroomProducto = {
  product_id: 1,
  nombre: "ARMINIA T-SHIRT",
  color: "BLACK",
  precio_full: 149900,
  precio_pagina: 89900,
  pct_descuento: 40,
  disponible_total: 5,
  alerta: "ULTIMAS UNIDADES",
  tallas: [
    { sku: "A-S", talla: "S", disponible: 2, ultimas: true },
    { sku: "A-M", talla: "M", disponible: 0, ultimas: false },
    { sku: "A-L", talla: "L", disponible: 3, ultimas: false },
  ],
};

describe("consulta de Catálogo Showroom", () => {
  it("envía únicamente los parámetros admitidos por la RPC", () => {
    const params = parametrosConsultaShowroom({
      busqueda: "arminia", categorias: ["T-SHIRTS"], colecciones: [], generos: [], tallas: ["M"], colores: [],
      precioMin: 50000, precioMax: 200000, soloRebajados: true, orden: "precio_menor",
    });
    expect(params).toEqual({
      p_busqueda: "arminia", p_categorias: ["T-SHIRTS"], p_colecciones: null, p_generos: null,
      p_tallas: ["M"], p_colores: null, p_precio_min: 50000, p_precio_max: 200000,
      p_solo_rebajados: true, p_orden: "precio_menor", p_limite: 48,
    });
    expect(params).not.toHaveProperty("p_vista");
    expect(params).not.toHaveProperty("p_incluir_agotados");
    expect(params).not.toHaveProperty("p_solo_confirmar");
  });
});

describe("precios e inventario de Showroom", () => {
  it("muestra Precio full solo cuando difiere de Precio página", () => {
    expect(mostrarPrecioFull(producto)).toBe(true);
    expect(mostrarPrecioFull({ ...producto, precio_full: 89900 })).toBe(false);
  });

  it("etiqueta ambos precios, muestra el descuento y omite tallas agotadas en el JPG/PDF", () => {
    const { html } = mosaicoShowroomHtml([producto], new Map(), { cols: 1, titulo: "Prueba", generado: "Ahora" });
    expect(html).toContain("Precio full");
    expect(html).toContain("Precio página");
    expect(html).toContain("$ 149.900");
    expect(html).toContain("$ 89.900");
    expect(html).toContain("-40%");
    expect(html).toContain(">S</span>");
    expect(html).toContain(">L</span>");
    expect(html).not.toContain(">M</span>");
  });

  it("exporta solo Precio página cuando ambos valores son iguales", () => {
    const { html } = mosaicoShowroomHtml([{ ...producto, precio_full: 89900, pct_descuento: 0 }], new Map(), { cols: 1, titulo: "Prueba", generado: "Ahora" });
    expect(html).not.toContain("Precio full");
    expect(html).toContain("Precio página");
    expect(html).not.toContain("-40%");
  });

  it("presenta la actualización en hora de Bogotá", () => {
    expect(fechaHoraBogota("2026-11-25T20:13:00Z")).toBe("25 nov 2026 · 3:13 p. m.");
    expect(fechaHoraBogota(null)).toBe("No disponible");
  });
});
