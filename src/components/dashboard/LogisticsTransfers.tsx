import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { ArrowRight, Download, FileText } from "lucide-react";
import { LoadingState, EmptyState } from "./LoadingState";
import { ProductDetailDrawer } from "./ProductDetailDrawer";

interface TransferRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  tienda_origen: string | null;
  stock_origen: number | null;
  tienda_destino: string | null;
  ritmo_venta_destino: number | null;
  uds_sugeridas: number | null;
  accion: string | null;
}

interface Props {
  days: number;
}

export function LogisticsTransfers({ days }: Props) {
  const [data, setData] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<{ foto: string; producto: string; sku: string; categoria: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows, error } = await supabase.rpc("reporte_sugerencias_traslado", {
        dias_atras: effectiveDays,
      });
      if (!error && rows) setData(rows as unknown as TransferRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days]);

  const exportData = data.map(r => ({
    Producto: r.producto ?? "",
    SKU: r.sku ?? "",
    Origen: r.tienda_origen ?? "",
    "Stock Origen": r.stock_origen ?? 0,
    Destino: r.tienda_destino ?? "",
    "Ritmo Venta": r.ritmo_venta_destino ?? 0,
    "Uds. Sugeridas": r.uds_sugeridas ?? 0,
  }));

  if (loading) return <LoadingState rows={5} />;
  if (!data.length)
    return (
      <EmptyState message="No hay sugerencias de traslado para este período. ✅ El inventario está bien distribuido." />
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
        <p className="text-sm text-muted-foreground">
          <span className="text-primary font-semibold">{data.length}</span> movimientos sugeridos
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportToCSV(exportData as unknown as Record<string, unknown>[], `allocation_${days}d`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => exportToPDF(exportData as unknown as Record<string, unknown>[], `allocation_${days}d`, "Sugerencias de Traslado")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
          <div className="px-2.5 py-1 rounded-full text-xs bg-warning/10 text-warning border border-warning/20">
            🚚 Accionables pendientes
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Origen</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Origen</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground"></th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destino</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ritmo Venta</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Uds. Sugeridas</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Acción</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.foto ? (
                        <img src={row.foto} alt="" className="w-16 h-16 rounded-lg object-cover bg-muted"
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-muted/50 flex items-center justify-center text-lg">👗</div>
                      )}
                      <span
                        className="font-medium text-foreground line-clamp-2 max-w-[180px] cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setSelectedProduct({ foto: row.foto ?? "", producto: row.producto ?? "", sku: row.sku ?? "", categoria: "" })}
                      >
                        {row.producto ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.sku ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-destructive">{row.tienda_origen ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{(row.stock_origen ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    <ArrowRight className="h-4 w-4 text-primary mx-auto" />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-primary">{row.tienda_destino ?? "—"}</span>
                  </td>
                   <td className="px-4 py-3 text-right text-muted-foreground">{(row.ritmo_venta_destino ?? 0).toFixed(1)} uds/sem</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                      {(row.uds_sugeridas ?? 0).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px]">{row.accion ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProductDetailDrawer product={selectedProduct} days={days} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
