import { describe, it, expect } from "vitest";
import { buildSaludWorkbook, buildSaludFileName, stripEmojis } from "@/lib/salud-producto-excel";

describe("Excel Salud de Producto", () => {
  it("formatos numéricos, encabezados y sin emojis", async () => {
    const wb = await buildSaludWorkbook([{ "Product ID": "1", Producto: "A", "Und. Vendidas": 1234, "ST 120d": 35.5, "RDV Total": 1.234, "Estado Salud": "🔴 SOBRESTOCK" }], "T");
    const ws = wb.getWorksheet("Salud de Producto")!;
    expect(ws.getCell(1, 1).value).toBe("T");
    expect(ws.getCell(3, 2).value).toBe("Producto");
    expect(ws.getCell(4, 3).value).toBe(1234);
    expect(ws.getCell(4, 3).numFmt).toBe("#,##0");
    expect(ws.getCell(4, 4).numFmt).toBe('0.0"%"');
    expect(ws.getCell(4, 5).numFmt).toBe("0.00");
    expect(ws.getCell(4, 6).value).toBe("SOBRESTOCK");
    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 2, ySplit: 3 });
  });
  it("nombre de archivo", () => {
    expect(buildSaludFileName(new Date("2026-11-17T16:00:00Z"))).toBe("Salud_Producto_2026-11-17.xlsx");
    expect(stripEmojis("🟢 ÓPTIMO")).toBe("ÓPTIMO");
  });
});

import { displayProductName } from "@/lib/product-behavior-identifiers";
describe("Excel cruce NetSuite", () => {
  it("hoja 2 una fila por SKU, hoja 1 con N° SKUs", async () => {
    const wb = await buildSaludWorkbook([{ "SKU padre": "1001", "Referencia NS": "ARMINIA", Producto: "A", "SKUs hijos": "1001100462101, 1001100462102 ,1001100462103", Categoría: "T", "Und. Vendidas": 5, "Estado Salud": "🟢 ÓPTIMO", "Product ID": "9" }], "T");
    const h1 = wb.getWorksheet("Salud de Producto")!;
    expect(h1.getRow(3).values).toContain("N° SKUs");
    expect(h1.getRow(3).values).not.toContain("SKUs hijos");
    const h2 = wb.getWorksheet("SKUs (cruce NetSuite)")!;
    expect(h2.getCell(3, 1).value).toBe("SKU");
    expect(h2.getCell(4, 1).value).toBe("1001100462101");
    expect(h2.getCell(4, 1).numFmt).toBe("@");
    expect(h2.getCell(4, 6).value).toBe("ÓPTIMO");
  });
  it("nombre visible usa referencia si el producto es un código", () => {
    expect(displayProductName("10000411251401 : 1000041125140140", "ARMINIA")).toBe("ARMINIA");
    expect(displayProductName("ARMINIA T-SHIRT", "X")).toBe("ARMINIA T-SHIRT");
  });
});
