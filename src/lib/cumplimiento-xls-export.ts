import ExcelJS from "exceljs";

type CumplimientoRow = {
  level: "group" | "subgroup" | "item" | "total-tiendas";
  label: string;
  budget: number;
  ventaNeta: number;
  pct: number;
  pctToDate: number;
  budgetToDate: number;
  unidades: number;
  ticket: number;
};

type GrandTotal = {
  label: string;
  budget: number;
  ventaNeta: number;
  pct: number;
  pctToDate: number;
  budgetToDate: number;
  unidades: number;
  ticket: number;
};

function pctFill(pct: number): Partial<ExcelJS.Fill> | undefined {
  if (pct >= 100) return { type: "pattern", pattern: "solid", fgColor: { argb: "FF00B050" } }; // green
  if (pct >= 80) return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC000" } }; // yellow/orange
  return { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } }; // red
}

function pctFont(pct: number): Partial<ExcelJS.Font> {
  if (pct >= 100) return { bold: true, color: { argb: "FF006100" } };
  if (pct >= 80) return { bold: true, color: { argb: "FF9C6500" } };
  return { bold: true, color: { argb: "FF9C0006" } };
}

const borderThin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD9D9D9" } },
  bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
  left: { style: "thin", color: { argb: "FFD9D9D9" } },
  right: { style: "thin", color: { argb: "FFD9D9D9" } },
};

