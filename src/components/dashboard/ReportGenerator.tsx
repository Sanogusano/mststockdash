import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays } from "./TimeFilter";
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

interface Location {
  location_id: string;
  name: string;
}

/* ── Constants ── */
const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtNum = (v: number) => v.toLocaleString("es-CO");

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

/* ─────────────────────────────────────────────────
   REPORT 1: EXECUTIVE REPORT
   ───────────────────────────────────────────────── */
async function generateExecutiveReport(
  days: number,
  reportType: "completo" | "canal" | "tienda",
  canal?: string,
  locationId?: string,
  locationName?: string,
) {
  const effectiveDays = resolveDays(days);
  let titulo = "DESEMPENO COMERCIAL - Venta Directa";
  if (reportType === "canal" && canal) {
    const canalLabel = canal === "tiendas" ? "Tiendas de Linea" : canal === "outlets" ? "Outlets" : "Digital";
    titulo = `DESEMPENO COMERCIAL - ${canalLabel}`;
  } else if (reportType === "tienda" && locationName) {
    titulo = `DESEMPENO COMERCIAL - ${stripEmoji(locationName)}`;
  }

  const canalParam = reportType === "canal" ? canal ?? null : null;
  const locationParam = reportType === "tienda" ? locationId ?? null : null;

  // Fetch data
  const canalFiltro = reportType === "canal" ? (canal === "tiendas" || canal === "outlets" ? "POS" : "DIGITAL") : null;
  const fetchPromises: PromiseLike<any>[] = [
    supabase.rpc("reporte_kpis_comerciales", { dias_atras: effectiveDays, p_canal: canalParam, p_location_id: locationParam }) as any,
    supabase.rpc("reporte_pareto_categorias" as any, { dias_atras: effectiveDays, p_canal: canalParam ?? "", p_location_id: locationParam }) as any,
    supabase.rpc("reporte_ejecutivo_productos", { dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locationParam, orden: "TOP", limite: 20 }) as any,
    supabase.rpc("reporte_ejecutivo_productos", { dias_atras: effectiveDays, canal_filtro: canalFiltro, location_filtro: locationParam, orden: "BOTTOM", limite: 20 }) as any,
    supabase.rpc("reporte_desempeno_por_linea" as any, { dias_atras: effectiveDays, p_canal: canalParam }) as any,
    getLogoBase64(),
  ];

  // Fetch metricas tienda individual if we have a location
  if (locationParam) {
    fetchPromises.push(supabase.rpc("reporte_metricas_tienda_individual", { dias_atras: effectiveDays, p_location_id: locationParam }) as any);
  }

  const results = await Promise.all(fetchPromises);
  const [kpiRes, paretoRes, topRes, bottomRes, lineaRes] = results;
  const logoB64 = results[5] as string;
  const metricasData = locationParam ? (results[6]?.data?.[0] as unknown as MetricasData | null) : null;

  const kpis = kpiRes.data?.[0] as unknown as KpiData ?? { total_pedidos: 0, unidades_vendidas: 0, ingresos_netos: 0, ticket_promedio: 0, upt: 0, pct_pedidos_full_price: 0, pct_pedidos_rebajas: 0, pct_pedidos_con_descuento: 0 };
  const paretoData = (paretoRes.data ?? []) as unknown as ParetoRow[];
  const topProducts = (topRes.data ?? []) as unknown as ProductRow[];
  const bottomProducts = (bottomRes.data ?? []) as unknown as ProductRow[];
  const lineaData = (lineaRes.data ?? []) as unknown as LineaRow[];

  const imageCache = new Map<string, string>();
  await prefetchImages([...topProducts.slice(0, 20), ...bottomProducts.slice(0, 20)], imageCache);

  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const dateStr = drawHeader(doc, logoB64, titulo, effectiveDays);
  let y = 36;

  // ── 1. INDICADORES COMERCIALES ──
  y = drawSectionTitle(doc, y, "INDICADORES COMERCIALES");

  // If we have metricas (tienda), show extended grid
  if (metricasData) {
    const pctChange = (cur: number, prev: number) => {
      if (!prev) return "";
      const pct = ((cur - prev) / prev) * 100;
      return pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`;
    };

    const metricItems = [
      { label: "Mejor Dia", value: stripEmoji(metricasData.mejor_dia_semana ?? "-"), sub: fmtCOP(metricasData.venta_mejor_dia ?? 0), color: GREEN },
      { label: "Peor Dia", value: stripEmoji(metricasData.peor_dia_semana ?? "-"), sub: fmtCOP(metricasData.venta_peor_dia ?? 0), color: RED },
      { label: "Prom. Lun-Vie", value: fmtCOP(metricasData.venta_promedio_semana ?? 0), sub: "", color: BLACK },
      { label: "Prom. Sab-Dom", value: fmtCOP(metricasData.venta_promedio_finde ?? 0), sub: "", color: BLACK },
    ];

    const colW = (pageW - 2 * margin) / 4;
    y = ensureSpace(doc, y, 22);
    metricItems.forEach((item, i) => {
      const x = margin + i * colW;
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(x, y, colW - 2, 18, 2, 2, "F");
      doc.setDrawColor(220, 220, 230);
      doc.roundedRect(x, y, colW - 2, 18, 2, 2, "S");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(item.label, x + 3, y + 5);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(item.color as [number, number, number]));
      doc.text(item.value, x + 3, y + 11.5);
      if (item.sub) {
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...GRAY);
        doc.text(item.sub, x + 3, y + 15.5);
      }
    });
    y += 22;

    // Row 2: Venta Prom/Dia, Pedidos Prom/Dia, Uds Prom/Dia
    const row2Items = [
      { label: "Venta Prom./Dia", value: fmtCOP(metricasData.venta_promedio_diaria_actual ?? 0), change: pctChange(metricasData.venta_promedio_diaria_actual, metricasData.venta_promedio_diaria_anterior) },
      { label: "Pedidos Prom./Dia", value: fmtNum(Math.round(metricasData.pedidos_promedio_diario_actual ?? 0)), change: pctChange(metricasData.pedidos_promedio_diario_actual, metricasData.pedidos_promedio_diario_anterior) },
      { label: "Uds Prom./Dia", value: fmtNum(Math.round(metricasData.unidades_promedio_diario_actual ?? 0)), change: pctChange(metricasData.unidades_promedio_diario_actual, metricasData.unidades_promedio_diario_anterior) },
    ];
    const col3W = (pageW - 2 * margin) / 3;
    y = ensureSpace(doc, y, 22);
    row2Items.forEach((item, i) => {
      const x = margin + i * col3W;
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(x, y, col3W - 2, 18, 2, 2, "F");
      doc.setDrawColor(220, 220, 230);
      doc.roundedRect(x, y, col3W - 2, 18, 2, 2, "S");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(item.label, x + 3, y + 5);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...BLACK);
      doc.text(item.value, x + 3, y + 11.5);
      if (item.change) {
        const isPositive = item.change.startsWith("+");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...(isPositive ? GREEN : RED));
        doc.text(item.change, x + 3, y + 15.5);
      }
    });
    y += 22;
  }

  // KPIs row: Ventas Netas, Ticket, UPT + % Full Price, % Rebajas, % Promo
  const kpiItems = [
    { label: "Ventas Netas", value: fmtCOP(kpis.ingresos_netos), color: BLACK },
    { label: "Ticket Promedio", value: fmtCOP(kpis.ticket_promedio), color: BLACK },
    { label: "UPT", value: kpis.upt.toFixed(2), color: BLACK },
    { label: "% Full Price", value: `${kpis.pct_pedidos_full_price.toFixed(1)}%`, color: GREEN },
    { label: "% Rebajas", value: `${kpis.pct_pedidos_rebajas.toFixed(1)}%`, color: RED },
    { label: "% Desc. Promo", value: `${kpis.pct_pedidos_con_descuento.toFixed(1)}%`, color: ORANGE },
  ];

  const kpiColW = (pageW - 2 * margin) / 3;
  y = ensureSpace(doc, y, 40);
  kpiItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + col * kpiColW;
    const boxY = y + row * 18;
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(x, boxY, kpiColW - 2, 16, 2, 2, "F");
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(x, boxY, kpiColW - 2, 16, 2, 2, "S");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(item.label, x + 3, boxY + 5);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(item.color as [number, number, number]));
    doc.text(item.value, x + 3, boxY + 12.5);
  });
  y += 40;

  // ── 2. PARTICIPACIÓN POR LÍNEA ──
  if (paretoData.length) {
    y = drawSectionTitle(doc, y, "PARTICIPACION POR LINEA");
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Unidades", "% Participacion", "$ Ventas Netas"]],
      body: paretoData.slice(0, 15).map(r => [
        stripEmoji((r.categoria ?? "-")).substring(0, 25),
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

  // ── 3. DESEMPEÑO POR LÍNEA (Top 20 + Bottom 20) ──
  if (lineaData.length) {
    // Sort by und_total desc for top, asc for bottom
    const sorted = [...lineaData].sort((a, b) => (b.und_total ?? 0) - (a.und_total ?? 0));
    const top20Lineas = sorted.slice(0, 20);
    const bottom20Lineas = sorted.length > 20 ? sorted.slice(-20).reverse() : [];

    y = drawSectionTitle(doc, y, "DESEMPENO POR LINEA - TOP 20");
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Und. Total", "% Part.", "Sell-Through", "WOS", "Estado"]],
      body: top20Lineas.map(r => [
        stripEmoji((r.categoria ?? "-")).substring(0, 25),
        fmtNum(r.und_total ?? 0),
        `${(r.pct_participacion ?? 0).toFixed(1)}%`,
        `${(r.sell_through_pct ?? 0).toFixed(1)}%`,
        (r.wos ?? 0).toFixed(1),
        stripEmoji(r.estado_salud ?? "-"),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const text = String(data.cell.raw);
          if (text.includes("RIESGO")) data.cell.styles.textColor = RED;
          else if (text.includes("SOBRESTOCK") || text.includes("ESTANCADO")) data.cell.styles.textColor = AMBER;
          else if (text.includes("PTIMO")) data.cell.styles.textColor = GREEN;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;

    if (bottom20Lineas.length) {
      y = drawSectionTitle(doc, y, "DESEMPENO POR LINEA - BOTTOM 20");
      autoTable(doc, {
        startY: y,
        head: [["Categoria", "Und. Total", "% Part.", "Sell-Through", "WOS", "Estado"]],
        body: bottom20Lineas.map(r => [
          stripEmoji((r.categoria ?? "-")).substring(0, 25),
          fmtNum(r.und_total ?? 0),
          `${(r.pct_participacion ?? 0).toFixed(1)}%`,
          `${(r.sell_through_pct ?? 0).toFixed(1)}%`,
          (r.wos ?? 0).toFixed(1),
          stripEmoji(r.estado_salud ?? "-"),
        ]),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
        alternateRowStyles: { fillColor: [254, 242, 242] },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const text = String(data.cell.raw);
            if (text.includes("RIESGO")) data.cell.styles.textColor = RED;
            else if (text.includes("SOBRESTOCK") || text.includes("ESTANCADO")) data.cell.styles.textColor = AMBER;
            else if (text.includes("PTIMO")) data.cell.styles.textColor = GREEN;
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }
  }

  // ── 4. TOP 20 PRODUCTOS ──
  if (topProducts.length) {
    y = drawSectionTitle(doc, y, "TOP 20 - PRODUCTOS MAS VENDIDOS");
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: topProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 35),
        stripEmoji((r.categoria ?? "-")).substring(0, 15),
        stripEmoji(r.clasificacion ?? "-"),
        fmtNum(r.unidades_vendidas ?? 0),
        fmtCOP(r.precio_prom_venta ?? 0),
        fmtNum(r.stock_disponible ?? 0),
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
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

  // ── BOTTOM 20 PRODUCTOS ──
  if (bottomProducts.length) {
    y = drawSectionTitle(doc, y, "BOTTOM 20 - MENOR ROTACION");
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: bottomProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 35),
        stripEmoji((r.categoria ?? "-")).substring(0, 15),
        stripEmoji(r.clasificacion ?? "-"),
        fmtNum(r.unidades_vendidas ?? 0),
        fmtCOP(r.precio_prom_venta ?? 0),
        fmtNum(r.stock_disponible ?? 0),
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
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

  // Summary
  y = drawSectionTitle(doc, y, `${healthData.length} PRODUCTOS EN RIESGO DE AGOTADO`);

  if (healthData.length) {
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "SKU", "Categoria", "Uds Vend.", "Stock Total", "WOS", "Sell-Through"]],
      body: healthData.slice(0, 50).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 30),
        (r.sku ?? "-").substring(0, 15),
        stripEmoji((r.categoria ?? "-")).substring(0, 15),
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
        stripEmoji((r.producto ?? "-")).substring(0, 25),
        (r.sku ?? "-").substring(0, 12),
        (r.tienda_origen ?? "-").substring(0, 15),
        fmtNum(r.stock_origen ?? 0),
        (r.tienda_destino ?? "-").substring(0, 15),
        fmtNum(r.uds_sugeridas ?? 0),
        stripEmoji((r.accion ?? "-")).substring(0, 25),
      ]),
      styles: { fontSize: 6.5, cellPadding: 1.5, minCellHeight: 10 },
      headStyles: { fillColor: [59, 130, 246] as any, textColor: 255, fontStyle: "bold", fontSize: 6.5 },
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
type ReportTypeOption = "completo" | "canal" | "tienda" | "salud" | "traslados";

interface ReportGeneratorProps {
  days: number;
}

export function ReportGeneratorButton({ days }: ReportGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportTypeOption>("completo");
  const [canal, setCanal] = useState("tiendas");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (reportType === "tienda" && locations.length === 0) {
      supabase.from("locations").select("location_id, name").eq("is_active", true).order("name")
        .then(({ data }) => { if (data) setLocations(data as Location[]); });
    }
  }, [reportType, locations.length]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      if (reportType === "salud") {
        await generateHealthReport(days);
      } else if (reportType === "traslados") {
        await generateTransferReport(days);
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
            <Button onClick={handleGenerate} disabled={generating || needsLocation}>
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
