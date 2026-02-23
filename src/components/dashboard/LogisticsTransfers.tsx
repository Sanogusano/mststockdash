import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { ArrowRight } from "lucide-react";
import { LoadingState, EmptyState } from "./LoadingState";

interface TransferRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  tienda_con_sobrestock: string | null;
  stock_origen: number | null;
  tienda_necesita: string | null;
  ritmo_venta_destino: number | null;
  accion: string | null;
}

interface Props {
  days: number;
}

export function LogisticsTransfers({ days }: Props) {
  const [data, setData] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { data: rows, error } = await supabase.rpc("reporte_sugerencias_traslado", {
        dias_atras: days,
      });
      if (!error && rows) setData(rows as TransferRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days]);

  if (loading) return <LoadingState rows={5} />;
  if (!data.length)
    return (
      <EmptyState message="No hay sugerencias de traslado para este período. ✅ El inventario está bien distribuido." />
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-semibold">{data.length}</span> movimientos sugeridos
        </p>
        <div className="px-2.5 py-1 rounded-full text-xs bg-warning/10 text-warning border border-warning/20">
          🚚 Accionables pendientes
        </div>
      </div>

      {data.map((row, i) => (
        <div key={i} className="glass-card rounded-xl p-4 hover:border-primary/30 transition-colors border border-border">
          <div className="flex items-start gap-4">
            {/* Product image */}
            <div className="shrink-0">
              {row.foto ? (
                <img
                  src={row.foto}
                  alt={row.producto ?? ""}
                  className="w-14 h-14 rounded-lg object-cover bg-muted"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted/50 flex items-center justify-center text-2xl">
                  👗
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="text-sm font-medium text-foreground leading-tight line-clamp-1">
                    {row.producto}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.sku}</p>
                </div>
              </div>

              {/* Transfer flow */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                  <p className="text-xs text-danger font-medium">ORIGEN</p>
                  <p className="text-xs text-foreground mt-0.5 font-medium">
                    {row.tienda_con_sobrestock?.replace("Monastery ", "")}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.stock_origen} uds</p>
                </div>

                <ArrowRight className="h-4 w-4 text-primary shrink-0" />

                <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-xs text-success font-medium">DESTINO</p>
                  <p className="text-xs text-foreground mt-0.5 font-medium">
                    {row.tienda_necesita?.replace("Monastery ", "")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(row.ritmo_venta_destino ?? 0).toFixed(1)} uds/sem
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action badge */}
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-primary">{row.accion}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
