// Panel de historial reciente de exportaciones de traslados.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { History, Loader2 } from "lucide-react";
import {
  obtenerHistorialExportaciones,
  type HistorialExportacion,
} from "@/lib/traslados-api";

interface Props {
  refreshKey?: number;
  limite?: number;
}

export function HistorialExportaciones({ refreshKey = 0, limite = 10 }: Props) {
  const [items, setItems] = useState<HistorialExportacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    obtenerHistorialExportaciones(limite)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [refreshKey, limite]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Historial de exportaciones (últimas {limite})
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">
          Aún no hay exportaciones registradas.
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <div
              key={it.id}
              className="grid grid-cols-12 gap-2 text-xs py-1.5 border-b border-border/50 last:border-0 items-center"
            >
              <span className="col-span-2 text-muted-foreground tabular-nums">
                {fmt(it.generated_at)}
              </span>
              <span className="col-span-3 truncate font-medium">
                {it.empleado}
              </span>
              <span className="col-span-5 truncate font-mono text-[11px]">
                {it.id_externo}
              </span>
              <span className="col-span-2 text-right text-muted-foreground tabular-nums">
                {it.total_lineas} líneas · {it.total_unidades} und
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
