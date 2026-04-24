// Página principal del módulo de Logística & Traslados v2.
// Tres modos: dashboard de destinos → tabla detallada → wizard de exportación.
import { useCallback, useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download, Loader2, Play, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  correrMotorAllocation,
  agruparPorDestino,
  obtenerSnapshotActivo,
  lineaId,
  type SugerenciaTraslado,
  type ParametrosMotor,
  type SnapshotActivo,
} from "@/lib/traslados-api";
import { DashboardDestinos } from "@/components/traslados/DashboardDestinos";
import {
  FiltrosTraslados,
  FILTROS_INICIALES,
  type FiltrosState,
} from "@/components/traslados/FiltrosTraslados";
import { TablaSugerenciasTraslados } from "@/components/traslados/TablaSugerenciasTraslados";
import { WizardExportacion } from "@/components/traslados/WizardExportacion";
import { HistorialExportaciones } from "@/components/traslados/HistorialExportaciones";
import { PanelComoFunciona } from "@/components/traslados/PanelComoFunciona";
import { InfoTooltip } from "@/components/traslados/InfoTooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "traslados_v2_state";

interface PersistedState {
  approved: string[];
  rejected: string[];
  adjusted: [string, number][];
}

export default function LogisticaTrasladosPage() {
  const { session } = useAuth();
  const empleadoDefault = session?.user?.email?.split("@")[0] ?? "Operador";

  // Parámetros del motor
  const [ventanaSemanas, setVentanaSemanas] = useState(4);
  const [minimoUnidades, setMinimoUnidades] = useState(3);
  const [consolidacionWos, setConsolidacionWos] = useState(20);

  // Estado del motor
  const [snapshot, setSnapshot] = useState<SnapshotActivo | null>(null);
  const [sugerencias, setSugerencias] = useState<SugerenciaTraslado[]>([]);
  const [corriendo, setCorriendo] = useState(false);
  const [ultimaCorrida, setUltimaCorrida] = useState<Date | null>(null);

  // Modo: dashboard | tabla
  const [destinoSeleccionado, setDestinoSeleccionado] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosState>(FILTROS_INICIALES);

  // Selección persistente
  const [approvedLines, setApprovedLines] = useState<Set<string>>(new Set());
  const [rejectedLines, setRejectedLines] = useState<Set<string>>(new Set());
  const [adjustedLines, setAdjustedLines] = useState<Map<string, number>>(new Map());

  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [historialKey, setHistorialKey] = useState(0);

  // Cargar snapshot activo al montar
  useEffect(() => {
    obtenerSnapshotActivo()
      .then(setSnapshot)
      .catch((e) => toast.error(`Error obteniendo snapshot: ${e.message ?? e}`));
  }, []);

  // Cargar estado persistido
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: PersistedState = JSON.parse(raw);
      setApprovedLines(new Set(parsed.approved));
      setRejectedLines(new Set(parsed.rejected));
      setAdjustedLines(new Map(parsed.adjusted));
    } catch {
      /* ignore */
    }
  }, []);

  // Guardar estado al cambiar
  useEffect(() => {
    const data: PersistedState = {
      approved: [...approvedLines],
      rejected: [...rejectedLines],
      adjusted: [...adjustedLines.entries()],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [approvedLines, rejectedLines, adjustedLines]);

  const handleCorrerMotor = async () => {
    setCorriendo(true);
    try {
      const params: ParametrosMotor = {
        p_ventana_semanas: ventanaSemanas,
        p_minimo_unidades_por_linea: minimoUnidades,
        p_consolidacion_wos_trigger: consolidacionWos,
      };
      const data = await correrMotorAllocation(params);
      setSugerencias(data);
      setUltimaCorrida(new Date());
      toast.success(`Motor ejecutado: ${data.length} sugerencias`);
    } catch (e) {
      toast.error(`Error en motor: ${(e as Error).message ?? e}`);
    } finally {
      setCorriendo(false);
    }
  };

  // Agrupaciones por destino para el dashboard
  const agrupaciones = useMemo(() => agruparPorDestino(sugerencias), [sugerencias]);

  // Sugerencias filtradas para la tabla del modo detalle
  const sugerenciasFiltradas = useMemo(() => {
    if (!destinoSeleccionado) return [];
    return sugerencias.filter((s) => {
      if (s.r_destino_location_id !== destinoSeleccionado) return false;
      if (filtros.linea !== "todas" && s.r_linea !== filtros.linea) return false;
      if (filtros.origenTipo !== "todos" && s.r_origen_tipo !== filtros.origenTipo) return false;
      if (s.r_prioridad < filtros.prioridadMin) return false;
      if (filtros.busqueda) {
        const q = filtros.busqueda.toLowerCase();
        if (
          !s.r_sku.toLowerCase().includes(q) &&
          !(s.r_nombre || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [sugerencias, destinoSeleccionado, filtros]);

  const destinoActual = useMemo(
    () => agrupaciones.find((g) => g.destino_location_id === destinoSeleccionado),
    [agrupaciones, destinoSeleccionado],
  );

  // Líneas aprobadas (todas, no solo del destino actual)
  const lineasAprobadas = useMemo(
    () => sugerencias.filter((s) => approvedLines.has(lineaId(s))),
    [sugerencias, approvedLines],
  );

  const handleToggleApprove = useCallback((id: string) => {
    setApprovedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleApproveAll = useCallback(
    (visibles: SugerenciaTraslado[]) => {
      const ids = visibles.map(lineaId);
      const todas = ids.every((id) => approvedLines.has(id));
      setApprovedLines((prev) => {
        const next = new Set(prev);
        if (todas) ids.forEach((id) => next.delete(id));
        else ids.forEach((id) => next.add(id));
        return next;
      });
    },
    [approvedLines],
  );

  const handleAdjust = useCallback((id: string, qty: number) => {
    setAdjustedLines((prev) => {
      const next = new Map(prev);
      if (qty > 0) next.set(id, qty);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleReject = useCallback(
    (id: string) => {
      setRejectedLines((prev) => new Set(prev).add(id));
      setApprovedLines((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const handleLimpiarSeleccion = () => {
    setApprovedLines(new Set());
    setRejectedLines(new Set());
    setAdjustedLines(new Map());
    toast.info("Selección limpiada");
  };

  const handleCompletadoExport = () => {
    setApprovedLines(new Set());
    setAdjustedLines(new Map());
    setHistorialKey((k) => k + 1);
    // Mantener rejected para no volver a mostrarlas en esta sesión
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">
                  Logística de Traslados
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  {snapshot ? (
                    <>
                      Snapshot activo: {snapshot.snapshot_date} ·{" "}
                      {(snapshot.total_skus ?? 0).toLocaleString()} SKUs
                      {ultimaCorrida && (
                        <>
                          {" · "}
                          Última corrida: {ultimaCorrida.toLocaleTimeString("es-CO")}
                        </>
                      )}
                    </>
                  ) : (
                    "Cargando snapshot…"
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {approvedLines.size > 0 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setWizardAbierto(true)}
                  className="gap-1"
                >
                  <Download className="h-4 w-4" />
                  Exportar {approvedLines.size}
                </Button>
              )}
              <Button onClick={handleCorrerMotor} disabled={corriendo} size="sm" className="gap-1">
                {corriendo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {corriendo ? "Corriendo…" : "Correr motor"}
              </Button>
            </div>
          </header>

          {/* Contenido */}
          <TooltipProvider delayDuration={150}>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            {/* Panel educativo "¿Cómo funciona?" */}
            <PanelComoFunciona />

            {/* Parámetros */}
            <Card className="p-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                💡 Ajusta los parámetros y presiona <strong>"Correr motor"</strong> para ver las
                sugerencias. Los valores default funcionan bien para la operación normal. Cambia la
                ventana a 8 semanas para decisiones más estables, o a 2 semanas para capturar
                tendencias muy recientes.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-[10px] uppercase flex items-center">
                    Ventana de análisis
                    <InfoTooltip
                      content={`Cuántas semanas de historial de ventas usar para calcular el ritmo de venta.\n\n• Corta (4 sem): más reactiva a tendencias recientes\n• Larga (8-12 sem): más estable, menos sensible a ventas atípicas\n\nRecomendación: empezar con 4 semanas.`}
                    />
                  </Label>
                  <Select
                    value={String(ventanaSemanas)}
                    onValueChange={(v) => setVentanaSemanas(Number(v))}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 6, 8, 12].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} semanas
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] uppercase flex items-center">
                    Mín unidades/traslado
                    <InfoTooltip
                      content={`El motor no sugerirá traslados con menos de este número de unidades.\n\n¿Por qué? Mover 1-2 unidades entre ciudades suele costar más que el valor del producto.\n\n• 1 und: muchísimas sugerencias\n• 3 und: balance entre volumen y rentabilidad\n• 5+ und: solo traslados "grandes"`}
                    />
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={minimoUnidades}
                    onChange={(e) => setMinimoUnidades(parseInt(e.target.value || "1", 10))}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase flex items-center">
                    Umbral consolidación lateral
                    <InfoTooltip
                      content={`Una tienda se considera "sobrestockeada" cuando tiene más semanas de cobertura del SKU que este valor. Solo entonces puede ceder unidades a otras tiendas.\n\n• 20 sem (default): conservador, solo pide a tiendas con >5 meses\n• 12-16 sem: más agresivo en mover entre tiendas\n• 30+ sem: casi nunca mueve entre tiendas, solo desde CEDI`}
                    />
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={consolidacionWos}
                    onChange={(e) => setConsolidacionWos(parseInt(e.target.value || "1", 10))}
                    className="h-9"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {(approvedLines.size > 0 || rejectedLines.size > 0) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLimpiarSeleccion}
                      className="gap-1 text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Limpiar
                    </Button>
                  )}
                  <div className="text-xs text-muted-foreground ml-auto">
                    <Badge variant="outline">{approvedLines.size} aprobadas</Badge>
                  </div>
                </div>
              </div>
            </Card>

            {/* Estado vacío */}
            {sugerencias.length === 0 && !corriendo && (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground mb-3">
                  Aún no has corrido el motor. Haz clic en <strong>"Correr motor"</strong> para
                  generar las sugerencias de traslado basadas en el snapshot activo.
                </p>
              </Card>
            )}

            {corriendo && (
              <Card className="p-12 text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Corriendo motor de allocation… esto puede tomar unos segundos.
                </p>
              </Card>
            )}

            {/* Texto descriptivo cuando hay resultados en dashboard */}
            {sugerencias.length > 0 && !destinoSeleccionado && !corriendo && (
              <Card className="p-3 bg-muted/20 border-dashed">
                <p className="text-xs text-muted-foreground">
                  📊 Se encontraron <strong>{sugerencias.length} sugerencias</strong> totalizando{" "}
                  <strong>
                    {sugerencias
                      .reduce((a, s) => a + (s.r_unidades_sugeridas || 0), 0)
                      .toLocaleString()}{" "}
                    unidades
                  </strong>
                  . Ordenadas por prioridad — las más urgentes primero. Las sugerencias vienen
                  principalmente de los CEDIs; algunas tiendas pueden aparecer como origen si tienen
                  sobrestock real de un SKU (consolidación lateral).
                </p>
              </Card>
            )}

            {/* Modo dashboard */}
            {sugerencias.length > 0 && !destinoSeleccionado && !corriendo && (
              <DashboardDestinos
                agrupaciones={agrupaciones}
                onSeleccionarDestino={(id) => {
                  setDestinoSeleccionado(id);
                  setFiltros(FILTROS_INICIALES);
                }}
              />
            )}

            {/* Modo tabla */}
            {destinoSeleccionado && destinoActual && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDestinoSeleccionado(null)}
                    className="gap-1"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Volver al dashboard
                  </Button>
                  <div className="text-sm">
                    Destino:{" "}
                    <strong>{destinoActual.destino_nombre}</strong>{" "}
                    <Badge variant="outline" className="ml-1">
                      {destinoActual.destino_tier}
                    </Badge>
                  </div>
                </div>

                <FiltrosTraslados
                  sugerencias={destinoActual.lineas}
                  filtros={filtros}
                  onChange={setFiltros}
                />

                <TablaSugerenciasTraslados
                  sugerencias={sugerenciasFiltradas}
                  approvedLines={approvedLines}
                  rejectedLines={rejectedLines}
                  adjustedLines={adjustedLines}
                  onToggleApprove={handleToggleApprove}
                  onToggleApproveAll={handleToggleApproveAll}
                  onAdjust={handleAdjust}
                  onReject={handleReject}
                  limite={100}
                />
              </div>
            )}

            {/* Historial reciente */}
            <HistorialExportaciones refreshKey={historialKey} limite={10} />
          </div>
          </TooltipProvider>

          {/* Wizard */}
          <WizardExportacion
            open={wizardAbierto}
            onClose={() => setWizardAbierto(false)}
            onCompletado={handleCompletadoExport}
            lineasAprobadas={lineasAprobadas}
            ajustes={adjustedLines}
            snapshot={snapshot}
            empleadoDefault={empleadoDefault}
          />
        </main>
      </div>
    </SidebarProvider>
  );
}
