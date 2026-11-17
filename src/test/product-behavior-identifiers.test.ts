import { describe, it, expect, vi } from "vitest";
import { loadProductIdentifiers, joinProductIdentifiers, matchesProductSearch, productExportIdentity } from "@/lib/product-behavior-identifiers";
import { buildSaludWorkbook } from "@/lib/salud-producto-excel";
import { exportToCSV } from "@/lib/csv-export";

describe("Identificadores de Salud de Producto", () => {
  it("pagina por 1000 y une también el producto de la segunda página", async () => {
    const entries = Array.from({ length: 1001 }, (_, i) => ({
      product_id: String(i), sku_padre: "1001100462101", referencia_ns: "ARMINIA", skus_hijos: "100110046210101, 100110046210102",
    }));
    const fetchPage = vi.fn(async (from: number, to: number) => entries.slice(from, to + 1));
    const map = await loadProductIdentifiers(fetchPage);
    expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(map.size).toBe(1001);
    const rows = joinProductIdentifiers([{ product_id: "1000", producto: "Camiseta" }, { product_id: "missing", producto: "Otra" }], map);
    expect(rows[0].sku_padre).toBe("1001100462101");
    expect(rows[1].referencia_ns).toBe("");
  });

  it("busca SKU padre, referencia y SKU hijo aunque no estén en el nombre", () => {
    const row = { producto: "Camiseta", sku_padre: "1001100462101", referencia_ns: "ARMINIA", skus_hijos: "100110046210102" };
    expect(matchesProductSearch(row, "1001100462101")).toBe(true);
    expect(matchesProductSearch(row, " arminia ")).toBe(true);
    expect(matchesProductSearch(row, "100110046210102")).toBe(true);
    expect(matchesProductSearch(row, "NO EXISTE")).toBe(false);
  });

  it("exporta las primeras cuatro columnas y Product ID al final, conservando SKU como texto", async () => {
    const record = { ...productExportIdentity({ producto: "Camiseta", sku_padre: "1001100462101", referencia_ns: "ARMINIA", skus_hijos: "00100110046210102" }), "Und. Vendidas": 1234, "Product ID": "99" };
    expect(Object.keys(record)).toEqual(["SKU padre", "Referencia NS", "Producto", "SKUs hijos", "Und. Vendidas", "Product ID"]);
    const wb = await buildSaludWorkbook([record], "Salud");
    const ws = wb.getWorksheet("Salud de Producto");
    if (!ws) throw new Error("Hoja ausente");
    expect(ws.getCell(4, 1).value).toBe("1001100462101");
    expect(ws.getCell(4, 1).numFmt).toBe("@");
    expect(ws.getCell(4, 4).value).toBe("00100110046210102");
    expect(ws.getCell(4, 4).numFmt).toBe("@");
    expect(ws.getCell(4, 5).value).toBe(1234);
  });

  it("CSV protege SKU numéricos frente a la conversión de Excel", () => {
    let captured: Blob | undefined;
    const create = vi.fn((blob: Blob) => { captured = blob; return "blob:csv"; });
    const oldCreate = URL.createObjectURL;
    const oldRevoke = URL.revokeObjectURL;
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      exportToCSV([{ "SKU padre": "1001100462101", "SKUs hijos": "001234", Producto: "A" }], "salud", ["SKU padre", "SKUs hijos"]);
      expect(captured).toBeDefined();
      // FileReader works for the DOM Blob used by the download helper.
      return new Promise<void>((resolve, reject) => {
        if (!captured) return reject(new Error("No se generó CSV"));
        const reader = new FileReader();
        reader.onload = () => {
          try {
            expect(reader.result).toBe("SKU padre,SKUs hijos,Producto\n'1001100462101,'001234,A");
            resolve();
          } catch (error) { reject(error); }
        };
        reader.readAsText(captured);
      });
    } finally {
      click.mockRestore();
      URL.createObjectURL = oldCreate;
      URL.revokeObjectURL = oldRevoke;
    }
  });
});