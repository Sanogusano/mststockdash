import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesempenoProductosPage from "@/pages/DesempenoProductos";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  pdf: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc, from: h.from },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

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
vi.mock("@/lib/desempeno-pdf-export", () => ({ exportDesempenoPDF: h.pdf }));
vi.mock("@/lib/csv-export", () => ({ exportToCSV: vi.fn() }));

const row = (over: Record<string, unknown>) => ({
  foto: "",
  sku: "Varias Tallas",
  categoria: "T-SHIRT MEN",
  und_tiendas: 109,
  und_outlets: 5,
  und_digital: 4,
  und_total: 118,
  pct_full_price: 73.7,
  pct_rebajas: 2.5,
  pct_descuento: 23.7,
  clasificacion: "Ganador Full Price",
  coleccion: "INVICTUS",
  stock_venta_directa: 740,
  stock_tiendas: 195,
  stock_online: 51,
  stock_standby: 491,
  stock_mayoristas: 3,
  semanas_vida: 3,
  primera_venta: "2026-10-23",
  ...over,
});

const ARMINIA = row({ producto: "ARMINIA T-SHIRT MEN BLACK", venta_neta: 45145249 });
const SALIX = row({ producto: "SALIX HOODIE MEN BLACK", venta_neta: 29701450, categoria: "HOODIE MEN" });

const roots: Root[] = [];
async function mount(rows: unknown[]) {
  h.rpc.mockImplementation(async (name: string) =>
    name === "categorias_disponibles"
      ? { data: [{ categoria: "T-SHIRT MEN", tiene_venta: true }], error: null }
      : { data: rows, error: null }
  );
  h.from.mockImplementation(() => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      not: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
    };
    return b;
  });
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

function pdfButton(container: HTMLElement): HTMLButtonElement {
  return [...container.querySelectorAll("button")].find(b =>
    (b.textContent ?? "").includes("PDF")
  ) as HTMLButtonElement;
}

async function clickPdf(container: HTMLElement) {
  await act(async () => {
    pdfButton(container).click();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

const pdfParams = () => h.pdf.mock.calls[0][0] as {
  rows: { producto: string; venta_neta: number | null }[];
  kpis: { unidades: number; referencias: number; venta_neta: number };
};

afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("Desempeño de Productos — venta neta", () => {
  it("passes each row's venta_neta to the PDF exporter and sums it in the KPIs", async () => {
    const container = await mount([ARMINIA, SALIX]);
    await clickPdf(container);

    expect(h.pdf).toHaveBeenCalledTimes(1);
    const p = pdfParams();
    expect(p.rows.map(r => r.venta_neta)).toEqual([45145249, 29701450]);
    expect(p.kpis.venta_neta).toBe(74846699);
    expect(p.kpis.referencias).toBe(2);
  });

  it("shows the filtered net sales total on the units card", async () => {
    const container = await mount([ARMINIA, SALIX]);
    expect(container.textContent).toContain("$74,8M");
  });

  it("keeps venta_neta when the universe is narrowed by the search box", async () => {
    const container = await mount([ARMINIA, SALIX]);
    const input = container.querySelector('input[placeholder="Producto o categoría..."]') as HTMLInputElement;
    const nativeValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    await act(async () => {
      nativeValue?.call(input, "ARMINIA");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    await clickPdf(container);

    const p = pdfParams();
    expect(p.rows.map(r => r.venta_neta)).toEqual([45145249]);
    expect(p.kpis.venta_neta).toBe(45145249);
  });
});
