/**
 * Estados del reporte de pendientes de facturación.
 * Los valores coinciden con `estado_facturacion` que devuelve la RPC
 * `reporte_pendientes_facturacion`; aquí solo se mapean a filtro, tarjetas y contadores.
 */

export type TabKey = "facturado" | "por_facturar" | "dian" | "diferencias" | "notas";
export type CardKey =
  | "sin_ov" | "pendiente" | "diferencia" | "fallo_dian" | "en_proceso" | "sin_cufe"
  | "esperando" | "facturado" | "ajustado" | "ajuste_no_cuadra" | "no_pagados";

/** Pedido que solo tiene tarjetas de regalo y no tiene factura: no es facturable. */
export const ESTADO_GIFT_CARD = "Tarjeta de regalo (no facturable)";
/** Texto corto del distintivo; el estado completo queda solo en el filtro y el título. */
export const ETIQUETA_GIFT_CARD = "Tarjeta de regalo";
export const ESTADO_NO_PAGADOS = "No pagados";

export const esEstadoGiftCard = (e: string | null | undefined) => (e ?? "") === ESTADO_GIFT_CARD;

/** Texto del distintivo de estado: tarjetas de regalo salen cortas, el resto tal cual. */
export const estadoBadgeTexto = (e: string) => (esEstadoGiftCard(e) ? ETIQUETA_GIFT_CARD : e);

/** Estados que muestra cada pestaña. Tarjetas de regalo no entra en ninguna: no es pendiente. */
export const ESTADOS_TAB: Partial<Record<TabKey, string[]>> = {
  facturado: ["Facturado"],
  por_facturar: ["SIN ORDEN DE VENTA EN NETSUITE", "PENDIENTE POR FACTURAR", "Esperando despacho"],
  dian: ["Emision en proceso", "Fallo la emision a DIAN"],
  diferencias: ["Descuadre de valor", "Ajuste no cuadra", "Ajustado"],
};

/** Cuántos pedidos suma cada tarjeta del reporte. */
export const CARD_ESTADO: Record<CardKey, (e: string) => boolean> = {
  sin_ov: (e) => e === "SIN ORDEN DE VENTA EN NETSUITE",
  pendiente: (e) => e === "PENDIENTE POR FACTURAR",
  diferencia: (e) => e === "Descuadre de valor",
  fallo_dian: (e) => e === "Fallo la emision a DIAN",
  en_proceso: (e) => e === "Emision en proceso",
  sin_cufe: (e) => e === "Emision en proceso" || e === "Fallo la emision a DIAN",
  esperando: (e) => e === "Esperando despacho",
  facturado: (e) => e === "Facturado",
  ajustado: (e) => e === "Ajustado",
  ajuste_no_cuadra: (e) => e === "Ajuste no cuadra",
  no_pagados: (e) => e === ESTADO_NO_PAGADOS,
};

/** Estado que se envía a la RPC cuando se elige una tarjeta. */
export const ESTADO_POR_TARJETA: Record<CardKey, string> = {
  sin_ov: "SIN ORDEN DE VENTA EN NETSUITE",
  pendiente: "PENDIENTE POR FACTURAR",
  diferencia: "Descuadre de valor",
  fallo_dian: "Fallo la emision a DIAN",
  en_proceso: "Emision en proceso",
  sin_cufe: "Sin CUFE",
  esperando: "Esperando despacho",
  facturado: "Facturado",
  ajustado: "Ajustado",
  ajuste_no_cuadra: "Ajuste no cuadra",
  no_pagados: ESTADO_NO_PAGADOS,
};

/** Opciones del filtro de estado. */
export const ESTADOS_FILTRO = [
  "SIN ORDEN DE VENTA EN NETSUITE", "PENDIENTE POR FACTURAR", "Esperando despacho", "Sin CUFE", "Emision en proceso", "Fallo la emision a DIAN", "Descuadre de valor",
  "Anulado por nota credito", "Facturado", "Ajustado", "Ajuste no cuadra", "No pagados",
  ESTADO_GIFT_CARD,
];

export type FilaResumen = { estado_facturacion: string | null; pedidos: number | null };

/**
 * Total de pedidos cuando no hay estado ni pestaña que acote:
 * fuera 'No pagados' y fuera tarjetas de regalo, que no son pendientes.
 */
export function sumarPedidosVisibles(rows: FilaResumen[]): number {
  return rows
    .filter((r) => (r.estado_facturacion ?? "") !== ESTADO_NO_PAGADOS && !esEstadoGiftCard(r.estado_facturacion))
    .reduce((a, r) => a + Number(r.pedidos ?? 0), 0);
}
