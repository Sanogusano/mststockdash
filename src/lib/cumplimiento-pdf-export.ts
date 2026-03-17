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

  // Temporarily expand
  const originalOverflow = element.style.overflow;
  const originalMaxHeight = element.style.maxHeight;
  element.style.overflow = "visible";
  element.style.maxHeight = "none";

  try {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - margin * 2;
    const footerSpace = 8;
    const sectionGap = 4;

    // Find all logical sections marked with data-pdf-section
    const sections = Array.from(
      element.querySelectorAll("[data-pdf-section]")
    ) as HTMLElement[];

    // Fallback: if no sections found, treat the whole element as one section
    const targets = sections.length > 0 ? sections : [element];

    let currentY = margin;
    let pageNum = 1;

    const addFooter = () => {
      pdf.setFontSize(6);
      pdf.setTextColor(150, 150, 165);
      pdf.text(
        `Monastery — Reporte Cumplimiento ${monthName} ${year}`,
        margin,
        pageH - 4
      );
      pdf.text(`Página ${pageNum}`, pageW - margin, pageH - 4, {
        align: "right",
      });
    };

    for (const section of targets) {
      const canvas = await html2canvas(section, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const scaleFactor = contentW / canvas.width;
      const sectionHeightMM = canvas.height * scaleFactor;
      const availableH = pageH - margin - footerSpace;

      // If section doesn't fit on current page, start a new one
      if (currentY + sectionHeightMM > availableH && currentY > margin) {
        addFooter();
        pdf.addPage();
        pageNum++;
        currentY = margin;
      }

      // If a single section is taller than one page, split it row-aware
      if (sectionHeightMM > availableH - margin) {
        // Capture row boundaries for this section
        const sectionRect = section.getBoundingClientRect();
        const rowBottoms: number[] = [];
        section.querySelectorAll("tr").forEach((tr) => {
          const trRect = tr.getBoundingClientRect();
          rowBottoms.push(trRect.bottom - sectionRect.top);
        });
        rowBottoms.sort((a, b) => a - b);

        const totalPx = canvas.height / 2; // scale=2
        let startPx = 0;

        while (startPx < totalPx) {
          const maxPxPerPage = (availableH - currentY) / scaleFactor;
          const idealEndPx = startPx + maxPxPerPage;

          let endPx = totalPx;
          if (idealEndPx < totalPx) {
            // Find the best row boundary before idealEndPx
            let bestBreak = idealEndPx * 0.8; // fallback
            for (let i = rowBottoms.length - 1; i >= 0; i--) {
              if (rowBottoms[i] <= idealEndPx && rowBottoms[i] > startPx) {
                bestBreak = rowBottoms[i];
                break;
              }
            }
            endPx = bestBreak;
          }

          // Slice the canvas
          const srcY = Math.round(startPx * 2); // scale=2
          const srcH = Math.round((endPx - startPx) * 2);
          const sliceHeightMM = (endPx - startPx) * scaleFactor;

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

          pdf.addImage(
            sliceCanvas.toDataURL("image/png"),
            "PNG",
            margin,
            currentY,
            contentW,
            sliceHeightMM
          );

          startPx = endPx;

          if (startPx < totalPx) {
            addFooter();
            pdf.addPage();
            pageNum++;
            currentY = margin;
          } else {
            currentY += sliceHeightMM + sectionGap;
          }
        }
      } else {
        // Section fits — add it directly
        pdf.addImage(imgData, "PNG", margin, currentY, contentW, sectionHeightMM);
        currentY += sectionHeightMM + sectionGap;
      }
    }

    // Final page footer
    addFooter();

    pdf.save(`Cumplimiento_${monthName}_${year}.pdf`);
  } catch (error) {
    console.error("Error generating PDF:", error);
  } finally {
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
  }
}
