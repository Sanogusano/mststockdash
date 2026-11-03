import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumplimientoPresupuestoCard } from "@/components/dashboard/CumplimientoPresupuestoCard";
import { CollectionCompositionCard } from "@/components/dashboard/CollectionCompositionCard";
import { StoreLeaderboard } from "@/components/dashboard/StoreLeaderboard";

const calls = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));
afterEach(() => { vi.clearAllMocks(); });

describe("Wholesale supplied compliance", () => {
  it("uses wholesale RPC values without fetching retail budgets", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<CumplimientoPresupuestoCard desde="2026-10-01" hasta="2026-10-31" channels={[]} venta={4_000_000_000} universo="Mayoristas" supplied={{ meta: 4_100_000_000, porcentaje: 97.6 }} />));
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(calls.from).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
  it.each([
    ["composition", <CollectionCompositionCard days={0} supplied={{ title: "Por Colección", items: [] }} />],
    ["client ranking", <StoreLeaderboard days={0} supplied={{ title: "Top clientes", columns: [], rows: [] }} />],
  ])("does not fetch retail data for supplied %s", (_name, component) => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(component));
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(calls.from).not.toHaveBeenCalled();
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});