import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MayoristasClientes desde="2026-11-01" hasta="2026-11-03" vendedor="123" onVendedorChange={() => {}} /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Mayoristas customer recency", () => {
  it("queries recency using only period end and seller independently of client data", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_recencia" ? recencia.slice().reverse() : clientes, error: null }));
    mount();
    await waitFor(() => expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_recencia", { p_hasta: "2026-11-03", p_vendedor: "123" }));
    await screen.findAllByText("Cliente 0");
    expect(calls.rpc).toHaveBeenCalledWith("reporte_mayoristas_clientes", { p_desde: "2026-11-01", p_hasta: "2026-11-03", p_vendedor: "123" });
  });

  it.each(tramos)("card %s selects only matching customers without refetching", async (tramo) => {
    calls.rpc.mockImplementation(async (name: string) => ({ data: name === "reporte_mayoristas_recencia" ? recencia : clientes, error: null }));
    const { container } = mount();
    await screen.findAllByText("Cliente 0");
    const card = [...container.querySelectorAll(".glass-card")].find(el => el.querySelector("p.uppercase")?.textContent === tramo);
    expect(card).toBeDefined();
    if (!card) throw new Error("Missing recency card");
    fireEvent.click(card);
    expect(screen.getAllByText(`Cliente ${tramos.indexOf(tramo)}`)).toHaveLength(2);
    expect(screen.queryByText("Cliente 5")).toBeNull();
    expect(calls.rpc).toHaveBeenCalledTimes(2);
  });

  it("shows recency errors while keeping customers available", async () => {
    calls.rpc.mockImplementation(async (name: string) => name === "reporte_mayoristas_recencia" ? { data: null, error: new Error("Recency unavailable") } : { data: clientes, error: null });
    mount();
    await screen.findByRole("alert");
    expect(screen.getAllByText("Cliente 0")).toHaveLength(2);
  });
});