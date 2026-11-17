import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtVentaNeta } from "@/lib/venta-neta-format";

export interface DesempenoPdfRow {
  foto: string;
  producto: string;
  categoria: string;
  coleccion?: string | null;
  und_tiendas: number;
  und_outlets: number;
  und_digital: number;
  und_total: number;
  pct_full_price: number;
  pct_rebajas: number;
  pct_descuento: number;
  clasificacion: string;
  stock_tiendas?: number | null;
  stock_online?: number | null;
  stock_standby?: number | null;
  stock_mayoristas?: number | null;
  semanas_vida?: number | null;
  venta_neta?: number | null;
}

export interface DesempenoPdfKpis {
  unidades: number;
  referencias: number;
  venta_neta: number;
  inventario_total: number;
  stock_tiendas: number;
  stock_online: number;
  stock_standby: number;
  stock_mayoristas: number;
}

export interface DesempenoPdfParams {
  rows: DesempenoPdfRow[];
  periodoLabel: string;
  filtrosLabel: string;
  kpis: DesempenoPdfKpis;
}

type RGB = [number, number, number];
const GREEN: RGB = [16, 185, 129];
const BLUE: RGB = [59, 130, 246];
const ORANGE: RGB = [245, 158, 11];
const PROMO: RGB = [249, 115, 22];
const VIOLET: RGB = [139, 92, 246];
const DARK: RGB = [20, 20, 20];
const MUTED: RGB = [115, 115, 115];
const ALT_ROW: RGB = [248, 248, 250];
const SEMANAS_VENTANA = 17;
const IMG_PX = 240;
const IMG_MM = 14;
const ROW_H = 18;
const MAX_PARALLEL = 6;

const n = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown) => n(v).toLocaleString("es-CO");

/** jsPDF core fonts can't render emoji / non-Latin1 chars. */
export function cleanText(s: string | null | undefined): string {
  return (s || "")
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[^\x20-\xFF–—·]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPdfFileName(periodoLabel: string, date = new Date()): string {
  const periodo = cleanText(periodoLabel)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "Periodo";
  const ymd = date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return `Top_Productos_${periodo}_${ymd}.pdf`;
}

function clasifColors(c: string): { bg: RGB; fg: RGB } {
  if (c.includes("Sin ventas")) return { bg: [240, 240, 240], fg: MUTED };
  if (c.includes("Full Price")) return { bg: [220, 246, 236], fg: [5, 150, 105] };
  if (c.includes("Rebajas")) return { bg: [224, 235, 254], fg: [37, 99, 235] };
  return { bg: [254, 234, 220], fg: [234, 88, 12] };
}

function loadImage(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const timeout = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = IMG_PX;
        canvas.height = IMG_PX;
        const ctx = canvas.getContext("2d");
        if (!ctx || !img.naturalWidth) return resolve(null);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, IMG_PX, IMG_PX);
        const scale = Math.min(IMG_PX / img.naturalWidth, IMG_PX / img.naturalHeight); // contain
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (IMG_PX - w) / 2, (IMG_PX - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(timeout); resolve(null); };
    img.src = url;
  });
}

async function loadAll(urls: string[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      out[i] = await loadImage(urls[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, urls.length) }, worker));
  return out;
}

function pill(doc: jsPDF, text: string, x: number, y: number, bg: RGB, fg: RGB, size = 7.5, maxW?: number) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  let t = text;
  if (maxW) while (t.length > 3 && doc.getTextWidth(t) + 4 > maxW) t = t.slice(0, -2) + "…";
  const w = doc.getTextWidth(t) + 4;
  const h = size * 0.3528 + 2;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F");
  doc.setTextColor(...fg);
  doc.text(t, x + 2, y + h / 2, { baseline: "middle" });
}

