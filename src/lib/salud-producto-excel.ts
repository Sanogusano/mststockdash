import ExcelJS from "exceljs";

export type SaludRecord = Record<string, string | number | null>;

export const PCT_COLS = ["ST 120d", "ST Total"];
export const DEC_COLS = ["RDV Total", "RDV Tienda", "RDV Online"];
export const TEXT_COLS = ["SKU padre", "Referencia NS", "SKUs hijos", "SKU", "Product ID", "Producto", "Categoría", "Clasificación", "Estado Salud"];

export function stripEmojis(s: unknown): string {
  return String(s ?? "")
    .replace(/[\p{Extended_Pictographic}\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSaludFileName(date = new Date()) {
  return `Salud_Producto_${date.toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.xlsx`;
}

export function splitSkus(v: unknown): string[] {
  return String(v ?? "").split(", ").map((s) => s.trim()).filter(Boolean);
}

/** Hoja 1: quita "SKUs hijos" y agrega "N° SKUs" después de Producto. */
export function toMainSheetRecords(records: SaludRecord[]): SaludRecord[] {
  return records.map((r) => {
    const out: SaludRecord = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "SKUs hijos") continue;
      out[k] = v;
      if (k === "Producto") out["N° SKUs"] = splitSkus(r["SKUs hijos"]).length;
    }
    return out;
  });
}

/** Hoja 2: una fila por SKU hijo, sin métricas. */
export function toSkuSheetRecords(records: SaludRecord[]): SaludRecord[] {
  return records.flatMap((r) => splitSkus(r["SKUs hijos"]).map((sku) => ({
    SKU: sku,
    "SKU padre": String(r["SKU padre"] ?? ""),
    "Referencia NS": String(r["Referencia NS"] ?? ""),
    Producto: String(r.Producto ?? ""),
    Categoría: String(r["Categoría"] ?? ""),
    "Estado Salud": stripEmojis(r["Estado Salud"]),
    "Product ID": String(r["Product ID"] ?? ""),
  })));
}

export async function buildSaludWorkbook(records: SaludRecord[], title: string) {
  const wb = new ExcelJS.Workbook();
  const hasSkus = records.some((r) => "SKUs hijos" in r);
  writeSheet(wb.addWorksheet("Salud de Producto"), hasSkus ? toMainSheetRecords(records) : records, title, "Producto");
  if (hasSkus) writeSheet(wb.addWorksheet("SKUs (cruce NetSuite)"), toSkuSheetRecords(records), title, "SKU");
  return wb;
}

function writeSheet(ws: ExcelJS.Worksheet, records: SaludRecord[], title: string, freezeCol: string) {
  const headers = Object.keys(records[0] ?? {});
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { bold: true, size: 13 };
  const head = ws.getRow(3);
  headers.forEach((h, i) => {
    const c = head.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
    c.alignment = { vertical: "middle" };
  });
  records.forEach((r, ri) => {
    const row = ws.getRow(4 + ri);
    headers.forEach((h, ci) => {
      const c = row.getCell(ci + 1);
      if (TEXT_COLS.includes(h)) { c.value = h === "Estado Salud" ? stripEmojis(r[h]) : String(r[h] ?? ""); c.numFmt = "@"; return; }
      const v = Number(r[h]);
      c.value = Number.isFinite(v) ? v : null;
      c.numFmt = PCT_COLS.includes(h) ? '0.0"%"' : DEC_COLS.includes(h) ? "0.00" : "#,##0";
    });
  });
  headers.forEach((h, i) => {
    let w = h.length;
    for (const r of records) {
      const v = r[h];
      const len = typeof v === "number" ? v.toLocaleString("es-CO", { maximumFractionDigits: 2 }).length + 1 : stripEmojis(v).length;
      if (len > w) w = len;
    }
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 8), 60);
  });
  const prodCol = Math.max(headers.indexOf(freezeCol) + 1, 1);
  ws.views = [{ state: "frozen", xSplit: prodCol, ySplit: 3 }];
  if (headers.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + records.length, column: headers.length } };
}

export async function exportSaludExcel(records: SaludRecord[], title: string) {
  const wb = await buildSaludWorkbook(records, title);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = buildSaludFileName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
