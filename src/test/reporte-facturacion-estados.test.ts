import { describe, expect, it } from "vitest";
import {
  CARD_ESTADO,
  CardKey,
  ESTADOS_FILTRO,
  ESTADOS_TAB,
  ESTADO_GIFT_CARD,
  estadoBadgeTexto,
  esEstadoGiftCard,
  sumarPedidosVisibles,
} from "@/lib/reporte-facturacion-estados";

// Control real de resumen_pendientes_facturacion('2026-09-01','2026-11-10').
const RESUMEN = [
  { estado_facturacion: "Facturado", pedidos: 20221 },
  { estado_facturacion: "Anulado por nota credito", pedidos: 384 },
  { estado_facturacion: "Descuadre de valor", pedidos: 142 },
  { estado_facturacion: "Ajustado", pedidos: 133 },
  { estado_facturacion: "Esperando despacho", pedidos: 111 },
  { estado_facturacion: "Fallo la emision a DIAN", pedidos: 42 },
  { estado_facturacion: "No pagados", pedidos: 23 },
  { estado_facturacion: "Tarjeta de regalo (no facturable)", pedidos: 18 },
  { estado_facturacion: "PENDIENTE POR FACTURAR", pedidos: 7 },
  { estado_facturacion: "Emision en proceso", pedidos: 4 },
  { estado_facturacion: "Ajuste no cuadra", pedidos: 4 },
  { estado_facturacion: "SIN ORDEN DE VENTA EN NETSUITE", pedidos: 2 },
];

describe("estado Tarjeta de regalo (no facturable)", () => {
  it("aparece en el filtro de estado con el nombre completo de la RPC", () => {
    expect(ESTADOS_FILTRO).toContain("Tarjeta de regalo (no facturable)");
    expect(ESTADO_GIFT_CARD).toBe("Tarjeta de regalo (no facturable)");
  });

  it("el distintivo dice 'Tarjeta de regalo'", () => {
    expect(estadoBadgeTexto("Tarjeta de regalo (no facturable)")).toBe("Tarjeta de regalo");
  });

  it("los demás estados se muestran tal cual", () => {
    expect(estadoBadgeTexto("PENDIENTE POR FACTURAR")).toBe("PENDIENTE POR FACTURAR");
    expect(estadoBadgeTexto("No pagados")).toBe("No pagados");
  });

  it("ninguna tarjeta de pendientes ni de errores lo suma", () => {
    (Object.keys(CARD_ESTADO) as CardKey[]).forEach((k) => {
      expect(CARD_ESTADO[k](ESTADO_GIFT_CARD), `tarjeta ${k}`).toBe(false);
    });
  });

  it("ninguna pestaña lo incluye en su lista de estados", () => {
    Object.entries(ESTADOS_TAB).forEach(([tab, estados]) => {
      expect(estados ?? [], `pestaña ${tab}`).not.toContain(ESTADO_GIFT_CARD);
    });
  });

  it("el total sin filtro deja fuera tarjetas de regalo y no pagados", () => {
    // 21.050 = 21.091 de la base menos 18 tarjetas de regalo y 23 no pagados.
    expect(sumarPedidosVisibles(RESUMEN)).toBe(21050);
  });

  it("reconoce el estado solo cuando es exacto", () => {
    expect(esEstadoGiftCard("Tarjeta de regalo (no facturable)")).toBe(true);
    expect(esEstadoGiftCard("PENDIENTE POR FACTURAR")).toBe(false);
    expect(esEstadoGiftCard(null)).toBe(false);
  });
});
