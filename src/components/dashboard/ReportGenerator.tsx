import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays } from "./TimeFilter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import monasteryLogoWhite from "@/assets/monastery-logo-white.png";

/* ── Types ── */
interface KpiData {
  total_pedidos: number;
  unidades_vendidas: number;
  ingresos_netos: number;
  ticket_promedio: number;
  upt: number;
  pct_pedidos_full_price: number;
  pct_pedidos_rebajas: number;
  pct_pedidos_con_descuento: number;
}

interface ProductRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  categoria: string | null;
  clasificacion: string | null;
  unidades_vendidas: number | null;
  precio_prom_venta: number | null;
  stock_disponible: number | null;
}

interface LineaRow {
  categoria: string | null;
  und_total: number | null;
  pct_participacion: number | null;
  sell_through_pct: number | null;
  wos: number | null;
  estado_salud: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
}

interface AlertRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  stock_tiendas: number | null;
  stock_digital: number | null;
  wos: number | null;
  estado_salud: string | null;
}

interface TransferRow {
  producto: string | null;
  sku: string | null;
  tienda_origen: string | null;
  stock_origen: number | null;
  tienda_destino: string | null;
  uds_sugeridas: number | null;
}

interface ParetoRow {
  categoria: string | null;
  unidades: number | null;
  pct_participacion: number | null;
}

interface Location {
  location_id: string;
  name: string;
}

/* ── Constants ── */
const CEDI_ID = "71474315479";
const OUTLET_KEYWORDS = ["SOPO", "UNICO", "ÚNICO"];
const isOutlet = (name: string) => OUTLET_KEYWORDS.some(k => name.toUpperCase().includes(k));

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

