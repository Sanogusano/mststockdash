import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CumplimientoPresupuestoCard } from "@/components/dashboard/CumplimientoPresupuestoCard";

const calls = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Wholesale supplied compliance", () => {
  it("uses wholesale RPC values without fetching retail budgets", () => {
    render(<CumplimientoPresupuestoCard desde="2026-10-01" hasta="2026-10-31" channels={[]} venta={4_000_000_000} universo="Mayoristas" supplied={{ meta: 4_100_000_000, porcentaje: 97.6 }} />);
    expect(calls.rpc).not.toHaveBeenCalled();
    expect(calls.from).not.toHaveBeenCalled();
  });
});