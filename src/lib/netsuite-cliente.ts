export type ClienteNetSuiteRespuesta = {
  ok?: boolean;
  error?: unknown;
  cliente?: {
    existe?: boolean;
    cliente_ns_id?: string | number;
    nombre_ns?: string;
    tipo?: string;
    payload?: Record<string, unknown>;
    errores?: unknown;
  };
};

type DireccionNetSuite = { addr1?: string | null; city?: string | null; state?: string | null };
type LibroNetSuite = {
  items?: Array<{ addressBookAddress?: DireccionNetSuite | null; addressbookaddress?: DireccionNetSuite | null } | null> | null;
};

export function puedeCrearClienteNetSuite(role: string | null | undefined) {
  return role === "admin" || role === "finanzas" || role === "logistica";
}

function textoError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textoError).filter(Boolean).join(" · ");
  if (typeof value === "object") return Object.entries(value).map(([key, message]) => `${key}: ${textoError(message)}`).join(" · ");
  return String(value);
}

export function erroresClienteNetSuite(respuesta: ClienteNetSuiteRespuesta | null): string {
  if (!respuesta) return "La función no devolvió una respuesta";
  const errores = [textoError(respuesta.error), textoError(respuesta.cliente?.errores)].filter(Boolean);
  if (errores.length) return errores.join(" · ");
  if (!respuesta.cliente) return "La respuesta no contiene los datos del cliente";
  if (!respuesta.cliente.existe && !respuesta.cliente.payload) return "La respuesta no contiene los datos del cliente";
  return "";
}

export function camposClienteNetSuite(respuesta: ClienteNetSuiteRespuesta) {
  const cliente = respuesta.cliente;
  const payload = cliente?.payload ?? {};
  const text = (...values: unknown[]) => {
    const value = values.find((v) => (typeof v === "string" && v.trim()) || typeof v === "number");
    return value === undefined ? "—" : String(value);
  };
  const nombrePersona = [payload.firstName, payload.lastName].filter(Boolean).join(" ");
  const nombre =
    cliente?.tipo === "empresa" ? payload.companyName
    : cliente?.tipo === "persona" ? nombrePersona
    : (payload.companyName ?? nombrePersona);
  const libro = (payload.addressBook ?? payload.addressbook) as LibroNetSuite | undefined;
  const address = libro?.items?.[0]?.addressBookAddress ?? libro?.items?.[0]?.addressbookaddress;
  const ciudad = address?.city ? [address.city, address.state].filter(Boolean).join(" / ") : "";
  return [
    ["Nombre", text(nombre, payload.nombre, payload.razon_social, payload.entityid)],
    ["Documento", text(payload.documento, payload.vatregnumber, payload.custentity_co_identification_num)],
    ["Tipo", text(cliente?.tipo)],
    ["Email", text(payload.email)],
    ["Teléfono", text(payload.telefono, payload.phone)],
    ["Dirección", text(address?.addr1, payload.direccion, payload.defaultaddress)],
    ["Ciudad", text(ciudad, payload.ciudad)],
  ];
}