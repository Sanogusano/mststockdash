const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "$4,00MM" / "$657,8M" / "$754.782" */
export function fmtMonto(value: number | null | undefined): string {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}MM`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
  return `${sign}$${Math.round(abs).toLocaleString("es-CO")}`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Diferencia de porcentajes en puntos: "+3,5 pp" / "-1,2 pp" */
export function fmtPp(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`;
}

/** Variación porcentual entre actual y anterior: ((act/ant)-1)*100; null si no hay base */
export function varPct(act: number | null | undefined, ant: number | null | undefined): number | null {
  const a = Number(act), b = Number(ant);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return (a / b - 1) * 100;
}

export function fmtNum(value: number | null | undefined): string {
  return Math.round(Number(value) || 0).toLocaleString("es-CO");
}

export type Semaforo = "verde" | "ambar" | "rojo" | "neutro";
export function semaforoCumplimiento(pct: number | null | undefined): Semaforo {
  if (pct === null || pct === undefined) return "neutro";
  if (pct >= 100) return "verde";
  if (pct >= 90) return "ambar";
  return "rojo";
}

export function tituloNombre(nombre: string): string {
  if (!nombre || nombre.startsWith("(")) return nombre;
  return nombre.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
}

export type Periodo = "mes" | "mes_ant" | "3m" | "anio" | "custom";
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** today = "YYYY-MM-DD" en Bogotá */
export function rangoPeriodo(p: Exclude<Periodo, "custom">, today: string): { desde: string; hasta: string } {
  const [y, m] = today.split("-").map(Number);
  if (p === "mes") return { desde: iso(y, m, 1), hasta: iso(y, m, lastDay(y, m)) };
  if (p === "mes_ant") {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    return { desde: iso(py, pm, 1), hasta: iso(py, pm, lastDay(py, pm)) };
  }
  if (p === "3m") {
    const sm = m - 2, sy = sm <= 0 ? y - 1 : y, smm = sm <= 0 ? sm + 12 : sm;
    return { desde: iso(sy, smm, 1), hasta: iso(y, m, lastDay(y, m)) };
  }
  return { desde: iso(y, 1, 1), hasta: today };
}

export function fmtRango(desde: string, hasta: string): string {
  const f = (s: string) => { const [, mm, dd] = s.split("-").map(Number); return `${dd} ${MESES[mm - 1]}`; };
  const yd = desde.slice(0, 4), yh = hasta.slice(0, 4);
  return yd === yh ? `${f(desde)} – ${f(hasta)}` : `${f(desde)} ${yd} – ${f(hasta)} ${yh}`;
}

export function hoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
