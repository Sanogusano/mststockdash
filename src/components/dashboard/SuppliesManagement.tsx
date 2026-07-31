import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import ConsumoInsumosMatriz from "./ConsumoInsumosMatriz";

interface SupplyRow {
  foto: string | null;
  insumo: string | null;
  sku: string | null;
  stock_cedi: number | null;
  consumo_diario_total: number | null;
  dias_autonomia: number | null;
  estado_gestion: string | null;
}

export function SuppliesManagement() {
  const [data, setData] = useState<SupplyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: rows, error } = await supabase.rpc("reporte_reorden_insumos");
      if (!error && rows) setData(rows as SupplyRow[]);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <LoadingState rows={5} />;
  if (!data.length)
    return (
      <div className="space-y-6">
        <EmptyState message="No hay insumos registrados en el CEDI." />
        <ConsumoInsumosMatriz />
      </div>
    );

  const urgentes = data.filter((r) => (r.dias_autonomia ?? 999) < 15).length;
  const planear = data.filter((r) => {
    const d = r.dias_autonomia ?? 999;
    return d >= 15 && d < 30;
  }).length;

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Total insumos</p>
          <p className="text-2xl font-display font-bold text-foreground">{data.length}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">🚨 Urgentes</p>
          <p className="text-2xl font-display font-bold text-danger">{urgentes}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">⚠️ Planear</p>
          <p className="text-2xl font-display font-bold text-warning">{planear}</p>
        </div>
      </div>

      {/* Supply Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Insumo</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Stock CEDI</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Consumo/día</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Días autonomía</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const dias = row.dias_autonomia ?? 999;
              const color =
                dias < 15
                  ? "text-danger"
                  : dias < 30
                  ? "text-warning"
                  : "text-success";

              return (
                <tr
                  key={row.sku ?? i}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {row.foto ? (
                        <img
                          src={row.foto}
                          alt={row.insumo ?? ""}
                          className="w-9 h-9 rounded-lg object-cover bg-muted"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-base">
                          📦
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground leading-tight">
                          {row.insumo ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">{row.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    {(row.stock_cedi ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                    {(row.consumo_diario_total ?? 0).toFixed(2)}
                  </td>
                  <td className={`px-4 py-3 text-right text-sm font-bold font-display ${color}`}>
                    {row.dias_autonomia != null ? `${row.dias_autonomia.toFixed(0)}d` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={row.estado_gestion ?? ""} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <ConsumoInsumosMatriz />
    </div>
  );
}
