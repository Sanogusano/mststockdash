import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllRpc } from "@/lib/fetch-all-rpc";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

function mockReport(total: number, failurePage?: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ product_id: String(i), sku: `sku-${i}` }));
  const orders: string[][] = [];
  const ranges: number[][] = [];
  const failure = { message: "RPC falló", code: "57014" };
  rpc.mockImplementation(() => {
    const columns: string[] = [];
    orders.push(columns);
    const query = {
      order: vi.fn((column: string) => { columns.push(column); return query; }),
      range: vi.fn(async (from: number, to: number) => {
        ranges.push([from, to]);
        if (ranges.length === failurePage) return { data: null, error: failure };
        return { data: rows.slice(from, to + 1), error: null };
      }),
    };
    return query;
  });
  return { rows, orders, ranges, failure };
}

describe("Carga RPC completa compartida", () => {
  beforeEach(() => rpc.mockReset());

  it.each([1115, 2076])("carga los %i productos rebajados sin truncarlos", async (total) => {
    const mock = mockReport(total);
    const params = { p_solo_con_stock: total === 1115, p_dias_venta: 90 };
    const result = await fetchAllRpc("reporte_rebajas_activas", params, "product_id");
    expect(result).toEqual(mock.rows);
    expect(mock.ranges).toEqual(Array.from({ length: Math.ceil(total / 1000) }, (_, i) => [i * 1000, i * 1000 + 999]));
    expect(mock.orders.every((columns) => columns.join() === "product_id")).toBe(true);
    for (const call of rpc.mock.calls) expect(call).toEqual(["reporte_rebajas_activas", params]);
  });

  it.each([3475, 8201])("carga %i SKUs ordenados por producto y SKU con progreso acumulado", async (total) => {
    const mock = mockReport(total);
    const progress = vi.fn();
    expect(await fetchAllRpc("reporte_rebajas_activas_sku", {}, ["product_id", "sku"], 1000, progress)).toEqual(mock.rows);
    expect(mock.orders).toEqual(Array.from({ length: Math.ceil(total / 1000) }, () => ["product_id", "sku"]));
    expect(progress.mock.calls.map(([count]) => count)).toEqual([0, ...Array.from({ length: Math.ceil(total / 1000) }, (_, i) => Math.min((i + 1) * 1000, total))]);
  });

  it("carga también los 3909 productos de Salud de Producto", async () => {
    const mock = mockReport(3909);
    expect(await fetchAllRpc("reporte_comportamiento_producto", { dias_atras: 30 }, "product_id")).toEqual(mock.rows);
    expect(mock.ranges).toHaveLength(4);
  });

  it("consulta una página vacía al completar exactamente 1000 filas", async () => {
    mockReport(1000);
    expect(await fetchAllRpc("reporte", {}, "product_id")).toHaveLength(1000);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("lanza el error original sin devolver un reporte parcial", async () => {
    const mock = mockReport(2076, 2);
    await expect(fetchAllRpc("reporte", {}, "product_id")).rejects.toBe(mock.failure);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("respeta un tamaño de página menor", async () => {
    const mock = mockReport(5);
    expect(await fetchAllRpc("reporte", {}, "product_id", 2)).toEqual(mock.rows);
    expect(mock.ranges).toEqual([[0, 1], [2, 3], [4, 5]]);
  });
});