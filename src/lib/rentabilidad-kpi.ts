/** Reglas de presentación de la tarjeta "Rentabilidad" (margen bruto). */

/** Verde desde 55%, ámbar entre 45% y 55%, rojo por debajo de 45%. */
export function margenBrutoColor(margen: number): string {
  const n = Number.isFinite(margen) ? margen : 0;
  if (n >= 55) return "text-emerald-600";
  if (n >= 45) return "text-amber-500";
  return "text-destructive";
}

/** Texto del tooltip de Rentabilidad, con la cobertura de costo ya aplicada. */
export function margenBrutoTooltip(coberturaCostoPct: number): string {
  const n = Number.isFinite(coberturaCostoPct) ? coberturaCostoPct : 0;
  return `Margen bruto sobre venta neta sin IVA. Costo: costo promedio NetSuite. Cobertura de costo: ${n.toFixed(1)}%`;
}
