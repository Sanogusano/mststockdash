import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface DetalleTiendaPdfRow {
  zona: string | null;
  tienda: string;
  es_bodega: boolean;
  dias_en_tienda: number | null;
  semanas_en_tienda: number | null;
  recibido: number;
  und_vendidas: number;
  und_vendidas_vida: number;
  ritmo_semanal: number | null;
  pct_full: number | null;
  pct_rebaja: number | null;
  pct_promo: number | null;
  stock_actual: number;
  st_120d: number | null;
  st_acum: number | null;
  wos: number | null;
  estado_salud: string;
}

export interface DetalleTiendaPdfParams {
  producto: string;
  foto?: string | null;
  coleccion?: string | null;
  categoria?: string | null;
  periodoLabel: string;
  filtrosLabel: string;
  rows: DetalleTiendaPdfRow[];
}

type RGB = [number, number, number];
const DARK: RGB = [20, 20, 20];
const MUTED: RGB = [115, 115, 115];
const GREEN: RGB = [16, 185, 129];
const BLUE: RGB = [59, 130, 246];
const ORANGE: RGB = [249, 115, 22];
const BODEGA_BG: RGB = [243, 244, 246];
const SEP_BG: RGB = [229, 231, 235];

const n = (v: unknown) => Number(v) || 0;
const fmt = (v: unknown) => n(v).toLocaleString("es-CO");

