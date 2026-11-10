export type ClienteNetSuiteRespuesta = {
  ok?: boolean;
  error?: unknown;
  cliente?: {
    existe?: boolean;
    cliente_ns_id?: string | number;
    tipo?: string;
    payload?: Record<string, unknown>;
    errores?: unknown;
  };
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
  const payload = respuesta.cliente?.payload ?? {};
  const text = (...values: unknown[]) => {
    const value = values.find((v) => (typeof v === "string" && v.trim()) || typeof v === "number");
    return value === undefined ? "—" : String(value);
  };
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
  const addressbook = object(payload.addressbook);
  const item = object(Array.isArray(addressbook.items) ? addressbook.items[0] : undefined);
  const address = object(item.addressbookaddress ?? payload.address);
  return [
    ["Nombre", text(payload.nombre, payload.razon_social, payload.companyname, [payload.firstname, payload.lastname].filter(Boolean).join(" "), payload.entityid)],
    ["Documento", text(payload.documento, payload.vatregnumber, payload.custentity_co_identification_num)],
    ["Tipo", text(respuesta.cliente?.tipo)],
    ["Email", text(payload.email)],
    ["Teléfono", text(payload.telefono, payload.phone)],
    ["Dirección", text(payload.direccion, address.addr1, payload.defaultaddress)],
    ["Ciudad", text(payload.ciudad, address.city)],
  ];
}