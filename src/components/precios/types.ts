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
