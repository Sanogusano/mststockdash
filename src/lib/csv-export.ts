/**
 * Export array of objects as a CSV file download.
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string,
  textColumns: string[] = [],
) {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          // CSV has no cell types; a text prefix prevents Excel's numeric inference.
          const raw = val == null ? "" : String(val);
          const str = textColumns.includes(h) && raw ? `'${raw}` : raw;
          // Escape quotes and wrap in quotes if needed
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];

  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
