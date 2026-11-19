export type LocInfo = { name: string | null; ciudad: string | null; zona: string | null };

/** Tienda/ciudad/zona de una liquidación; si no cruza con locations, muestra el location_id. */
export function tiendaInfo(locInfo: Map<string, LocInfo>, locationId: string | null | undefined) {
  const id = locationId ?? "";
  const l = locInfo.get(id);
  return { tienda: l?.name || id || "—", ciudad: l?.ciudad ?? "", zona: l?.zona ?? "" };
}

/** Orden de descarga: Tienda y luego Vendedor. No suma ni deduplica. */
export function ordenarPorTiendaVendedor<T extends { tienda: string; nombre: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.tienda.localeCompare(b.tienda, "es") || a.nombre.localeCompare(b.nombre, "es"));
}
