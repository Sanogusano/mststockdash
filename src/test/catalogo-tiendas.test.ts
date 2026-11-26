import { describe, it, expect } from "vitest";
import { csvTraslado, mensajeTienda, type LineaSolicitud } from "@/lib/catalogo-tiendas";

const base: LineaSolicitud = { key: "a", product_id: "1", nombre: "ARMINIA", color: "BLACK", imagen: null, talla: "M", sku: "SKU1",
  ns_item_id: "999", location_id: "L1", tienda: "Santafe Medellin", ciudad: "Medellín", ns_location_id: "15", cantidad: 2, max: 3 };

describe("catalogo tiendas", () => {
  it("CSV con columnas, valores y nombre", () => {
    const now = new Date(Date.UTC(2026, 10, 26, 16, 5)); // 11:05 Bogotá
    const r = csvTraslado([base, { ...base, key: "b", ns_item_id: null, sku: "SKU2" }], "Ana Pérez", now);
    const lines = r.contenido.replace("\uFEFF", "").split("\r\n");
    expect(r.contenido.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe("ID EXTERNO;SUBSIDIARIA;FECHA;UBICACIÓN ORIGEN;UBICACIÓN DESTINO;ARTÍCULO;ID INTERNO ART;EMPLEADO;CANTIDAD");
    expect(lines[1]).toBe("15 PS26111105 CEDI GUAYABAL;2;26/11/2026;15;7;SKU1;999;ANA PÉREZ;2");
    expect(lines).toHaveLength(2);
    expect(r.excluidas.map((l) => l.sku)).toEqual(["SKU2"]);
    expect(r.nombre).toBe("Traslado_15_SantafeMedellin_a_GUAYABAL_26112026_1105.csv");
  });
  it("mensaje para la tienda", () => {
    const m = mensajeTienda("Santafe", [base], "Ana");
    expect(m).toContain("• ARMINIA BLACK – Talla M – SKU SKU1 – 2 und");
    expect(m.endsWith("— Ana")).toBe(true);
  });
});
