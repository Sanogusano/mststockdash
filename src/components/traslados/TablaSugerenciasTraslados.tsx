// Tabla detallada con selección múltiple, ajuste inline y rechazo.
import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X, Info } from "lucide-react";
import type { SugerenciaTraslado } from "@/lib/traslados-api";
import { lineaId } from "@/lib/traslados-api";
import {
  colorOrigen,
  colorPrioridad,
  nombreOrigen,
  descripcionOrigen,
} from "./visual-helpers";
import { InfoTooltip } from "./InfoTooltip";

interface Props {
  sugerencias: SugerenciaTraslado[];
  approvedLines: Set<string>;
  rejectedLines: Set<string>;
  adjustedLines: Map<string, number>;
  onToggleApprove: (id: string) => void;
  onToggleApproveAll: (visibles: SugerenciaTraslado[]) => void;
  onAdjust: (id: string, qty: number) => void;
  onReject: (id: string) => void;
  limite?: number;
}

export function TablaSugerenciasTraslados({
  sugerencias,
  approvedLines,
  rejectedLines,
  adjustedLines,
  onToggleApprove,
  onToggleApproveAll,
  onAdjust,
  onReject,
  limite,
}: Props) {
  const visibles = useMemo(
    () => sugerencias.filter((s) => !rejectedLines.has(lineaId(s))),
    [sugerencias, rejectedLines],
  );
  const cortadas = limite ? visibles.slice(0, limite) : visibles;
  const todasSeleccionadas =
    cortadas.length > 0 && cortadas.every((s) => approvedLines.has(lineaId(s)));

  return (
    <TooltipProvider>
      <div className="rounded-md border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-10">
                  <Checkbox
                    checked={todasSeleccionadas}
                    onCheckedChange={() => onToggleApproveAll(cortadas)}
                    aria-label="Seleccionar todas las visibles"
                  />
                </TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>
                  Origen
                  <InfoTooltip content={`La ubicación que cede stock.\n\n• CEDI Principal: centro de distribución principal\n• CEDI Guayabal: CEDI que vende online\n• Consolidación: tienda con sobrestock del SKU`} />
                </TableHead>
                <TableHead className="text-right">
                  Stock dest
                  <InfoTooltip content="Unidades actuales en la tienda destino según el último snapshot de NetSuite." />
                </TableHead>
                <TableHead className="text-right">
                  Ritmo/sem
                  <InfoTooltip content={`Unidades vendidas por semana en promedio, calculado en la ventana de análisis configurada.\n\nFórmula: ventas_ventana ÷ semanas_ventana`} />
                </TableHead>
                <TableHead className="text-right">
                  WOS
                  <InfoTooltip content={`Weeks of Stock — cuántas semanas aguanta el stock al ritmo actual.\n\nFórmula: stock_actual ÷ ritmo_semanal\n\nSe muestra como WOS_actual / WOS_objetivo. Si el actual es menor al objetivo, la tienda necesita resurtido.`} />
                </TableHead>
                <TableHead className="text-right">
                  Unidades
                  <InfoTooltip content={`Cantidad sugerida a trasladar.\n\nFórmula: max(WOS_objetivo × ritmo, MOD) − stock_destino\nLimitado por el stock cedible en el origen.\n\nPuedes editarla manualmente.`} />
                </TableHead>
                <TableHead className="text-right">
                  Prio
                  <InfoTooltip content={`Score de urgencia.\n\nFórmula: (WOS_objetivo − WOS_actual) × 10 + gap_unidades × 0.5\n\n🔴 >50 urgente · 🟠 20-50 importante · 🟡 <20 puede esperar`} />
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cortadas.map((s) => {
                const id = lineaId(s);
                const seleccionada = approvedLines.has(id);
                const cantidadActual = adjustedLines.get(id) ?? s.r_unidades_sugeridas;
                return (
                  <TableRow key={id} className={seleccionada ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={seleccionada}
                        onCheckedChange={() => onToggleApprove(id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" title={s.r_nombre}>
                          {s.r_nombre || s.r_sku}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {s.r_sku}
                          </span>
                          {s.r_color && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {s.r_color}
                            </Badge>
                          )}
                          {s.r_talla && (
                            <Badge variant="outline" className="text-[10px] py-0">
                              {s.r_talla}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className={`${colorOrigen(s.r_origen_tipo)} text-[10px] w-fit cursor-help`}>
                              {nombreOrigen(s.r_origen_tipo)}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {descripcionOrigen(s.r_origen_tipo)}
                          </TooltipContent>
                        </Tooltip>
                        <span
                          className="text-[10px] text-muted-foreground truncate max-w-[140px]"
                          title={s.r_origen_nombre}
                        >
                          {s.r_origen_nombre} · stock {s.r_stock_origen}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s.r_stock_destino}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.r_ritmo_semanal_destino?.toFixed(2) ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={s.r_wos_actual_destino < 1 ? "text-red-600 font-semibold" : ""}>
                        {s.r_wos_actual_destino?.toFixed(1) ?? "—"}
                      </span>
                      <span className="text-muted-foreground text-[10px]">
                        {" "}
                        / {s.r_wos_objetivo_destino?.toFixed(1) ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        value={cantidadActual}
                        onChange={(e) => onAdjust(id, parseInt(e.target.value || "0", 10))}
                        className="h-7 w-16 text-right tabular-nums ml-auto"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={`${colorPrioridad(s.r_prioridad)} text-[10px]`}>
                        {Math.round(s.r_prioridad)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs">
                            <p className="text-xs">{s.r_justificacion}</p>
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => onReject(id)}
                          title="Rechazar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {cortadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay sugerencias que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {limite && visibles.length > limite && (
          <div className="text-center py-2 text-xs text-muted-foreground border-t">
            Mostrando {limite} de {visibles.length} líneas. Ajusta los filtros para ver más.
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
