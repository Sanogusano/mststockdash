import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FacturaElectronicaPage from "@/pages/FacturaElectronica";
import { filtrarFacturas, ORIGEN_LABEL, origenTexto } from "@/lib/factura-electronica";

const mocks = vi.hoisted(() => ({ role: "admin", invoke: vi.fn(), read: vi.fn() }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ role: mocks.role, isAdmin: mocks.role === "admin" }) }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => children, SidebarTrigger: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ range: mocks.read }) }),
} }));

const fila = (id: string, estado: string, origen: string | null, extra: Record<string, unknown> = {}) => ({
  shopify_order_id: id,
  pedido: `#${id}`,
  estado,
  origen,
  razon_social: `Cliente ${id}`,
  documento: "123",
  documento_direccion: "123",
  email: null,
  telefono: null,
  direccion: null,
  departamento: null,
  ciudad: null,
  registrado: false,
  capturado_en: null,
  factura_tranid: null,
  factura_cliente: null,
  ...extra,
});

const filas = [
  fila("P1", "pendiente", "etiqueta"),
  fila("M1", "facturado_mostrador", "etiqueta", { capturado_en: "2026-11-01T10:00:00Z", factura_tranid: "FAC-1", factura_cliente: "CLI-1" }),
  fila("M2", "facturado_mostrador", "auto_registrado", { capturado_en: "2026-11-02T10:00:00Z", factura_tranid: "FAC-2", factura_cliente: "CLI-2" }),
];

const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FacturaElectronicaPage /></QueryClientProvider>);
const abrirMostrador = async () => {
  fireEvent.click(screen.getByText("Facturado a Cliente Mostrador"));
  await waitFor(() => expect(screen.queryByText("#M1")).not.toBeNull());
};

beforeAll(() => {
  // jsdom no implementa scrollIntoView y Radix lo llama al montar el contenido del Select.
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.read.mockResolvedValue({ data: filas, error: null });
  mocks.invoke.mockResolvedValue({ data: {}, error: null });
});

describe("etiqueta de origen", () => {
  it("traduce los dos orígenes conocidos", () => {
    expect(origenTexto("etiqueta")).toBe("Pidió factura");
    expect(origenTexto("auto_registrado")).toBe("Auto registrado");
  });
  it("muestra — cuando el origen viene vacío", () => expect(origenTexto(null)).toBe("—"));
  it("mantiene un origen desconocido tal cual", () => expect(origenTexto("otro")).toBe("otro"));
  it("las etiquetas del filtro coinciden con las del helper", () => {
    expect(ORIGEN_LABEL.etiqueta).toBe("Pidió factura");
    expect(ORIGEN_LABEL.auto_registrado).toBe("Auto registrado");
  });
});

describe("filtrarFacturas", () => {
  it("encuentra el documento de facturación sin depender del documento original", () => {
    const rows = [fila("D1", "pendiente", "etiqueta", { doc_factura: "987654321", documento: "111", documento_direccion: "222" })];
    expect(filtrarFacturas(rows, "pendiente", null, "987654321").map((r) => r.pedido)).toEqual(["#D1"]);
  });
  const base = [
    { estado: "pendiente", origen: "etiqueta", pedido: "#P1", razon_social: "Uno", documento: "123", documento_direccion: "123" },
    { estado: "facturado_mostrador", origen: "etiqueta", pedido: "#M1", razon_social: "Dos", documento: "123", documento_direccion: "123" },
    { estado: "facturado_mostrador", origen: "auto_registrado", pedido: "#M2", razon_social: "Tres", documento: "999", documento_direccion: "999" },
    { estado: "facturado_mostrador", origen: null, pedido: "#M3", razon_social: "Cuatro", documento: null, documento_direccion: null },
  ];

  it("muestra solo los que pidieron factura cuando el filtro es etiqueta", () => {
    expect(filtrarFacturas(base, "facturado_mostrador", "etiqueta", "").map((r) => r.pedido)).toEqual(["#M1"]);
  });
  it("muestra solo los auto registrados cuando el filtro es auto_registrado", () => {
    expect(filtrarFacturas(base, "facturado_mostrador", "auto_registrado", "").map((r) => r.pedido)).toEqual(["#M2"]);
  });
  it("sin filtro de origen deja todos los del estado, incluso sin origen", () => {
    expect(filtrarFacturas(base, "facturado_mostrador", null, "").map((r) => r.pedido)).toEqual(["#M1", "#M2", "#M3"]);
  });
  it("no mezcla estados", () => {
    expect(filtrarFacturas(base, "pendiente", null, "").map((r) => r.pedido)).toEqual(["#P1"]);
  });
  it("la búsqueda casa pedido, razón social y documento", () => {
    expect(filtrarFacturas(base, "facturado_mostrador", null, "dos").map((r) => r.pedido)).toEqual(["#M1"]);
    expect(filtrarFacturas(base, "facturado_mostrador", null, "999").map((r) => r.pedido)).toEqual(["#M2"]);
  });
});

