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
  if (pct >= 100) return [34, 197, 94];   // green
  if (pct >= 80) return [234, 179, 8];    // yellow
  return [239, 68, 68];                    // red
}

function cleanText(s: string): string {
  return (s || "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[🏆🏪🌐📍🧲📦👗⚠️🔴🟡🟢🚚🔥📈📊⏳]/g, "")
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
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => { clearTimeout(timeout); resolve(null); };
      img.src = new URL("/src/assets/monastery-logo-white.jpg", window.location.origin).href;
    });
  } catch { return null; }
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

  // ── Background ──
  doc.setFillColor(15, 15, 20);
  doc.rect(0, 0, pageW, pageH, "F");

  // ── Header: Logo + Title + Date ──
  const logo = await loadLogoBase64();
  if (logo) {
    doc.addImage(logo, "JPEG", margin, y, 35, 12);
  }

  const now = new Date();
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const dateStr = `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Reporte de Cumplimiento — ${monthName} ${year}`, margin + 40, y + 5);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 170);
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
    // Card bg
    doc.setFillColor(30, 30, 38);
    doc.roundedRect(x, y, cardW, cardH, 3, 3, "F");

    // Title
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(140, 140, 155);
    doc.text(card.title, x + 4, y + 6);

    // Value
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    if (card.pct >= 0) {
      const [r, g, b] = pctColorRGB(card.pct);
      doc.setTextColor(r, g, b);
    } else {
      doc.setTextColor(255, 255, 255);
    }
    doc.text(card.value, x + 4, y + 15);

    // Progress bar for first two
    if (card.pct >= 0) {
      const barY = y + 18;
      const barW = cardW - 8;
      doc.setFillColor(50, 50, 60);
      doc.roundedRect(x + 4, barY, barW, 2.5, 1, 1, "F");
      const [r, g, b] = pctColorRGB(card.pct);
      doc.setFillColor(r, g, b);
      doc.roundedRect(x + 4, barY, Math.min(card.pct / 100, 1) * barW, 2.5, 1, 1, "F");
    }

    // Sub text
    if (card.sub) {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 135);
      doc.text(card.sub, x + 4, y + 25);
    }
  });

  y += cardH + 6;

  // ── Daily Chart ──
  const chartH = 35;
  const chartW = pageW - margin * 2;
  doc.setFillColor(30, 30, 38);
  doc.roundedRect(margin, y, chartW, chartH + 14, 3, 3, "F");

  // Chart title
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Historial Diario", margin + 4, y + 5);

  // Average pct
  const daysWithSales = dailyData.slice(0, currentDay).filter(d => d.ventaNeta > 0);
  const avgPct = daysWithSales.length > 0 ? daysWithSales.reduce((s, d) => s + d.pct, 0) / daysWithSales.length : 0;
  const [ar, ag, ab] = pctColorRGB(avgPct);
  doc.setTextColor(ar, ag, ab);
  doc.setFontSize(7);
  doc.text(`Promedio diario: ${avgPct.toFixed(1)}%`, margin + chartW - 50, y + 5);

  doc.setFontSize(6);
  doc.setTextColor(120, 120, 135);
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
  doc.setDrawColor(100, 100, 120);
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
    doc.setTextColor(120, 120, 135);
    doc.text(String(d.day), bx + barW / 2, barAreaY + barAreaH + 4, { align: "center" });
  });

  y += chartH + 18;

  // ── Compliance Table ──
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

  const tableHead = [
    "Canal / Tienda", "Presupuesto", "Venta Neta", "% Cumpl.", "% General", "% Cumpl. Fecha", "Uds.", "Ticket Prom."
  ];

  const tableBody = allRows.map((row) => [
    cleanText(row.label),
    fmtCOP(row.budget),
    fmtCOP(row.ventaNeta),
    `${row.pct.toFixed(1)}%`,
    `${row.pctGeneral.toFixed(1)}%`,
    `${row.pctToDate.toFixed(1)}%`,
    row.unidades.toLocaleString("es-CO"),
    fmtCOP(row.ticket),
  ]);

  autoTable(doc, {
    startY: y,
    head: [tableHead],
    body: tableBody,
    theme: "plain",
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      textColor: [220, 220, 230],
      lineColor: [50, 50, 60],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [40, 40, 55],
      textColor: [200, 200, 215],
      fontStyle: "bold",
      fontSize: 6.5,
    },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    didParseCell: (data: any) => {
      if (data.section !== "body") return;
      const row = allRows[data.row.index];
      if (!row) return;

      // Style by level
      if (row.level === "group" || row.label === "VENTA DIRECTA") {
        data.cell.styles.fillColor = [25, 25, 40];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [255, 255, 255];
      } else if (row.level === "total-tiendas") {
        data.cell.styles.fillColor = [30, 35, 50];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [255, 255, 255];
      } else if (row.level === "subgroup") {
        data.cell.styles.fillColor = [28, 28, 42];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = [200, 200, 215];
      } else {
        data.cell.styles.fillColor = data.row.index % 2 === 0 ? [22, 22, 32] : [18, 18, 28];
        data.cell.styles.textColor = [170, 170, 185];
      }

      // Color % columns
      if (data.column.index === 3 || data.column.index === 5) {
        const pct = row.level === "group" && data.column.index === 3 ? row.pct : 
                    data.column.index === 3 ? row.pct : row.pctToDate;
        const [r, g, b] = pctColorRGB(pct);
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
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 115);
    doc.text(`Monastery — Reporte Cumplimiento ${monthName} ${year}`, margin, pageH - 5);
    doc.text(`Página ${p} de ${totalPages}`, pageW - margin, pageH - 5, { align: "right" });
  }

  doc.save(`Cumplimiento_${monthName}_${year}.pdf`);
}
