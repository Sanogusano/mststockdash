// Dashboard inicial: cards por destino con métricas resumen.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronRight, Layers, Package } from "lucide-react";
import type { AgrupacionDestino } from "@/lib/traslados-api";
import {
  colorPrioridad,
  colorTier,
  colorOrigen,
  nombreOrigen,
  descripcionTier,
  descripcionOrigen,
} from "./visual-helpers";

interface Props {
  agrupaciones: AgrupacionDestino[];
  onSeleccionarDestino: (destinoId: string) => void;
}

export function DashboardDestinos({ agrupaciones, onSeleccionarDestino }: Props) {
  if (agrupaciones.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">
          No hay sugerencias de traslado. Ajusta los parámetros o corre el motor de nuevo.
        </p>
      </Card>
    );
  }

  // Resumen urgencia alta
  const urgentes = agrupaciones.flatMap((g) => g.lineas.filter((l) => l.r_prioridad > 50));
  const destinosUrgentes = new Set(urgentes.map((l) => l.r_destino_location_id)).size;
  const undUrgentes = urgentes.reduce((a, l) => a + (l.r_unidades_sugeridas || 0), 0);

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {urgentes.length > 0 && (
        <Card className="p-4 border-red-200 bg-red-50/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-red-700 font-semibold">
                Urgencia alta (prioridad &gt; 50)
              </p>
              <p className="text-sm text-foreground mt-1">
                {destinosUrgentes} destinos · {urgentes.length} líneas · {undUrgentes} unidades
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agrupaciones.map((g) => (
          <Card
            key={g.destino_location_id}
            className="p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSeleccionarDestino(g.destino_location_id)}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate" title={g.destino_nombre}>
                  {g.destino_nombre}
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={`${colorTier(g.destino_tier)} mt-1 text-[10px] cursor-help`}>
                      {g.destino_tier || "—"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {descripcionTier(g.destino_tier)}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Badge className={`${colorPrioridad(g.prioridadPromedio)} text-[10px]`}>
                P {g.prioridadPromedio}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Líneas</p>
                  <p className="text-sm font-semibold">{g.totalLineas}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Unidades</p>
                  <p className="text-sm font-semibold">{g.totalUnidades}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1 mb-3">
              <p className="text-[10px] text-muted-foreground uppercase">Orígenes</p>
              <div className="flex flex-wrap gap-1">
                {g.origenes.slice(0, 3).map((o) => (
                  <Tooltip key={o.nombre}>
                    <TooltipTrigger asChild>
                      <Badge
                        className={`${colorOrigen(o.tipo)} text-[10px] cursor-help`}
                      >
                        {nombreOrigen(o.tipo)} ({o.lineas})
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {descripcionOrigen(o.tipo)} · {o.nombre}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

            <Button variant="ghost" size="sm" className="w-full justify-between">
              Ver detalles
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Card>
        ))}
      </div>
    </div>
    </TooltipProvider>
  );
}
