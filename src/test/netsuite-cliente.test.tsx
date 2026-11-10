import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FacturaElectronicaPage from "@/pages/FacturaElectronica";
import { camposClienteNetSuite, ClienteNetSuiteRespuesta, erroresClienteNetSuite, puedeCrearClienteNetSuite } from "@/lib/netsuite-cliente";

const mocks = vi.hoisted(() => ({ role: "admin", invoke: vi.fn(), read: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ role: mocks.role, isAdmin: mocks.role === "admin" }) }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: () => null }));
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: ({ children }: { children: React.ReactNode }) => children, SidebarTrigger: () => null }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ range: mocks.read }) }),
} }));

const fila = { shopify_order_id: "1", pedido: "#1234", estado: "pendiente", razon_social: "Cliente original", documento: "123", documento_direccion: "123" };
const preview: ClienteNetSuiteRespuesta = {
  cliente: {
    tipo: "persona",
    existe: false,
    payload: {
      firstName: "Ana",
      lastName: "Prueba",
      email: "ana@example.test",
      phone: "555",
      vatregnumber: "456",
      addressBook: { items: [{ addressBookAddress: { addr1: "Calle 1 #2-3", city: "Bogotá", state: "CUN" } }] },
    },
  },
};
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FacturaElectronicaPage /></QueryClientProvider>);

beforeEach(() => {
  cleanup(); vi.clearAllMocks(); mocks.role = "admin";
  mocks.read.mockResolvedValue({ data: [fila], error: null });
  mocks.invoke.mockResolvedValue({ data: preview, error: null });
});

describe("roles autorizados para crear cliente", () => {
  it.each(["admin", "finanzas", "logistica"])("autoriza %s", (role) => expect(puedeCrearClienteNetSuite(role)).toBe(true));
  it.each(["gerencia", "viewer", "", undefined])("no autoriza %s", (role) => expect(puedeCrearClienteNetSuite(role)).toBe(false));
});

describe("validación de la respuesta", () => {
  it("bloquea errores de función", () => expect(erroresClienteNetSuite({ error: "Documento inválido" })).toBe("Documento inválido"));
  it("bloquea errores del cliente", () => expect(erroresClienteNetSuite({ cliente: { ...preview.cliente, errores: ["Falta email"] } })).toBe("Falta email"));
  it("acepta cliente existente sin payload", () => expect(erroresClienteNetSuite({ cliente: { existe: true, cliente_ns_id: 42 } })).toBe(""));
  it("mapea los datos del payload, no de la fila", () => expect(camposClienteNetSuite(preview)).toContainEqual(["Documento", "456"]));
});

describe("mapeo de los datos del cliente NetSuite", () => {
  it("usa companyName cuando el tipo es empresa", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { tipo: "empresa", payload: { companyName: "Acme S.A.S.", firstName: "Ignorado", lastName: "Nombre" } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Nombre", "Acme S.A.S."]);
  });
  it("une firstName y lastName cuando el tipo es persona", () => {
    expect(camposClienteNetSuite(preview)).toContainEqual(["Nombre", "Ana Prueba"]);
  });
  it("toma la dirección del primer ítem del addressBook", () => {
    expect(camposClienteNetSuite(preview)).toContainEqual(["Dirección", "Calle 1 #2-3"]);
  });
  it("muestra ciudad y estado separados por /", () => {
    expect(camposClienteNetSuite(preview)).toContainEqual(["Ciudad", "Bogotá / CUN"]);
  });
  it("muestra solo la ciudad si no viene el estado", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { tipo: "persona", payload: { addressBook: { items: [{ addressBookAddress: { city: "Medellín" } }] } } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Ciudad", "Medellín"]);
  });
  it("no falla si el payload viene vacío", () => {
    const campos = camposClienteNetSuite({ cliente: { tipo: "empresa", existe: false, payload: {} } });
    expect(campos).toContainEqual(["Nombre", "—"]);
    expect(campos).toContainEqual(["Dirección", "—"]);
    expect(campos).toContainEqual(["Ciudad", "—"]);
  });
});

describe("flujo de creación", () => {
  it("consulta en prueba y solo crea en real al confirmar; recarga la lista", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    await screen.findByText("Ana Prueba");
    await screen.findByText("Calle 1 #2-3");
    await screen.findByText("Bogotá / CUN");
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("netsuite-crear", { body: { accion: "cliente", pedido: "#1234", modo: "prueba" } });
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    mocks.read.mockResolvedValue({ data: [{ ...fila, estado: "cliente_creado" }], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenLastCalledWith("netsuite-crear", { body: { accion: "cliente", pedido: "#1234", modo: "real" } }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Cliente creado y pedido etiquetado REGISTRADO"));
    await waitFor(() => expect(screen.queryByText("Cliente original")).not.toBeInTheDocument());
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it("no permite confirmar cuando hay errores del cliente", async () => {
    mocks.invoke.mockResolvedValue({ data: { cliente: { ...preview.cliente, errores: ["Falta documento"] } }, error: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("permite marcar el cliente existente como registrado", async () => {
    mocks.invoke.mockResolvedValue({ data: { cliente: { ...preview.cliente, existe: true, cliente_ns_id: 42, nombre_ns: "Ana Prueba" } }, error: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    await screen.findByText(/Ya existe en NetSuite: Ana Prueba/);
    expect(screen.getByRole("button", { name: "Marcar como registrado" })).toBeEnabled();
  });
  it("muestra el error de la creación real", async () => {
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    await screen.findByText("Ana Prueba");
    mocks.invoke.mockResolvedValueOnce({ data: { error: "NetSuite no disponible" }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("NetSuite no disponible"));
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("logística puede ver la acción sin recibir los otros permisos de edición", async () => {
    mocks.role = "logistica"; mount();
    expect(await screen.findByRole("button", { name: "Crear cliente en NetSuite" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Marcar facturado" })).not.toBeInTheDocument();
  });
  it("oculta la acción a gerencia", async () => {
    mocks.role = "gerencia"; mount(); await screen.findByText("Cliente original");
    expect(screen.queryByRole("button", { name: "Crear cliente en NetSuite" })).not.toBeInTheDocument();
  });
});
