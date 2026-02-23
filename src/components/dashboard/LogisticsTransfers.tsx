import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { exportToCSV } from "@/lib/csv-export";
import { ArrowRight, Download } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-semibold">{data.length}</span> movimientos sugeridos
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportToCSV(data as unknown as Record<string, unknown>[], `allocation_${days}d`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar
          </button>
          <div className="px-2.5 py-1 rounded-full text-xs bg-warning/10 text-warning border border-warning/20">
            🚚 Accionables pendientes
          </div>
        </div>
      </div>

      {/* Table view for allocation */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Origen (Sobrestock)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Origen</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destino (Necesita)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ritmo Venta</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {row.foto ? (
                        <img src={row.foto} alt="" className="w-8 h-8 rounded-md object-cover bg-muted"
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center text-sm">👗</div>
                      )}
                      <span className="font-medium text-foreground line-clamp-1 max-w-[150px]">{row.producto ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-destructive">{row.tienda_con_sobrestock ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{(row.stock_origen ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="h-4 w-4 text-primary mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-primary">{row.tienda_necesita ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{(row.ritmo_venta_destino ?? 0).toFixed(1)} uds/sem</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
