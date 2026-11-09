import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesempenoProductosPage from "@/pages/DesempenoProductos";

const calls = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: calls.rpc, from: vi.fn() },
}));

// Render the shadcn Select as a plain <select> so every option is always in the DOM.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <select>{children}</select>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SidebarTrigger: () => null,
}));
vi.mock("@/components/dashboard/TimeFilter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/dashboard/TimeFilter")>();
  return { ...actual, TimeFilter: () => null };
});
vi.mock("@/components/dashboard/LoadingState", () => ({ LoadingState: () => null, EmptyState: () => null }));
vi.mock("@/components/dashboard/ProductDetailDrawer", () => ({ ProductDetailDrawer: () => null }));
vi.mock("@/components/dashboard/ProductSkuBreakdown", () => ({ ProductSkuBreakdown: () => null }));
vi.mock("@/components/dashboard/CollectionBadge", () => ({ CollectionBadge: () => null }));
vi.mock("@/components/dashboard/ProductImageThumb", () => ({ ProductImageThumb: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/desempeno-pdf-export", () => ({ exportDesempenoPDF: vi.fn() }));
vi.mock("@/lib/csv-export", () => ({ exportToCSV: vi.fn() }));

const loadedRow = (categoria: string) => ({
  foto: "",
  producto: `Producto ${categoria}`,
  sku: `SKU-${categoria}`,
  categoria,
  und_tiendas: 10,
  und_outlets: 0,
  und_digital: 0,
  und_total: 10,
  pct_full_price: 100,
  pct_rebajas: 0,
  pct_descuento: 0,
  clasificacion: "Venta Full",
  coleccion: "OTROS",
  stock_venta_directa: 5,
  stock_tiendas: 5,
  stock_online: 0,
  stock_standby: 0,
  stock_mayoristas: 0,
  semanas_vida: 10,
  primera_venta: "2026-08-01",
});

// Only CAP made it into the loaded ranking; T-SHIRT WOMEN exists in the catalog but not in the Top N.
const loaded = [loadedRow("CAP")];
const catalog = [{ categoria: "CAP" }, { categoria: "POLO MEN" }, { categoria: "T-SHIRT WOMEN" }];

const roots: Root[] = [];
async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/desempeno-productos"]}>
        <DesempenoProductosPage />
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
  return container;
}

function categoryOptions(container: HTMLElement): string[] {
  const select = [...container.querySelectorAll("select")].find(s =>
    [...s.querySelectorAll("option")].some(o => o.textContent === "Todas las categorías")
  );
  return [...(select?.querySelectorAll("option") ?? [])].map(o => o.textContent ?? "");
}

const catalogCalls = () => calls.rpc.mock.calls.filter(c => c[0] === "categorias_disponibles").length;

afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Desempeño de Productos — category filter list", () => {
  it("fills the filter from the catalog, so lines outside the Top N are selectable", async () => {
    calls.rpc.mockImplementation(async (name: string) =>
      name === "categorias_disponibles" ? { data: catalog, error: null } : { data: loaded, error: null }
    );
    const container = await mount();

    expect(calls.rpc).toHaveBeenCalledWith("categorias_disponibles", { p_dias: 90 });
    const options = categoryOptions(container);
    expect(options).toContain("Todas las categorías");
    expect(options).toContain("T-SHIRT WOMEN");
    expect(options).toContain("POLO MEN");
    expect(options).toContain("CAP");
  });

  it("loads the catalog once on open, not on every filter change", async () => {
    calls.rpc.mockImplementation(async (name: string) =>
      name === "categorias_disponibles" ? { data: catalog, error: null } : { data: loaded, error: null }
    );
    await mount();
    expect(catalogCalls()).toBe(1);
  });

  it("falls back to the loaded categories if the catalog call fails", async () => {
    calls.rpc.mockImplementation(async (name: string) =>
      name === "categorias_disponibles"
        ? { data: null, error: new Error("Catalog unavailable") }
        : { data: loaded, error: null }
    );
    const container = await mount();

    const options = categoryOptions(container);
    expect(options).toEqual(["Todas las categorías", "CAP"]);
  });
});
