/** Reglas de presentación de la tarjeta "Rentabilidad" (margen bruto). */

/** Verde desde 55%, ámbar entre 45% y 55%, rojo por debajo de 45%. */
export function margenBrutoColor(margen: number): string {
  const n = Number.isFinite(margen) ? margen : 0;
  if (n >= 55) return "text-emerald-600";
  if (n >= 45) return "text-amber-500";
  return "text-destructive";
}

/** Texto del tooltip de Margen bruto, con la cobertura de costo ya aplicada. */
export function margenBrutoTooltip(coberturaCostoPct: number): string {
  const n = Number.isFinite(coberturaCostoPct) ? coberturaCostoPct : 0;
  return `Margen bruto = (venta neta sin IVA \u2212 costo) / venta neta. Costo: costo promedio actual de NetSuite. No incluye devoluciones parciales, env\u00edos, comisiones de marketplace ni pasarela. Cobertura de costo: ${n.toFixed(1)}%`;
}
