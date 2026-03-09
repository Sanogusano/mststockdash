import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Monastery logo as base64 (black version for print)
const MONASTERY_LOGO_B64 = ""; // Will load from URL

interface ProductRow {
  foto: string;
  producto: string;
  categoria: string;
  coleccion: string;
  und_tiendas: number;
  und_outlets: number;
  und_digital: number;
  und_total: number;
  pct_full_price: number;
  pct_rebajas: number;
  pct_descuento: number;
  clasificacion: string;
  stock_venta_directa: number;
}

function cleanText(s: string): string {
  return (s || "")
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[🏆🏷️🧲📦👗⚠️🔴🟡🟢🚚🔥📈📊⏳]/g, "")
    .trim();
}

function formatDate(): string {
  const now = new Date();
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return `${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}`;
}

async function loadImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { mode: "cors" });
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function loadLogoAsBase64(): Promise<string | null> {
  try {
    // Use the SVG logo from assets - convert to a simple text-based approach
    // Instead, we'll draw "MONASTERY" text in the PDF header
    return null;
  } catch {
    return null;
  }
}

export async function exportDesempenoPDF(data: ProductRow[], days: number) {
  if (!data.length) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header background
  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, pageW, 28, "F");

  // Logo text (MONASTERY)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("MONASTERY", 14, 14);

  // Subtitle
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Top Productos - Venta Directa", 14, 21);

  // Date right-aligned
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Informe generado: ${formatDate()}  |  Periodo: ultimos ${days} dias`, pageW - 14, 14, { align: "right" });
  doc.text(`Total productos: ${data.length}`, pageW - 14, 21, { align: "right" });

  const headers = [
    "#", "Producto", "Categoria", "Coleccion",
    "Tiendas", "Outlets", "Digital", "Total Uds",
    "FP%", "Reb%", "Promo%", "Clasificacion", "Stock VD"
  ];

  const body = data.map((r, i) => [
    String(i + 1),
    r.producto || "",
    r.categoria || "",
    r.coleccion || "Otros",
    String(r.und_tiendas ?? 0),
    String(r.und_outlets ?? 0),
    String(r.und_digital ?? 0),
    String(r.und_total ?? 0),
    `${r.pct_full_price ?? 0}%`,
    `${r.pct_rebajas ?? 0}%`,
    `${r.pct_descuento ?? 0}%`,
    cleanText(r.clasificacion),
    String(r.stock_venta_directa ?? 0),
  ]);

  autoTable(doc, {
    startY: 32,
    head: [headers],
    body,
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      lineColor: [40, 40, 40],
      lineWidth: 0.1,
      textColor: [220, 220, 220],
      fillColor: [25, 25, 25],
    },
    headStyles: {
      fillColor: [35, 35, 35],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: {
      fillColor: [30, 30, 30],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 8 },
      1: { cellWidth: 45 },
      2: { cellWidth: 22 },
      3: { cellWidth: 22 },
      4: { halign: "right", cellWidth: 16 },
      5: { halign: "right", cellWidth: 16 },
      6: { halign: "right", cellWidth: 16 },
      7: { halign: "right", cellWidth: 18, fontStyle: "bold" },
      8: { halign: "right", cellWidth: 14 },
      9: { halign: "right", cellWidth: 14 },
      10: { halign: "right", cellWidth: 14 },
      11: { cellWidth: 30 },
      12: { halign: "right", cellWidth: 18 },
    },
    didParseCell: (data) => {
      // Color the percentage columns
      if (data.section === "body") {
        if (data.column.index === 8) {
          data.cell.styles.textColor = [52, 211, 153]; // emerald
        } else if (data.column.index === 9) {
          data.cell.styles.textColor = [59, 130, 246]; // blue
        } else if (data.column.index === 10) {
          data.cell.styles.textColor = [249, 115, 22]; // orange
        }
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`MONASTERY - Informe Confidencial  |  Pagina ${i} de ${pageCount}`, pageW / 2, pageH - 5, { align: "center" });
  }

  doc.save(`Desempeno_Productos_${new Date().toISOString().slice(0, 10)}.pdf`);
}