const borderMedium: Partial<ExcelJS.Borders> = {
  top: { style: "medium", color: { argb: "FF000000" } },
  bottom: { style: "medium", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FFD9D9D9" } },
  right: { style: "thin", color: { argb: "FFD9D9D9" } },
};

const COP_FMT = '"$" #,##0';
const PCT_FMT = "0%";

export async function exportCumplimientoXLS(
  rows: CumplimientoRow[],
  grandTotal: GrandTotal,
  monthName: string,
  year: number
) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cumplimiento");

  // Column widths matching the image
  ws.columns = [
    { key: "budget", width: 22 },
    { key: "store", width: 38 },
    { key: "venta", width: 22 },
    { key: "budgetToDate", width: 22 },
    { key: "cumplimiento", width: 16 },
    { key: "unidades", width: 16 },
    { key: "promedio", width: 22 },
  ];

  // ── Title row ──
  const titleRow = ws.addRow([`VENTAS Y CUMPLIMIENTO ACUMULADO ${monthName.toUpperCase()}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 7);
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF000000" } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  titleRow.height = 30;
  for (let c = 1; c <= 7; c++) {
    titleRow.getCell(c).border = {
      bottom: { style: "medium", color: { argb: "FF000000" } },
    };
  }

  // ── Header row ──
  const headers = ["PRESUPUESTO\nMENSUAL", "TIENDA", "VENTA", "PRESUPUESTO A LA\nFECHA", "CUMPLIMIENTO", "UNIDADES\nVENDIDAS", "PROMEDIO"];
  const headerRow = ws.addRow(headers);
  headerRow.height = 32;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FF000000" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } };
    cell.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
      bottom: { style: "medium", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  // Helper to add a data row
  const addDataRow = (
    budget: number,
    label: string,
    venta: number,
    budgetToDate: number,
    pct: number,
    unidades: number,
    promedio: number | null,
    isTotal: boolean,
    isBoldTotal: boolean
  ) => {
    const r = ws.addRow([
      budget || null,
      label,
      venta || null,
      budgetToDate || null,
      pct / 100,
      unidades || null,
      promedio ?? null,
    ]);

    // Budget col
    r.getCell(1).numFmt = COP_FMT;
    r.getCell(1).alignment = { horizontal: "right" };
    // Store col
    r.getCell(2).alignment = { horizontal: "center" };
    // Venta col
    r.getCell(3).numFmt = COP_FMT;
    r.getCell(3).alignment = { horizontal: "right" };
    // Budget to date col
    r.getCell(4).numFmt = COP_FMT;
    r.getCell(4).alignment = { horizontal: "right" };
    // Cumplimiento col
    r.getCell(5).numFmt = PCT_FMT;
    r.getCell(5).alignment = { horizontal: "center" };
    if (pct > 0) {
      r.getCell(5).font = pctFont(pct);
    }
    // Unidades col
    r.getCell(6).numFmt = "#,##0";
    r.getCell(6).alignment = { horizontal: "center" };
    // Promedio col
    if (promedio != null) {
      r.getCell(7).numFmt = COP_FMT;
      r.getCell(7).alignment = { horizontal: "right" };
    }

    // Styling for totals
    if (isBoldTotal) {
      r.eachCell((cell) => {
        cell.font = { ...cell.font, bold: true, size: 11 };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
        cell.border = borderMedium;
      });
    } else if (isTotal) {
      r.eachCell((cell) => {
        cell.font = { ...cell.font, bold: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        cell.border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FFD9D9D9" } },
          right: { style: "thin", color: { argb: "FFD9D9D9" } },
        };
      });
    } else {
      r.eachCell((cell) => {
        cell.border = borderThin;
      });
    }

    return r;
  };

  // ── Build rows matching image structure ──
  // Separate rows by type
  const zones: Record<string, CumplimientoRow[]> = {};
  const channels: CumplimientoRow[] = [];
  let currentZone = "";

  for (const row of rows) {
    if (row.level === "group") {
      // Digital channels group header - skip, we'll handle channels
      continue;
    }
    if (row.level === "total-tiendas") {
      // We'll compute this ourselves
      continue;
    }
    if (row.level === "subgroup") {
      currentZone = row.label.replace(/📍\s*/, "");
      if (!zones[currentZone]) zones[currentZone] = [];
      continue;
    }
    if (row.level === "item") {
      // Check if it belongs to a zone or to channels
      if (currentZone && zones[currentZone] !== undefined) {
        zones[currentZone].push(row);
      } else {
        channels.push(row);
      }
    }
  }

  // Find zone subtotals and channel group from original rows
  const zoneSubtotals: Record<string, CumplimientoRow> = {};
  const channelGroup = rows.find(r => r.level === "group");
  const totalTiendas = rows.find(r => r.level === "total-tiendas");

  for (const row of rows) {
    if (row.level === "subgroup") {
      const zoneName = row.label.replace(/📍\s*/, "");
      zoneSubtotals[zoneName] = row;
    }
  }

  // 1. Print stores by zone
  let zoneIndex = 0;
  const zoneNames = Object.keys(zones);
  for (const zoneName of zoneNames) {
    const storeRows = zones[zoneName];
    zoneIndex++;

    // Individual stores
    for (const st of storeRows) {
      addDataRow(
        st.budget, st.label, st.ventaNeta, st.budgetToDate, st.pct,
        st.unidades, null, false, false
      );
    }

    // Zone subtotal
    const zt = zoneSubtotals[zoneName];
    if (zt) {
      // Compute promedio for zone
      const daysWithSales = storeRows.filter(s => s.ventaNeta > 0).length || 1;
      addDataRow(
        zt.budget, `TOTAL TIENDAS ${zoneName.toUpperCase()}`, zt.ventaNeta,
        zt.budgetToDate, zt.pct, zt.unidades,
        zt.ticket, true, false
      );
    }
  }

  // 2. TOTAL TIENDAS COLOMBIA
  if (totalTiendas) {
    addDataRow(
      totalTiendas.budget, "TOTAL TIENDAS COLOMBIA", totalTiendas.ventaNeta,
      totalTiendas.budgetToDate, totalTiendas.pct, totalTiendas.unidades,
      totalTiendas.ticket, false, true
    );
  }

  // 3. Digital channels
  for (const ch of channels) {
    addDataRow(
      ch.budget, ch.label.toUpperCase(), ch.ventaNeta, ch.budgetToDate, ch.pct,
      ch.unidades, null, false, false
    );
  }

  // 4. TOTAL DIGITAL
  if (channelGroup) {
    addDataRow(
      channelGroup.budget, "TOTAL DIGITAL", channelGroup.ventaNeta,
      channelGroup.budgetToDate, channelGroup.pct, channelGroup.unidades,
      channelGroup.ticket, false, true
    );
  }

  // 5. TOTAL COMPAÑÍA (Grand Total)
  addDataRow(
    grandTotal.budget, "TOTAL COMPAÑÍA", grandTotal.ventaNeta,
    grandTotal.budgetToDate, grandTotal.pct, grandTotal.unidades,
    grandTotal.ticket, false, true
  );

  // Last row extra bold styling
  const lastRow = ws.lastRow;
  if (lastRow) {
    lastRow.eachCell((cell) => {
      cell.font = { ...cell.font, bold: true, size: 12 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB4C6E7" } };
      cell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
    });
  }

  // Generate and download
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Cumplimiento_${monthName}_${year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
