import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

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

  // Temporarily expand the element to full height to capture everything
  const originalOverflow = element.style.overflow;
  const originalMaxHeight = element.style.maxHeight;
  element.style.overflow = "visible";
  element.style.maxHeight = "none";

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const imgAspect = canvas.height / canvas.width;
    const contentH = contentW * imgAspect;

    let heightLeft = contentH;
    let position = margin;
    let page = 0;

    while (heightLeft > 0) {
      if (page > 0) {
        pdf.addPage();
      }

      // Calculate source crop for this page
      const availableH = pageH - margin * 2;
      const sliceH = Math.min(heightLeft, availableH);
      
      // For the first page, add from top; for subsequent pages, offset
      const sourceY = page * availableH;
      
      // Create a temporary canvas for this page slice
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      const slicePixelH = Math.round((sliceH / contentH) * canvas.height);
      sliceCanvas.height = slicePixelH;
      const ctx = sliceCanvas.getContext("2d");
      if (ctx) {
        const sourcePixelY = Math.round((sourceY / contentH) * canvas.height);
        ctx.drawImage(
          canvas,
          0, sourcePixelY, canvas.width, slicePixelH,
          0, 0, canvas.width, slicePixelH
        );
      }

      const sliceData = sliceCanvas.toDataURL("image/png");
      pdf.addImage(sliceData, "PNG", margin, margin, contentW, sliceH);

      // Footer
      pdf.setFontSize(6);
      pdf.setTextColor(150, 150, 165);
      pdf.text(`Monastery — Reporte Cumplimiento ${monthName} ${year}`, margin, pageH - 4);
      pdf.text(`Página ${page + 1}`, pageW - margin, pageH - 4, { align: "right" });

      heightLeft -= availableH;
      page++;
    }

    pdf.save(`Cumplimiento_${monthName}_${year}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
  } finally {
    // Restore original styles
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
  }
}
