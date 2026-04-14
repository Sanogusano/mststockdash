import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays, needsDateRange, getDateRange, toDateStr } from "./TimeFilter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import monasteryLogoWhite from "@/assets/monastery-logo-white.png";

/* ── Types ── */
interface KpiData {
  total_pedidos: number;
  unidades_vendidas: number;
  ingresos_netos: number;
  ticket_promedio: number;
  upt: number;
  pct_pedidos_full_price: number;
  pct_pedidos_rebajas: number;
  pct_pedidos_con_descuento: number;
}

interface MetricasData {
  mejor_dia_semana: string | null;
  peor_dia_semana: string | null;
  venta_mejor_dia: number;
  venta_peor_dia: number;
  venta_promedio_diaria_actual: number;
  pedidos_promedio_diario_actual: number;
  unidades_promedio_diario_actual: number;
  venta_promedio_diaria_anterior: number;
  pedidos_promedio_diario_anterior: number;
  unidades_promedio_diario_anterior: number;
  venta_promedio_semana: number;
  venta_promedio_finde: number;
}

interface ProductRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  clasificacion: string | null;
  unidades_vendidas: number | null;
  precio_prom_venta: number | null;
  stock_disponible: number | null;
}

interface LineaRow {
  categoria: string | null;
  und_total: number | null;
  pct_participacion: number | null;
  sell_through_pct: number | null;
  wos: number | null;
  estado_salud: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
  und_tiendas: number | null;
  und_digital: number | null;
  und_outlets: number | null;
}

interface AlertRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
  wos: number | null;
  estado_salud: string | null;
  und_vendidas: number | null;
  sell_through_pct: number | null;
}

interface TransferRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  tienda_origen: string | null;
  stock_origen: number | null;
  tienda_destino: string | null;
  uds_sugeridas: number | null;
  ritmo_venta_destino: number | null;
  accion: string | null;
}

interface ParetoRow {
  categoria: string | null;
  unidades: number | null;
  ingresos: number | null;
  pct_participacion: number | null;
}

interface RankingRow {
  tienda: string;
  ventas_totales: number;
  unidades_vendidas: number;
  ticket_promedio: number;
  upt: number;
  pct_venta_full_price: number;
  zona: string;
}

interface DiscountAlertRow {
  numero_pedido: string;
  producto: string;
  sku: string;
  sucursal: string;
  cantidad: number;
  precio: number;
  descuento_otorgado: number;
  categoria: string;
}

interface LocationItem {
  location_id: string;
  name: string;
  zona: string | null;
  dimension_m2: number | null;
}

/* ── Constants ── */
const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtNum = (v: number) => v.toLocaleString("es-CO");

const DAY_MAP: Record<string, string> = {
  Monday: "Lunes", Tuesday: "Martes", Wednesday: "Miercoles",
  Thursday: "Jueves", Friday: "Viernes", Saturday: "Sabado", Sunday: "Domingo",
};

function translateDay(d: string): string {
  const trimmed = d.trim();
  return DAY_MAP[trimmed] ?? trimmed;
}

