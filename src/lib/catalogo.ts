export type CatalogoTalla = {
  sku: string;
  talla: string;
  disponible: number;
  ultimas: boolean;
  tiendas?: number | null;
  outlets?: number | null;
  reservas?: number | null;
  vendible?: number | null;
  confirmar?: boolean | null;
  fisico_netsuite?: number | null;
  en_mano_shopify?: number | null;
  comprometido?: number | null;
  facturado_sin_despachar?: number | null;
  saliendo_traslados?: number | null;
  en_camino?: number | null;
  por_llegar?: number | null;
  traslados_entrantes?: string | null;
  diferencia_netsuite?: number | null;
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
  tallas_confirmar?: number | null;
};

/** Dominio público de los catálogos compartidos: siempre el mismo, sin importar desde dónde se abra Selliq. */
export const PUBLIC_CATALOG_BASE = "https://monasterysmart.shop";

/** Enlace público de un catálogo compartido. */
export const catalogoPublicoUrl = (slug: string) => `${PUBLIC_CATALOG_BASE}/c/${slug}`;

export const formatCOP = (n: number | null | undefined) =>
  "$ " + Math.round(Number(n) || 0).toLocaleString("es-CO");

/** Unidades que se pueden vender: usa vendible cuando viene, si no disponible. */
export const unidadesVendibles = (t: CatalogoTalla) => Number(t.vendible ?? t.disponible) || 0;

/** Tallas que ve el cliente (ficha, mosaico, WhatsApp): solo vendible > 0, sin alertas internas. */
export const tallasConStock = (p: CatalogoProducto) =>
  (p.tallas ?? []).filter((t) => unidadesVendibles(t) > 0);

export const tieneUltimas = (p: CatalogoProducto) =>
  p.alerta === "ULTIMAS UNIDADES" || (p.tallas ?? []).some((t) => t.ultimas && unidadesVendibles(t) > 0);

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

const ORDEN_TALLAS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
/** Orden lógico: letras (XS…XXL), luego numéricas de menor a mayor, luego el resto. */
export function compararTallas(a: string, b: string): number {
  const ia = ORDEN_TALLAS.indexOf(a.toUpperCase()), ib = ORDEN_TALLAS.indexOf(b.toUpperCase());
  const na = /^\d+(\.\d+)?$/.test(a) ? Number(a) : null, nb = /^\d+(\.\d+)?$/.test(b) ? Number(b) : null;
  const rank = (i: number, n: number | null) => (i >= 0 ? 0 : n !== null ? 1 : 2);
  const ra = rank(ia, na), rb = rank(ib, nb);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return ia - ib;
  if (ra === 1) return na! - nb!;
  return a.localeCompare(b, "es");
}

/** Texto del botón: "Talla" → "Talla: M" → "Talla: M, L" → "Talla · 3". */
export function etiquetaFiltro(nombre: string, sel: string[]): string {
  if (!sel.length) return nombre;
  if (sel.length <= 2) return `${nombre}: ${sel.join(", ")}`;
  return `${nombre} · ${sel.length}`;
}

export const mensajeCatalogoZenvia = (url: string) =>
  `¡Hola! Te comparto nuestro catálogo Monastery con precios especiales. Elige tus productos y tallas y envíanos tu pedido por aquí mismo. Disponible solo por 48 horas: ${url}`;

export type PedidoItem = {
  sku: string;
  product_id: string;
  nombre: string;
  color: string | null;
  talla: string;
  precio: number;
  imagen: string | null;
  cantidad: number;
};

type ProductoParaPedido = Omit<PedidoItem, "sku" | "talla" | "cantidad" | "product_id"> & { product_id: string | number };

/** Agrega una unidad sin superar las existencias informadas para esa talla. */
export function agregarProductoAlPedido(
  pedido: PedidoItem[],
  producto: ProductoParaPedido,
  talla: { sku: string; talla: string; disponible: number },
): { pedido: PedidoItem[]; agregado: boolean } {
  const disponible = Math.max(0, Number(talla.disponible) || 0);
  const existente = pedido.find((item) => item.sku === talla.sku);
  if (disponible < 1 || (existente && existente.cantidad >= disponible)) return { pedido, agregado: false };
  if (existente) {
    return {
      pedido: pedido.map((item) => item.sku === talla.sku ? { ...item, cantidad: item.cantidad + 1 } : item),
      agregado: true,
    };
  }
  return {
    pedido: [...pedido, {
      sku: talla.sku,
      product_id: String(producto.product_id),
      nombre: producto.nombre,
      color: producto.color,
      talla: talla.talla,
      precio: Number(producto.precio) || 0,
      imagen: producto.imagen,
      cantidad: 1,
    }],
    agregado: true,
  };
}

/** Cambia cantidades entre 1 y el disponible; las eliminaciones se hacen aparte. */
export function cambiarCantidadPedido(pedido: PedidoItem[], sku: string, delta: number, disponible: number): PedidoItem[] {
  return pedido.map((item) => {
    if (item.sku !== sku) return item;
    const siguiente = item.cantidad + delta;
    if (siguiente < 1) return item;
    return { ...item, cantidad: Math.min(siguiente, Math.max(1, Number(disponible) || 0)) };
  });
}

export const unidadesPedido = (pedido: PedidoItem[]) => pedido.reduce((sum, item) => sum + item.cantidad, 0);
export const totalPedido = (pedido: PedidoItem[]) => pedido.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

export function mensajePedidoWhatsApp(pedido: PedidoItem[], url: string): string {
  const lineas = pedido.map((item, index) =>
    `${index + 1}. ${item.nombre}${item.color ? ` ${item.color}` : ""} – Talla ${item.talla} – ${item.cantidad} und – ${formatCOP(item.precio)} c/u (Ref ${item.sku})`,
  );
  return [
    "¡Hola! Quiero hacer este pedido del catálogo Monastery:",
    ...lineas,
    `Total: ${formatCOP(totalPedido(pedido))}`,
    `Catálogo: ${url}`,
  ].join("\n");
}
