import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import FacturaElectronicaPage from "@/pages/FacturaElectronica";
import { avisosClienteNetSuite, camposClienteNetSuite, ClienteNetSuiteRespuesta, erroresClienteNetSuite, faltaNombreClienteNetSuite, fuenteDocumentoNetSuite, opcionesDocumentoNetSuite, puedeCrearClienteNetSuite } from "@/lib/netsuite-cliente";

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
    nombre: "Ana Prueba",
    email: "ana@example.test",
    telefono: "3001112233",
    direccion_envio: "Calle 1 #2-3",
    tipo: "persona",
    existe: false,
    payload: {
      firstName: "Ana",
      lastName: "Prueba",
      email: "payload@example.test",
      phone: "555",
      vatregnumber: "456",
      addressBook: { items: [{ addressBookAddress: { addr1: "Dirección del payload", city: "Bogotá", state: "CUN" } }] },
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
  it("lee el nombre de cliente.nombre e ignora el payload", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { nombre: "Ana Prueba", tipo: "empresa", payload: { companyName: "Ignorada", firstName: "Ignorado", lastName: "Nombre" } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Nombre", "Ana Prueba"]);
    expect(faltaNombreClienteNetSuite(respuesta)).toBe(false);
  });
  it("ignora el nombre del payload cuando cliente.nombre no viene", () => {
    expect(camposClienteNetSuite(preview)).toContainEqual(["Nombre", "Ana Prueba"]);
    const sinNombre: ClienteNetSuiteRespuesta = { cliente: { tipo: "persona", payload: { companyName: "Acme S.A.S.", firstName: "Ana", lastName: "Prueba" } } };
    expect(camposClienteNetSuite(sinNombre)).toContainEqual(["Nombre", "Sin nombre", undefined, true]);
    expect(faltaNombreClienteNetSuite(sinNombre)).toBe(true);
  });
  it("trata como vacío un nombre con solo espacios", () => {
    expect(faltaNombreClienteNetSuite({ cliente: { nombre: "   ", payload: {} } })).toBe(true);
    expect(camposClienteNetSuite({ cliente: { nombre: "   ", payload: {} } })).toContainEqual(["Nombre", "Sin nombre", undefined, true]);
  });
  it("no exige nombre en la respuesta de elección", () => {
    expect(faltaNombreClienteNetSuite({ cliente: { requiere_elegir: true, opciones: ["123"] } })).toBe(true);
    expect(faltaNombreClienteNetSuite(null)).toBe(true);
  });
  it("lee email, teléfono y dirección de cliente, no del payload", () => {
    const campos = camposClienteNetSuite(preview);
    expect(campos).toContainEqual(["Email", "ana@example.test"]);
    expect(campos).toContainEqual(["Teléfono", "3001112233"]);
    expect(campos).toContainEqual(["Dirección", "Calle 1 #2-3"]);
    expect(campos.some(([label, value]) => value === "payload@example.test" || value === "555" || value === "Dirección del payload")).toBe(false);
  });
  it("muestra guion cuando email, teléfono o dirección no vienen", () => {
    const campos = camposClienteNetSuite({ cliente: { nombre: "Ana", tipo: "persona", payload: {} } });
    expect(campos).toContainEqual(["Email", "—"]);
    expect(campos).toContainEqual(["Teléfono", "—"]);
    expect(campos).toContainEqual(["Dirección", "—"]);
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
    expect(campos).toContainEqual(["Nombre", "Sin nombre", undefined, true]);
    expect(campos).toContainEqual(["Dirección", "—"]);
    expect(campos).toContainEqual(["Ciudad", "—"]);
    expect(campos).toContainEqual(["Código postal", "—"]);
  });
  it("agrega el código postal de cliente.direccion.zip", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { tipo: "persona", payload: {}, direccion: { zip: "110111" } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Código postal", "110111"]);
  });
  it("anota el código corregido con su original", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { tipo: "persona", payload: {}, direccion: { zip: "110111", zip_corregido: true, zip_original: "110001" } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Código postal", "110111", "(corregido, original: 110001)"]);
  });
  it("dice vacío cuando el código original no viene", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { tipo: "persona", payload: {}, direccion: { zip: "110111", zip_corregido: true, zip_original: "" } } };
    expect(camposClienteNetSuite(respuesta)).toContainEqual(["Código postal", "110111", "(corregido, original: vacío)"]);
  });
});

