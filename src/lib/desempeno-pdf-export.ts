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
      const timeout = setTimeout(() => resolve(null), 4000);
      img.onload = () => {
        clearTimeout(timeout);
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        // Draw with rounded corners effect (white bg + cover)
        ctx.fillStyle = "#f5f5f5";
        ctx.fillRect(0, 0, 80, 80);
        const scale = Math.max(80 / img.naturalWidth, 80 / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (80 - w) / 2, (80 - h) / 2, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { clearTimeout(timeout); resolve(null); };
      img.src = url;
    });
  } catch {
    return null;
  }
}

/** Draw a small horizontal bar in the PDF */
function drawBar(doc: jsPDF, x: number, y: number, width: number, pct: number, color: [number, number, number]) {
  // Background track
  doc.setFillColor(230, 230, 235);
  doc.roundedRect(x, y, width, 2, 0.5, 0.5, "F");
  // Filled bar
  if (pct > 0) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, Math.max(width * (pct / 100), 1), 2, 0.5, 0.5, "F");
  }
}

export async function exportDesempenoPDF(data: ProductRow[], days: number) {
  if (!data.length) return;

  // Pre-load all product images in parallel
  const imagePromises = data.map(r => loadImageAsBase64(r.foto));
  const images = await Promise.all(imagePromises);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const IMG_SIZE = 10; // mm — image size in table
  const ROW_HEIGHT = 12; // mm — row height to fit image

  // ── Header ──
  doc.setFillColor(20, 20, 20);
  doc.rect(0, 0, pageW, 22, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("MONASTERY", 14, 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(190, 190, 190);
  doc.text("Top Productos - Venta Directa", 14, 17);

  doc.setTextColor(170, 170, 170);
  doc.text(`${formatDate()}  |  Ultimos ${days} dias  |  ${data.length} productos`, pageW - 14, 11, { align: "right" });

  // ── Table ──
  // Columns: #, [Foto+Producto], Categoria, Coleccion, Tiendas, Outlets, Digital, Total, Mezcla Precios, Clasificacion, Stock VD
  const headers = [
    "#", "Producto", "Categoria", "Coleccion",
    "Tiendas", "Outlets", "Digital", "Total Uds",
    "Mezcla de Precios", "Clasificacion", "Stock VD"
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
    `FP ${r.pct_full_price ?? 0}% | Reb ${r.pct_rebajas ?? 0}% | Promo ${r.pct_descuento ?? 0}%`,
    cleanText(r.clasificacion),
    String(r.stock_venta_directa ?? 0),
  ]);

  // Available width: 297 - 20 margin = 277
  autoTable(doc, {
    startY: 25,
    head: [headers],
    body,
    styles: {
      fontSize: 6.5,
      cellPadding: { top: 1, bottom: 1, left: 1.5, right: 1.5 },
      lineColor: [215, 215, 220],
      lineWidth: 0.15,
      textColor: [50, 50, 50],
      fillColor: [255, 255, 255],
      minCellHeight: ROW_HEIGHT,
      valign: "middle",
    },
    headStyles: {
      fillColor: [45, 45, 50],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 6,
      minCellHeight: 7,
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [248, 248, 252],
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 7, fontStyle: "bold" },    // #
      1: { cellWidth: 55 },                                         // Producto (foto + name)
      2: { cellWidth: 22, fontSize: 6 },                            // Categoria
      3: { cellWidth: 22, fontSize: 6 },                            // Coleccion
      4: { halign: "right", cellWidth: 14 },                        // Tiendas
      5: { halign: "right", cellWidth: 14 },                        // Outlets
      6: { halign: "right", cellWidth: 14 },                        // Digital
      7: { halign: "right", cellWidth: 16, fontStyle: "bold" },     // Total
      8: { cellWidth: 50 },                                          // Mezcla precios (bars)
      9: { cellWidth: 28 },                                          // Clasificacion
      10: { halign: "right", cellWidth: 16, fontStyle: "bold" },    // Stock VD
    },
    didParseCell: (hookData) => {
      if (hookData.section === "body" && hookData.column.index === 1) {
        // Add left padding for the image
        hookData.cell.styles.cellPadding = { top: 1, bottom: 1, left: 13, right: 1.5 };
      }
    },
    didDrawCell: (hookData) => {
      if (hookData.section !== "body") return;
      const rowIdx = hookData.row.index;

      // ── Column 1: Draw product photo ──
      if (hookData.column.index === 1) {
        const imgData = images[rowIdx];
        const x = hookData.cell.x + 1;
        const y = hookData.cell.y + (hookData.cell.height - IMG_SIZE) / 2;
        if (imgData) {
          try {
            doc.addImage(imgData, "JPEG", x, y, IMG_SIZE, IMG_SIZE);
          } catch { /* skip */ }
        } else {
          // Gray placeholder
          doc.setFillColor(230, 230, 235);
          doc.roundedRect(x, y, IMG_SIZE, IMG_SIZE, 1, 1, "F");
        }
      }

      // ── Column 8: Draw price mix bars ──
      if (hookData.column.index === 8) {
        const row = data[rowIdx];
        if (!row) return;
        const cx = hookData.cell.x + 2;
        const cy = hookData.cell.y;
        const barW = 22;
        const cellH = hookData.cell.height;

        // Clear the text (we'll draw our own)
        doc.setFillColor(
          hookData.row.index % 2 === 0 ? 255 : 248,
          hookData.row.index % 2 === 0 ? 255 : 248,
          hookData.row.index % 2 === 0 ? 255 : 252
        );
        doc.rect(hookData.cell.x + 0.5, cy + 0.5, hookData.cell.width - 1, cellH - 1, "F");

        const startY = cy + (cellH - 12) / 2 + 1;

        // Full Price bar
        drawBar(doc, cx, startY, barW, row.pct_full_price ?? 0, [16, 185, 129]);
        doc.setFontSize(5.5);
        doc.setTextColor(16, 150, 90);
        doc.text(`FP ${row.pct_full_price ?? 0}%`, cx + barW + 1.5, startY + 1.8);

        // Rebajas bar
        drawBar(doc, cx, startY + 4, barW, row.pct_rebajas ?? 0, [59, 130, 246]);
        doc.setTextColor(37, 99, 235);
        doc.text(`Reb ${row.pct_rebajas ?? 0}%`, cx + barW + 1.5, startY + 5.8);

        // Promo bar
        drawBar(doc, cx, startY + 8, barW, row.pct_descuento ?? 0, [249, 115, 22]);
        doc.setTextColor(220, 80, 10);
        doc.text(`Promo ${row.pct_descuento ?? 0}%`, cx + barW + 1.5, startY + 9.8);
      }
    },
    margin: { left: 10, right: 10 },
  });

  // ── Footer on each page ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFontSize(6.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`MONASTERY  |  Informe Confidencial  |  Pagina ${i} de ${pageCount}`, pageW / 2, pageH - 5, { align: "center" });
  }

  doc.save(`Desempeno_Productos_${new Date().toISOString().slice(0, 10)}.pdf`);
}
