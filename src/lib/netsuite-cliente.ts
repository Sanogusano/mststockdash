export type ClienteNetSuiteRespuesta = {
  ok?: boolean;
  error?: unknown;
  cliente?: {
    existe?: boolean;
    cliente_ns_id?: string | number;
    nombre_ns?: string;
    tipo?: string;
    doc_fuente?: string;
    requiere_elegir?: boolean;
    opciones?: Array<string | { documento?: string; doc_fuente?: string; fuente?: string; origen?: string; label?: string }>;
    payload?: Record<string, unknown>;
    errores?: unknown;
    direccion?: {
      zip?: string | number | null;
      zip_corregido?: boolean;
      zip_original?: string | number | null;
      avisos?: unknown;
    };
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
  if (respuesta.cliente.requiere_elegir) return "";
  if (!respuesta.cliente.existe && !respuesta.cliente.payload) return "La respuesta no contiene los datos del cliente";
  return "";
}

export type CampoClienteNetSuite = [string, string, string?];

export function fuenteDocumentoNetSuite(fuente: string | null | undefined): string {
  return fuente === "qikify" ? "Qikify" : fuente === "empresa" ? "Shopify" : fuente || "—";
}

export function opcionesDocumentoNetSuite(respuesta: ClienteNetSuiteRespuesta | null) {
  return (respuesta?.cliente?.opciones ?? []).flatMap((opcion) => {
    const documento = typeof opcion === "string" ? opcion : opcion?.documento;
    if (!documento) return [];
    const fuente = typeof opcion === "string" ? undefined : opcion?.doc_fuente ?? opcion?.fuente ?? opcion?.origen;
    const label = typeof opcion === "string" ? documento : opcion?.label ?? `${fuenteDocumentoNetSuite(fuente)}: ${documento}`;
    return [{ documento, label }];
  });
}

export function camposClienteNetSuite(respuesta: ClienteNetSuiteRespuesta): CampoClienteNetSuite[] {
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
  const zipOriginal = text(cliente?.direccion?.zip_original);
  const avisoZip = cliente?.direccion?.zip_corregido
    ? `(corregido, original: ${zipOriginal === "—" ? "vacío" : zipOriginal})`
    : undefined;
  const campoZip: CampoClienteNetSuite = avisoZip
    ? ["Código postal", text(cliente?.direccion?.zip), avisoZip]
    : ["Código postal", text(cliente?.direccion?.zip)];
  return [
    ["Nombre", text(nombre, payload.nombre, payload.razon_social, payload.entityid)],
    ["Documento", text(payload.documento, payload.vatregnumber, payload.custentity_co_identification_num)],
    ["Tipo", cliente?.tipo === "persona" ? "Persona" : cliente?.tipo === "empresa" ? "Empresa" : text(cliente?.tipo)],
    ["Origen del documento", fuenteDocumentoNetSuite(cliente?.doc_fuente)],
    ["Email", text(payload.email)],
    ["Teléfono", text(payload.telefono, payload.phone)],
    ["Dirección", text(address?.addr1, payload.direccion, payload.defaultaddress)],
    ["Ciudad", text(ciudad, payload.ciudad)],
    campoZip,
  ];
}

export function avisosClienteNetSuite(respuesta: ClienteNetSuiteRespuesta | null): string[] {
  const avisos = respuesta?.cliente?.direccion?.avisos;
  if (!Array.isArray(avisos)) return [];
  return avisos.map(textoError).filter(Boolean);
}