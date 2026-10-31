/** Compact Colombian pesos for KPI values (not exports or transaction tables). */
export function formatKpiMoney(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}