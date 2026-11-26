export type TiendaStock = { location_id: string | number; tienda: string; ciudad: string | null; ns_location_id: string | number | null; unidades: number };
export type TallaTiendas = { sku: string; talla: string; ns_item_id: string | number | null; tiendas: TiendaStock[] };
export type ProductoTiendas = {
  product_id: string | number; nombre: string; titulo?: string; color?: string | null; color_hex?: string | null; imagen?: string | null;
  precio: number; precio_antes?: number | null; pct_descuento?: number | null; categoria?: string; genero?: string;
  vendidas_online_30d?: number; agotado_online: boolean; unidades_tiendas: number; tallas: TallaTiendas[];
};
export type LineaSolicitud = {
  key: string; product_id: string; nombre: string; color: string | null; imagen: string | null; talla: string; sku: string;
  ns_item_id: string | null; location_id: string; tienda: string; ciudad: string | null; ns_location_id: string | null; cantidad: number; max: number;
};

export const CIUDADES = ["Medellín", "Bogotá", "Cali", "Barranquilla", "Bucaramanga", "Cartagena", "Cúcuta", "Ipiales", "Montería", "Pasto", "Pitalito", "Sincelejo", "Villavicencio", "Sin ciudad"];

const p2 = (n: number) => String(n).padStart(2, "0");
/** Fecha/hora en Bogotá como partes */
export function partesBogota(d = new Date()) {
  const b = new Date(d.getTime() - 5 * 3600 * 1000);
  return { dd: p2(b.getUTCDate()), MM: p2(b.getUTCMonth() + 1), yyyy: String(b.getUTCFullYear()), HH: p2(b.getUTCHours()), mm: p2(b.getUTCMinutes()) };
}

export function mensajeTienda(tienda: string, lineas: LineaSolicitud[], usuario: string): string {
  const items = lineas.map((l) => `• ${l.nombre}${l.color ? ` ${l.color}` : ""} – Talla ${l.talla} – SKU ${l.sku} – ${l.cantidad} und`).join("\n");
  return `Hola equipo ${tienda} 👋 Por favor validen si tienen físicamente estas unidades para enviarlas a CEDI Guayabal (pedido Personal Shopper):\n${items}\nRespondan confirmando cuáles tienen para solicitar el traslado. ¡Gracias!\n— ${usuario}`;
}

export const CSV_HEADER = "ID EXTERNO;SUBSIDIARIA;FECHA;UBICACIÓN ORIGEN;UBICACIÓN DESTINO;ARTÍCULO;ID INTERNO ART;EMPLEADO;CANTIDAD";

export function csvTraslado(lineas: LineaSolicitud[], empleado: string, now = new Date()) {
  const t = partesBogota(now);
  const incluidas = lineas.filter((l) => l.ns_item_id && l.ns_location_id);
  const excluidas = lineas.filter((l) => !l.ns_item_id || !l.ns_location_id);
  const first = lineas[0];
  const nsLoc = first?.ns_location_id ?? "";
  const idExt = `${nsLoc} PS${t.dd}${t.MM}${t.HH}${t.mm} CEDI GUAYABAL`;
  const fecha = `${t.dd}/${t.MM}/${t.yyyy}`;
  const emp = (empleado || "").toUpperCase();
  const rows = incluidas.map((l) => [idExt, 2, fecha, l.ns_location_id, 7, l.sku, l.ns_item_id, emp, l.cantidad].join(";"));
  const contenido = "\uFEFF" + [CSV_HEADER, ...rows].join("\r\n");
  const nombre = `Traslado_${nsLoc}_${(first?.tienda ?? "").replace(/\s+/g, "")}_a_GUAYABAL_${t.dd}${t.MM}${t.yyyy}_${t.HH}${t.mm}.csv`;
  return { contenido, nombre, incluidas, excluidas };
}
