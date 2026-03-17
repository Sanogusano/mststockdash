import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

/**
 * Find safe page-break positions by scanning table rows and KPI containers.
 * Returns an array of pixel Y-positions where it's safe to cut (between rows).
 */
function findSafeBreakPoints(element: HTMLElement): number[] {
  const rect = element.getBoundingClientRect();
  const breakPoints: number[] = [0]; // start

  // Collect bottom edges of all <tr> elements
  const rows = element.querySelectorAll("tr");
  rows.forEach((row) => {
    const rowRect = row.getBoundingClientRect();
    const bottomY = rowRect.bottom - rect.top;
    breakPoints.push(bottomY);
  });

  // Collect bottom edges of KPI card containers
  const cards = element.querySelectorAll(".glass-card, [class*='kpi']");
  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    const bottomY = cardRect.bottom - rect.top;
    breakPoints.push(bottomY);
  });

  // Sort and deduplicate
  const unique = [...new Set(breakPoints)].sort((a, b) => a - b);
  return unique;
}

export async function exportCumplimientoPDF(
  elementId: string,
  monthName: string,
  year: number
) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Dashboard element not found for PDF export");
    return;
  }

  // Temporarily expand the element and apply print-safe styles
  const originalOverflow = element.style.overflow;
  const originalMaxHeight = element.style.maxHeight;
  element.style.overflow = "visible";
  element.style.maxHeight = "none";

  // Inject temporary print CSS to protect rows from splitting
  const printStyle = document.createElement("style");
  printStyle.id = "pdf-export-print-styles";
  printStyle.textContent = `
    #${elementId} tr,
    #${elementId} .glass-card {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  `;
  document.head.appendChild(printStyle);

  try {
    // Collect safe break points BEFORE rendering to canvas
    const breakPoints = findSafeBreakPoints(element);
    const elementHeight = element.scrollHeight;
    const elementWidth = element.scrollWidth;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: elementWidth,
      windowHeight: elementHeight,
    });

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - margin * 2;
    const availableH = pageH - margin * 2 - 6; // 6mm reserved for footer

    // Scale factor: DOM pixels → PDF mm
    const scale = contentW / elementWidth;

    // Build page slices using safe break points
    const slices: { startPx: number; endPx: number }[] = [];
    let currentStartPx = 0;
    const maxSlicePx = availableH / scale; // max DOM pixels per page

    while (currentStartPx < elementHeight) {
      const idealEndPx = currentStartPx + maxSlicePx;

      if (idealEndPx >= elementHeight) {
        // Last page — take everything remaining
        slices.push({ startPx: currentStartPx, endPx: elementHeight });
        break;
      }

      // Find the best safe break point that doesn't exceed the page
      let bestBreak = currentStartPx + maxSlicePx * 0.5; // fallback: half page
      for (let i = breakPoints.length - 1; i >= 0; i--) {
        if (breakPoints[i] <= idealEndPx && breakPoints[i] > currentStartPx) {
          bestBreak = breakPoints[i];
          break;
        }
      }

      slices.push({ startPx: currentStartPx, endPx: bestBreak });
      currentStartPx = bestBreak;
    }

    // Render each slice to a PDF page
    const canvasScaleFactor = canvas.width / elementWidth;

    slices.forEach((slice, pageIdx) => {
      if (pageIdx > 0) pdf.addPage();

      const srcY = Math.round(slice.startPx * canvasScaleFactor);
      const srcH = Math.round((slice.endPx - slice.startPx) * canvasScaleFactor);
      const sliceHeightMM = (slice.endPx - slice.startPx) * scale;

      // Create a temporary canvas for this page slice
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = srcH;
      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(
          canvas,
          0, srcY, canvas.width, srcH,
          0, 0, canvas.width, srcH
        );
      }

      const sliceData = sliceCanvas.toDataURL("image/png");
      pdf.addImage(sliceData, "PNG", margin, margin, contentW, sliceHeightMM);

      // Footer
      pdf.setFontSize(6);
      pdf.setTextColor(150, 150, 165);
      pdf.text(
        `Monastery — Reporte Cumplimiento ${monthName} ${year}`,
        margin,
        pageH - 4
      );
      pdf.text(
        `Página ${pageIdx + 1} de ${slices.length}`,
        pageW - margin,
        pageH - 4,
        { align: "right" }
      );
    });

    pdf.save(`Cumplimiento_${monthName}_${year}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
  } finally {
    // Restore original styles
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
    // Remove injected print styles
    const injected = document.getElementById("pdf-export-print-styles");
    if (injected) injected.remove();
  }
}
