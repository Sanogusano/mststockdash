import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MayoristasClientes } from "@/components/mayoristas/MayoristasClientes";

const calls = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));
vi.mock("@/components/mayoristas/MayoristasPanel", () => ({ ConsultaError: ({ error }: { error: Error }) => <p role="alert">{error.message}</p> }));
vi.mock("@/components/mayoristas/MayoristasOrdenes", () => ({
  VendedoraSelect: () => null,
  TablaCard: ({ children }: { children: React.ReactNode }) => <table>{children}</table>,
  TablaTh: () => null,
}));

const tramos = ["Activo", "Sin pedido 60 días", "Sin pedido 90 días", "Sin pedido 120 días", "Perdido"];
const recencia = tramos.map((tramo, i) => ({ tramo, orden: i + 1, clientes: [37, 2, 2, 4, 30][i], venta_12m: [22_261_637_772, 285_565_461, 30_392_227, 248_649_800, 356_465_268][i], pct_venta_12m: [96, 1.2, 0.1, 1.1, 1.5][i] }));
const clientes = [...tramos, "Nuevo"].map((estado, i) => ({ cliente_id: String(i), cliente: `Cliente ${i}`, estado, venta: 100, unidades: 1, facturas: 1, puntos_entrega: 1, vendedora: "Lorena", ultima_compra: "2026-08-01", dias_sin_compra: 94 }));

const roots: Root[] = [];
async function mount(entry = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><MayoristasClientes desde="2026-11-01" hasta="2026-11-03" vendedor="123" onVendedorChange={() => {}} /></MemoryRouter></QueryClientProvider>);
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return container;
}

afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren(); vi.clearAllMocks(); });

describe("Mayoristas customer recency", () => {
  it("loads seller-only RFM and applies URL segment and overdue chips by client ID", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_recencia" ? recencia : name === "reporte_mayoristas_rfm" ? [
      { cliente_id: "1", segmento: "Leales", cartera_vencida: true },
      { cliente_id: "0", segmento: "Leales", cartera_vencida: false },
    ] : clientes, error: null }));
    const container = await mount("/mayoristas?tab=clientes&segmento=Leales");
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_rfm", { p_vendedor: "123" });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    const chip = [...container.querySelectorAll("button")].find(el => el.textContent === "Con cartera vencida");
    if (!chip) throw new Error("Missing overdue filter");
    await act(async () => chip.click());
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("tbody tr")?.textContent).toContain("Cliente 1");
    expect(calls.rpc).toHaveBeenCalledTimes(3);
  });
  it("queries recency using only period end and seller independently of client data", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_recencia" ? recencia.slice().reverse() : clientes, error: null }));
    await mount();
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_recencia", { p_hasta: "2026-11-03", p_vendedor: "123" });
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_clientes", { p_desde: "2026-11-01", p_hasta: "2026-11-03", p_vendedor: "123" });
  });

  it.each(tramos)("card %s selects only matching customers without refetching", async (tramo) => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_recencia" ? recencia : clientes, error: null }));
    const container = await mount();
    const card = [...container.querySelectorAll(".glass-card")].find(el => el.querySelector("p.uppercase")?.textContent === tramo);
    expect(card).toBeDefined();
    if (!card) throw new Error("Missing recency card");
    await act(async () => { card.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const visibleClientNames = [...container.querySelectorAll("p, button")].filter(el => el.textContent?.startsWith("Cliente ")).map(el => el.textContent);
    expect(visibleClientNames).toEqual([`Cliente ${tramos.indexOf(tramo)}`, `Cliente ${tramos.indexOf(tramo)}`]);
    expect(calls.rpc).toHaveBeenCalledTimes(3);
  });

  it("shows recency errors while keeping customers available", async () => {
    calls.rpc.mockImplementation(async (name: string) => name === "reporte_mayoristas_recencia" ? { data: null, error: new Error("Recency unavailable") } : { data: clientes, error: null });
    const container = await mount();
    expect(container.querySelector("[role=alert]")?.textContent).toBe("Recency unavailable");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
  });
});