function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[\u{20E3}]/gu, "")
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\u{2B50}|\u{2705}|\u{26A0}|\u{1F534}|\u{1F7E1}|\u{1F7E2}/gu, "")
    .replace(/[\u{25B2}\u{25BC}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Logo to base64 ── */
async function getLogoBase64(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

async function imageToBase64(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 40, 40);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

/* ── Shared PDF helpers ── */
const BLACK = [15, 15, 15] as [number, number, number];
const GREEN = [16, 185, 129] as [number, number, number];
const RED = [220, 38, 38] as [number, number, number];
const ORANGE = [234, 88, 12] as [number, number, number];
const GRAY = [120, 120, 120] as [number, number, number];
const LIGHT_BG = [245, 245, 245] as [number, number, number];
const AMBER = [180, 130, 0] as [number, number, number];
const BLUE = [59, 130, 246] as [number, number, number];

function createDoc() {
  return new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
}

function drawHeader(doc: jsPDF, logoB64: string, titulo: string, effectiveDays: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 30, "F");
  if (logoB64) {
    try { doc.addImage(logoB64, "PNG", margin, 4, 50, 22); } catch { /* skip */ }
  }
  const dateStr = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota",
  });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(stripEmoji(titulo), pageW - margin, 12, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(stripEmoji(dateStr), pageW - margin, 19, { align: "right" });
  doc.text(`Periodo: ultimos ${effectiveDays} dias`, pageW - margin, 24, { align: "right" });
  doc.setTextColor(0, 0, 0);
  return dateStr;
}

function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  if (y + 16 > pageH - margin) { doc.addPage(); y = margin; }
  doc.setFillColor(...BLACK);
  doc.roundedRect(margin, y, pageW - 2 * margin, 9, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(stripEmoji(title), margin + 4, y + 6.2);
  doc.setTextColor(0, 0, 0);
  return y + 13;
}

function addFooters(doc: jsPDF, dateStr: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(`Monastery - Informe - ${stripEmoji(dateStr)}`, margin, pageH - 6);
    doc.text(`Pagina ${i} / ${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
    doc.setDrawColor(200, 200, 210);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
  }
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + needed > pageH - 14) { doc.addPage(); return 14; }
  return y;
}

async function prefetchImages(items: { foto: string | null }[], cache: Map<string, string>, limit = 40) {
  const promises = items.slice(0, limit).filter(p => p.foto).map(async (p) => {
    try {
      const b64 = await imageToBase64(p.foto!);
      if (b64) cache.set(p.foto!, b64);
    } catch { /* skip */ }
  });
  await Promise.all(promises);
}

/* ── Comparison helper ── */
function pctChange(cur: number, prev: number): string {
  if (!prev) return "";
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
}

/* ── Draw KPI card with comparison arrow ── */
function drawKpiCardWithArrow(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, color: [number, number, number],
  change?: string, subLabel?: string,
) {
  doc.setFillColor(...LIGHT_BG);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setDrawColor(220, 220, 230);
  doc.roundedRect(x, y, w, h, 2, 2, "S");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(label, x + 3, y + 5);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);
  // Use splitTextToSize to prevent text from being cut
  const lines = doc.splitTextToSize(value, w - 6);
  doc.text(lines[0] || value, x + 3, y + 11.5);
  if (subLabel) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(subLabel, x + 3, y + 15.5);
  }
  if (change) {
    const isPositive = change.startsWith("+");
    const arrow = isPositive ? "+" : "-";
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(isPositive ? GREEN : RED));
    const changeText = `${arrow} ${change.replace('+','').replace('-','')} vs ant.`;
    const textLines = doc.splitTextToSize(changeText, w / 2);
    doc.text(textLines[0], x + w - 3, y + 5, { align: "right" });
  }
}

/* ── Panel de Accionables (enhanced) ── */
function drawAccionablesPanel(
  doc: jsPDF, y: number,
  kpis: KpiData, kpisPrev: KpiData,
  discountAlerts?: DiscountAlertRow[],
  stockoutProducts?: AlertRow[],
): number {
  const margin = 14;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - 2 * margin;

  y = drawSectionTitle(doc, y, "PANEL DE ACCIONABLES");

  const indicators = [
    { name: "Ventas Netas", cur: kpis.ingresos_netos, prev: kpisPrev.ingresos_netos, isCurrency: true },
    { name: "Pedidos", cur: kpis.total_pedidos, prev: kpisPrev.total_pedidos, isCurrency: false },
    { name: "Unidades Vendidas", cur: kpis.unidades_vendidas, prev: kpisPrev.unidades_vendidas, isCurrency: false },
    { name: "Ticket Promedio", cur: kpis.ticket_promedio, prev: kpisPrev.ticket_promedio, isCurrency: true },
    { name: "UPT", cur: kpis.upt, prev: kpisPrev.upt, isCurrency: false },
    { name: "% Full Price", cur: kpis.pct_pedidos_full_price, prev: kpisPrev.pct_pedidos_full_price, isCurrency: false },
    { name: "% Rebajas", cur: kpis.pct_pedidos_rebajas, prev: kpisPrev.pct_pedidos_rebajas, isCurrency: false },
    { name: "% Desc. Promo", cur: kpis.pct_pedidos_con_descuento, prev: kpisPrev.pct_pedidos_con_descuento, isCurrency: false },
  ];

  const withPct = indicators.map(i => ({
    ...i,
    pct: i.prev ? ((i.cur - i.prev) / Math.abs(i.prev)) * 100 : 0,
  }));

  const dropping = withPct.filter(i => i.pct <= -10);
  const rising = withPct.filter(i => i.pct >= 10);

  // ── INDICADORES EN CAIDA ──
  if (dropping.length) {
    const blockH = 10 + dropping.length * 6;
    y = ensureSpace(doc, y, blockH + 4);
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(margin, y, contentW, blockH, 2, 2, "F");
    doc.setDrawColor(220, 180, 180);
    doc.roundedRect(margin, y, contentW, blockH, 2, 2, "S");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...RED);
    doc.text("INDICADORES EN CAIDA (>10%)", margin + 4, y + 6);
    dropping.forEach((ind, i) => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const fmt = ind.isCurrency
        ? `${fmtCOP(ind.prev)} -> ${fmtCOP(ind.cur)}`
        : `${fmtNum(Math.round(ind.prev))} -> ${fmtNum(Math.round(ind.cur))}`;
      const line = doc.splitTextToSize(`  - ${ind.name}: ${ind.pct.toFixed(1)}% (${fmt})`, contentW - 10);
      doc.text(line, margin + 4, y + 12 + i * 6);
    });
    y += blockH + 4;
  }

  // ── INDICADORES EN ALZA ──
  if (rising.length) {
    const hypotheses: string[] = [];
    const rebajasRising = rising.find(i => i.name === "% Rebajas");
    const ventasRising = rising.find(i => i.name === "Ventas Netas");
    const fullPriceDropping = dropping.find(i => i.name === "% Full Price");
    const promoRising = rising.find(i => i.name === "% Desc. Promo");
    const ticketRising = rising.find(i => i.name === "Ticket Promedio");
    const ticketDropping = dropping.find(i => i.name === "Ticket Promedio");
    const unidadesRising = rising.find(i => i.name === "Unidades Vendidas");

    if (rebajasRising && ventasRising) {
      hypotheses.push(`CORRELACION: El aumento de Rebajas (+${rebajasRising.pct.toFixed(1)}%) posiblemente impulso Ventas Netas (+${ventasRising.pct.toFixed(1)}%). Evaluar si el margen neto se mantuvo.`);
    }
    if (rebajasRising && fullPriceDropping) {
      hypotheses.push(`CORRELACION: Las Rebajas (+${rebajasRising.pct.toFixed(1)}%) estan desplazando ventas Full Price (${fullPriceDropping.pct.toFixed(1)}%). Revisar estrategia de precios.`);
    }
    if (promoRising && ventasRising) {
      hypotheses.push(`CORRELACION: Las promociones (+${promoRising.pct.toFixed(1)}%) contribuyeron al crecimiento en ventas (+${ventasRising.pct.toFixed(1)}%). Medir impacto en margen.`);
    }
    if (ticketRising && !unidadesRising) {
      hypotheses.push(`NO CORRELACION: El ticket promedio sube (+${ticketRising.pct.toFixed(1)}%) pero las unidades no crecen al mismo ritmo. Posible cambio en mix de producto.`);
    }
    if (ticketDropping && unidadesRising) {
      hypotheses.push(`CORRELACION: Las unidades suben (+${unidadesRising.pct.toFixed(1)}%) pero el ticket cae (${ticketDropping.pct.toFixed(1)}%). Se estan vendiendo mas items de menor valor.`);
    }
    if (ventasRising && !rebajasRising && !promoRising) {
      hypotheses.push(`POSITIVO: Las ventas crecen (+${ventasRising.pct.toFixed(1)}%) sin depender de rebajas o promociones. Crecimiento organico saludable.`);
    }

    const risingBlockH = 10 + rising.length * 6;
    y = ensureSpace(doc, y, risingBlockH + 4);
    doc.setFillColor(220, 252, 231);
    doc.roundedRect(margin, y, contentW, risingBlockH, 2, 2, "F");
    doc.setDrawColor(180, 220, 190);
    doc.roundedRect(margin, y, contentW, risingBlockH, 2, 2, "S");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...GREEN);
    doc.text("INDICADORES EN ALZA (>10%)", margin + 4, y + 6);
    rising.forEach((ind, i) => {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const fmt = ind.isCurrency
        ? `${fmtCOP(ind.prev)} -> ${fmtCOP(ind.cur)}`
        : `${fmtNum(Math.round(ind.prev))} -> ${fmtNum(Math.round(ind.cur))}`;
      const line = doc.splitTextToSize(`  + ${ind.name}: +${ind.pct.toFixed(1)}% (${fmt})`, contentW - 10);
      doc.text(line, margin + 4, y + 12 + i * 6);
    });
    y += risingBlockH + 4;

    if (hypotheses.length) {
      const hypoBlockH = 10 + hypotheses.length * 10;
      y = ensureSpace(doc, y, hypoBlockH + 4);
      doc.setFillColor(254, 249, 195);
      doc.roundedRect(margin, y, contentW, hypoBlockH, 2, 2, "F");
      doc.setDrawColor(220, 210, 150);
      doc.roundedRect(margin, y, contentW, hypoBlockH, 2, 2, "S");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...AMBER);
      doc.text("HIPOTESIS Y CORRELACIONES", margin + 4, y + 6);
      hypotheses.forEach((h, i) => {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const lines = doc.splitTextToSize(`- ${h}`, contentW - 10);
        doc.text(lines, margin + 4, y + 12 + i * 10);
      });
      y += hypoBlockH + 4;
    }
  }

  if (!dropping.length && !rising.length) {
    y = ensureSpace(doc, y, 14);
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text("Todos los indicadores se mantienen estables (variaciones menores al 10%).", margin, y + 5);
    y += 14;
  }

  // ── ALERTAS FRAGANCES / SUNGLASSES CON DESCUENTO ──
  const alertCategories = ["FRAGANCE", "FRAGANCES", "SUNGLASSES"];
  const filteredAlerts = (discountAlerts ?? []).filter(r =>
    alertCategories.some(cat => (r.categoria ?? "").toUpperCase().includes(cat))
  );
  if (filteredAlerts.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, y, "ALERTA: PRODUCTOS CON DESCUENTO NO AUTORIZADO");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Se detectaron ${filteredAlerts.length} items de FRAGANCES/SUNGLASSES vendidos con descuento.`, margin, y);
    y += 4;

    const alertsByCategory = new Map<string, DiscountAlertRow[]>();
    filteredAlerts.forEach(a => {
      const cat = (a.categoria ?? "SIN CATEGORIA").toUpperCase();
      if (!alertsByCategory.has(cat)) alertsByCategory.set(cat, []);
      alertsByCategory.get(cat)!.push(a);
    });

    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Producto", "SKU", "Sucursal", "Cant.", "Precio", "Descuento"]],
      body: filteredAlerts.slice(0, 30).map(r => [
        (r.categoria ?? "-").toUpperCase(),
        stripEmoji(r.producto ?? "-"),
        r.sku ?? "-",
        r.sucursal ?? "-",
        String(r.cantidad ?? 0),
        fmtCOP(r.precio ?? 0),
        fmtCOP(r.descuento_otorgado ?? 0),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: RED as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── PRODUCTOS RIESGO DE AGOTADO ──
  const riesgoProducts = (stockoutProducts ?? []).filter(r =>
    (r.estado_salud ?? "").includes("RIESGO")
  ).sort((a, b) => (a.wos ?? 0) - (b.wos ?? 0));

  if (riesgoProducts.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, y, `PRODUCTOS RIESGO DE AGOTADO (${riesgoProducts.length} productos)`);

    autoTable(doc, {
      startY: y,
      head: [["Producto", "SKU", "Categoria", "Uds Vend.", "Stock", "WOS", "Sell-Through"]],
      body: riesgoProducts.slice(0, 40).map(r => [
        stripEmoji(r.producto ?? "-"),
        r.sku ?? "-",
        stripEmoji(r.categoria ?? "-"),
        fmtNum(r.und_vendidas ?? 0),
        fmtNum((r.stock_tiendas ?? 0) + (r.stock_digital ?? 0)),
        (r.wos ?? 0).toFixed(1),
        `${(r.sell_through_pct ?? 0).toFixed(1)}%`,
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: ORANGE as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [255, 247, 237] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const wos = parseFloat(String(data.cell.raw));
          if (wos < 2) data.cell.styles.textColor = RED;
          else if (wos < 4) data.cell.styles.textColor = ORANGE;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  return y;
}

/* ─────────────────────────────────────────────────
   REPORT 1: EXECUTIVE REPORT
   ───────────────────────────────────────────────── */
async function generateExecutiveReport(
  days: number,
  reportType: "completo" | "canal" | "tienda" | "zona",
  canal?: string,
  locationId?: string,
  locationName?: string,
  zona?: string,
) {
  const effectiveDays = resolveDays(days);
  let titulo = "DESEMPENO COMERCIAL - Venta Directa";
  if (reportType === "canal" && canal) {
    const canalLabel = canal === "tiendas" ? "Tiendas de Linea" : canal === "outlets" ? "Outlets" : "Digital";
    titulo = `DESEMPENO COMERCIAL - ${canalLabel}`;
  } else if (reportType === "tienda" && locationName) {
    titulo = `DESEMPENO COMERCIAL - ${stripEmoji(locationName)}`;
  } else if (reportType === "zona") {
    titulo = `DESEMPENO COMERCIAL - Zona ${zona ?? "Todas"}`;
  }

  const canalParam = reportType === "canal" ? canal ?? null : null;
  const locationParam = reportType === "tienda" ? locationId ?? null : null;
  const zonaParam = (reportType === "zona" && zona) ? zona : null;
  const canalFiltro = reportType === "canal" ? (canal === "tiendas" || canal === "outlets" ? "POS" : "DIGITAL") : null;

  // ── Fetch all data in parallel ──
  const fetchPromises: PromiseLike<any>[] = [
    /* 0 */ (needsDateRange(days) ? supabase.rpc("reporte_kpis_por_rango" as any, (() => { const r = getDateRange(days); return { p_desde: toDateStr(r.from), p_hasta: toDateStr(r.to), p_canal: canalParam, p_location_id: locationParam, p_zona: zonaParam }; })() ) : supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: canalParam, p_location_id: locationParam, p_zona: zonaParam })) as any,
    /* 1 */ supabase.rpc("reporte_pareto_categorias" as any, { dias_atras: effectiveDays, p_canal: canalParam ?? "", p_location_id: locationParam }) as any,
    /* 2 */ supabase.rpc("reporte_ejecutivo_productos", { dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locationParam, orden: "TOP", limite: 20, zona_filtro: zonaParam }) as any,
    /* 3 */ supabase.rpc("reporte_ejecutivo_productos", { dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locationParam, orden: "BOTTOM", limite: 20, zona_filtro: zonaParam }) as any,
    /* 4 */ supabase.rpc("reporte_desempeno_por_linea" as any, { dias_atras: effectiveDays, p_canal: canalParam }) as any,
    /* 5 */ getLogoBase64(),
    /* 6 */ supabase.rpc("reporte_kpis_periodo_anterior", { dias_atras: effectiveDays, p_canal: canalParam, p_location_id: locationParam, p_zona: zonaParam }) as any,
    /* 7 - metricas */ locationParam
      ? supabase.rpc("reporte_metricas_tienda_individual", { dias_atras: effectiveDays, p_location_id: locationParam }) as any
      : supabase.rpc("reporte_metricas_zona", { dias_atras: effectiveDays, p_canal: canalParam, p_zona: zonaParam }) as any,
    /* 8 */ supabase.rpc("reporte_ranking_tiendas", { dias_atras: effectiveDays, p_canal: canalParam }) as any,
    /* 9 */ supabase.rpc("reporte_pct_ventas_por_tipo", { dias_atras: effectiveDays, p_canal: canalParam, p_location_id: locationParam, p_zona: zonaParam }) as any,
    /* 10 */ supabase.rpc("reporte_pedidos_por_tipo_venta", { dias_atras: effectiveDays, p_canal: canalParam, p_location_id: locationParam, p_tipo: "descuento" }) as any,
    /* 11 */ supabase.rpc("reporte_comportamiento_producto", { dias_atras: effectiveDays }) as any,
    /* 12 */ supabase.from("locations").select("location_id, name, zona, dimension_m2").eq("is_active", true) as any,
  ];

  const results = await Promise.all(fetchPromises);

  const kpis = results[0].data?.[0] as unknown as KpiData ?? { total_pedidos: 0, unidades_vendidas: 0, ingresos_netos: 0, ticket_promedio: 0, upt: 0, pct_pedidos_full_price: 0, pct_pedidos_rebajas: 0, pct_pedidos_con_descuento: 0 };
  const kpisPrev = results[6].data?.[0] as unknown as KpiData ?? { total_pedidos: 0, unidades_vendidas: 0, ingresos_netos: 0, ticket_promedio: 0, upt: 0, pct_pedidos_full_price: 0, pct_pedidos_rebajas: 0, pct_pedidos_con_descuento: 0 };
  const paretoData = (results[1].data ?? []) as unknown as ParetoRow[];
  const topProducts = (results[2].data ?? []) as unknown as ProductRow[];
  const bottomProducts = (results[3].data ?? []) as unknown as ProductRow[];
  const lineaData = (results[4].data ?? []) as unknown as LineaRow[];
  const logoB64 = results[5] as string;
  const metricasData = results[7]?.data?.[0] as unknown as MetricasData | null;
  const rankingData = (results[8].data ?? []) as unknown as RankingRow[];
  const pctVentasData = results[9]?.data?.[0] as any;
  const discountAlerts = (results[10].data ?? []) as unknown as DiscountAlertRow[];
  const stockoutData = (results[11].data ?? []) as unknown as AlertRow[];
  const locationsData = (results[12].data ?? []) as unknown as LocationItem[];

  // Filter ranking by zone if zona report
  const filteredRanking = zonaParam
    ? rankingData.filter(r => r.zona === zonaParam)
    : rankingData;

  // Calculate m2 for zone/canal
  let totalM2 = 0;
  const relevantLocations = zonaParam
    ? locationsData.filter(l => l.zona === zonaParam)
    : locationsData.filter(l => l.location_id !== "71474315479");
  totalM2 = relevantLocations.reduce((s, l) => s + (l.dimension_m2 ?? 0), 0);
  const ventaM2 = totalM2 > 0 ? kpis.ingresos_netos / totalM2 : 0;

  const imageCache = new Map<string, string>();
  await prefetchImages([...topProducts.slice(0, 20), ...bottomProducts.slice(0, 20)], imageCache);

  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const dateStr = drawHeader(doc, logoB64, titulo, effectiveDays);
  let y = 36;

  // ═══════════════════════════════════════════════
  // 1. PANEL DE DESEMPENO
  // ═══════════════════════════════════════════════
  y = drawSectionTitle(doc, y, "PANEL DE DESEMPENO");

  // Row 1: Ventas Netas, Ticket Promedio, UPT, Venta/m2
  const row1Items = [
    { label: "Ventas Netas", value: fmtCOP(kpis.ingresos_netos), color: BLACK, change: pctChange(kpis.ingresos_netos, kpisPrev.ingresos_netos) },
    { label: "Ticket Promedio", value: fmtCOP(kpis.ticket_promedio), color: BLACK, change: pctChange(kpis.ticket_promedio, kpisPrev.ticket_promedio) },
    { label: "UPT", value: kpis.upt.toFixed(2), color: kpis.upt >= 2 ? GREEN : kpis.upt < 1.5 ? RED : BLACK, change: pctChange(kpis.upt, kpisPrev.upt) },
    { label: totalM2 > 0 ? `Venta/m2 (${fmtNum(Math.round(totalM2))} m2)` : "Venta/m2", value: totalM2 > 0 ? fmtCOP(ventaM2) : "N/A", color: BLACK, change: "" },
  ];
  const col4W = (pageW - 2 * margin) / 4;
  y = ensureSpace(doc, y, 22);
  row1Items.forEach((item, i) => {
    drawKpiCardWithArrow(doc, margin + i * col4W, y, col4W - 2, 18, item.label, item.value, item.color as [number, number, number], item.change || undefined);
  });
  y += 22;

  // Row 2: % Full Price, % Rebajas, % Desc Promo
  const row2Items = [
    { label: "% Full Price", value: `${kpis.pct_pedidos_full_price.toFixed(1)}%`, color: GREEN, change: pctChange(kpis.pct_pedidos_full_price, kpisPrev.pct_pedidos_full_price) },
    { label: "% Rebajas", value: `${kpis.pct_pedidos_rebajas.toFixed(1)}%`, color: RED, change: pctChange(kpis.pct_pedidos_rebajas, kpisPrev.pct_pedidos_rebajas) },
    { label: "% Desc. Promo", value: `${kpis.pct_pedidos_con_descuento.toFixed(1)}%`, color: ORANGE, change: pctChange(kpis.pct_pedidos_con_descuento, kpisPrev.pct_pedidos_con_descuento) },
  ];
  const col3W = (pageW - 2 * margin) / 3;
  y = ensureSpace(doc, y, 22);
  row2Items.forEach((item, i) => {
    drawKpiCardWithArrow(doc, margin + i * col3W, y, col3W - 2, 18, item.label, item.value, item.color as [number, number, number], item.change);
  });
  y += 22;

  // ═══════════════════════════════════════════════
  // 2. DESEMPENO COMERCIAL (daily metrics)
  // ═══════════════════════════════════════════════
  if (metricasData) {
    y = drawSectionTitle(doc, y, "DESEMPENO COMERCIAL");

    // Row: Mejor Dia, Peor Dia, Prom Lun-Vie, Prom Sab-Dom
    const metricRow1 = [
      { label: "Mejor Dia", value: translateDay(metricasData.mejor_dia_semana ?? "-"), sub: fmtCOP(metricasData.venta_mejor_dia ?? 0), color: GREEN },
      { label: "Peor Dia", value: translateDay(metricasData.peor_dia_semana ?? "-"), sub: fmtCOP(metricasData.venta_peor_dia ?? 0), color: RED },
      { label: "Prom. Lun-Vie", value: fmtCOP(metricasData.venta_promedio_semana ?? 0), sub: "", color: BLACK },
      { label: "Prom. Sab-Dom", value: fmtCOP(metricasData.venta_promedio_finde ?? 0), sub: "", color: BLACK },
    ];
    y = ensureSpace(doc, y, 22);
    metricRow1.forEach((item, i) => {
      drawKpiCardWithArrow(doc, margin + i * col4W, y, col4W - 2, 18, item.label, item.value, item.color as [number, number, number], undefined, item.sub);
    });
    y += 22;

    // Row: Venta Prom/Dia, Pedidos Prom/Dia, Uds Prom/Dia
    const metricRow2 = [
      { label: "Venta Prom./Dia", value: fmtCOP(metricasData.venta_promedio_diaria_actual ?? 0), change: pctChange(metricasData.venta_promedio_diaria_actual, metricasData.venta_promedio_diaria_anterior) },
      { label: "Pedidos Prom./Dia", value: fmtNum(Math.round(metricasData.pedidos_promedio_diario_actual ?? 0)), change: pctChange(metricasData.pedidos_promedio_diario_actual, metricasData.pedidos_promedio_diario_anterior) },
      { label: "Uds Prom./Dia", value: fmtNum(Math.round(metricasData.unidades_promedio_diario_actual ?? 0)), change: pctChange(metricasData.unidades_promedio_diario_actual, metricasData.unidades_promedio_diario_anterior) },
    ];
    y = ensureSpace(doc, y, 22);
    metricRow2.forEach((item, i) => {
      drawKpiCardWithArrow(doc, margin + i * col3W, y, col3W - 2, 18, item.label, item.value, BLACK, item.change);
    });
    y += 22;
  }

  // ═══════════════════════════════════════════════
  // 3. TOP TIENDAS (skip for individual store reports)
  // ═══════════════════════════════════════════════
  if (reportType !== "tienda" && filteredRanking.length > 0) {
    y = drawSectionTitle(doc, y, `TOP TIENDAS${zonaParam ? ` - ZONA ${zonaParam.toUpperCase()}` : ""}`);

    autoTable(doc, {
      startY: y,
      head: [["#", "Tienda", "Zona", "Ventas Netas", "Uds", "Ticket Prom", "UPT", "% Full Price"]],
      body: filteredRanking.slice(0, 20).map((r, i) => [
        String(i + 1),
        r.tienda,
        r.zona ?? "-",
        fmtCOP(r.ventas_totales),
        fmtNum(r.unidades_vendidas),
        fmtCOP(r.ticket_promedio),
        r.upt.toFixed(2),
        `${r.pct_venta_full_price.toFixed(1)}%`,
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body") {
          // Medal colors for top 3
          if (data.column.index === 0 && data.row.index < 3) {
            data.cell.styles.textColor = AMBER;
            data.cell.styles.fontStyle = "bold";
          }
          // UPT health coloring
          if (data.column.index === 6) {
            const upt = parseFloat(String(data.cell.raw));
            if (upt >= 2.0) data.cell.styles.textColor = GREEN;
            else if (upt < 1.5) data.cell.styles.textColor = RED;
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══════════════════════════════════════════════
  // 4. PARTICIPACION POR LINEA (top 10 + Otros)
  // ═══════════════════════════════════════════════
  if (paretoData.length) {
    y = drawSectionTitle(doc, y, "PARTICIPACION POR LINEA");

    const top10 = paretoData.slice(0, 10);
    const otros = paretoData.slice(10);
    const otrosRow: ParetoRow | null = otros.length > 0 ? {
      categoria: `OTROS (${otros.length} categorias)`,
      unidades: otros.reduce((s, r) => s + (r.unidades ?? 0), 0),
      ingresos: otros.reduce((s, r) => s + (r.ingresos ?? 0), 0),
      pct_participacion: otros.reduce((s, r) => s + (r.pct_participacion ?? 0), 0),
    } : null;

    const tableRows = [...top10, ...(otrosRow ? [otrosRow] : [])];

    // Draw donut chart using simple circles
    const centerX = pageW / 2;
    const donutR = 22;
    y = ensureSpace(doc, y, donutR * 2 + 8);
    const donutY = y + donutR + 2;

    const DONUT_COLORS: [number, number, number][] = [
      [63, 81, 181], [103, 58, 183], [233, 30, 99], [0, 150, 136], [255, 152, 0],
      [76, 175, 80], [33, 150, 243], [156, 39, 176], [255, 193, 7], [121, 85, 72],
      [158, 158, 158],
    ];

    let startAngle = -90;
    tableRows.forEach((r, i) => {
      const pct = r.pct_participacion ?? 0;
      const sweep = (pct / 100) * 360;
      const midAngle = ((startAngle + sweep / 2) * Math.PI) / 180;
      const color = DONUT_COLORS[i % DONUT_COLORS.length];

      // Draw arc segment as filled shape
      doc.setFillColor(...color);
      const segStartRad = (startAngle * Math.PI) / 180;
      const segEndRad = ((startAngle + sweep) * Math.PI) / 180;
      const steps = Math.max(Math.ceil(sweep / 5), 2);
      const points: [number, number][] = [];
      for (let s = 0; s <= steps; s++) {
        const angle = segStartRad + (s / steps) * (segEndRad - segStartRad);
        points.push([centerX + Math.cos(angle) * donutR, donutY + Math.sin(angle) * donutR]);
      }
      for (let s = steps; s >= 0; s--) {
        const angle = segStartRad + (s / steps) * (segEndRad - segStartRad);
        points.push([centerX + Math.cos(angle) * (donutR * 0.5), donutY + Math.sin(angle) * (donutR * 0.5)]);
      }
      if (points.length >= 3) {
        // @ts-ignore
        doc.triangle(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1], "F");
        // For a proper donut we approximate with multiple triangles - simplified approach: draw colored rect as legend
      }

      startAngle += sweep;
    });

    // White center for donut hole
    doc.setFillColor(255, 255, 255);
    doc.circle(centerX, donutY, donutR * 0.5, "F");

    // Legend on the side
    const legendX = margin;
    let legendY = y;
    tableRows.forEach((r, i) => {
      if (i > 10) return;
      const color = DONUT_COLORS[i % DONUT_COLORS.length];
      doc.setFillColor(...color);
      doc.rect(legendX, legendY, 3, 3, "F");
      doc.setFontSize(6);
      doc.setTextColor(60, 60, 60);
      doc.text(`${stripEmoji(r.categoria ?? "-")} (${(r.pct_participacion ?? 0).toFixed(1)}%)`, legendX + 4.5, legendY + 2.5);
      legendY += 4;
    });

    y += donutR * 2 + 8;

    // Table below donut
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Unidades", "% Participacion", "$ Ventas Netas"]],
      body: tableRows.map(r => [
        stripEmoji(r.categoria ?? "-"),
        fmtNum(r.unidades ?? 0),
        `${(r.pct_participacion ?? 0).toFixed(1)}%`,
        fmtCOP(r.ingresos ?? 0),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══════════════════════════════════════════════
  // 5. TOP 20 PRODUCTOS MAS VENDIDOS
  // ═══════════════════════════════════════════════
  if (topProducts.length) {
    y = drawSectionTitle(doc, y, "TOP 20 - PRODUCTOS MAS VENDIDOS");
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: topProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji(r.producto ?? "-"),
        stripEmoji(r.categoria ?? "-"),
        stripEmoji(r.clasificacion ?? "-"),
        fmtNum(r.unidades_vendidas ?? 0),
        fmtCOP(r.precio_prom_venta ?? 0),
        fmtNum(r.stock_disponible ?? 0),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 45 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const text = String(data.cell.raw);
          if (text.includes("Full Price")) data.cell.styles.textColor = GREEN;
          else if (text.includes("Rebajas")) data.cell.styles.textColor = RED;
          else if (text.includes("Promo")) data.cell.styles.textColor = ORANGE;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const product = topProducts[data.row.index];
          if (product?.foto && imageCache.has(product.foto)) {
            try { doc.addImage(imageCache.get(product.foto)!, "JPEG", data.cell.x + 1, data.cell.y + 1, 8, 8); } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══════════════════════════════════════════════
  // 6. BOTTOM 20 PRODUCTOS
  // ═══════════════════════════════════════════════
  if (bottomProducts.length) {
    y = drawSectionTitle(doc, y, "BOTTOM 20 - MENOR ROTACION");
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: bottomProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji(r.producto ?? "-"),
        stripEmoji(r.categoria ?? "-"),
        stripEmoji(r.clasificacion ?? "-"),
        fmtNum(r.unidades_vendidas ?? 0),
        fmtCOP(r.precio_prom_venta ?? 0),
        fmtNum(r.stock_disponible ?? 0),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 45 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const text = String(data.cell.raw);
          if (text.includes("Full Price")) data.cell.styles.textColor = GREEN;
          else if (text.includes("Rebajas")) data.cell.styles.textColor = RED;
          else if (text.includes("Promo")) data.cell.styles.textColor = ORANGE;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const product = bottomProducts[data.row.index];
          if (product?.foto && imageCache.has(product.foto)) {
            try { doc.addImage(imageCache.get(product.foto)!, "JPEG", data.cell.x + 1, data.cell.y + 1, 8, 8); } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══════════════════════════════════════════════
  // 7. PANEL DE ACCIONABLES
  // ═══════════════════════════════════════════════
  y = drawAccionablesPanel(doc, y, kpis, kpisPrev, discountAlerts, stockoutData);

  addFooters(doc, dateStr);
  const safeName = titulo.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`${safeName}_${effectiveDays}d.pdf`);
}

/* ─────────────────────────────────────────────────
   REPORT 2: SALUD DE PRODUCTO - RIESGO DE AGOTADOS
   ───────────────────────────────────────────────── */
async function generateHealthReport(days: number) {
  const effectiveDays = resolveDays(days);
  const [healthRes, logoB64] = await Promise.all([
    supabase.rpc("reporte_comportamiento_producto", { dias_atras: effectiveDays }),
    getLogoBase64(),
  ]);

  const healthData = ((healthRes.data ?? []) as unknown as AlertRow[])
    .filter(r => r.estado_salud?.includes("RIESGO"))
    .sort((a, b) => (a.wos ?? 0) - (b.wos ?? 0));

  const imageCache = new Map<string, string>();
  await prefetchImages(healthData.slice(0, 50), imageCache, 50);

  const doc = createDoc();
  const margin = 14;
  const titulo = "SALUD DE PRODUCTO - RIESGO DE AGOTADOS";
  const dateStr = drawHeader(doc, logoB64, titulo, effectiveDays);
  let y = 36;

  y = drawSectionTitle(doc, y, `${healthData.length} PRODUCTOS EN RIESGO DE AGOTADO`);

  if (healthData.length) {
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "SKU", "Categoria", "Uds Vend.", "Stock Total", "WOS", "Sell-Through"]],
      body: healthData.slice(0, 50).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji(r.producto ?? "-"),
        (r.sku ?? "-"),
        stripEmoji(r.categoria ?? "-"),
        fmtNum(r.und_vendidas ?? 0),
        fmtNum((r.stock_tiendas ?? 0) + (r.stock_digital ?? 0)),
        (r.wos ?? 0).toFixed(1),
        `${(r.sell_through_pct ?? 0).toFixed(1)}%`,
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: RED as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const product = healthData[data.row.index];
          if (product?.foto && imageCache.has(product.foto)) {
            try { doc.addImage(imageCache.get(product.foto)!, "JPEG", data.cell.x + 1, data.cell.y + 1, 8, 8); } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("No hay productos en riesgo de agotado en el periodo seleccionado.", margin, y + 5);
  }

  addFooters(doc, dateStr);
  doc.save(`Salud_Producto_Riesgo_${effectiveDays}d.pdf`);
}

/* ─────────────────────────────────────────────────
   REPORT 3: RECOMENDACIONES DE TRASLADO DE STOCK
   ───────────────────────────────────────────────── */
async function generateTransferReport(days: number) {
  const effectiveDays = resolveDays(days);
  const [transferRes, logoB64] = await Promise.all([
    supabase.rpc("reporte_sugerencias_traslado", { dias_atras: effectiveDays }),
    getLogoBase64(),
  ]);

  const transferData = (transferRes.data ?? []) as unknown as TransferRow[];
  const imageCache = new Map<string, string>();
  await prefetchImages(transferData.slice(0, 50), imageCache, 50);

  const doc = createDoc();
  const margin = 14;
  const titulo = "RECOMENDACIONES DE TRASLADO DE STOCK";
  const dateStr = drawHeader(doc, logoB64, titulo, effectiveDays);
  let y = 36;

  y = drawSectionTitle(doc, y, `${transferData.length} TRASLADOS SUGERIDOS`);

  if (transferData.length) {
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "SKU", "Origen", "Stock Orig.", "Destino", "Uds Sugeridas", "Accion"]],
      body: transferData.slice(0, 60).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji(r.producto ?? "-"),
        (r.sku ?? "-"),
        (r.tienda_origen ?? "-"),
        fmtNum(r.stock_origen ?? 0),
        (r.tienda_destino ?? "-"),
        fmtNum(r.uds_sugeridas ?? 0),
        stripEmoji(r.accion ?? "-"),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5, minCellHeight: 10 },
      headStyles: { fillColor: BLUE as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
      alternateRowStyles: { fillColor: [238, 242, 255] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const item = transferData[data.row.index];
          if (item?.foto && imageCache.has(item.foto)) {
            try { doc.addImage(imageCache.get(item.foto)!, "JPEG", data.cell.x + 1, data.cell.y + 1, 8, 8); } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("No hay traslados sugeridos para el periodo seleccionado.", margin, y + 5);
  }

  addFooters(doc, dateStr);
  doc.save(`Traslados_Stock_${effectiveDays}d.pdf`);
}

/* ── Component ── */
type ReportTypeOption = "completo" | "canal" | "tienda" | "zona" | "salud" | "traslados";

interface ReportGeneratorProps {
  days: number;
}

export function ReportGeneratorButton({ days }: ReportGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportTypeOption>("completo");
  const [canal, setCanal] = useState("tiendas");
  const [locationId, setLocationId] = useState("");
  const [selectedZona, setSelectedZona] = useState("");
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [zones, setZones] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if ((reportType === "tienda" || reportType === "zona") && locations.length === 0) {
      supabase.from("locations").select("location_id, name, zona, dimension_m2").eq("is_active", true).order("name")
        .then(({ data }) => {
          if (data) {
            setLocations(data as LocationItem[]);
            const uniqueZones = [...new Set(data.map(l => l.zona).filter(Boolean))] as string[];
            setZones(uniqueZones.sort());
          }
        });
    }
  }, [reportType, locations.length]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      if (reportType === "salud") {
        await generateHealthReport(days);
      } else if (reportType === "traslados") {
        await generateTransferReport(days);
      } else if (reportType === "zona") {
        await generateExecutiveReport(days, "zona", undefined, undefined, undefined, selectedZona);
      } else {
        const loc = locations.find(l => l.location_id === locationId);
        await generateExecutiveReport(
          days,
          reportType as "completo" | "canal" | "tienda",
          reportType === "canal" ? canal : undefined,
          reportType === "tienda" ? locationId : undefined,
          reportType === "tienda" ? loc?.name : undefined,
        );
      }
    } catch (err) {
      console.error("Error generating report:", err);
    }
    setGenerating(false);
    setOpen(false);
  };

  const needsLocation = reportType === "tienda" && !locationId;
  const needsZona = reportType === "zona" && !selectedZona;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
      >
        <FileText className="h-4 w-4" />
        Generar Informe
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Generar Informe</DialogTitle>
            <DialogDescription>Selecciona el tipo de informe y descargalo en PDF</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tipo de informe</label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as ReportTypeOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="completo">Informe Ejecutivo Completo</SelectItem>
                  <SelectItem value="canal">Informe Ejecutivo por Canal</SelectItem>
                  <SelectItem value="tienda">Informe Ejecutivo por Tienda</SelectItem>
                  <SelectItem value="zona">Informe Ejecutivo por Zona</SelectItem>
                  <SelectItem value="salud">Salud de Producto - Riesgo de Agotados</SelectItem>
                  <SelectItem value="traslados">Recomendaciones de Traslado de Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportType === "canal" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Canal</label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50">
                    <SelectItem value="tiendas">Tiendas de Linea</SelectItem>
                    <SelectItem value="outlets">Outlets</SelectItem>
                    <SelectItem value="digital">Digital</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportType === "zona" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Zona</label>
                <Select value={selectedZona} onValueChange={setSelectedZona}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar zona..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50 max-h-[200px]">
                    {zones.map(z => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportType === "tienda" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tienda</label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tienda..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50 max-h-[200px]">
                    {locations.map(loc => (
                      <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={generating || needsLocation || needsZona}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Descargar PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
