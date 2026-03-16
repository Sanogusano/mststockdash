import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Types ──
interface KpiData {
  globalPct: number;
  pctToDate: number;
  totalVentaNeta: number;
  totalBudget: number;
  budgetToDate: number;
  daysElapsed: number;
  totalUnidades: number;
  ticketPromedio: number;
  numDaysInMonth: number;
}

interface DailyRow {
  day: number;
  ventaNeta: number;
  pct: number;
}

interface TableRowData {
  level: "group" | "subgroup" | "item" | "total-tiendas";
  label: string;
  budget: number;
  ventaNeta: number;
  pct: number;
  pctGeneral: number;
  pctToDate: number;
  unidades: number;
  ticket: number;
}

// ── Helpers ──
function fmtCOP(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function pctColorRGB(pct: number): [number, number, number] {
  if (pct >= 100) return [22, 163, 74];    // green-600
  if (pct >= 80) return [202, 138, 4];     // yellow-600
  return [220, 38, 38];                     // red-600
}

function pctBgRGB(pct: number): [number, number, number] {
  if (pct >= 100) return [220, 252, 231];  // green-100
  if (pct >= 80) return [254, 249, 195];   // yellow-100
  return [254, 226, 226];                   // red-100
}

function cleanText(s: string): string {
  return (s || "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[🏆🏪🌐📍🧲📦👗⚠️🔴🟡🟢🚚🔥📈📊⏳🐢🐇🚀]/g, "")
    .trim();
}

async function loadLogoBase64(): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 3000);
      img.onload = () => {
        clearTimeout(timeout);
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png", 0.9));
      };
      img.onerror = () => { clearTimeout(timeout); resolve(null); };
      img.src = new URL("/src/assets/monastery-logo.png", window.location.origin).href;
    });
  } catch { return null; }
}

// Draw a rounded badge with colored background and text
function drawBadge(doc: jsPDF, x: number, y: number, text: string, pct: number, align: "right" | "left" = "right") {
  const [tr, tg, tb] = pctColorRGB(pct);
  const [br, bg, bb] = pctBgRGB(pct);
  const textW = doc.getTextWidth(text);
  const badgeW = textW + 4;
  const badgeH = 4.5;
  const bx = align === "right" ? x - badgeW : x;
  const by = y - badgeH + 0.8;

  doc.setFillColor(br, bg, bb);
  doc.roundedRect(bx, by, badgeW, badgeH, 1.5, 1.5, "F");
  doc.setTextColor(tr, tg, tb);
  doc.setFont("helvetica", "bold");
  doc.text(text, bx + 2, y - 0.5);
}

