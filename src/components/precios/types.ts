export interface PrecioRow {
  product_id: string;
  producto: string;
  coleccion: string | null;
  tipo: string | null;
  genero: string | null;
  etiquetas: string[] | null;
  etiqueta_ht: string | null;
  semanas_vida: number | null;
  tallas: string | null;
  precio_lista: number | null;
  precio_actual: number | null;
  precio_uniforme: boolean | null;
  dcto_actual: number | null;
  costo: number | null;
  margen_actual: number | null;
  stock_guayabal: number | null;
  venta_28d: number | null;
  venta_7d: number | null;
  rdv_semana: number | null;
  wos: number | null;
  inicio_rebaja: string | null;
  rdv_antes: number | null;
  rdv_desde: number | null;
  efecto: string | null;
  sugerencia: string | null;
  dcto_sugerido: number | null;
  precio_sugerido: number | null;
  margen_sugerido: number | null;
  alertas: string[] | null;
}

export const SUGERENCIAS: Record<string, { label: string; card: string; badge: string; ring: string }> = {
  entrar: { label: "Entrar a descuento", card: "Deberían entrar a descuento", badge: "bg-emerald-100 text-emerald-800 border-emerald-300", ring: "ring-emerald-500" },
  subir: { label: "Subir descuento", card: "Descuento sin efecto: subir", badge: "bg-amber-100 text-amber-800 border-amber-300", ring: "ring-amber-500" },
  no_admite: { label: "No admite más descuento", card: "No rota y no admite más descuento", badge: "bg-red-100 text-red-800 border-red-300", ring: "ring-red-500" },
  quitar: { label: "Quitar descuento", card: "Se agota con descuento: quitar", badge: "bg-sky-100 text-sky-800 border-sky-300", ring: "ring-sky-500" },
};

export const esEtiquetaDesalineada = (r: PrecioRow) =>
  (r.alertas ?? []).some((a) => a.includes("Etiqueta") || a.includes("sin etiqueta HT26"));

export const cop = (n: number | null | undefined) =>
  n == null ? "—" : `$ ${Math.round(Number(n)).toLocaleString("es-CO")}`;
export const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n) * 100)}%`);
export const num = (n: number | null | undefined) => (n == null ? "—" : Math.round(Number(n)).toLocaleString("es-CO"));

SUGERENCIAS.mantener = { label: "Mantener", card: "Mantener", badge: "bg-muted text-muted-foreground border-border", ring: "ring-muted-foreground" };
SUGERENCIAS.revisar = { label: "Revisar", card: "Revisar", badge: "bg-violet-100 text-violet-800 border-violet-300", ring: "ring-violet-500" };
SUGERENCIAS.no_admite.label = "No admite más";

export type AccionLote = "subir" | "fijar" | "quitar" | "sugerido";

/** Precio nuevo = round(precio_lista × (1 − dcto) / 1000) × 1000 */
export const precioConDcto = (precioLista: number, dcto: number) =>
  Math.round((precioLista * (1 - dcto)) / 1000) * 1000;

/** Margen = 1 − costo / (precio / 1.19) */
export const margenDe = (costo: number | null, precio: number) =>
  costo == null || precio <= 0 ? null : 1 - costo / (precio / 1.19);

/** Descuento resultante de una acción para una fila (null = no aplica) */
export function dctoNuevo(r: Pick<PrecioRow, "dcto_actual" | "dcto_sugerido">, accion: AccionLote, valor: number): number | null {
  if (accion === "quitar") return 0;
  if (accion === "fijar") return valor / 100;
  if (accion === "subir") return Math.min(0.95, Number(r.dcto_actual ?? 0) + valor / 100);
  return r.dcto_sugerido == null ? null : Number(r.dcto_sugerido);
}

export type CambioRdv = { tipo: "na" } | { tipo: "pronto" } | { tipo: "nuevo" } | { tipo: "pct"; v: number };
export function cambioRdv(r: Pick<PrecioRow, "dcto_actual" | "efecto" | "rdv_antes" | "rdv_desde" | "inicio_rebaja">): CambioRdv {
  if (!r.dcto_actual || Number(r.dcto_actual) <= 0) return { tipo: "na" };
  if (r.efecto === "muy_pronto" || r.efecto === "muy pronto") return { tipo: "pronto" };
  const a = r.rdv_antes == null ? null : Number(r.rdv_antes);
  const d = r.rdv_desde == null ? null : Number(r.rdv_desde);
  if (a == null || d == null) return { tipo: "na" };
  if (a === 0) return d > 0 ? { tipo: "nuevo" } : { tipo: "na" };
  return { tipo: "pct", v: (d - a) / a };
}
