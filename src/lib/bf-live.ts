import type { UserPermission } from "@/hooks/useUserPermissions";

export const BF_REFRESH_INTERVAL = 20_000;
export const BF_EVENT_END = "2026-12-01T23:59:59-05:00";
export type LiveOrder = { hora: string; venta: number; canal: string };
export interface BfLiveData {
  ahora: string; evento_inicio: string; evento_fin: string;
  presupuesto_mes: { presupuesto: number; vendido: number; falta: number; pct: number; online_presupuesto: number; online_vendido: number; online_falta: number };
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