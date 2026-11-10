export type Alerta = "sin_documento" | "distintos" | "ok";

export const soloDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/** Rojo: sin documento. Naranja: ambos existen y difieren. Verde: iguales o solo documento. */
export function calcularAlerta(documento: string | null | undefined, documentoDireccion: string | null | undefined): Alerta {
  const d = soloDigitos(documento);
  const dd = soloDigitos(documentoDireccion);
  if (!d) return "sin_documento";
  if (dd && d !== dd) return "distintos";
  return "ok";
}

export const ALERTA_ORDEN: Record<Alerta, number> = { sin_documento: 0, distintos: 1, ok: 2 };export const ALERTA_LABEL: Record<Alerta, string> = {
  sin_documento: "🔴 Sin documento",
  distintos: "🟠 Documentos distintos",
  ok: "🟢 OK",
};

export function ordenarPorAlerta<T extends { alerta: Alerta; capturado_en: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const o = ALERTA_ORDEN[a.alerta] - ALERTA_ORDEN[b.alerta];
    if (o !== 0) return o;
    return (a.capturado_en ?? "").localeCompare(b.capturado_en ?? "");
  });
}

/** Origen del registro de cliente mostrador: lo pidió el cliente o se registró solo. */
export type Origen = "etiqueta" | "auto_registrado";

export const ORIGEN_LABEL: Record<Origen, string> = {
  etiqueta: "Pidió factura",
  auto_registrado: "Auto registrado",
};

/** Etiqueta legible del origen; devuelve el valor tal cual si no es conocido y "—" si viene vacío. */
export function origenTexto(v: string | null | undefined): string {
  if (v === "etiqueta" || v === "auto_registrado") return ORIGEN_LABEL[v];
  return v ?? "—";
}

export type FilaFactura = {
  estado: string;
  origen: string | null;
  pedido: string | null;
  razon_social: string | null;
  documento: string | null;
  doc_factura?: string | null;
  documento_direccion: string | null;
};

/**
 * Filas de una pestaña: primero por estado y, cuando se indica, por origen.
 * La búsqueda libre casa pedido, razón social o documento (solo dígitos).
 */
export function filtrarFacturas<T extends FilaFactura>(
  rows: T[],
  estado: string,
  origen: Origen | null,
  q: string,
): T[] {
  const t = q.trim().toLowerCase();
  const td = t.replace(/\D/g, "");
  return rows.filter((r) => {
    if (r.estado !== estado) return false;
    if (origen && (r.origen ?? "") !== origen) return false;
    if (!t) return true;
    return (
      (r.pedido ?? "").toLowerCase().includes(t) ||
      (r.razon_social ?? "").toLowerCase().includes(t) ||
      (!!td && (soloDigitos(r.documento).includes(td) || soloDigitos(r.doc_factura).includes(td) || soloDigitos(r.documento_direccion).includes(td)))
    );
  });
}
