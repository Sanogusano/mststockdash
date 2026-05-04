/** Formatos colombianos compartidos en módulo Finanzas. */
export const fmtCOP = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return "$ " + Math.round(v).toLocaleString("es-CO");
};

export const fmtInt = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString("es-CO");

export const fmtPct = (n: number | null | undefined, d = 1) =>
  `${(Number(n ?? 0)).toFixed(d)}%`;

export const fmtFecha = (s: string | Date | null | undefined) => {
  if (!s) return "—";
  const d = typeof s === "string" ? new Date(s) : s;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
};

export const monthLabel = (anio: number, mes: number) =>
  new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
