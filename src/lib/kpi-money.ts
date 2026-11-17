/** Compact Colombian pesos for KPI values (not exports or transaction tables). */
export function formatKpiMoney(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

/** Millones enteros con separador de miles, nunca "MM": "$489M", "$1.704M", "$6.871M". */
export function formatMillonesSinDecimales(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${Math.round(abs / 1_000_000).toLocaleString("es-CO")}M`;
  return `${sign}$${Math.round(abs).toLocaleString("es-CO")}`;
}