import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  if (!url) return null;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 40;
        canvas.height = 40;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, 40, 40);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

export async function exportDesempenoPDF(data: ProductRow[], days: number) {
  if (!data.length) return;

  // Pre-load all product images in parallel
  const imagePromises = data.map(r => loadImageAsBase64(r.foto));
  const images = await Promise.all(imagePromises);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Header - dark strip
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, 24, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("MONASTERY", 14, 12);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(200, 200, 200);
  doc.text("Top Productos - Venta Directa", 14, 19);

  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text(`Informe: ${formatDate()}  |  Periodo: ultimos ${days} dias  |  ${data.length} productos`, pageW - 14, 12, { align: "right" });

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(10, 26, pageW - 10, 26);

  const headers = [
    "#", "", "Producto", "Categoria", "Coleccion",
    "Tiendas", "Outlets", "Digital", "Total",
    "FP%", "Reb%", "Promo%", "Clasificacion", "Stock VD"
  ];

  const body = data.map((r, i) => [
    String(i + 1),
    "", // photo placeholder
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
    startY: 29,
    head: [headers],
    body,
    styles: {
      fontSize: 7,
      cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
      lineColor: [220, 220, 220],
      lineWidth: 0.15,
      textColor: [40, 40, 40],
      fillColor: [255, 255, 255],
      minCellHeight: 8,
    },
    headStyles: {
      fillColor: [55, 55, 55],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6.5,
      cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
    },
    alternateRowStyles: {
      fillColor: [245, 245, 250],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 7 },
      1: { cellWidth: 9 }, // photo
      2: { cellWidth: 40 },
      3: { cellWidth: 20 },
      4: { cellWidth: 20 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 14 },
      7: { halign: "right", cellWidth: 14 },
      8: { halign: "right", cellWidth: 14, fontStyle: "bold" },
      9: { halign: "right", cellWidth: 12 },
      10: { halign: "right", cellWidth: 12 },
      11: { halign: "right", cellWidth: 12 },
      12: { cellWidth: 28 },
      13: { halign: "right", cellWidth: 16 },
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body") {
        // Color percentage columns
        if (hookData.column.index === 9) {
          hookData.cell.styles.textColor = [16, 150, 90]; // green
        } else if (hookData.column.index === 10) {
          hookData.cell.styles.textColor = [37, 99, 235]; // blue
        } else if (hookData.column.index === 11) {
          hookData.cell.styles.textColor = [220, 80, 10]; // orange
        }
      }
    },
    didDrawCell: (hookData) => {
      // Draw product photo in column 1
      if (hookData.section === "body" && hookData.column.index === 1) {
        const rowIdx = hookData.row.index;
        const imgData = images[rowIdx];
        if (imgData) {
          try {
            const x = hookData.cell.x + 0.5;
            const y = hookData.cell.y + 0.8;
            const size = Math.min(hookData.cell.height - 1.6, 7);
            doc.addImage(imgData, "JPEG", x, y, size, size);
          } catch {
            // Skip if image fails
          }
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
    doc.setTextColor(130, 130, 130);
    doc.text(`MONASTERY - Informe Confidencial  |  Pagina ${i} de ${pageCount}`, pageW / 2, pageH - 5, { align: "center" });
  }

  doc.save(`Desempeno_Productos_${new Date().toISOString().slice(0, 10)}.pdf`);
}
