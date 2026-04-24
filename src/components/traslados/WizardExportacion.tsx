// Wizard de exportación: 3 pasos (Resumen, Datos comunes, Generar).
// Incluye: consecutivo auto-sugerido por origen, validación de duplicados,
// empleado prellenado desde user_profiles con dropdown de operadores.
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  Pencil,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import {
  agruparParaExportacion,
  obtenerMapeoSkus,
  obtenerCodigosOracleUbicaciones,
  obtenerSiguientesConsecutivos,
  obtenerOperadoresDisponibles,
  validarIdExternosDuplicados,
  registrarExportacion,
  lineaId,
  type SugerenciaTraslado,
  type SnapshotActivo,
  type RegistroDuplicado,
  type OperadorDisponible,
} from "@/lib/traslados-api";
import {
  formatearFechaNetSuite,
  generarExcel,
  generarYDescargarZip,
} from "@/lib/generar-excel-traslados";
import { ResumenExportacion } from "./ResumenExportacion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onClose: () => void;
  onCompletado: () => void;
  lineasAprobadas: SugerenciaTraslado[];
  ajustes: Map<string, number>;
  snapshot: SnapshotActivo | null;
  empleadoDefault: string;
}

// Helper: normaliza nombre de destino igual que en handleGenerar
function normalizarNombreDestino(nombre: string): string {
  return nombre.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
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
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

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

  const [fecha, setFecha] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [empleado, setEmpleado] = useState<string>(empleadoDefault);
  const [empleadoUserId, setEmpleadoUserId] = useState<string | null>(null);
  const [operadores, setOperadores] = useState<OperadorDisponible[]>([]);
  const [editandoEmpleado, setEditandoEmpleado] = useState(false);

  const [mapeoSkus, setMapeoSkus] = useState<Record<string, number>>({});
  const [codigosOracle, setCodigosOracle] = useState<Record<string, number | null>>({});
  const [cargandoMapeos, setCargandoMapeos] = useState(false);

  // Consecutivos por origen NetSuite
  const [usarSugeridos, setUsarSugeridos] = useState(true);
  // { netsuiteId: consecutivoBase }  (auto-sugerido)
  const [sugeridosPorOrigen, setSugeridosPorOrigen] = useState<Record<number, number>>({});
  // { netsuiteId: consecutivoBase }  (manual override)
  const [manualesPorOrigen, setManualesPorOrigen] = useState<Record<number, number>>({});

  // Validación de duplicados
  const [duplicados, setDuplicados] = useState<RegistroDuplicado[]>([]);
  const [confirmacionDuplicado, setConfirmacionDuplicado] = useState("");
  const [forzarDuplicados, setForzarDuplicados] = useState(false);

  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState(0);

  // Cargar mapeos + operadores + nombre desde user_profiles + consecutivos al abrir
  useEffect(() => {
    if (!open) return;
    setCargandoMapeos(true);
    setForzarDuplicados(false);
    setConfirmacionDuplicado("");
    setEditandoEmpleado(false);

    const skus = lineasFinales.map((l) => l.r_sku);
    const locs = lineasFinales.flatMap((l) => [
      l.r_origen_location_id,
      l.r_destino_location_id,
    ]);

    Promise.all([
      obtenerMapeoSkus(skus),
      obtenerCodigosOracleUbicaciones(locs),
      obtenerOperadoresDisponibles().catch(() => []),
      userId
        ? supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", userId)
            .maybeSingle()
            .then(({ data }) => data?.full_name ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([s, o, ops, fullName]) => {
        setMapeoSkus(s);
        setCodigosOracle(o);
        setOperadores(ops);
        if (fullName) {
          setEmpleado(fullName);
          setEmpleadoUserId(userId);
        }
      })
      .catch((e) => toast.error(`Error cargando datos: ${e.message ?? e}`))
      .finally(() => setCargandoMapeos(false));
  }, [open, lineasFinales, userId]);

  // Orígenes únicos (NetSuite IDs) involucrados en esta exportación
  const origenesInvolucrados = useMemo(() => {
    const map = new Map<number, { nombre: string; archivos: number }>();
    for (const g of agrupaciones) {
      const codOrigen = codigosOracle[g.origen_location_id];
      if (!codOrigen) continue;
      if (!map.has(codOrigen)) {
        map.set(codOrigen, { nombre: g.origen_nombre, archivos: 0 });
      }
      map.get(codOrigen)!.archivos += 1;
    }
    return [...map.entries()].map(([codigo, info]) => ({
      codigo,
      nombre: info.nombre,
      archivos: info.archivos,
    }));
  }, [agrupaciones, codigosOracle]);

  // Cargar siguientes consecutivos cuando cambien los orígenes involucrados
  useEffect(() => {
    if (origenesInvolucrados.length === 0) return;
    obtenerSiguientesConsecutivos(origenesInvolucrados.map((o) => o.codigo))
      .then((map) => {
        setSugeridosPorOrigen(map);
        // Inicializar manuales con los sugeridos para que no queden vacíos
        setManualesPorOrigen((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(map)) {
            const key = Number(k);
            if (next[key] == null) next[key] = v;
          }
          return next;
        });
      })
      .catch((e) => console.warn("No se pudieron obtener consecutivos:", e));
  }, [origenesInvolucrados]);

  // Consecutivo base efectivo por origen (sugerido o manual)
  const consecutivosEfectivos = useMemo(() => {
    const map: Record<number, number> = {};
    for (const o of origenesInvolucrados) {
      map[o.codigo] = usarSugeridos
        ? sugeridosPorOrigen[o.codigo] ?? 46125
        : manualesPorOrigen[o.codigo] ?? sugeridosPorOrigen[o.codigo] ?? 46125;
    }
    return map;
  }, [origenesInvolucrados, usarSugeridos, sugeridosPorOrigen, manualesPorOrigen]);

  // Calcular los id_externo que se generarían con los consecutivos actuales
  const idsExternosPropuestos = useMemo(() => {
    const result: { idExterno: string; codOrigen: number; codDestino: number; grupo: typeof agrupaciones[number] }[] = [];
    // Contador por origen: cada archivo del mismo origen incrementa
    const counters: Record<number, number> = {};
    for (const g of agrupaciones) {
      const codOrigen = codigosOracle[g.origen_location_id];
      const codDestino = codigosOracle[g.destino_location_id];
      if (!codOrigen || !codDestino) continue;
      if (counters[codOrigen] == null) {
        counters[codOrigen] = consecutivosEfectivos[codOrigen] ?? 46125;
      }
      const consec = counters[codOrigen];
      const idExterno = `${codOrigen} ${consec} ${normalizarNombreDestino(g.destino_nombre)}`;
      result.push({ idExterno, codOrigen, codDestino, grupo: g });
      counters[codOrigen] += 1;
    }
    return result;
  }, [agrupaciones, codigosOracle, consecutivosEfectivos]);

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

  // Pre-validar duplicados cuando cambien los IDs propuestos
  useEffect(() => {
    if (idsExternosPropuestos.length === 0) {
      setDuplicados([]);
      return;
    }
    let cancelled = false;
    validarIdExternosDuplicados(idsExternosPropuestos.map((p) => p.idExterno))
      .then((dups) => {
        if (!cancelled) setDuplicados(dups);
      })
      .catch(() => !cancelled && setDuplicados([]));
    return () => {
      cancelled = true;
    };
  }, [idsExternosPropuestos]);

  // Reset confirmación cuando cambian los duplicados detectados
  useEffect(() => {
    setConfirmacionDuplicado("");
    setForzarDuplicados(false);
  }, [duplicados.length]);

  const hayDuplicados = duplicados.length > 0;
  const puedeContinuarConDuplicados =
    !hayDuplicados || (forzarDuplicados && confirmacionDuplicado.trim() === "DUPLICAR");

  const handleSeleccionarOperador = (op: OperadorDisponible) => {
    setEmpleado(op.full_name);
    setEmpleadoUserId(op.user_id);
    setEditandoEmpleado(false);
  };

  const handleGenerar = async () => {
    if (ubicacionesSinCodigo.length > 0) {
      toast.error("Hay ubicaciones sin código Oracle. Configúralas primero.");
      return;
    }
    if (hayDuplicados && !puedeContinuarConDuplicados) {
      toast.error("Debes resolver los consecutivos duplicados antes de continuar.");
      return;
    }
    setGenerando(true);
    setProgreso(0);
    try {
      const fechaNs = formatearFechaNetSuite(fecha);
      const archivos: { nombre: string; blob: Blob }[] = [];

      for (let i = 0; i < idsExternosPropuestos.length; i++) {
        const { idExterno, codOrigen, codDestino, grupo } = idsExternosPropuestos[i];

        const ajustesObj: Record<string, number> = {};
        ajustes.forEach((v, k) => (ajustesObj[k] = v));

        const result = await generarExcel({
          idExterno,
          fecha: fechaNs,
          empleado,
          subsidiaria: 2,
          codigoOrigen: codOrigen,
          codigoDestino: codDestino,
          lineas: grupo.lineas,
          mapeoSkus,
          ajustes: ajustesObj,
        });

        if (result.filasIncluidas > 0) {
          archivos.push({ nombre: result.nombreArchivo, blob: result.blob });

          try {
            await registrarExportacion({
              snapshot_id: snapshot?.id ?? null,
              id_externo: idExterno,
              fecha_traslado: fecha,
              empleado,
              origen_location_id: grupo.origen_location_id,
              destino_location_id: grupo.destino_location_id,
              origen_netsuite_id: codOrigen,
              destino_netsuite_id: codDestino,
              lineas_json: grupo.lineas.map((l) => ({
                sku: l.r_sku,
                cantidad: ajustes.get(lineaId(l)) ?? l.r_unidades_sugeridas,
              })),
              total_unidades: result.unidadesTotales,
              total_lineas: result.filasIncluidas,
              subsidiaria: 2,
              generated_by_user_id: empleadoUserId ?? userId,
            });
          } catch (e) {
            console.warn("No se pudo registrar la exportación:", e);
          }
        }

        setProgreso(Math.round(((i + 1) / idsExternosPropuestos.length) * 100));
      }

      if (archivos.length === 0) {
        toast.error("No se generó ningún archivo. Revisa mapeos de SKUs.");
        return;
      }

      const primeraOrigen = origenesInvolucrados[0]?.codigo ?? "x";
      const primerConsec =
        consecutivosEfectivos[origenesInvolucrados[0]?.codigo ?? 0] ?? "x";
      const nombreZip = `traslados_${fecha}_${primeraOrigen}_${primerConsec}.zip`;
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

            {/* Consecutivos por origen */}
            <Card className="p-3 mb-3 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-medium">Consecutivos por origen</p>
                <p className="text-[11px] text-muted-foreground">
                  Cada CEDI tiene su propia secuencia. El sistema busca el último consecutivo
                  registrado y sugiere el siguiente.
                </p>
              </div>

              <RadioGroup
                value={usarSugeridos ? "sugerido" : "manual"}
                onValueChange={(v) => setUsarSugeridos(v === "sugerido")}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="sugerido" id="sugerido" />
                  <Label htmlFor="sugerido" className="text-xs cursor-pointer">
                    Usar consecutivos sugeridos (recomendado)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual" className="text-xs cursor-pointer">
                    Especificar manualmente
                  </Label>
                </div>
              </RadioGroup>

              {origenesInvolucrados.length === 0 ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Calculando orígenes…
                </p>
              ) : (
                <div className="space-y-2">
                  {origenesInvolucrados.map((o) => {
                    const sugerido = sugeridosPorOrigen[o.codigo];
                    const ultimo = sugerido != null ? sugerido - 1 : null;
                    const base = consecutivosEfectivos[o.codigo] ?? sugerido ?? 46125;
                    const rango =
                      o.archivos > 1
                        ? `${base} → ${base + o.archivos - 1}`
                        : `${base}`;
                    return (
                      <div
                        key={o.codigo}
                        className="grid grid-cols-12 gap-2 items-center text-xs border border-border/50 rounded p-2"
                      >
                        <div className="col-span-5">
                          <p className="font-medium truncate">{o.nombre}</p>
                          <p className="text-[10px] text-muted-foreground">
                            código {o.codigo} · {o.archivos} archivo{o.archivos !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="col-span-3 text-[11px] text-muted-foreground">
                          Último: {ultimo ?? "—"}
                        </div>
                        <div className="col-span-4">
                          {usarSugeridos ? (
                            <span className="font-mono text-xs font-semibold text-primary">
                              {rango}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              className="h-7 text-xs"
                              value={manualesPorOrigen[o.codigo] ?? sugerido ?? 46125}
                              onChange={(e) =>
                                setManualesPorOrigen((prev) => ({
                                  ...prev,
                                  [o.codigo]: parseInt(e.target.value || "0", 10),
                                }))
                              }
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Fecha + Empleado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              <div>
                <Label className="text-xs">Empleado</Label>
                <Popover open={editandoEmpleado} onOpenChange={setEditandoEmpleado}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm text-left flex items-center justify-between hover:border-primary/50 transition-colors"
                    >
                      <span className="truncate">{empleado}</span>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-2" align="end">
                    <p className="text-[11px] text-muted-foreground px-2 pb-2">
                      Selecciona otro operador:
                    </p>
                    <div className="max-h-64 overflow-y-auto">
                      {operadores.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-2">
                          No hay otros operadores disponibles.
                        </p>
                      ) : (
                        operadores.map((op) => (
                          <button
                            key={op.user_id}
                            type="button"
                            onClick={() => handleSeleccionarOperador(op)}
                            className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted transition-colors ${
                              empleadoUserId === op.user_id ? "bg-muted" : ""
                            }`}
                          >
                            <div className="font-medium">{op.full_name}</div>
                            {op.email && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                {op.email}
                              </div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {empleadoUserId
                    ? "Usuario verificado del sistema"
                    : "Usuario no vinculado a un perfil"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Subsidiaria: 2 (fijo)</p>
              </div>
            </div>
          </section>

          {/* Paso 3: Validación de duplicados */}
          {hayDuplicados && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                ⚠️ Consecutivos duplicados detectados
              </h3>
              <Card className="p-3 border-destructive/50 bg-destructive/5 space-y-3">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <p className="text-xs font-medium text-destructive">
                      Los siguientes archivos ya fueron generados anteriormente:
                    </p>
                    <ul className="text-[11px] space-y-1">
                      {duplicados.slice(0, 5).map((d) => (
                        <li key={d.id_externo} className="font-mono">
                          • <strong>{d.id_externo}</strong>
                          <span className="text-muted-foreground font-sans">
                            {" "}
                            — {new Date(d.generated_at).toLocaleString("es-CO")} por {d.empleado}
                          </span>
                        </li>
                      ))}
                      {duplicados.length > 5 && (
                        <li className="text-muted-foreground">
                          … y {duplicados.length - 5} más
                        </li>
                      )}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">
                      Generar archivos con el <strong>mismo id_externo</strong> puede causar
                      duplicación de inventario en NetSuite. Te recomendamos volver al paso
                      anterior y aumentar los consecutivos.
                    </p>
                  </div>
                </div>

                {!forzarDuplicados ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        setUsarSugeridos(true);
                        toast.info("Consecutivos restablecidos a los sugeridos");
                      }}
                    >
                      Cambiar consecutivos
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => setForzarDuplicados(true)}
                    >
                      Continuar de todos modos
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 border-t border-destructive/30 pt-3">
                    <p className="text-xs font-medium">
                      Esta acción es riesgosa. Escribe{" "}
                      <span className="font-mono bg-muted px-1 rounded">DUPLICAR</span>{" "}
                      para confirmar:
                    </p>
                    <Input
                      value={confirmacionDuplicado}
                      onChange={(e) => setConfirmacionDuplicado(e.target.value)}
                      className="h-8"
                      placeholder="DUPLICAR"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setForzarDuplicados(false);
                        setConfirmacionDuplicado("");
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </Card>
            </section>
          )}

          {/* Warnings */}
          {(skusSinMapeo.length > 0 || ubicacionesSinCodigo.length > 0) && (
            <section>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                Advertencias
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
              agrupaciones.length === 0 ||
              !puedeContinuarConDuplicados
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