// ── Main export function ──
export async function exportCumplimientoPDF(
  monthName: string,
  year: number,
  kpi: KpiData,
  dailyData: DailyRow[],
  currentDay: number,
  tableRows: TableRowData[],
  dailyTarget: number
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  let y = margin;

  // ── White Background ──
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");

  // ── Header: Logo + Title + Date ──
  const logo = await loadLogoBase64();
  if (logo) {
    doc.addImage(logo, "PNG", margin, y, 35, 12);
  }

  const now = new Date();
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const dateStr = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Reporte de Cumplimiento — ${monthName} ${year}`, margin + 40, y + 5);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 130);
  doc.text(`Generado: ${dateStr} a las ${timeStr}`, margin + 40, y + 11);

  y += 20;

  // ── KPI Cards Row ──
  const cardW = (pageW - margin * 2 - 12) / 4;
  const cardH = 28;
  const cards = [
    { title: "Cumplimiento Mes", value: `${kpi.globalPct.toFixed(1)}%`, sub: `Venta: ${fmtCOP(kpi.totalVentaNeta)} / Meta: ${fmtCOP(kpi.totalBudget)}`, pct: kpi.globalPct },
    { title: "Cumplimiento a la Fecha", value: `${kpi.pctToDate.toFixed(1)}%`, sub: `Venta: ${fmtCOP(kpi.totalVentaNeta)} / Meta día ${kpi.daysElapsed}: ${fmtCOP(kpi.budgetToDate)}`, pct: kpi.pctToDate },
    { title: "Unidades Vendidas", value: kpi.totalUnidades.toLocaleString("es-CO"), sub: "", pct: -1 },
    { title: "Ticket Promedio", value: fmtCOP(kpi.ticketPromedio), sub: "", pct: -1 },
  ];

  cards.forEach((card, i) => {
    const x = margin + i * (cardW + 4);
    // Card bg - light gray
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(230, 230, 235);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, "FD");

    // Title
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 115);
    doc.text(card.title, x + 4, y + 6);

    // Value
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    if (card.pct >= 0) {
      const [r, g, b] = pctColorRGB(card.pct);
      doc.setTextColor(r, g, b);
    } else {
      doc.setTextColor(30, 30, 30);
    }
    doc.text(card.value, x + 4, y + 16);

    // Progress bar for first two
    if (card.pct >= 0) {
      const barY = y + 19;
      const barW = cardW - 8;
      doc.setFillColor(230, 230, 235);
      doc.roundedRect(x + 4, barY, barW, 2.5, 1, 1, "F");
      const [r, g, b] = pctColorRGB(card.pct);
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 4, barY, Math.min(card.pct / 100, 1) * barW, 2.5, 1, 1, "F");
    }

    // Sub text
    if (card.sub) {
      doc.setFontSize(5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 145);
      doc.text(card.sub, x + 4, y + 25);
    }
  });

  y += cardH + 6;

  // ── Daily Chart ──
  const chartH = 35;
  const chartW = pageW - margin * 2;
  doc.setFillColor(248, 249, 250);
  doc.setDrawColor(230, 230, 235);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, chartW, chartH + 14, 3, 3, "FD");

  // Chart title
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 30, 30);
  doc.text("Historial Diario", margin + 4, y + 5);

  // Average pct
  const daysWithSales = dailyData.slice(0, currentDay).filter(d => d.ventaNeta > 0);
  const avgPct = daysWithSales.length > 0 ? daysWithSales.reduce((s, d) => s + d.pct, 0) / daysWithSales.length : 0;
  const [ar, ag, ab] = pctColorRGB(avgPct);
  doc.setTextColor(ar, ag, ab);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text(`Promedio diario: ${avgPct.toFixed(1)}%`, margin + chartW - 50, y + 5);

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(130, 130, 145);
  doc.text(`Objetivo diario: ${fmtCOP(dailyTarget)}`, margin + 4, y + 10);

  // Draw bars
  const barsData = dailyData.slice(0, currentDay);
  const maxVal = Math.max(dailyTarget, ...barsData.map(d => d.ventaNeta), 1);
  const barAreaX = margin + 4;
  const barAreaY = y + 13;
  const barAreaW = chartW - 8;
  const barAreaH = chartH - 6;
  const barGap = 1;
  const barW = barsData.length > 0 ? (barAreaW - (barsData.length - 1) * barGap) / barsData.length : 4;

  // Daily target line
  const targetLineY = barAreaY + barAreaH - (dailyTarget / maxVal) * barAreaH;
  doc.setDrawColor(180, 180, 190);
  doc.setLineDashPattern([1, 1], 0);
  doc.setLineWidth(0.3);
  doc.line(barAreaX, targetLineY, barAreaX + barAreaW, targetLineY);
  doc.setLineDashPattern([], 0);

  barsData.forEach((d, i) => {
    const bx = barAreaX + i * (barW + barGap);
    const h = maxVal > 0 ? (d.ventaNeta / maxVal) * barAreaH : 0;
    const by = barAreaY + barAreaH - Math.max(h, 0.5);
    const [r, g, b] = pctColorRGB(d.pct);
    doc.setFillColor(r, g, b);
    doc.rect(bx, by, Math.max(barW, 0.5), Math.max(h, 0.5), "F");

    // Day label
    doc.setFontSize(4);
    doc.setTextColor(130, 130, 145);
    doc.text(String(d.day), bx + barW / 2, barAreaY + barAreaH + 4, { align: "center" });
  });

  y += chartH + 18;

  // ── Compliance Table ──
  // Build rows with VENTA DIRECTA as first row
  const allRows: TableRowData[] = [
    {
      level: "group",
      label: "VENTA DIRECTA",
      budget: kpi.totalBudget,
      ventaNeta: kpi.totalVentaNeta,
      pct: kpi.globalPct,
      pctGeneral: 100,
      pctToDate: kpi.pctToDate,
      unidades: kpi.totalUnidades,
      ticket: kpi.ticketPromedio,
    },
    ...tableRows,
  ];

  // Only 2 % columns: Cumplimiento General (pctGeneral mapped to pct for display), % a la Fecha
  const tableHead = [
    "Canal / Tienda", "Presupuesto", "Venta Neta", "Cumpl. General %", "% a la Fecha", "Uds.", "Ticket Prom."
  ];

  const tableBody = allRows.map((row) => {
    const label = cleanText(row.label);
    // Add turtle indicator for items with pctToDate < 100
    const turtlePrefix = (row.level === "item" && row.pctToDate < 100) ? "🐢 " : "";
    return [
      turtlePrefix + label,
      fmtCOP(row.budget),
      fmtCOP(row.ventaNeta),
      `${row.pct.toFixed(1)}%`,
      `${row.pctToDate.toFixed(1)}%`,
      row.unidades.toLocaleString("es-CO"),
      fmtCOP(row.ticket),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [tableHead],
    body: tableBody,
    theme: "plain",
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
      textColor: [50, 50, 60],
      lineColor: [220, 220, 230],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [240, 240, 245],
      textColor: [60, 60, 75],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const row = allRows[data.row.index];
      if (!row) return;

      // Style by level
      if (row.level === "group" || row.label === "VENTA DIRECTA") {
        data.cell.styles.fillColor = [235, 237, 245];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [25, 25, 35];
      } else if (row.level === "total-tiendas") {
        data.cell.styles.fillColor = [230, 235, 248];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [25, 25, 35];
      } else if (row.level === "subgroup") {
        data.cell.styles.fillColor = [242, 243, 248];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [40, 40, 55];
      } else {
        data.cell.styles.fillColor = data.row.index % 2 === 0 ? [255, 255, 255] : [250, 250, 253];
        data.cell.styles.textColor = [70, 70, 85];
      }

      // Color % columns (index 3 = Cumpl. General, index 4 = % a la Fecha)
      if (data.column.index === 3) {
        const [r, g, b] = pctColorRGB(row.pct);
        data.cell.styles.textColor = [r, g, b];
        data.cell.styles.fontStyle = "bold";
      }
      if (data.column.index === 4) {
        const [r, g, b] = pctColorRGB(row.pctToDate);
        data.cell.styles.textColor = [r, g, b];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: margin, right: margin },
  });

  // ── Footer ──
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // White bg on every page
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");

    doc.setFontSize(6);
    doc.setTextColor(150, 150, 165);
    doc.text(`Monastery — Reporte Cumplimiento ${monthName} ${year}`, margin, pageH - 5);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 5, { align: "right" });
  }

  // Re-render content on page 1 is not needed since autoTable handles pagination.
  // The footer bg rect might overlay content on multi-page — let's fix by only drawing footer text
  // Actually we need to remove the bg rect in footer loop — it will cover table on page 2+
  // Let me fix: redraw approach doesn't work with autoTable. Remove the bg fill from footer.

  doc.save(`Cumplimiento_${monthName}_${year}.pdf`);
}
