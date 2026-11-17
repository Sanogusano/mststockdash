/**
 * Venta neta compacta para tablas, tarjetas y PDF:
 * "$45,1M" (millones con una decimal), "$2.081M" (miles de millones), "$850k" (< 1M).
 * Nunca usa "MM".
 */
export function fmtVentaNeta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${Math.round(abs / 1e6).toLocaleString("es-CO")}M`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
}
