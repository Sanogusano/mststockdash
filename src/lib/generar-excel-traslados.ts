// Generación de archivos Excel para NetSuite y empaquetado en ZIP.
// Formato exigido por NetSuite: una hoja con columnas específicas.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { SugerenciaTraslado } from "./traslados-api";

export interface FilaNetSuite {
  idExterno: string;
  subsidiaria: number;
  fecha: string; // DD/MM/YYYY
  ubicacionOrigen: number;
  ubicacionDestino: number;
  articulo: string; // SKU
  idInternoArt: number;
  empleado: string;
  cantidad: number;
}

export interface ExcelBuildParams {
  idExterno: string;
  fecha: string; // DD/MM/YYYY
  empleado: string;
  subsidiaria: number;
  codigoOrigen: number;
  codigoDestino: number;
  lineas: SugerenciaTraslado[];
  mapeoSkus: Record<string, number>;
  ajustes: Record<string, number>;
}

export interface ExcelBuildResult {
  blob: Blob;
  nombreArchivo: string;
  filasIncluidas: number;
  unidadesTotales: number;
  skusExcluidos: string[];
}

// Convierte ISO YYYY-MM-DD → DD/MM/YYYY
export function formatearFechaNetSuite(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export async function generarExcel(
  params: ExcelBuildParams,
): Promise<ExcelBuildResult> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monastery";
  wb.created = new Date();

  const ws = wb.addWorksheet("Traslado");

  const headers = [
    "ID EXTERNO",
    "SUBSIDIARIA",
    "FECHA",
    "UBICACIÓN ORIGEN",
    "UBICACIÓN DESTINO",
    "ARTÍCULO",
    "ID INTERNO ART",
    "EMPLEADO",
    "CANTIDAD",
  ];
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };

  const skusExcluidos: string[] = [];
  let filasIncluidas = 0;
  let unidadesTotales = 0;

  for (const linea of params.lineas) {
    const idInterno = params.mapeoSkus[linea.r_sku];
    if (!idInterno) {
      skusExcluidos.push(linea.r_sku);
      continue;
    }
    const cantidad =
      params.ajustes[`${linea.r_sku}__${linea.r_origen_location_id}__${linea.r_destino_location_id}`] ??
      linea.r_unidades_sugeridas;
    if (!cantidad || cantidad <= 0) continue;

    ws.addRow([
      params.idExterno,
      params.subsidiaria,
      params.fecha,
      params.codigoOrigen,
      params.codigoDestino,
      linea.r_sku,
      idInterno,
      params.empleado,
      cantidad,
    ]);
    filasIncluidas += 1;
    unidadesTotales += cantidad;
  }

  // Anchos de columna razonables
  ws.columns.forEach((col, idx) => {
    col.width = idx === 0 ? 22 : idx === 7 ? 22 : 16;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // Nombre: "{codigoOrigen} {idExterno-consecutivo} {NOMBRE_DESTINO}.xlsx"
  // El idExterno ya viene compuesto, así que usamos eso para el nombre
  const nombreArchivo = `${params.idExterno}.xlsx`;

  return { blob, nombreArchivo, filasIncluidas, unidadesTotales, skusExcluidos };
}

export async function generarYDescargarZip(
  archivos: { nombre: string; blob: Blob }[],
  nombreZip: string,
): Promise<void> {
  const zip = new JSZip();
  for (const a of archivos) {
    const arrayBuffer = await a.blob.arrayBuffer();
    zip.file(a.nombre, arrayBuffer);
  }
  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, nombreZip);
}
