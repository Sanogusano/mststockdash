import type { UserPermission } from "@/hooks/useUserPermissions";

export const BF_REFRESH_INTERVAL = 20_000;
export const BF_EVENT_END = "2026-12-01T23:59:59-05:00";
export type LiveOrder = { hora: string; venta: number; canal: string };
export type BfBudgetAmount = { vendido: number; presupuesto: number; falta: number; pct: number };
export type BfBudgetGroup = BfBudgetAmount & { grupo: "Tiendas" | "Ecommerce"; detalle: (BfBudgetAmount & { nombre: string })[] };
export type BfToday = {
  tiendas_venta: number; tiendas_pedidos: number;
  online_venta: number; online_pedidos: number;
  online_ayer_misma_hora: number; online_ayer: number;
  tiendas_ayer: number; dias_restantes: number; ritmo_necesario_dia: number;
  meta_dia?: number; online_pedidos_min?: number; tiendas_pedidos_min?: number;
  ranking_tiendas?: { tienda: string; venta: number; pedidos: number }[];
};

/** Tiendas whose position improved (lower index) vs the previous ranking. */
export function risenStores(prev: string[], next: string[]) {
  const before = new Map(prev.map((t, i) => [t, i]));
  return new Set(next.filter((t, i) => before.has(t) && i < (before.get(t) as number)));
}
export interface BfLiveData {
  ahora: string; evento_inicio: string; evento_fin: string;
  hoy: BfToday;
  presupuesto_bloques: { general: BfBudgetAmount; grupos: BfBudgetGroup[] };
  evento: { pedidos: number; compradores: number; articulos: number; venta_neta: number; ticket_promedio: number; por_canal: { canal: string; venta: number; pedidos: number }[] };
  online_vivo: { pedidos_min_15: number; articulos_min_15: number; venta_ultima_hora: number; pedidos_hoy: number; venta_hoy: number; serie_60min: { min: string; pedidos: number }[]; ultimos_pedidos: LiveOrder[] };
  por_zona: { zona: string; venta: number; pedidos: number }[];
  top_tiendas: { tienda: string; venta: number; pedidos: number }[];
  top_productos: { producto: string; unidades: number; venta: number; imagen: string | null }[];
  top_categorias: { categoria: string; unidades: number; venta: number }[];
  tiendas_actualizadas_hasta: string | null;
}

export function canViewBfLive(permissions: UserPermission[] = [], isAdmin = false) {
  return isAdmin || permissions.some(p => p.granted && p.action_key === "view" && (
    p.module_key === "dashboards.resumen_ejecutivo" || p.module_key === "dashboards.resumen" ||
    p.module_key === "comercial" || p.module_key.startsWith("comercial.")
  ));
}

export function liveMoney(value: number, compact = true) {
  const amount = Number(value) || 0;
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(amount) >= 1_000_000_000 ? 0 : 1 })} M`;
  }
  return `$${Math.round(amount).toLocaleString("es-CO")}`;
}

export function budgetMoney(value: number) {
  return `$${(value / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} M`;
}

export function expectedMonthProgress(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  const days = new Date(Date.UTC(part("year"), part("month"), 0)).getUTCDate();
  return part("day") / days * 100;
}

export function budgetPace(pct: number, expected: number) {
  return pct >= expected ? "success" : pct >= expected - 5 ? "warning" : "destructive";
}

export function countdown(end: string, now: number) {
  const remaining = Math.max(0, Math.floor((Date.parse(end) - now) / 1000)) || 0;
  return [Math.floor(remaining / 86400), Math.floor(remaining / 3600) % 24, Math.floor(remaining / 60) % 60, remaining % 60];
}

export function bogotaTime(value: string | number | null, seconds = false) {
  if (value === null) return "Sin actualización";
  // SQL time-only values already represent the RPC's local hour.
  if (typeof value === "string" && /^\d{2}:\d{2}/.test(value)) return value.slice(0, seconds ? 8 : 5);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false });
}

export function isNewOrder(previous: LiveOrder | undefined, next: LiveOrder | undefined) {
  return Boolean(previous && next && (previous.hora !== next.hora || previous.venta !== next.venta));
}

export function productThumbnail(image: string) {
  try {
    const url = new URL(image);
    url.searchParams.set("width", "200");
    return url.toString();
  } catch { return image; }
}
export const BF_MILESTONE = 100_000_000;
export const BF_MILESTONE_KEY = "bf_ultimo_hito";
export function salesMilestone(total: number) { return Math.max(0, Math.floor((Number(total) || 0) / BF_MILESTONE)); }
/** Decide whether to celebrate: first load (no saved value) stores without celebrating; jumps celebrate once with the highest milestone. */
export function milestoneStep(saved: number | null, total: number): { save: number | null; celebrate: number | null } {
  const current = salesMilestone(total);
  if (saved === null) return { save: current, celebrate: null };
  if (current > saved) return { save: current, celebrate: current };
  return { save: null, celebrate: null };
}
export function milestoneLabel(hito: number) { return `¡$${(hito * 100).toLocaleString("es-CO")} MILLONES!`; }

/** Total sold today across physical stores and online. */
export function todayTotal(hoy: BfToday) {
  return (Number(hoy.tiendas_venta) || 0) + (Number(hoy.online_venta) || 0);
}

/** Percentage of the daily pace goal already reached; a missing goal never divides by zero. */
export function todayPacePct(vendido: number, ritmoNecesarioDia: number) {
  const ritmo = Number(ritmoNecesarioDia) || 0;
  if (ritmo <= 0) return 0;
  return Math.max(0, (Number(vendido) || 0) / ritmo * 100);
}

/** Green only once the day's goal is reached; golden while still below it. */
export function todayPaceTone(pct: number) {
  return pct >= 100 ? "success" : "warning";
}

/** Growth against yesterday at the same hour; null when there is no yesterday reference to compare with. */
export function onlineVsYesterdayPct(onlineVenta: number, onlineAyerMismaHora: number) {
  const base = Number(onlineAyerMismaHora) || 0;
  if (base <= 0) return null;
  return ((Number(onlineVenta) || 0) - base) / base * 100;
}

/** Bogota date for the section title, e.g. "sábado 28 nov". */
export function bogotaDayLabel(now: number) {
  const parts = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "short" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}`;
}
