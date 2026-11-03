import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumplimientoPresupuestoCard } from "@/components/dashboard/CumplimientoPresupuestoCard";

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
});