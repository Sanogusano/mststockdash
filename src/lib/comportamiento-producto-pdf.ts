import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ComportamientoPDFRow {
  foto: string;
  sku: string;
  producto: string;
  categoria: string;
  und_vendidas: number;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  stock_tiendas: number;
  stock_digital: number;
  stock_standby: number;
  stock_total: number;
  bod_principal: number;
  bod_reserva: number;
  bod_tiendas: number;
  bod_exportaciones: number;
  sell_through_pct: number;
}

const stripEmoji = (s: string) =>
  (s ?? "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportComportamientoProductoPDF(
  rows: ComportamientoPDFRow[],
  filename = "comportamiento_producto",
  title = "Comportamiento de Producto"
) {
  if (!rows.length) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a3" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(stripEmoji(title), 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generado: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}  -  ${rows.length} productos`,
    40,
    48
  );
  doc.setTextColor(0);

  // Preload images (in parallel, cap to avoid memory blow-up)
  const photos = await Promise.all(rows.map((r) => (r.foto ? urlToDataUrl(r.foto) : Promise.resolve(null))));

  const ROW_H = 44;
  const IMG = 36;

  autoTable(doc, {
    startY: 60,
    head: [[
      "Foto",
      "Producto",
      "Und. Vendidas",
      "Full Price",
      "Rebajas",
      "Promo",
      "Stock Tiendas",
      "Stock Digital",
      "Stock Stand-by",
      "Stock Total",
      "Principal",
      "Reserva Distribuidores",
      "Tiendas Monastery",
      "Exportaciones",
      "Sell-Through %",
    ]],
    body: rows.map((r) => [
      "",
      `${stripEmoji(r.producto)}\n${r.sku}  -  ${stripEmoji(r.categoria)}`,
      (r.und_vendidas ?? 0).toLocaleString("es-CO"),
      (r.und_full_price ?? 0).toLocaleString("es-CO"),
      (r.und_rebajas ?? 0).toLocaleString("es-CO"),
      (r.und_promo ?? 0).toLocaleString("es-CO"),
      (r.stock_tiendas ?? 0).toLocaleString("es-CO"),
      (r.stock_digital ?? 0).toLocaleString("es-CO"),
      (r.stock_standby ?? 0).toLocaleString("es-CO"),
      (r.stock_total ?? 0).toLocaleString("es-CO"),
      (r.bod_principal ?? 0).toLocaleString("es-CO"),
      (r.bod_reserva ?? 0).toLocaleString("es-CO"),
      (r.bod_tiendas ?? 0).toLocaleString("es-CO"),
      (r.bod_exportaciones ?? 0).toLocaleString("es-CO"),
      `${r.sell_through_pct ?? 0}%`,
    ]),
    styles: { fontSize: 8, cellPadding: 4, minCellHeight: ROW_H, valign: "middle", font: "helvetica" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold", halign: "center" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 50, halign: "center" },
      1: { cellWidth: 200 },
      2: { halign: "right", fontStyle: "bold" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right", fontStyle: "bold" },
      9: { halign: "right" },
      10: { halign: "right" },
      11: { halign: "right" },
      12: { halign: "right" },
      13: { halign: "right" },
      14: { halign: "right" },
      15: { halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const photo = photos[data.row.index];
        if (photo) {
          const x = data.cell.x + (data.cell.width - IMG) / 2;
          const y = data.cell.y + (data.cell.height - IMG) / 2;
          try {
            doc.addImage(photo, "JPEG", x, y, IMG, IMG);
          } catch {
            try {
              doc.addImage(photo, "PNG", x, y, IMG, IMG);
            } catch {
              /* ignore broken image */
            }
          }
        }
      }
    },
  });

  doc.save(`${filename}.pdf`);
}