describe("avisos de la dirección", () => {
  it("devuelve los avisos de cliente.direccion.avisos", () => {
    const respuesta: ClienteNetSuiteRespuesta = { cliente: { payload: {}, direccion: { avisos: ["Dirección incompleta", "ZIP ajustado"] } } };
    expect(avisosClienteNetSuite(respuesta)).toEqual(["Dirección incompleta", "ZIP ajustado"]);
  });
  it("no devuelve avisos cuando no hay dirección o no es lista", () => {
    expect(avisosClienteNetSuite(preview)).toEqual([]);
    expect(avisosClienteNetSuite({ cliente: { payload: {}, direccion: { avisos: "solo texto" } } })).toEqual([]);
    expect(avisosClienteNetSuite(null)).toEqual([]);
  });
  it("convierte avisos de objeto en texto", () => {
    expect(avisosClienteNetSuite({ cliente: { payload: {}, direccion: { avisos: [{ zip: "ajustado" }] } } })).toEqual(["zip: ajustado"]);
  });
});

describe("flujo de creación", () => {
  it("requiere elegir antes de crear y conserva el documento en prueba y real", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { cliente: { requiere_elegir: true, opciones: [{ fuente: "qikify", documento: "123456789" }, { fuente: "empresa", documento: "123456788" }] } }, error: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    const opcion = await screen.findByRole("radio", { name: "Shopify: 123456788" });
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(opcion);
    await screen.findByText("Ana Prueba");
    expect(mocks.invoke).toHaveBeenLastCalledWith("netsuite-crear", { body: { accion: "cliente", pedido: "#1234", modo: "prueba", documento_elegido: "123456788" } });
    mocks.invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenLastCalledWith("netsuite-crear", { body: { accion: "cliente", pedido: "#1234", modo: "real", documento_elegido: "123456788" } }));
  });
  it("no crea si la nueva vista previa del documento elegido falla", async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { cliente: { requiere_elegir: true, opciones: ["123456789"] } }, error: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    mocks.invoke.mockResolvedValueOnce({ data: { error: "Documento inválido" }, error: null });
    fireEvent.click(await screen.findByRole("radio", { name: "123456789" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });
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
  it("no permite confirmar sin nombre y lo marca en rojo", async () => {
    const { nombre: _omitida, ...clienteSinNombre } = preview.cliente!;
    mocks.invoke.mockResolvedValue({ data: { cliente: clienteSinNombre }, error: null });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    const valor = await screen.findByText("Sin nombre");
    expect(valor).toHaveClass("text-destructive");
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenLastCalledWith("netsuite-crear", { body: { accion: "cliente", pedido: "#1234", modo: "prueba" } });
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
  it("muestra el código postal corregido y los avisos de la dirección", async () => {
    mocks.invoke.mockResolvedValue({ data: { cliente: { ...preview.cliente, direccion: { zip: "110111", zip_corregido: true, zip_original: "110001", avisos: ["Dirección incompleta"] } } }, error: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Crear cliente en NetSuite" }));
    await screen.findByText("Código postal");
    expect(await screen.findByText("110111")).toBeInTheDocument();
    expect(await screen.findByText("(corregido, original: 110001)")).toHaveClass("text-amber-700");
    expect(await screen.findByText(/Dirección incompleta/)).toBeInTheDocument();
  });
});

describe("documento y tipo de la vista previa", () => {
  it.each([["qikify", "Qikify"], ["empresa", "Shopify"], [undefined, "—"]])("mapea origen %s", (fuente, label) => {
    expect(fuenteDocumentoNetSuite(fuente)).toBe(label);
  });
  it.each([["persona", "Persona"], ["empresa", "Empresa"]])("mapea tipo %s", (tipo, label) => {
    expect(camposClienteNetSuite({ cliente: { tipo, doc_fuente: "qikify", payload: {} } })).toContainEqual(["Tipo", label]);
    expect(camposClienteNetSuite({ cliente: { tipo, doc_fuente: "qikify", payload: {} } })).toContainEqual(["Origen del documento", "Qikify"]);
  });
  it("acepta respuesta de elección sin payload y conserva sus documentos", () => {
    const respuesta = { cliente: { requiere_elegir: true, opciones: [{ documento: "123", doc_fuente: "qikify" }, "456"] } };
    expect(erroresClienteNetSuite(respuesta)).toBe("");
    expect(opcionesDocumentoNetSuite(respuesta)).toEqual([{ documento: "123", label: "Qikify: 123" }, { documento: "456", label: "456" }]);
    expect(opcionesDocumentoNetSuite(null)).toEqual([]);
  });
});
