import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export async function exportProyeccionPDF(
  elementId: string,
  monthName: string,
  year: number
) {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error("Proyección element not found for PDF export");
    return;
  }

  const originalOverflow = element.style.overflow;
  const originalMaxHeight = element.style.maxHeight;
  const originalDisplay = element.style.display;
  const originalPosition = element.style.position;
  const originalLeft = element.style.left;
  const originalTop = element.style.top;

  element.style.overflow = "visible";
  element.style.maxHeight = "none";
  element.style.display = "block";
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = "-1";

  try {
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentW = pageW - margin * 2;
    const footerSpace = 8;
    const sectionGap = 4;

    const sections = Array.from(
      element.querySelectorAll("[data-pdf-section]")
    ) as HTMLElement[];
    const targets = sections.length > 0 ? sections : [element];

    let currentY = margin;
    let pageNum = 1;

    const addFooter = () => {
      pdf.setFontSize(6);
      pdf.setTextColor(150, 150, 165);
      pdf.text(
        `Monastery — Proyección de Cierre ${monthName} ${year}`,
        margin,
        pageH - 4
      );
      pdf.text(`Página ${pageNum}`, pageW - margin, pageH - 4, { align: "right" });
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

      if (currentY + sectionHeightMM > availableH && currentY > margin) {
        addFooter();
        pdf.addPage();
        pageNum++;
        currentY = margin;
      }

      if (sectionHeightMM > availableH - margin) {
        const sectionRect = section.getBoundingClientRect();
        const rowBottoms: number[] = [];
        section.querySelectorAll("tr").forEach((tr) => {
          const trRect = tr.getBoundingClientRect();
          rowBottoms.push(trRect.bottom - sectionRect.top);
        });
        rowBottoms.sort((a, b) => a - b);

        const canvasScale = 2;
        const cssToPdfScale = contentW / (canvas.width / canvasScale);
        const totalCssPx = canvas.height / canvasScale;
        let startCssPx = 0;

        while (startCssPx < totalCssPx) {
          const availMM = availableH - currentY;
          const maxCssPxPerPage = availMM / cssToPdfScale;
          const idealEndCssPx = startCssPx + maxCssPxPerPage;

          let endCssPx = totalCssPx;
          if (idealEndCssPx < totalCssPx) {
            let bestBreak = idealEndCssPx * 0.8;
            for (let i = rowBottoms.length - 1; i >= 0; i--) {
              if (rowBottoms[i] <= idealEndCssPx && rowBottoms[i] > startCssPx) {
                bestBreak = rowBottoms[i];
                break;
              }
            }
            endCssPx = bestBreak;
          }

          const srcY = Math.round(startCssPx * canvasScale);
          const srcH = Math.round((endCssPx - startCssPx) * canvasScale);
          const sliceHeightMM = (endCssPx - startCssPx) * cssToPdfScale;

          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = srcH;
          const ctx = sliceCanvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
          }

          pdf.addImage(
            sliceCanvas.toDataURL("image/png"),
            "PNG",
            margin,
            currentY,
            contentW,
            sliceHeightMM
          );

          startCssPx = endCssPx;

          if (startCssPx < totalCssPx) {
            addFooter();
            pdf.addPage();
            pageNum++;
            currentY = margin;
          } else {
            currentY += sliceHeightMM + sectionGap;
          }
        }
      } else {
        pdf.addImage(imgData, "PNG", margin, currentY, contentW, sectionHeightMM);
        currentY += sectionHeightMM + sectionGap;
      }
    }

    addFooter();
    pdf.save(`Proyeccion_Cierre_${monthName}_${year}.pdf`);
  } catch (error) {
    console.error("Error generating Proyección PDF:", error);
  } finally {
    element.style.overflow = originalOverflow;
    element.style.maxHeight = originalMaxHeight;
    element.style.display = originalDisplay;
    element.style.position = originalPosition;
    element.style.left = originalLeft;
    element.style.top = originalTop;
    element.style.zIndex = "";
  }
}
