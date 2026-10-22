export interface Lote {
  id: number;
  nombre: string;
  estado: string;
  notas: string | null;
  creado_en: string;
  aprobado_en: string | null;
  netsuite_completo_en: string | null;
  shopify_fin_en: string | null;
  lote_revertido_id?: number | null;
}

export interface LoteItem {
  lote_id: number;
  product_id: string;
  variant_id: string;
  sku: string;
  titulo: string | null;
  precio_lista: number;
  precio_antes: number;
  precio_nuevo: number;
  compare_nuevo: number | null;
  etiqueta_antes: string | null;
  etiqueta_nueva: string | null;
  costo: number | null;
  margen_nuevo: number | null;
  ns_precio: number | null;
  ns_ok: boolean;
  shopify_ok: boolean;
  error: string | null;
}

export const ESTADO_LOTE: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground border-border" },
  esperando_netsuite: { label: "Esperando NetSuite", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  aplicando_shopify: { label: "Aplicando Shopify", cls: "bg-sky-100 text-sky-800 border-sky-300" },
  aplicado: { label: "Aplicado", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  error: { label: "Error", cls: "bg-red-100 text-red-800 border-red-300" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border line-through" },
  revertido: { label: "Revertido", cls: "bg-violet-100 text-violet-800 border-violet-300" },
};


export const fechaHoraLote = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "—";

/** CSV NetSuite: separador ;, sin BOM, enteros sin miles */
export function csvNetsuite(rows: { internal_id: string; b_precio_shopify: number; parque93_precio_sin_iva: number; website_precio_sin_iva: number }[]) {
  const n = (v: number) => String(Math.round(Number(v ?? 0)));
  const lines = ["Internal ID;B. Precio Shopify;Parque 93 Precio sin IVA;Website Precio sin IVA"];
  rows.forEach((r) => lines.push([r.internal_id, n(r.b_precio_shopify), n(r.parque93_precio_sin_iva), n(r.website_precio_sin_iva)].join(";")));
  return lines.join("\r\n") + "\r\n";
}
