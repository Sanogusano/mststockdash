import React, { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { CollectionCompositionCard } from "@/components/dashboard/CollectionCompositionCard";

const calls = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: calls }));

const rows = [
  { coleccion: "IMPERIUM", unidades: 1234, venta: 489_000_000 },
  { coleccion: "STALLION", unidades: 3465, venta: 120_000_000 },
];
const lines = [
  { coleccion: "IMPERIUM", categoria: "T-SHIRT WOMEN", unidades: 1000, venta: 400_000_000 },
];

const roots: Root[] = [];
async function mount(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(node); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  return container;
}

afterEach(() => {
  roots.splice(0).forEach((root) => act(() => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const ResizeObserverStub = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => { vi.stubGlobal("ResizeObserver", ResizeObserverStub); });

describe("Collection composition sold value", () => {
  it("shows units, percentage and the sold value per collection", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({
      data: name === "reporte_composicion_coleccion" ? rows : lines,
      error: null,
    }));
    const container = await mount(<CollectionCompositionCard days={30} />);
    const text = container.textContent ?? "";
    expect(text).toContain("uds");
    expect(text).toContain("26.3%");
    expect(text).toContain("$489M");
    expect(text).toContain("$120M");
    expect(text).toContain("$609M");
  });

  it("shows the line value inside the expanded collection detail", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({
      data: name === "reporte_composicion_coleccion" ? rows : lines,
      error: null,
    }));
    const container = await mount(<CollectionCompositionCard days={30} />);
    const button = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes("IMPERIUM"));
    expect(button).toBeTruthy();
    await act(async () => { fireEvent.click(button!); });
    expect(container.textContent ?? "").toContain("$400M");
  });

  it("shows whole millions with a thousands separator and never MM", async () => {
    calls.rpc.mockImplementation(async (name: string) => ({
      data: name === "reporte_composicion_coleccion"
        ? [
            { coleccion: "IMPERIUM", unidades: 1234, venta: 1_704_000_000 },
            { coleccion: "STALLION", unidades: 3465, venta: 5_167_000_000 },
          ]
        : [{ coleccion: "IMPERIUM", categoria: "T-SHIRT WOMEN", unidades: 1000, venta: 1_200_000_000 }],
      error: null,
    }));
    const container = await mount(<CollectionCompositionCard days={30} />);
    const text = container.textContent ?? "";
    expect(text).toContain("$1.704M");
    expect(text).toContain("$5.167M");
    expect(text).toContain("$6.871M");
    expect(text).not.toContain("MM");
    const button = Array.from(container.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes("IMPERIUM"));
    await act(async () => { fireEvent.click(button!); });
    expect(container.textContent ?? "").toContain("$1.200M");
    expect(container.textContent ?? "").not.toContain("MM");
  });

  it("keeps the supplied (wholesale) rendering without a money column", async () => {    const container = await mount(
      <CollectionCompositionCard days={0} supplied={{
        title: "Por Colección",
        items: [{ name: "IMPERIUM", value: 1234, pct: 60, detail: "$489M" }],
      }} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("uds totales");
    expect(text).not.toContain("$");
    expect(calls.rpc).not.toHaveBeenCalled();
  });
});
