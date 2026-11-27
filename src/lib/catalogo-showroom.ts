export type CatalogoShowroomTalla = {
  sku: string;
  talla: string;
  disponible: number;
  ultimas: boolean;
};

export type CatalogoShowroomProducto = {
  product_id: string | number;
  nombre: string;
  titulo?: string | null;
  color?: string | null;
  color_hex?: string | null;
  imagen?: string | null;
  precio_full: number;
  precio_pagina: number;
  pct_descuento?: number | null;
  categoria?: string | null;
  coleccion?: string | null;
  genero?: string | null;
  disponible_total: number;
  vendidas_14d?: number | null;
  alerta?: "ULTIMAS UNIDADES" | "AGOTADO" | null;
  tallas: CatalogoShowroomTalla[];
};

export type ConsultaShowroom = {
  busqueda: string | null;
  categorias: string[];
  colecciones: string[];
  generos: string[];
  tallas: string[];
  colores: string[];
  precioMin: number | null;
  precioMax: number | null;
  soloRebajados: boolean;
  orden: string;
};

/** Parámetros exactos de catalogo_showroom_productos; el offset se agrega en cada llamada. */
export function parametrosConsultaShowroom(q: ConsultaShowroom, limite = 48) {
  const lista = (valores: string[]) => valores.length ? valores : null;
  return {
    p_busqueda: q.busqueda || null,
    p_categorias: lista(q.categorias),
    p_colecciones: lista(q.colecciones),
    p_generos: lista(q.generos),
    p_tallas: lista(q.tallas),
    p_colores: lista(q.colores),
    p_precio_min: q.precioMin,
    p_precio_max: q.precioMax,
    p_solo_rebajados: q.soloRebajados,
    p_orden: q.orden,
    p_limite: limite,
  };
}

export const mostrarPrecioFull = (p: Pick<CatalogoShowroomProducto, "precio_full" | "precio_pagina">) =>
  Number(p.precio_full) !== Number(p.precio_pagina);

export const tallasShowroomConStock = (p: CatalogoShowroomProducto) =>
  (p.tallas ?? []).filter((t) => (Number(t.disponible) || 0) > 0);

export const tieneUltimasShowroom = (p: CatalogoShowroomProducto) =>
  p.alerta === "ULTIMAS UNIDADES" || tallasShowroomConStock(p).some((t) => t.ultimas);

export const nombreArchivoShowroom = (p: CatalogoShowroomProducto) =>
  `${[p.nombre, p.color].filter(Boolean).join("-")}`.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim() + ".jpg";

/** Fecha y hora legibles en Colombia, sin convertirlas a la zona del dispositivo. */
export function fechaHoraBogota(iso: string | null | undefined): string {
  if (!iso) return "No disponible";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No disponible";
  const timeZone = "America/Bogota";
  const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone }).formatToParts(d);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const fecha = `${get("day")} ${get("month").replace(".", "")} ${get("year")}`;
  const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(d).replace(/\u00a0/g, " ");
  return `${fecha} · ${hora}`;
}
