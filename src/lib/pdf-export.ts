import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Export array of objects as a styled PDF table download.
 */
export function exportToPDF(
  data: Record<string, unknown>[],
  filename: string,
  title?: string
) {
  if (!data.length) return;

  const doc = new jsPDF({ orientation: "landscape" });
  const headers = Object.keys(data[0]);

  if (title) {
    doc.setFontSize(14);
    doc.text(title, 14, 18);
  }

  autoTable(doc, {
    startY: title ? 24 : 14,
    head: [headers],
    body: data.map((row) => headers.map((h) => {
      const val = row[h];
      return val == null ? "" : String(val);
    })),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [63, 81, 181], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });

  doc.save(`${filename}.pdf`);
}
