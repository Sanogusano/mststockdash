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

export const ALERTA_ORDEN: Record<Alerta, number> = { sin_documento: 0, distintos: 1, ok: 2 };
export const ALERTA_LABEL: Record<Alerta, string> = {
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
