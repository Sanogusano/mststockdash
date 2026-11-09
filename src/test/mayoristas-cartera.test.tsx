import React from "react";
import { render, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MayoristasCartera } from "@/components/mayoristas/MayoristasCartera";
import { totalCartera, carteraEnRiesgo, ordenarCartera, carteraExcel, recaudoExcel, type CarteraRow, type RecaudoRow } from "@/lib/mayoristas-cartera";

const calls = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));
vi.mock("@/components/mayoristas/MayoristasPanel", () => ({ ConsultaError: ({ error }: { error: Error }) => <p role="alert">{error.message}</p> }));
vi.mock("@/components/mayoristas/MayoristasOrdenes", () => ({
  VendedoraSelect: () => null,
  TablaCard: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TablaTh: () => null,
}));
vi.mock("recharts", () => ({ ResponsiveContainer: () => null, BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null, Tooltip: () => null }));
const row: CarteraRow = { cliente_id: "42", cliente: "Cliente prueba", vendedor_id: "7", vendedora: "Lorena", facturas: 2,
  saldo: 1000, por_vencer: 400, vencido_1_30: 100, vencido_31_60: 100, vencido_61_90: 100, vencido_90: 300,
  vencido_total: 600, pct_vencido: 60, dias_max_vencido: 100, factura_mas_antigua: "FV-1", actualizado_en: "2026-11-09T20:00:00Z" };
const pago: RecaudoRow = { cliente_id: "42", cliente: "Cliente prueba", vendedor_id: "7", vendedora: "Lorena", recaudo: 300, notas_credito: 50, por_asiento: 100, por_pago: 200, facturas_pagadas: 1, ultimo_pago: "2026-11-03" };
function mount(desde = "2026-11-01", hasta = "2026-11-09") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } } });
  const component = (from: string, to: string) => <QueryClientProvider client={client}><MayoristasCartera desde={from} hasta={to} vendedor="7" onVendedorChange={() => {}} /></QueryClientProvider>;
  return { ...render(component(desde, hasta)), component };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe("Cartera rules", () => {
  it("totals current balances and calculates weighted overdue percentage", () => {
    expect(totalCartera([row, { ...row, saldo: 2000, vencido_total: 0, por_vencer: 2000, vencido_90: 0 }])).toMatchObject({ saldo: 3000, vencido: 600, porVencer: 2400, vencido90: 300, pctVencido: 20 });
    expect(totalCartera([]).pctVencido).toBeNull();
  });
  it("marks risk only above 50 percent overdue", () => {
    expect(carteraEnRiesgo({ pct_vencido: 50 })).toBe(false);
    expect(carteraEnRiesgo({ pct_vencido: 50.01 })).toBe(true);
  });
  it("sorts amounts numerically and customer names alphabetically without mutating data", () => {
    const rows = [row, { ...row, cliente: "Ana", saldo: 20 }];
    expect(ordenarCartera(rows, "saldo", true).map(r => r.saldo)).toEqual([20, 1000]);
    expect(ordenarCartera(rows, "cliente", true).map(r => r.cliente)).toEqual(["Ana", "Cliente prueba"]);
    expect(rows[0].saldo).toBe(1000);
  });
  it("exports full currency values and keeps credit notes separate from cash collection", () => {
    expect(carteraExcel([row])[0]).toMatchObject({ Saldo: 1000, "+90": 300 });
    expect(recaudoExcel([pago])[0]).toMatchObject({ Recaudo: 300, "Notas crédito (no es recaudo de caja)": 50, "Por asiento": 100, "Por pago": 200 });
  });
  it("period changes reload only period collections, not balances or rolling 12 months", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_cartera" ? [row] : name === "reporte_mayoristas_recaudo" ? [pago] : [], error: null }));
    const view = mount();
    await waitFor(() => expect(calls.rpc).toHaveBeenCalledTimes(3));
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_cartera", { p_vendedor: "7" });
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_recaudo_mensual", { p_meses: 12, p_vendedor: "7" });
    view.rerender(view.component("2026-10-01", "2026-10-31"));
    await waitFor(() => expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_recaudo", { p_desde: "2026-10-01", p_hasta: "2026-10-31", p_vendedor: "7" }));
    expect(calls.rpc.mock.calls.filter(([name]) => name === "reporte_mayoristas_cartera")).toHaveLength(1);
    expect(calls.rpc.mock.calls.filter(([name]) => name === "reporte_mayoristas_recaudo_mensual")).toHaveLength(1);
  });
  it("requests invoice details only after opening the selected customer", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_cartera" ? [row] : [], error: null }));
    const view = mount();
    const button = await view.findByRole("button", { name: "Cliente prueba" });
    expect(calls.rpc.mock.calls.some(([name]) => name === "reporte_mayoristas_cartera_detalle")).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_cartera_detalle", { p_cliente: "42" }));
  });
  it("a balance failure does not prevent collections loading", async () => {
    calls.rpc.mockImplementation(async (name: string) => name === "reporte_mayoristas_cartera" ? { data: null, error: new Error("permission denied for function reporte_mayoristas_cartera") } : { data: [pago], error: null });
    const view = mount();
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("permission denied"));
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_recaudo", { p_desde: "2026-11-01", p_hasta: "2026-11-09", p_vendedor: "7" });
    expect(view.getByRole("region", { name: "Recaudo del período" }).querySelectorAll("tbody tr")).toHaveLength(1);
  });
});