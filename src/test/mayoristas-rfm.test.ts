import { describe, expect, it } from "vitest";
import { agruparRfm, clientesRfmUrl, filtrarRfm, type RfmRow } from "@/lib/mayoristas-rfm";

const cliente = (id: string, segmento: string, compras: number, vencida = false, orden = 1): RfmRow => ({
  cliente_id: id, cliente: id, segmento, segmento_orden: orden, compras_12m: compras,
  cartera_vencida: vencida, facturas_12m: 6, saldo: 100, vencido_60: 50,
  dias_sin_compra: 10, primera_compra: "2026-01-01", ticket_12m: 100,
  ultima_compra: "2026-11-01", vendedor_id: "123", vendedora: "Lorena",
});

describe("Mayoristas RFM", () => {
  it("aggregates client counts, 12-month purchases and overdue flags in all seven segments", () => {
    const grupos = agruparRfm([cliente("1", "Campeones", 200), cliente("2", "Campeones", 300, true)]);
    expect(grupos).toHaveLength(7);
    expect(grupos[0]).toMatchObject({ nombre: "Campeones", clientes: 2, compras: 500, vencidos: 1 });
    expect(grupos[1]).toMatchObject({ nombre: "Leales", clientes: 0, compras: 0, vencidos: 0 });
  });
  it("orders groups using segmento_orden from the RPC", () => {
    const grupos = agruparRfm([cliente("1", "Perdidos", 20, false, 0)]);
    expect(grupos[0].nombre).toBe("Perdidos");
  });
  it("joins by cliente_id and intersects segment with overdue filter", () => {
    const rows = [{ cliente_id: "1" }, { cliente_id: "2" }, { cliente_id: "3" }];
    const rfm = [cliente("2", "Leales", 100, true), cliente("1", "Leales", 200), cliente("3", "Perdidos", 30, true)];
    expect(filtrarRfm(rows, rfm, "Leales", true)).toEqual([{ cliente_id: "2" }]);
    expect(filtrarRfm(rows, rfm, null, true)).toEqual([{ cliente_id: "2" }, { cliente_id: "3" }]);
    expect(filtrarRfm(rows, [], null, false)).toEqual(rows);
  });
  it("retains seller and dates when opening a segment", () => {
    const url = new URL(clientesRfmUrl("En riesgo", "123", "2026-11-01", "2026-11-10"), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: "clientes", segmento: "En riesgo", vendedor: "123", desde: "2026-11-01", hasta: "2026-11-10" });
  });
});