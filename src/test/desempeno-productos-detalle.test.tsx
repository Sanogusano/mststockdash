import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import DesempenoProductosPage from "@/pages/DesempenoProductos";

type Filter = { col: string; val: unknown };

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  // Each test swaps this in: it receives the eq() filters of a product_catalog query.
  lookup: (async (_filters: Filter[]) => null) as (filters: Filter[]) => Promise<{ product_id: string | null } | null>,
  queries: [] as Filter[],
  opened: [] as { product_id: string; producto: string }[],
  toastError: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: h.rpc, from: h.from },
}));

vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn(), info: vi.fn() } }));

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
vi.mock("@/components/dashboard/ProductDetailDrawer", () => ({
  ProductDetailDrawer: (props: { product: { product_id: string; producto: string } | null }) => {
    if (props.product) h.opened.push({ product_id: props.product.product_id, producto: props.product.producto });
    return null;
  },
}));
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

const row = (over: Partial<{ sku: string; producto: string }>) => ({
  foto: "",
  producto: "PANTALON WOMEN",
  sku: "Varias Tallas",
  categoria: "PANTALON WOMEN",
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
  ...over,
});

function makeBuilder() {
  const filters: Filter[] = [];
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filters.push({ col, val });
      h.queries.push({ col, val });
      return b;
    },
    not: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: await h.lookup(filters), error: null }),
  };
  return b;
}

const roots: Root[] = [];
async function mount(rows: unknown[]) {
  h.rpc.mockImplementation(async (name: string) =>
    name === "categorias_disponibles"
      ? { data: [{ categoria: "PANTALON WOMEN", tiene_venta: true }], error: null }
      : { data: rows, error: null }
  );
  h.from.mockImplementation(() => makeBuilder());
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

async function expandFirstRow(container: HTMLElement) {
  const tr = container.querySelector("tbody tr") as HTMLElement;
  await act(async () => {
    tr.click();
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

function detalleButton(container: HTMLElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(b =>
    (b.textContent ?? "").includes("detalle por tienda") || (b.textContent ?? "").includes("Cargando")
  ) as HTMLButtonElement | undefined;
}

async function clickDetalle(container: HTMLElement) {
  const btn = detalleButton(container);
  await act(async () => {
    btn!.click();
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount()));
  document.body.replaceChildren();
  h.queries.length = 0;
  h.opened.length = 0;
  h.lookup = async () => null;
  vi.clearAllMocks();
});

describe("Desempeño de Productos — Ver detalle por tienda", () => {
  it("finds multi-size products by title when the SKU is the 'Varias Tallas' placeholder", async () => {
    h.lookup = async (filters) =>
      filters.some(f => f.col === "title") ? { product_id: "P-TITLE" } : null;
    const container = await mount([row({ sku: "Varias Tallas" })]);
    await expandFirstRow(container);
    await clickDetalle(container);

    expect(h.queries.some(q => q.col === "sku")).toBe(false);
    expect(h.queries.some(q => q.col === "title" && q.val === "PANTALON WOMEN")).toBe(true);
    expect(h.opened).toEqual([{ product_id: "P-TITLE", producto: "PANTALON WOMEN" }]);
    expect(h.toastError).not.toHaveBeenCalled();
  });

  it("falls back to the title when the SKU exists but is not in the catalog", async () => {
    h.lookup = async (filters) =>
      filters.some(f => f.col === "title") ? { product_id: "P-TITLE" } : null;
    const container = await mount([row({ sku: "SKU-QUE-NO-EXISTE" })]);
    await expandFirstRow(container);
    await clickDetalle(container);

    expect(h.queries.some(q => q.col === "sku" && q.val === "SKU-QUE-NO-EXISTE")).toBe(true);
    expect(h.opened).toEqual([{ product_id: "P-TITLE", producto: "PANTALON WOMEN" }]);
  });

  it("keeps using the SKU lookup for single-size products", async () => {
    h.lookup = async (filters) =>
      filters.some(f => f.col === "sku") ? { product_id: "P-SKU" } : null;
    const container = await mount([row({ sku: "SKU-UNICA" })]);
    await expandFirstRow(container);
    await clickDetalle(container);

    expect(h.opened).toEqual([{ product_id: "P-SKU", producto: "PANTALON WOMEN" }]);
    expect(h.queries.some(q => q.col === "title")).toBe(false);
  });

  it("warns with a toast when the product is in neither lookup", async () => {
    h.lookup = async () => null;
    const container = await mount([row({ sku: "Varias Tallas" })]);
    await expandFirstRow(container);
    await clickDetalle(container);

    expect(h.toastError).toHaveBeenCalledWith("No se encontró el producto en el catálogo");
    expect(h.opened).toEqual([]);
  });

  it("disables the button and shows 'Cargando…' while the catalog is looked up", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    h.lookup = async () => {
      await gate;
      return { product_id: "P-LATE" };
    };
    const container = await mount([row({ sku: "Varias Tallas" })]);
    await expandFirstRow(container);

    const btn = detalleButton(container)!;
    await act(async () => {
      btn.click();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    const loading = detalleButton(container)!;
    expect(loading.textContent).toBe("Cargando…");
    expect(loading.disabled).toBe(true);
    expect(h.opened).toEqual([]);

    await act(async () => {
      release();
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(h.opened).toEqual([{ product_id: "P-LATE", producto: "PANTALON WOMEN" }]);
    expect(detalleButton(container)!.textContent).toBe("Ver detalle por tienda");
    expect(detalleButton(container)!.disabled).toBe(false);
  });
});