/** Strip emojis and non-latin unicode symbols that jsPDF can't render */
function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[\u{20E3}]/gu, "")
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\u{2B50}|\u{2705}|\u{26A0}|\u{1F534}|\u{1F7E1}|\u{1F7E2}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ── Logo to base64 ── */
async function getLogoBase64(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

/* ── Image to base64 ── */
async function imageToBase64(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, 40, 40);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

/* ── PDF Builder ── */
async function generateReport(
  days: number,
  reportType: "completo" | "canal" | "tienda",
  canal?: string,
  locationId?: string,
  locationName?: string,
) {
  const effectiveDays = resolveDays(days);
  
  // Determine title
  let titulo = "DESEMPENO COMERCIAL - Venta Directa";
  if (reportType === "canal" && canal) {
    const canalLabel = canal === "tiendas" ? "Tiendas de Linea" : canal === "outlets" ? "Outlets" : "Digital";
    titulo = `DESEMPENO COMERCIAL - ${canalLabel}`;
  } else if (reportType === "tienda" && locationName) {
    titulo = `DESEMPENO COMERCIAL - ${locationName}`;
  }

  // Determine RPC params
  const canalParam = reportType === "canal" ? canal ?? null : null;
  const locationParam = reportType === "tienda" ? locationId ?? null : null;

  // Fetch all data in parallel
  const [kpiRes, paretoRes, topRes, bottomRes, lineaRes, healthRes, transferRes, logoB64] = await Promise.all([
    supabase.rpc("reporte_kpis_comerciales", {
      dias_atras: effectiveDays,
      p_canal: canalParam,
      p_location_id: locationParam,
    }),
    supabase.rpc("reporte_pareto_categorias" as any, {
      dias_atras: effectiveDays,
      p_canal: canalParam ?? "",
      p_location_id: locationParam,
    }),
    supabase.rpc("reporte_ejecutivo_productos", {
      dias_atras: effectiveDays,
      canal_filtro: reportType === "canal" ? (canal === "tiendas" || canal === "outlets" ? "POS" : "DIGITAL") : null,
      location_filtro: locationParam,
      orden: "TOP",
      limite: 20,
    }),
    supabase.rpc("reporte_ejecutivo_productos", {
      dias_atras: effectiveDays,
      canal_filtro: reportType === "canal" ? (canal === "tiendas" || canal === "outlets" ? "POS" : "DIGITAL") : null,
      location_filtro: locationParam,
      orden: "BOTTOM",
      limite: 20,
    }),
    supabase.rpc("reporte_desempeno_por_linea" as any, {
      dias_atras: effectiveDays,
      p_canal: canalParam,
    }),
    supabase.rpc("reporte_comportamiento_producto", {
      dias_atras: effectiveDays,
      p_location_id: locationParam,
    }),
    supabase.rpc("reporte_sugerencias_traslado", { dias_atras: effectiveDays }),
    getLogoBase64(),
  ]);

  const kpis = kpiRes.data?.[0] as unknown as KpiData ?? { total_pedidos: 0, unidades_vendidas: 0, ingresos_netos: 0, ticket_promedio: 0, upt: 0, pct_pedidos_full_price: 0, pct_pedidos_rebajas: 0, pct_pedidos_con_descuento: 0 };
  const paretoData = (paretoRes.data ?? []) as unknown as ParetoRow[];
  const topProducts = (topRes.data ?? []) as unknown as ProductRow[];
  const bottomProducts = (bottomRes.data ?? []) as unknown as ProductRow[];
  const lineaData = (lineaRes.data ?? []) as unknown as LineaRow[];
  const healthData = ((healthRes.data ?? []) as unknown as AlertRow[])
    .filter(r => r.estado_salud?.includes("RIESGO"));
  const transferData = (transferRes.data ?? []) as unknown as TransferRow[];

  // Pre-fetch product images for top/bottom
  const allProducts = [...topProducts.slice(0, 20), ...bottomProducts.slice(0, 20)];
  const imageCache = new Map<string, string>();
  const imagePromises = allProducts
    .filter(p => p.foto)
    .map(async (p) => {
      try {
        const b64 = await imageToBase64(p.foto!);
        if (b64) imageCache.set(p.foto!, b64);
      } catch {
        // skip
      }
    });
  await Promise.all(imagePromises);

  // Also fetch health product images
  const healthImagePromises = healthData.slice(0, 30)
    .filter(p => p.foto)
    .map(async (p) => {
      try {
        const b64 = await imageToBase64(p.foto!);
        if (b64) imageCache.set(p.foto!, b64);
      } catch {
        // skip
      }
    });
  await Promise.all(healthImagePromises);

  // ── Create PDF ──
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = margin;

  // Colors — Black theme
  const BLACK = [15, 15, 15] as [number, number, number];
  const DARK = [30, 30, 30] as [number, number, number];
  const ACCENT = [40, 40, 40] as [number, number, number];
  const GREEN = [16, 185, 129] as [number, number, number];
  const RED = [220, 38, 38] as [number, number, number];
  const ORANGE = [234, 88, 12] as [number, number, number];
  const GRAY = [120, 120, 120] as [number, number, number];
  const LIGHT_BG = [245, 245, 245] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];

  function addNewPageIfNeeded(requiredSpace: number) {
    if (y + requiredSpace > pageH - margin) {
      doc.addPage();
      y = margin;
      return true;
    }
    return false;
  }

  function drawSectionTitle(title: string) {
    addNewPageIfNeeded(16);
    doc.setFillColor(...BLACK);
    doc.roundedRect(margin, y, pageW - 2 * margin, 9, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(stripEmoji(title), margin + 4, y + 6.2);
    doc.setTextColor(0, 0, 0);
    y += 13;
  }

  // ── HEADER ──
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, pageW, 30, "F");

  // Logo
  if (logoB64) {
    try {
      doc.addImage(logoB64, "PNG", margin, 4, 50, 22);
    } catch { /* skip */ }
  }

  // Date + Title
  const dateStr = new Date().toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "America/Bogota"
  });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(stripEmoji(titulo), pageW - margin, 12, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(stripEmoji(dateStr), pageW - margin, 19, { align: "right" });
  doc.text(`Periodo: ultimos ${effectiveDays} dias`, pageW - margin, 24, { align: "right" });
  
  doc.setTextColor(0, 0, 0);
  y = 36;

  // ── PARTICIPACIÓN POR LÍNEA ──
  drawSectionTitle("PARTICIPACION POR LINEA");

  if (paretoData.length) {
    // Draw a mini bar chart representation
    const barH = 5;
    const maxPct = Math.max(...paretoData.map(r => r.pct_participacion ?? 0));
    const barMaxW = pageW - 2 * margin - 60;
    
    paretoData.slice(0, 10).forEach((row, i) => {
      addNewPageIfNeeded(barH + 2);
      const pct = row.pct_participacion ?? 0;
      const barW = maxPct > 0 ? (pct / maxPct) * barMaxW : 0;
      
      // Category label
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(stripEmoji((row.categoria ?? "-")).substring(0, 20), margin, y + 3.5);
      
      // Bar
      const barX = margin + 40;
      const colors: [number, number, number][] = [
        [59, 130, 246], [124, 58, 237], [236, 72, 153],
        [34, 197, 94], [245, 158, 11], [239, 68, 68],
        [6, 182, 212], [168, 85, 247], [234, 179, 8], [192, 132, 252],
      ];
      doc.setFillColor(...(colors[i % colors.length]));
      doc.roundedRect(barX, y, Math.max(barW, 1), barH, 1, 1, "F");
      
      // Value
      doc.setTextColor(...BLACK);
      doc.setFont("helvetica", "bold");
      doc.text(`${pct.toFixed(1)}% · ${(row.unidades ?? 0).toLocaleString()} uds`, barX + barW + 3, y + 3.5);
      
      y += barH + 2;
    });
    y += 4;
  }

  // ── KPIs ──
  drawSectionTitle("INDICADORES COMERCIALES");

  const kpiItems = [
    { label: "Ventas Netas", value: fmtCOP(kpis.ingresos_netos), color: BLACK },
    { label: "Ticket Promedio", value: fmtCOP(kpis.ticket_promedio), color: BLACK },
    { label: "UPT", value: kpis.upt.toFixed(2), color: BLACK },
    { label: "% Full Price", value: `${kpis.pct_pedidos_full_price.toFixed(1)}%`, color: GREEN },
    { label: "% Rebajas", value: `${kpis.pct_pedidos_rebajas.toFixed(1)}%`, color: RED },
    { label: "% Desc. Promo", value: `${kpis.pct_pedidos_con_descuento.toFixed(1)}%`, color: ORANGE },
  ];

  const kpiColW = (pageW - 2 * margin) / 3;
  kpiItems.forEach((item, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    if (col === 0 && row > 0) y += 18;
    if (i === 0) addNewPageIfNeeded(36);

    const x = margin + col * kpiColW;
    const boxY = y;

    // Box background
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(x, boxY, kpiColW - 3, 16, 2, 2, "F");
    doc.setDrawColor(220, 220, 230);
    doc.roundedRect(x, boxY, kpiColW - 3, 16, 2, 2, "S");

    // Label
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(item.label, x + 4, boxY + 5.5);

    // Value
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(item.color as [number, number, number]));
    doc.text(item.value, x + 4, boxY + 12.5);
  });
  y += 22;

  // ── DESEMPEÑO POR LÍNEA TABLE ──
  if (lineaData.length) {
    drawSectionTitle("DESEMPENO POR LINEA");
    autoTable(doc, {
      startY: y,
      head: [["Categoria", "Und. Total", "% Part.", "Sell-Through", "WOS", "Estado"]],
      body: lineaData.map(r => [
        stripEmoji((r.categoria ?? "-")).substring(0, 25),
        (r.und_total ?? 0).toLocaleString(),
        `${(r.pct_participacion ?? 0).toFixed(1)}%`,
        `${(r.sell_through_pct ?? 0).toFixed(1)}%`,
        (r.wos ?? 0).toFixed(1),
        stripEmoji(r.estado_salud ?? "-"),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const text = String(data.cell.raw);
          if (text.includes("RIESGO")) data.cell.styles.textColor = RED;
          else if (text.includes("SOBRESTOCK") || text.includes("ESTANCADO")) data.cell.styles.textColor = RED;
          else if (text.includes("ÓPTIMO")) data.cell.styles.textColor = GREEN;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── TOP 20 ──
  if (topProducts.length) {
    drawSectionTitle("TOP 20 - PRODUCTOS MAS VENDIDOS");
    
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: topProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 35),
        stripEmoji((r.categoria ?? "-")).substring(0, 15),
        stripEmoji(r.clasificacion ?? "-"),
        (r.unidades_vendidas ?? 0).toLocaleString(),
        fmtCOP(r.precio_prom_venta ?? 0),
        (r.stock_disponible ?? 0).toLocaleString(),
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const text = String(data.cell.raw);
          if (text.includes("Full Price")) data.cell.styles.textColor = GREEN;
          else if (text.includes("Rebajas")) data.cell.styles.textColor = RED;
          else if (text.includes("Promo")) data.cell.styles.textColor = ORANGE;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const rowIndex = data.row.index;
          const product = topProducts[rowIndex];
          if (product?.foto && imageCache.has(product.foto)) {
            try {
              doc.addImage(
                imageCache.get(product.foto)!,
                "JPEG",
                data.cell.x + 1,
                data.cell.y + 1,
                8,
                8
              );
            } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── BOTTOM 20 ──
  if (bottomProducts.length) {
    drawSectionTitle("BOTTOM 20 - MENOR ROTACION");
    
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "Categoria", "Clasificacion", "Uds", "Precio Prom", "Stock"]],
      body: bottomProducts.slice(0, 20).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 35),
        stripEmoji((r.categoria ?? "-")).substring(0, 15),
        stripEmoji(r.clasificacion ?? "-"),
        (r.unidades_vendidas ?? 0).toLocaleString(),
        fmtCOP(r.precio_prom_venta ?? 0),
        (r.stock_disponible ?? 0).toLocaleString(),
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const text = String(data.cell.raw);
          if (text.includes("Full Price")) data.cell.styles.textColor = GREEN;
          else if (text.includes("Rebajas")) data.cell.styles.textColor = RED;
          else if (text.includes("Promo")) data.cell.styles.textColor = ORANGE;
        }
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const rowIndex = data.row.index;
          const product = bottomProducts[rowIndex];
          if (product?.foto && imageCache.has(product.foto)) {
            try {
              doc.addImage(
                imageCache.get(product.foto)!,
                "JPEG",
                data.cell.x + 1,
                data.cell.y + 1,
                8,
                8
              );
            } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── SALUD DE PRODUCTO — RIESGO AGOTADOS ──
  if (healthData.length) {
    drawSectionTitle("SALUD DE PRODUCTO - RIESGO DE AGOTADOS");
    
    autoTable(doc, {
      startY: y,
      head: [["", "Producto", "SKU", "Stock Total", "WOS", "Estado"]],
      body: healthData.slice(0, 30).map(r => [
        { content: "", styles: { minCellWidth: 10, cellWidth: 10 } },
        stripEmoji((r.producto ?? "-")).substring(0, 35),
        (r.sku ?? "-").substring(0, 15),
        ((r.stock_tiendas ?? 0) + (r.stock_digital ?? 0)).toLocaleString(),
        (r.wos ?? 0).toFixed(1),
        stripEmoji(r.estado_salud ?? "-"),
      ]),
      styles: { fontSize: 7, cellPadding: 2, minCellHeight: 10 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [254, 252, 232] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: 10 } },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 0) {
          const rowIndex = data.row.index;
          const product = healthData[rowIndex];
          if (product?.foto && imageCache.has(product.foto)) {
            try {
              doc.addImage(
                imageCache.get(product.foto)!,
                "JPEG",
                data.cell.x + 1,
                data.cell.y + 1,
                8,
                8
              );
            } catch { /* skip */ }
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── RECOMENDACIONES DE TRASLADO ──
  if (transferData.length) {
    drawSectionTitle("RECOMENDACIONES DE TRASLADO DE STOCK");
    
    autoTable(doc, {
      startY: y,
      head: [["Producto", "SKU", "Origen", "Stock Orig.", "Destino", "Uds Sugeridas"]],
      body: transferData.slice(0, 30).map(r => [
        stripEmoji((r.producto ?? "-")).substring(0, 30),
        (r.sku ?? "-").substring(0, 15),
        (r.tienda_origen ?? "-").substring(0, 20),
        (r.stock_origen ?? 0).toLocaleString(),
        (r.tienda_destino ?? "-").substring(0, 20),
        (r.uds_sugeridas ?? 0).toLocaleString(),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: BLACK as any, textColor: 255, fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: [238, 242, 255] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── FOOTER on every page ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(`Monastery - Informe Ejecutivo - ${stripEmoji(dateStr)}`, margin, pageH - 6);
    doc.text(`Pagina ${i} / ${totalPages}`, pageW - margin, pageH - 6, { align: "right" });
    // Thin line
    doc.setDrawColor(200, 200, 210);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
  }

  // Save
  const safeName = titulo.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑ0-9 ]/g, "").replace(/\s+/g, "_");
  doc.save(`${safeName}_${effectiveDays}d.pdf`);
}

/* ── Component ── */
interface ReportGeneratorProps {
  days: number;
}

export function ReportGeneratorButton({ days }: ReportGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [reportType, setReportType] = useState<"completo" | "canal" | "tienda">("completo");
  const [canal, setCanal] = useState("tiendas");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (reportType === "tienda" && locations.length === 0) {
      supabase.from("locations").select("location_id, name").eq("is_active", true).order("name")
        .then(({ data }) => {
          if (data) setLocations(data as Location[]);
        });
    }
  }, [reportType, locations.length]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const loc = locations.find(l => l.location_id === locationId);
      await generateReport(
        days,
        reportType,
        reportType === "canal" ? canal : undefined,
        reportType === "tienda" ? locationId : undefined,
        reportType === "tienda" ? loc?.name : undefined,
      );
    } catch (err) {
      console.error("Error generating report:", err);
    }
    setGenerating(false);
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
      >
        <FileText className="h-4 w-4" />
        Generar Informe
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Generar Informe Ejecutivo</DialogTitle>
            <DialogDescription>Selecciona el tipo de informe y descárgalo en PDF</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Tipo de informe</label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="completo">📊 Informe Ejecutivo Completo</SelectItem>
                  <SelectItem value="canal">📈 Informe Ejecutivo por Canal</SelectItem>
                  <SelectItem value="tienda">🏪 Informe Ejecutivo por Tienda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reportType === "canal" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Canal</label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50">
                    <SelectItem value="tiendas">🏬 Tiendas de Línea</SelectItem>
                    <SelectItem value="outlets">🏷️ Outlets</SelectItem>
                    <SelectItem value="digital">🌐 Digital</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {reportType === "tienda" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Tienda</label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tienda..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border border-border shadow-lg z-50 max-h-[200px]">
                    {locations.map(loc => (
                      <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleGenerate}
              disabled={generating || (reportType === "tienda" && !locationId)}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Descargar PDF
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
