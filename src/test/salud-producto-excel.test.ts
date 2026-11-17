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
