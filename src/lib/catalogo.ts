export type CatalogoTalla = {
  sku: string;
  talla: string;
  disponible: number;
  ultimas: boolean;
  tiendas?: number | null;
  outlets?: number | null;
  reservas?: number | null;
};

export type CatalogoProducto = {
  product_id: string | number;
  nombre: string;
  titulo?: string | null;
  color?: string | null;
  color_hex?: string | null;
  imagen?: string | null;
  precio: number;
  precio_antes?: number | null;
  pct_descuento?: number | null;
  categoria?: string | null;
  subcategoria?: string | null;
  coleccion?: string | null;
  genero?: string | null;
  disponible_total: number;
  vendidas_14d?: number | null;
  alerta?: "ULTIMAS UNIDADES" | "AGOTADO" | null;
  tallas: CatalogoTalla[];
};

export const formatCOP = (n: number | null | undefined) =>
  "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");

export const tallasConStock = (p: CatalogoProducto) =>
  (p.tallas ?? []).filter((t) => Number(t.disponible) > 0);

export const tieneUltimas = (p: CatalogoProducto) =>
  p.alerta === "ULTIMAS UNIDADES" || (p.tallas ?? []).some((t) => t.ultimas && Number(t.disponible) > 0);

/** Texto para WhatsApp; omite líneas que no aplican. */
export function textoWhatsApp(p: CatalogoProducto): string {
  const lines: string[] = [];
  lines.push(`*${p.nombre}*${p.color ? ` – ${p.color}` : ""}`);
  const pct = Math.round(Number(p.pct_descuento) || 0);
  let precio = `💰 ${formatCOP(p.precio)}`;
  if (p.precio_antes && Number(p.precio_antes) > Number(p.precio)) {
    precio += ` (antes ${formatCOP(p.precio_antes)}${pct > 0 ? `, -${pct}%` : ""})`;
  }
  lines.push(precio);
  const tallas = tallasConStock(p).map((t) => t.talla);
  if (tallas.length) lines.push(`📏 Tallas: ${tallas.join(", ")}`);
  if (tieneUltimas(p)) lines.push("⚠️ ¡Últimas unidades!");
  return lines.join("\n");
}

export const nombreArchivo = (p: CatalogoProducto) =>
  `${[p.nombre, p.color].filter(Boolean).join("-")}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() + ".jpg";

export function minutosDesde(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}