export async function exportDesempenoPDF({ rows, periodoLabel, filtrosLabel, kpis }: DesempenoPdfParams) {
  if (!rows.length) return;
  const images = await loadAll(rows.map((r) => r.foto));

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 10;

  // ── Header ──
  doc.setFillColor(...DARK);
  doc.rect(0, 0, pageW, 12, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("MONASTERY", M, 8);

  doc.setTextColor(...DARK);
  doc.setFontSize(16);
  doc.text("Top Productos — Venta Directa", M, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Ranking por unidades vendidas, mezcla de precios y stock actualizado", M, 28);

  const generado = new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(cleanText(periodoLabel), pageW - M, 19, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(cleanText(filtrosLabel), pageW - M, 24, { align: "right" });
  doc.text(`Generado: ${cleanText(generado)}`, pageW - M, 29, { align: "right" });

  // ── KPI cards ──
  const cardY = 34, cardH = 34, gap = 6;
  const cardW = (pageW - 2 * M - gap) / 2;
  const card = (x: number) => {
    doc.setDrawColor(225, 225, 230);
    doc.setLineWidth(0.2);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "FD");
  };
  card(M);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("UNIDADES VENDIDAS — UNIVERSO FILTRADO", M + 5, cardY + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  doc.text(fmt(kpis.unidades), M + 5, cardY + 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${fmt(kpis.referencias)} referencias`, M + 5, cardY + 27);

  const cardRight = M + cardW - 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text("VENTA NETA — UNIVERSO FILTRADO", cardRight, cardY + 7, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text(fmtVentaNeta(kpis.venta_neta), cardRight, cardY + 19, { align: "right" });

  const x2 = M + cardW + gap;
  card(x2);
  doc.setFontSize(7.5);
  doc.text("INVENTARIO — UNIVERSO FILTRADO", x2 + 5, cardY + 7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...DARK);
  doc.text(fmt(kpis.inventario_total), x2 + 5, cardY + 15);
  const blocks: { label: string; value: number; color: RGB }[] = [
    { label: "Tiendas", value: n(kpis.stock_tiendas), color: GREEN },
    { label: "Online", value: n(kpis.stock_online), color: BLUE },
    { label: "Stand By", value: n(kpis.stock_standby), color: ORANGE },
    { label: "Mayoristas", value: n(kpis.stock_mayoristas), color: VIOLET },
  ];
  const sum = blocks.reduce((s, b) => s + b.value, 0);
  const innerW = cardW - 10;
  const colW = innerW / 4;
  blocks.forEach((b, i) => {
    const bx = x2 + 5 + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...b.color);
    doc.text(b.label, bx, cardY + 20.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(fmt(b.value), bx, cardY + 25);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const pct = sum > 0 ? Math.round((b.value / sum) * 100) : 0;
    doc.text(`${pct}%`, bx + doc.getTextWidth(fmt(b.value)) * (10 / 7.5) + 2, cardY + 25);
  });
  let bx = x2 + 5;
  doc.setFillColor(235, 235, 238);
  doc.roundedRect(bx, cardY + 28, innerW, 2.5, 1, 1, "F");
  if (sum > 0) {
    blocks.forEach((b) => {
      const w = (b.value / sum) * innerW;
      if (w <= 0) return;
      doc.setFillColor(...b.color);
      doc.rect(bx, cardY + 28, w, 2.5, "F");
      bx += w;
    });
  }

  // ── Table ──
  const body = rows.map((r, i) => [String(i + 1), "", cleanText(r.categoria), "", "", "", ""]);
  autoTable(doc, {
    startY: cardY + cardH + 6,
    head: [["#", "Producto", "Categoría", "Ventas", "Mezcla de precios", "Clasificación", "Inventario"]],
    body,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    margin: { left: M, right: M, top: 12, bottom: 12 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.5,
      textColor: [50, 50, 50],
      lineColor: [230, 230, 233],
      lineWidth: 0.1,
      minCellHeight: ROW_H,
      valign: "middle",
    },
    headStyles: { fillColor: [40, 40, 45], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8, minCellHeight: 8 },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 74 },
      2: { cellWidth: 28 },
      3: { cellWidth: 42 },
      4: { cellWidth: 44 },
      5: { cellWidth: 38 },
      6: { cellWidth: 43 },
    },
    didDrawCell: (h) => {
      if (h.section !== "body") return;
      const r = rows[h.row.index];
      if (!r) return;
      const { x, y, width, height } = h.cell;
      const col = h.column.index;

      if (col === 1) {
        const ix = x + 1.5, iy = y + (height - IMG_MM) / 2;
        const img = images[h.row.index];
        if (img) {
          try { doc.addImage(img, "JPEG", ix, iy, IMG_MM, IMG_MM); } catch { /* ignore */ }
        } else {
          doc.setFillColor(225, 225, 228);
          doc.roundedRect(ix, iy, IMG_MM, IMG_MM, 1, 1, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.setTextColor(...MUTED);
          doc.text((cleanText(r.producto).charAt(0) || "?").toUpperCase(), ix + IMG_MM / 2, iy + IMG_MM / 2, { align: "center", baseline: "middle" });
        }
        const tx = ix + IMG_MM + 2.5;
        const tw = x + width - tx - 1.5;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...DARK);
        let lines = doc.splitTextToSize(cleanText(r.producto), tw) as string[];
        if (lines.length > 2) {
          let l2 = lines[1];
          while (l2.length > 1 && doc.getTextWidth(l2 + "…") > tw) l2 = l2.slice(0, -1);
          lines = [lines[0], l2 + "…"];
        }
        const top = y + 3.5;
        doc.text(lines, tx, top + 2.5, { lineHeightFactor: 1.15 });
        const sem = r.semanas_vida != null ? ` · sem ${r.semanas_vida}/${SEMANAS_VENTANA}` : "";
        pill(doc, `${cleanText(r.coleccion) || "Otros"}${sem}`, tx, top + 2.5 + lines.length * 3.8, [238, 238, 241], [70, 70, 75], 7.5, tw);
      }

      if (col === 3) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...DARK);
        doc.text(fmt(r.und_total), x + 2, y + 6);
        doc.setFontSize(9);
        doc.text(fmtVentaNeta(r.venta_neta), x + 2, y + 10.5);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        const det = `Tiendas ${fmt(r.und_tiendas)} · Outlet ${fmt(r.und_outlets)} · Online ${fmt(r.und_digital)}`;
        doc.text(doc.splitTextToSize(det, width - 4) as string[], x + 2, y + 14.2);
      }

      if (col === 4) {
        const bars: [number, RGB][] = [[n(r.pct_full_price), GREEN], [n(r.pct_rebajas), BLUE], [n(r.pct_descuento), PROMO]];
        const barW = width - 16;
        bars.forEach(([pct, color], i) => {
          const by = y + height / 2 - 5 + i * 4.5;
          doc.setFillColor(232, 232, 236);
          doc.roundedRect(x + 2, by, barW, 2.2, 1, 1, "F");
          if (pct > 0) {
            doc.setFillColor(...color);
            doc.roundedRect(x + 2, by, Math.max((barW * Math.min(pct, 100)) / 100, 1), 2.2, 1, 1, "F");
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(...color);
          doc.text(`${Math.round(pct)}%`, x + width - 2, by + 1.1, { align: "right", baseline: "middle" });
        });
      }

      if (col === 5) {
        const c = cleanText(r.clasificacion);
        if (c) {
          const { bg, fg } = clasifColors(c);
          pill(doc, c, x + 2, y + height / 2 - 2.3, bg, fg, 7.5, width - 4);
        }
      }

      if (col === 6) {
        const tie = n(r.stock_tiendas), onl = n(r.stock_online), sb = n(r.stock_standby), may = n(r.stock_mayoristas);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...DARK);
        doc.text(fmt(tie + onl + sb + may), x + 2, y + height / 2 - 1);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(doc.splitTextToSize(`Tie ${fmt(tie)} · Onl ${fmt(onl)} · SB ${fmt(sb)} · May ${fmt(may)}`, width - 4) as string[], x + 2, y + height / 2 + 3.5);
      }
    },
  });

  // ── Footer ──
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`MONASTERY · Informe confidencial · Página ${i} de ${total}`, pageW / 2, pageH - 5, { align: "center" });
  }

  doc.save(buildPdfFileName(periodoLabel));
}
