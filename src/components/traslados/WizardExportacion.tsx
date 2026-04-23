// Wizard de exportación: 3 pasos (Resumen, Datos comunes, Generar).
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { AlertTriangle, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  agruparParaExportacion,
  obtenerMapeoSkus,
  obtenerCodigosOracleUbicaciones,
  registrarExportacion,
  lineaId,
  type SugerenciaTraslado,
  type SnapshotActivo,
} from "@/lib/traslados-api";
import {
  formatearFechaNetSuite,
  generarExcel,
  generarYDescargarZip,
} from "@/lib/generar-excel-traslados";
import { ResumenExportacion } from "./ResumenExportacion";

interface Props {
  open: boolean;
  onClose: () => void;
  onCompletado: () => void;
  lineasAprobadas: SugerenciaTraslado[];
  ajustes: Map<string, number>;
  snapshot: SnapshotActivo | null;
  empleadoDefault: string;
}

export function WizardExportacion({
  open,
  onClose,
  onCompletado,
  lineasAprobadas,
  ajustes,
  snapshot,
  empleadoDefault,
}: Props) {
  // Línea aprobada con cantidad ajustada aplicada
  const lineasFinales = useMemo(
    () =>
      lineasAprobadas.map((l) => {
        const id = lineaId(l);
        const qty = ajustes.get(id);
        return qty != null ? { ...l, r_unidades_sugeridas: qty } : l;
      }),
    [lineasAprobadas, ajustes],
  );

  const agrupaciones = useMemo(
    () => agruparParaExportacion(lineasFinales),
    [lineasFinales],
  );

  const [consecutivo, setConsecutivo] = useState<number>(46125);
  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [empleado, setEmpleado] = useState<string>(empleadoDefault);
  const [mapeoSkus, setMapeoSkus] = useState<Record<string, number>>({});
  const [codigosOracle, setCodigosOracle] = useState<Record<string, number | null>>({});
  const [cargandoMapeos, setCargandoMapeos] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState(0);

  // Cargar mapeos al abrir
  useEffect(() => {
    if (!open) return;
    setCargandoMapeos(true);
    const skus = lineasFinales.map((l) => l.r_sku);
    const locs = lineasFinales.flatMap((l) => [
      l.r_origen_location_id,
      l.r_destino_location_id,
    ]);
    Promise.all([obtenerMapeoSkus(skus), obtenerCodigosOracleUbicaciones(locs)])
      .then(([s, o]) => {
        setMapeoSkus(s);
        setCodigosOracle(o);
      })
      .catch((e) => toast.error(`Error cargando mapeos: ${e.message ?? e}`))
      .finally(() => setCargandoMapeos(false));
  }, [open, lineasFinales]);

  // Detectar SKUs sin mapeo y ubicaciones sin código Oracle
  const skusSinMapeo = useMemo(() => {
    const set = new Set<string>();
    for (const l of lineasFinales) if (!mapeoSkus[l.r_sku]) set.add(l.r_sku);
    return [...set];
  }, [lineasFinales, mapeoSkus]);

  const ubicacionesSinCodigo = useMemo(() => {
    const set = new Set<string>();
    for (const g of agrupaciones) {
      if (!codigosOracle[g.origen_location_id]) set.add(g.origen_nombre);
      if (!codigosOracle[g.destino_location_id]) set.add(g.destino_nombre);
    }
    return [...set];
  }, [agrupaciones, codigosOracle]);

  const handleGenerar = async () => {
    if (ubicacionesSinCodigo.length > 0) {
      toast.error("Hay ubicaciones sin código Oracle. Configúralas primero.");
      return;
    }
    setGenerando(true);
    setProgreso(0);
    try {
      const fechaNs = formatearFechaNetSuite(fecha);
      const archivos: { nombre: string; blob: Blob }[] = [];
      let consecutivoActual = consecutivo;

      for (let i = 0; i < agrupaciones.length; i++) {
        const g = agrupaciones[i];
        const codOrigen = codigosOracle[g.origen_location_id];
        const codDestino = codigosOracle[g.destino_location_id];
        if (!codOrigen || !codDestino) continue;

        // Nombre destino: solo letras/números/espacio, mayúsculas
        const nombreDest = g.destino_nombre
          .toUpperCase()
          .replace(/[^A-Z0-9 ]/g, "")
          .trim();
        const idExterno = `${codOrigen} ${consecutivoActual} ${nombreDest}`;

        const ajustesObj: Record<string, number> = {};
        ajustes.forEach((v, k) => (ajustesObj[k] = v));

        const result = await generarExcel({
          idExterno,
          fecha: fechaNs,
          empleado,
          subsidiaria: 2,
          codigoOrigen: codOrigen,
          codigoDestino: codDestino,
          lineas: g.lineas,
          mapeoSkus,
          ajustes: ajustesObj,
        });

        if (result.filasIncluidas > 0) {
          archivos.push({ nombre: result.nombreArchivo, blob: result.blob });

          // Registrar en allocation_runs
          try {
            await registrarExportacion({
              snapshot_id: snapshot?.id ?? null,
              id_externo: idExterno,
              fecha_traslado: fecha,
              empleado,
              origen_location_id: g.origen_location_id,
              destino_location_id: g.destino_location_id,
              origen_netsuite_id: codOrigen,
              destino_netsuite_id: codDestino,
              lineas_json: g.lineas.map((l) => ({
                sku: l.r_sku,
                cantidad: ajustes.get(lineaId(l)) ?? l.r_unidades_sugeridas,
              })),
              total_unidades: result.unidadesTotales,
              total_lineas: result.filasIncluidas,
              subsidiaria: 2,
            });
          } catch (e) {
            console.warn("No se pudo registrar la exportación:", e);
          }
        }

        consecutivoActual += 1;
        setProgreso(Math.round(((i + 1) / agrupaciones.length) * 100));
      }

      if (archivos.length === 0) {
        toast.error("No se generó ningún archivo. Revisa mapeos de SKUs.");
        return;
      }

      const nombreZip = `traslados_${fecha}_${consecutivo}.zip`;
      await generarYDescargarZip(archivos, nombreZip);

      toast.success(`Exportados ${archivos.length} archivos. ZIP descargado.`);
      onCompletado();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error(`Error al generar: ${(e as Error).message ?? e}`);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !generando && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Exportar traslados a NetSuite
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Paso 1: Resumen */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Paso 1 · Resumen
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Cada archivo Excel contendrá los traslados de un mismo par origen→destino, porque
              NetSuite procesa los traslados agrupados por este criterio. Se generará un ZIP con
              todos los archivos para que los subas a NetSuite individualmente.
            </p>
            <ResumenExportacion agrupaciones={agrupaciones} ajustes={ajustes} />
          </section>

          {/* Paso 2: Datos comunes */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Paso 2 · Datos comunes
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              El <strong>consecutivo</strong> es un número que identifica el lote de traslados en
              NetSuite. Consulta con tu equipo el siguiente número disponible. Se incrementa
              automáticamente por cada archivo (ej: 46125, 46126, 46127…).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="consecutivo" className="text-xs">
                  Consecutivo inicial
                </Label>
                <Input
                  id="consecutivo"
                  type="number"
                  value={consecutivo}
                  onChange={(e) => setConsecutivo(parseInt(e.target.value || "0", 10))}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Se generará {consecutivo}, {consecutivo + 1}…
                </p>
              </div>
              <div>
                <Label htmlFor="fecha" className="text-xs">
                  Fecha
                </Label>
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="empleado" className="text-xs">
                  Empleado
                </Label>
                <Input
                  id="empleado"
                  value={empleado}
                  onChange={(e) => setEmpleado(e.target.value)}
                  className="h-9"
                  placeholder="Nombre del operador"
                />
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Subsidiaria: 2 (fijo)</p>
              </div>
            </div>
          </section>

          {/* Paso 3: Warnings */}
          {(skusSinMapeo.length > 0 || ubicacionesSinCodigo.length > 0) && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Paso 3 · Advertencias
              </h3>
              <Card className="p-3 border-yellow-300 bg-yellow-50/40 space-y-2">
                {skusSinMapeo.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">
                        {skusSinMapeo.length} SKU(s) sin id_interno_art (se excluirán):
                      </p>
                      <ul className="text-[10px] text-muted-foreground mt-1 list-disc list-inside">
                        {skusSinMapeo.slice(0, 5).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                        {skusSinMapeo.length > 5 && <li>… y {skusSinMapeo.length - 5} más</li>}
                      </ul>
                    </div>
                  </div>
                )}
                {ubicacionesSinCodigo.length > 0 && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-red-700">
                        Ubicaciones sin código Oracle (bloquean exportación):
                      </p>
                      <ul className="text-[10px] text-muted-foreground mt-1 list-disc list-inside">
                        {ubicacionesSinCodigo.map((u) => (
                          <li key={u}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </Card>
            </section>
          )}

          {generando && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Generando archivos… {progreso}%</p>
              <Progress value={progreso} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generando}>
            Cancelar
          </Button>
          <Button
            onClick={handleGenerar}
            disabled={
              generando ||
              cargandoMapeos ||
              ubicacionesSinCodigo.length > 0 ||
              agrupaciones.length === 0
            }
          >
            {generando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generando…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generar archivos ZIP
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
