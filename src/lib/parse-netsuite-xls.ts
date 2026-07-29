/**
 * Parser de archivos XML Spreadsheet 2003 (.xls) exportados desde NetSuite.
 * Reporte: "Inventario Disponible por Ubicación".
 *
 * Notas clave:
 * - El archivo NO es Excel binario; es XML con extensión .xls
 * - Las celdas vacías se comprimen usando ss:Index — debe respetarse
 * - Las columnas se localizan POR NOMBRE de header, no por índice fijo:
 *   NetSuite puede agregar/reordenar columnas (p. ej. "Código UPC", bodegas
 *   nuevas) y el parser debe seguir funcionando sin cambios.
 * - Se incluyen los sub_tipo vendibles: PRENDAS, ACCESORIOS y CALZADO.
 *   Se excluyen MUESTRAS, INSUMOS, TELA, MATERIAL DE EMPAQUE, GANCHO, Total.
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

const NUM_COLS = 80;
const HEADER_ROW_INDEX = 6;
const DATA_START_ROW = 7;

// Sub_tipos que SÍ entran al inventario (vendibles). Todo lo demás se ignora.
const SUBTIPOS_INCLUIDOS = new Set(["PRENDAS", "ACCESORIOS", "CALZADO"]);

// Nombres de las columnas de atributo de producto en el header NetSuite.
const COL_SUBTIPO = "Sub tipo";
const COL_COLECCION = "Colección temporada";
const COL_COLECCION_SKU = "Colección SKU";
const COL_ARTICULO = "Artículo";
const COL_NOMBRE = "Nombre para mostrar";
const COL_LINEA = "Línea";
const COL_GENERO = "Género";
const COL_COLOR = "Color";
const COL_TALLA = "Talla";
const COL_TOTAL = "Total";

// Columnas que NO son ubicaciones (atributos de producto + Total).
// Cualquier otra columna con nombre se trata como ubicación.
const NON_LOCATION_HEADERS = new Set([
  COL_SUBTIPO,
  "Proveedor",
  COL_COLECCION,
  COL_COLECCION_SKU,
  COL_ARTICULO,
  "Código UPC",
  COL_NOMBRE,
  COL_LINEA,
  COL_GENERO,
  COL_COLOR,
  COL_TALLA,
  COL_TOTAL,
  "",
]);

/**
 * Normaliza el SKU. NetSuite a veces lo entrega como "PADRE:VARIANTE".
 * Si contiene ':', se queda con la parte después del ':'.
 */
function normalizeSku(raw: string): string {
  if (!raw) return "";
  if (raw.includes(":")) {
    return raw.split(":").pop()!.trim();
  }
  return raw.trim();
}

/**
 * Parsea una fila respetando ss:Index (celdas vacías comprimidas).
 */
function parseRow(rowElement: Element, numCols: number = NUM_COLS): string[] {
  const result: string[] = new Array(numCols).fill("");
  let pos = 0;

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

/**
 * Construye un índice nombre-de-columna → posición a partir del header.
 * Lanza error si falta una columna de atributo esperada (aviso temprano
 * en vez de fallar en silencio si NetSuite cambia el reporte).
 */
function buildColumnIndex(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h && !(h in idx)) idx[h] = i;
  });

  const requeridas = [COL_SUBTIPO, COL_ARTICULO];
  const faltantes = requeridas.filter((c) => !(c in idx));
  if (faltantes.length > 0) {
    throw new Error(
      `El archivo NetSuite no tiene las columnas esperadas: ${faltantes.join(
        ", "
      )}. ¿Cambió el formato del reporte?`
    );
  }
  return idx;
}

export async function parseNetsuiteXls(
  file: File
): Promise<NetsuiteSnapshotData> {
  const text = await file.text();

  if (!text.trimStart().startsWith("<?xml") || !text.includes("<Workbook")) {
    throw new Error(
      "Formato inválido. El archivo debe ser XML Spreadsheet 2003 exportado desde NetSuite."
    );
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");

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

  // Header y mapa de columnas por nombre
  const headers = parseRow(rows[HEADER_ROW_INDEX], NUM_COLS);
  const col = buildColumnIndex(headers);

  // Posiciones de ubicación = cualquier header que no sea atributo/Total
  const locationCols: number[] = [];
  headers.forEach((h, i) => {
    if (h && !NON_LOCATION_HEADERS.has(h)) locationCols.push(i);
  });

  const iSub = col[COL_SUBTIPO];
  const iArt = col[COL_ARTICULO];
  const iColeccion = col[COL_COLECCION] ?? -1;
  const iColeccionSku = col[COL_COLECCION_SKU] ?? -1;
  const iNombre = col[COL_NOMBRE] ?? -1;
  const iLinea = col[COL_LINEA] ?? -1;
  const iGenero = col[COL_GENERO] ?? -1;
  const iColor = col[COL_COLOR] ?? -1;
  const iTalla = col[COL_TALLA] ?? -1;

  const get = (cells: string[], i: number): string | null =>
    i >= 0 && cells[i] ? cells[i] : null;

  const lines: NetsuiteLine[] = [];
  const skuSet = new Set<string>();
  const locationUnits: Record<string, number> = {};
  const lineaUnits: Record<string, number> = {};
  let totalUnits = 0;
  let normalizedCount = 0;

  for (let i = DATA_START_ROW; i < rows.length; i++) {
    const cells = parseRow(rows[i], NUM_COLS);
    const subTipo = cells[iSub];
    const rawSku = cells[iArt];
    const sku = normalizeSku(rawSku);

    if (!sku || subTipo === "Total") continue;
    if (!SUBTIPOS_INCLUIDOS.has(subTipo)) continue;

    if (rawSku && rawSku.includes(":")) normalizedCount++;

    for (const c of locationCols) {
      const qtyStr = cells[c];
      if (!qtyStr) continue;
      const qty = parseFloat(qtyStr);
      if (!qty || qty <= 0) continue;

      const qtyInt = Math.floor(qty);
      const locationName = headers[c];
      if (!locationName) continue;

      lines.push({
        sku,
        netsuiteLocationName: locationName,
        quantity: qtyInt,
        subTipo,
        coleccion: get(cells, iColeccion),
        coleccionSku: get(cells, iColeccionSku),
        nombre: get(cells, iNombre),
        linea: get(cells, iLinea),
        genero: get(cells, iGenero),
        color: get(cells, iColor),
        talla: get(cells, iTalla),
      });

      skuSet.add(sku);
      totalUnits += qtyInt;
      locationUnits[locationName] = (locationUnits[locationName] || 0) + qtyInt;
      const lineaKey = get(cells, iLinea) || "(sin línea)";
      lineaUnits[lineaKey] = (lineaUnits[lineaKey] || 0) + qtyInt;
    }
  }

  if (lines.length === 0) {
    throw new Error(
      "No se encontraron productos vendibles (PRENDAS/ACCESORIOS/CALZADO) con stock. ¿Es el archivo correcto?"
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

  console.log(
    `[Parser] Líneas: ${lines.length}, SKUs únicos: ${skuSet.size}, normalizados (tenían ':'): ${normalizedCount}`
  );

  return {
    fileName: file.name,
    snapshotDate,
    totalSkus: skuSet.size,
    totalUnits,
    totalLocations: uniqueLocationNames.length,
    lines,
    warnings: [],
    topLocations,
    topLineas,
    uniqueLocationNames,
  };
}
