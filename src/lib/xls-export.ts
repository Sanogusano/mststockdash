import * as XLSX from "xlsx";

export function exportToXLS(
  data: Record<string, unknown>[],
  filename: string,
  sheetName?: string
) {
  if (!data.length) return;
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName ?? "Datos");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