describe("documentos de las cuatro pestañas", () => {
  it.each([
    ["pendiente", "Pendientes"],
    ["cliente_creado", "Cliente creado"],
    ["facturado", "Facturados"],
    ["facturado_mostrador", "Facturado a Cliente Mostrador"],
  ])("usa doc_factura y documento_direccion en %s", async (estado, tarjeta) => {
    mocks.read.mockResolvedValue({ data: [fila("DOC", estado, "etiqueta", { documento: "111000", doc_factura: "900123456", doc_fuente: "qikify", documento_direccion: "800654321", doc_casi_igual: true })], error: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(`^${tarjeta}`) }));
    const row = (await screen.findByText("#DOC")).closest("tr");
    if (!row) throw new Error("No se encontró el pedido");
    expect(within(row).getByText("900123456")).toBeInTheDocument();
    expect(within(row).getByText("800654321")).toBeInTheDocument();
    expect(within(row).queryByText("111000")).not.toBeInTheDocument();
  });
});

describe("tarjeta Facturado a Cliente Mostrador", () => {
  it("muestra el total y, en pequeño, cuántos pidieron factura", async () => {
    mount();
    await waitFor(() => expect(screen.queryByText("Facturado a Cliente Mostrador")).not.toBeNull());
    const tarjeta = screen.getByText("Facturado a Cliente Mostrador").closest("button") as HTMLElement;
    expect(tarjeta.textContent).toContain("2");
    expect(tarjeta.textContent).toContain("1 pidió factura");
  });
});

describe("pestaña Facturado a Cliente Mostrador", () => {
  it("al abrir solo muestra los que pidieron factura, con sus facturas", async () => {
    mount();
    await waitFor(() => expect(screen.queryByText("Facturado a Cliente Mostrador")).not.toBeNull());
    // Pestaña inicial: sigue mostrando los pendientes, sin filtro de origen.
    expect(screen.queryByText("#P1")).not.toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();

    await abrirMostrador();
    expect(screen.queryByText("#M1")).not.toBeNull();
    expect(screen.queryByText("#M2")).toBeNull();
    expect(screen.queryByText("FAC-1")).not.toBeNull();
    expect(screen.queryByText("CLI-1")).not.toBeNull();
    expect((screen.getByRole("combobox") as HTMLElement).textContent).toContain("Pidió factura");
  });

  it("al cambiar el filtro a Auto registrado solo muestra esos registros", async () => {
    mount();
    await waitFor(() => expect(screen.queryByText("Facturado a Cliente Mostrador")).not.toBeNull());
    await abrirMostrador();

    const combo = screen.getByRole("combobox");
    fireEvent.keyDown(combo, { key: "Enter" });
    const opcion = await screen.findByRole("option", { name: "Auto registrado" });
    fireEvent.click(opcion);

    await waitFor(() => expect(screen.queryByText("#M2")).not.toBeNull());
    expect(screen.queryByText("#M1")).toBeNull();
    expect(screen.queryByText("FAC-2")).not.toBeNull();
    expect(screen.queryByText("CLI-2")).not.toBeNull();
  });
});
