import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import monasteryLogoWhite from "@/assets/monastery-logo-white.png";

export type Celda = string | number | null;

/** Fecha y hora de generación en Bogotá. */
export const generadoEl = () => {
  const d = new Date();
  const f = d.toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "America/Bogota",
  });
  const h = d.toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
  });
  return `${f}, ${h}`;
};

/** "<base> YYYY-MM-DD HHmm" */
export const nombreArchivo = (base: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${base} ${g("year")}-${g("month")}-${g("day")} ${g("hour")}${g("minute")}`;
};

async function getLogoBase64(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

interface ExportArgs {
  titulo: string;
  subtitulo?: string;
  head: string[];
  body: Celda[][];
  archivo: string;
  /** Índices de columnas alineadas a la derecha. */
  numericas?: number[];
  anchos?: number[];
}

export async function exportarPDF({ titulo, subtitulo, head, body, archivo, numericas = [] }: ExportArgs) {
  if (!body.length) return;
  const logo = await getLogoBase64();
  const generated = generadoEl();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;

  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, pageW, 30, "F");
  if (logo) {
    try { doc.addImage(logo, "PNG", margin, 4, 50, 22); } catch { /* sin logo */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, pageW - margin, 11, { align: "right" });
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(`Generado ${generated}`, pageW - margin, 18, { align: "right" });
  if (subtitulo) doc.text(subtitulo, pageW - margin, 24, { align: "right" });
  doc.setTextColor(0, 0, 0);

  const columnStyles: Record<number, { halign: "right" }> = {};
  numericas.forEach((i) => { columnStyles[i] = { halign: "right" }; });

  autoTable(doc, {
    startY: 35,
    head: [head],
    body: body.map((r) => r.map((c) => (c == null ? "-" : String(c)))),
    styles: { fontSize: 6.8, cellPadding: 1.4, valign: "middle" },
    headStyles: { fillColor: [15, 15, 15], textColor: 255, fontStyle: "bold", fontSize: 6.8 },
    alternateRowStyles: { fillColor: [245, 245, 248] },
    margin: { left: margin, right: margin, top: 14, bottom: 14 },
    showHead: "everyPage",
    columnStyles,
  });

  const pageH = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.setDrawColor(200, 200, 210);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.text("MST-Retail Intelligence · powered by Selliq", margin, pageH - 6);
    doc.text(generated, pageW / 2, pageH - 6, { align: "center" });
    doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 6, { align: "right" });
  }

  doc.save(`${archivo}.pdf`);
}

export async function exportarExcel({ titulo, subtitulo, head, body, archivo, anchos }: ExportArgs) {
  if (!body.length) return;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos", { views: [{ state: "frozen", ySplit: 4 }] });
  ws.columns = head.map((_, i) => ({ width: anchos?.[i] ?? 18 }));

  ws.addRow([`${titulo}  ·  Generado ${generadoEl()}`]);
  ws.mergeCells(1, 1, 1, head.length);
  ws.getRow(1).getCell(1).font = { bold: true, size: 14 };
  ws.addRow([subtitulo ?? ""]);
  ws.mergeCells(2, 1, 2, head.length);
  ws.getRow(2).getCell(1).font = { color: { argb: "FF666666" } };
  ws.addRow([]);

  const header = ws.addRow(head);
  header.height = 22;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  body.forEach((r) => ws.addRow(r.map((c) => (c == null ? "" : c))));

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${archivo}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
