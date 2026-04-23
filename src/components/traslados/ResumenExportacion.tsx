// Resumen visual de las agrupaciones a exportar (Paso 1 del wizard).
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgrupacionExport } from "@/lib/traslados-api";
import { colorOrigen, nombreOrigen } from "./visual-helpers";

interface Props {
  agrupaciones: AgrupacionExport[];
  ajustes: Map<string, number>;
}

export function ResumenExportacion({ agrupaciones, ajustes }: Props) {
  const totalArchivos = agrupaciones.length;
  const totalLineas = agrupaciones.reduce((a, g) => a + g.lineas.length, 0);
  const totalUnidades = agrupaciones.reduce(
    (a, g) =>
      a +
      g.lineas.reduce((b, l) => {
        const id = `${l.r_sku}__${l.r_origen_location_id}__${l.r_destino_location_id}`;
        return b + (ajustes.get(id) ?? l.r_unidades_sugeridas);
      }, 0),
    0,
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vas a exportar <strong>{totalLineas} líneas</strong> agrupadas en{" "}
        <strong>{totalArchivos} archivos Excel</strong>:
      </p>
      <div className="space-y-2">
        {agrupaciones.map((g) => {
          const und = g.lineas.reduce((a, l) => {
            const id = `${l.r_sku}__${l.r_origen_location_id}__${l.r_destino_location_id}`;
            return a + (ajustes.get(id) ?? l.r_unidades_sugeridas);
          }, 0);
          return (
            <Card
              key={`${g.origen_location_id}__${g.destino_location_id}`}
              className="p-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Badge className={`${colorOrigen(g.origen_tipo)} text-[10px]`}>
                  {nombreOrigen(g.origen_tipo)}
                </Badge>
                <span className="text-sm truncate">
                  {g.origen_nombre} → {g.destino_nombre}
                </span>
              </div>
              <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {g.lineas.length} líneas · {und} und
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="p-3 bg-muted/30">
        <p className="text-sm font-semibold">
          Total: {totalUnidades} unidades · {totalArchivos} archivos .xlsx en un .zip
        </p>
      </Card>
    </div>
  );
}
