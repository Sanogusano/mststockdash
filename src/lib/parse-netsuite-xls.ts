/**
 * Parser de archivos XML Spreadsheet 2003 (.xls) exportados desde NetSuite.
 * Reporte: "Inventario Disponible por Ubicación".
 *
 * Notas clave:
 * - El archivo NO es Excel binario; es XML con extensión .xls
 * - Las celdas vacías se comprimen usando ss:Index — debe respetarse
 * - Solo procesamos sub_tipo = 'PRENDAS' (las demás no entran al allocation)
 */

export interface NetsuiteLine {
  sku: string;
  netsuiteLocationName: string;
  quantity: number;
  subTipo: string | null;
  coleccion: string | null;
  coleccionSku: string | null;
  nombre: string | null;
  linea: string | null;
  genero: string | null;
  color: string | null;
  talla: string | null;
}

export interface NetsuiteSnapshotData {
  fileName: string;
  snapshotDate: string; // YYYY-MM-DD
  totalSkus: number;
  totalUnits: number;
  totalLocations: number;
  lines: NetsuiteLine[];
  warnings: string[];
  // Datos auxiliares para preview
  topLocations: { name: string; units: number }[];
  topLineas: { name: string; units: number }[];
  uniqueLocationNames: string[];
}

const NUM_COLS = 60;

/**
 * Normaliza el SKU. NetSuite a veces lo entrega como "VARIANT_ID:SKU".
 * Si contiene ':', se queda con la parte después del ':'.
 */
function normalizeSku(raw: string): string {
  if (!raw) return "";
  if (raw.includes(":")) {
    return raw.split(":")[1].trim();
  }
  return raw.trim();
}
const HEADER_ROW_INDEX = 6;
const DATA_START_ROW = 8;
const LOCATION_COL_START = 10;
const LOCATION_COL_END = 59; // exclusivo: 10..58

/**
 * Parsea una fila respetando ss:Index (celdas vacías comprimidas).
 */
function parseRow(rowElement: Element, numCols: number = NUM_COLS): string[] {
  const result: string[] = new Array(numCols).fill("");
  let pos = 0;

  // :scope > Cell para no capturar celdas anidadas accidentalmente
  const cells = rowElement.querySelectorAll(":scope > Cell");

  cells.forEach((cell) => {
    const idx = cell.getAttribute("ss:Index");
    if (idx) pos = parseInt(idx, 10) - 1;

    const dataEl = cell.querySelector("Data");
    if (dataEl && pos < numCols) {
      result[pos] = (dataEl.textContent || "").trim();
    }
    pos++;
  });

  return result;
}

export async function parseNetsuiteXls(
  file: File
): Promise<NetsuiteSnapshotData> {
  const text = await file.text();

  // Validación de formato
  if (!text.trimStart().startsWith("<?xml") || !text.includes("<Workbook")) {
    throw new Error(
      "Formato inválido. El archivo debe ser XML Spreadsheet 2003 exportado desde NetSuite."
    );
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

  // Validar parseo
  const parserError = xmlDoc.querySelector("parsererror");
  if (parserError) {
    throw new Error("No se pudo parsear el XML del archivo NetSuite.");
  }

  const worksheet = xmlDoc.querySelector("Worksheet");
  if (!worksheet) {
    throw new Error("No se encontró ninguna hoja (Worksheet) en el archivo.");
  }

  const rows = worksheet.querySelectorAll("Row");
  if (rows.length < DATA_START_ROW + 1) {
    throw new Error("El archivo no tiene suficientes filas de datos.");
  }

  // Extraer headers
  const headers = parseRow(rows[HEADER_ROW_INDEX], NUM_COLS);

  const lines: NetsuiteLine[] = [];
  const skuSet = new Set<string>();
  const locationUnits: Record<string, number> = {};
  const lineaUnits: Record<string, number> = {};
  let totalUnits = 0;
  let normalizedCount = 0;

  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const cells = parseRow(rows[i], NUM_COLS);
    const subTipo = cells[0];
    const rawSku = cells[3];
    const sku = normalizeSku(rawSku);

    if (!sku || subTipo === "Total") continue;
    if (subTipo !== "PRENDAS") continue;

    if (rawSku && rawSku.includes(":")) normalizedCount++;

    for (let col = LOCATION_COL_START; col < LOCATION_COL_END; col++) {
      const qtyStr = cells[col];
      if (!qtyStr) continue;
      const qty = parseFloat(qtyStr);
      if (!qty || qty <= 0) continue;

      const qtyInt = Math.floor(qty);
      const locationName = headers[col];
      if (!locationName) continue;

      lines.push({
        sku,
        netsuiteLocationName: locationName,
        quantity: qtyInt,
        subTipo,
        coleccion: cells[1] || null,
        coleccionSku: cells[2] || null,
        nombre: cells[5] || null,
        linea: cells[6] || null,
        genero: cells[7] || null,
        color: cells[8] || null,
        talla: cells[9] || null,
      });

      skuSet.add(sku);
      totalUnits += qtyInt;
      locationUnits[locationName] = (locationUnits[locationName] || 0) + qtyInt;
      const lineaKey = cells[6] || "(sin línea)";
      lineaUnits[lineaKey] = (lineaUnits[lineaKey] || 0) + qtyInt;
    }
  }

  if (lines.length === 0) {
    throw new Error(
      "No se encontraron productos PRENDAS con stock. ¿Es el archivo correcto?"
    );
  }

  const uniqueLocationNames = Object.keys(locationUnits);

  const topLocations = uniqueLocationNames
    .map((name) => ({ name, units: locationUnits[name] }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 10);

  const topLineas = Object.keys(lineaUnits)
    .map((name) => ({ name, units: lineaUnits[name] }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 10);

  const today = new Date();
  const snapshotDate = today.toISOString().slice(0, 10);

  return {
    fileName: file.name,
    snapshotDate,
    totalSkus: skuSet.size,
    totalUnits,
    totalLocations: uniqueLocationNames.length,
    lines,
    warnings: [], // se completan después al cruzar con netsuite_location_mapping
    topLocations,
    topLineas,
    uniqueLocationNames,
  };
}