/** Quita emojis y caracteres que las fuentes base de jsPDF no soportan. */
export function stripEmojis(s: string | null | undefined): string {
  return (s || "")
    .replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/[^\x20-\xFF–—·]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function saludColors(estado: string): { bg: RGB; fg: RGB } {
  const e = stripEmojis(estado).toUpperCase();
  if (e.includes("SOBRESTOCK")) return { bg: [220, 38, 38], fg: [255, 255, 255] };
  if (e.includes("RIESGO") || e.includes("AGOTAD")) return { bg: [249, 115, 22], fg: [255, 255, 255] };
  if (e.includes("ÓPTIMO") || e.includes("OPTIMO")) return { bg: [16, 163, 74], fg: [255, 255, 255] };
  if (e.includes("ESTANCADO")) return { bg: [64, 64, 64], fg: [255, 255, 255] };
  if (e.includes("BODEGA")) return { bg: [229, 231, 235], fg: [64, 64, 64] };
  return { bg: [229, 231, 235], fg: [64, 64, 64] };
}

export function buildDetalleTiendaFileName(producto: string, date = new Date()): string {
  const name = stripEmojis(producto)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "PRODUCTO";
  const ymd = date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return `Detalle_Tiendas_${name}_${ymd}.pdf`;
}

/** Agrupa por zona (orden de aparición) y deja bodegas al final. */
export function groupRows(rows: DetalleTiendaPdfRow[]): { zona: string; rows: DetalleTiendaPdfRow[] }[] {
  const groups = new Map<string, DetalleTiendaPdfRow[]>();
  const bodegas: DetalleTiendaPdfRow[] = [];
  for (const r of rows) {
    if (r.es_bodega) { bodegas.push(r); continue; }
    const z = r.zona?.trim() || "Sin zona";
    groups.set(z, [...(groups.get(z) ?? []), r]);
  }
  const out = [...groups.entries()].map(([zona, rows]) => ({ zona, rows }));
  if (bodegas.length) out.push({ zona: "Bodegas", rows: bodegas });
  return out;
}

export function computeSummary(rows: DetalleTiendaPdfRow[]) {
  const tiendas = rows.filter((r) => !r.es_bodega);
  const recibido = tiendas.reduce((s, r) => s + n(r.recibido), 0);
  const vendidas = tiendas.reduce((s, r) => s + n(r.und_vendidas), 0);
  const vida = tiendas.reduce((s, r) => s + n(r.und_vendidas_vida), 0);
  const stockTiendas = tiendas.reduce((s, r) => s + n(r.stock_actual), 0);
  const stockBodegas = rows.filter((r) => r.es_bodega).reduce((s, r) => s + n(r.stock_actual), 0);
  return {
    recibido, vendidas, vida, stockTiendas, stockBodegas,
    stockTotal: stockTiendas + stockBodegas,
    stAcum: recibido > 0 ? (vida / recibido) * 100 : null,
  };
}

function loadImage(url: string | null | undefined, px = 300): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(t);
      try {
        const c = document.createElement("canvas");
        c.width = px; c.height = px;
        const ctx = c.getContext("2d");
        if (!ctx || !img.naturalWidth) return resolve(null);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, px, px);
        const s = Math.min(px / img.naturalWidth, px / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.drawImage(img, (px - w) / 2, (px - h) / 2, w, h);
        resolve(c.toDataURL("image/jpeg", 0.9));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(n(v))}%`);

export async function exportDetalleTiendaPDF(p: DetalleTiendaPdfParams) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setCharSpace(0);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 10;

  // Banda
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text("MONASTERY", M, 8);

  // Foto
  const imgY = 16, IMG = 28;
  const img = await loadImage(p.foto);
  doc.setDrawColor(220, 220, 220);
  if (img) {
    doc.setFillColor(255, 255, 255);
    doc.rect(M, imgY, IMG, IMG, "FD");
    doc.addImage(img, "JPEG", M, imgY, IMG, IMG);
  } else {
    doc.setFillColor(229, 231, 235);
    doc.rect(M, imgY, IMG, IMG, "F");
    doc.setTextColor(...MUTED); doc.setFontSize(20);
    doc.text((stripEmojis(p.producto)[0] ?? "?").toUpperCase(), M + IMG / 2, imgY + IMG / 2, { align: "center", baseline: "middle" });
  }

  const tx = M + IMG + 6;
  const maxTW = W - tx - M;
  doc.setTextColor(...DARK); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(doc.splitTextToSize(stripEmojis(p.producto), maxTW)[0], tx, imgY + 6);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  const sub = [p.coleccion, p.categoria].map((s) => stripEmojis(s)).filter(Boolean).join(" · ");
  if (sub) doc.text(sub, tx, imgY + 12);
  doc.setTextColor(...DARK);
  doc.text(`Periodo: ${stripEmojis(p.periodoLabel)}`, tx, imgY + 18);
  doc.text(doc.splitTextToSize(`Filtros: ${stripEmojis(p.filtrosLabel)}`, maxTW)[0], tx, imgY + 23);
  doc.setTextColor(...MUTED);
  const gen = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });
  doc.text(`Generado: ${gen}`, tx, imgY + 28);

  // Tarjetas
  const s = computeSummary(p.rows);
  const cards: [string, string, string?][] = [
    ["Recibido total", fmt(s.recibido)],
    ["Vendidas en el periodo", fmt(s.vendidas)],
    ["Vendidas de vida", fmt(s.vida)],
    ["Stock total", fmt(s.stockTotal), `Tiendas ${fmt(s.stockTiendas)} · Bodegas ${fmt(s.stockBodegas)}`],
    ["ST acumulado ponderado", s.stAcum == null ? "—" : `${s.stAcum.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`, "Vendidas de vida / recibido"],
  ];
  const cy = imgY + IMG + 5, gap = 4, cw = (W - 2 * M - gap * 4) / 5, ch = 18;
  cards.forEach(([label, value, note], i) => {
    const x = M + i * (cw + gap);
    doc.setDrawColor(220, 220, 220); doc.setFillColor(250, 250, 250);
    doc.roundedRect(x, cy, cw, ch, 2, 2, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, cy + 5);
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...DARK);
    doc.text(value, x + 3, cy + 12);
    if (note) { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(note, x + 3, cy + 16); }
  });

  // Tabla
  type Meta = { kind: "sep" | "row" | "total"; row?: DetalleTiendaPdfRow };
  const metas: Meta[] = [];
  const body: any[] = [];
  for (const g of groupRows(p.rows)) {
    metas.push({ kind: "sep" });
    body.push([{ content: g.zona, colSpan: 12, styles: { fillColor: SEP_BG, fontStyle: "bold", textColor: DARK } }]);
    for (const r of g.rows) {
      metas.push({ kind: "row", row: r });
      const b = r.es_bodega;
      const tiempo = b || (r.semanas_en_tienda == null && r.dias_en_tienda == null)
        ? "—" : `${Math.floor(n(r.semanas_en_tienda))} sem · ${Math.floor(n(r.dias_en_tienda))} d`;
      body.push([
        stripEmojis(r.tienda), tiempo,
        b ? "—" : fmt(r.recibido), b ? "—" : fmt(r.und_vendidas), b ? "—" : fmt(r.und_vendidas_vida),
        b || r.ritmo_semanal == null ? "—" : n(r.ritmo_semanal).toLocaleString("es-CO", { maximumFractionDigits: 2 }),
        "", fmt(r.stock_actual),
        b ? "—" : fmtPct(r.st_120d), b ? "—" : fmtPct(r.st_acum),
        b ? "—" : r.wos == null ? "Sin rot." : fmt(r.wos),
        "",
      ]);
    }
  }
  metas.push({ kind: "total" });
  body.push(["Total", "", fmt(s.recibido), fmt(s.vendidas), fmt(s.vida), "", "", fmt(s.stockTotal), "", "", "", ""]);

  const right = { halign: "right" as const };
  autoTable(doc, {
    startY: cy + ch + 5,
    margin: { left: M, right: M, bottom: 14, top: 14 },
    head: [["Tienda", "Tiempo", "Recibido", "Und.", "Vida", "RDV", "Composición", "Stock", "ST 120d", "ST acum.", "WOS", "Salud"]],
    body,
    theme: "plain",
    rowPageBreak: "avoid",
    showHead: "everyPage",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.8, textColor: DARK, valign: "middle", minCellHeight: 9 },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 46, fontStyle: "bold" }, 1: { cellWidth: 24 },
      2: { ...right, cellWidth: 17 }, 3: { ...right, cellWidth: 14 }, 4: { ...right, cellWidth: 14 },
      5: { ...right, cellWidth: 14 }, 6: { cellWidth: 52 }, 7: { ...right, cellWidth: 15 },
      8: { ...right, cellWidth: 15 }, 9: { ...right, cellWidth: 16 }, 10: { ...right, cellWidth: 15 },
      11: { cellWidth: "auto" },
    },
    didParseCell: (d) => {
      if (d.section !== "body") return;
      const m = metas[d.row.index];
      if (m?.kind === "row" && m.row?.es_bodega) d.cell.styles.fillColor = BODEGA_BG;
      if (m?.kind === "total") { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [250, 250, 250]; d.cell.styles.lineWidth = { top: 0.4 } as any; d.cell.styles.lineColor = DARK; }
    },
    didDrawCell: (d) => {
      if (d.section !== "body") return;
      const m = metas[d.row.index];
      if (m?.kind !== "row" || !m.row) return;
      const r = m.row;
      const { x, y, width, height } = d.cell;
      if (d.column.index === 6 && !r.es_bodega) {
        const segs: [string, number, RGB][] = [["Full", n(r.pct_full), GREEN], ["Reb.", n(r.pct_rebaja), BLUE], ["Promo", n(r.pct_promo), ORANGE]];
        const sw = (width - 4) / 3;
        segs.forEach(([lbl, v, col], i) => {
          const bx = x + 1.5 + i * (sw + 0.5);
          doc.setFillColor(235, 235, 235); doc.rect(bx, y + 2, sw - 1, 1.6, "F");
          doc.setFillColor(...col); doc.rect(bx, y + 2, (sw - 1) * Math.min(Math.max(v, 0), 100) / 100, 1.6, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...col);
          doc.text(`${lbl} ${Math.round(v)}%`, bx, y + height - 2);
        });
      } else if (d.column.index === 6) {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
        doc.text("—", x + 2, y + height / 2, { baseline: "middle" });
      }
      if (d.column.index === 11) {
        const t = stripEmojis(r.estado_salud) || "—";
        const c = saludColors(r.estado_salud);
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
        let txt = t;
        while (txt.length > 3 && doc.getTextWidth(txt) + 4 > width - 2) txt = txt.slice(0, -2) + "…";
        const pw = doc.getTextWidth(txt) + 4, ph = 4.6;
        doc.setFillColor(...c.bg);
        doc.roundedRect(x + 1, y + (height - ph) / 2, pw, ph, ph / 2, ph / 2, "F");
        doc.setTextColor(...c.fg);
        doc.text(txt, x + 3, y + height / 2, { baseline: "middle" });
      }
    },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`MONASTERY · Informe confidencial · Página ${i} de ${pages}`, W / 2, H - 6, { align: "center" });
  }
  doc.save(buildDetalleTiendaFileName(p.producto));
}
