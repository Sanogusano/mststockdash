import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { StatusBadge } from "./StatusBadge";
import { CollectionBadge } from "./CollectionBadge";

interface ExecutiveRow {
  foto: string | null;
  producto: string | null;
  sku: string | null;
  unidades_vendidas: number | null;
  precio_prom_venta: number | null;
  pct_contribucion: number | null;
  perfil_ejecutivo: string | null;
  coleccion: string | null;
}

interface Props {
  days: number;
}

export function ExecutiveSummary({ days }: Props) {
  const [data, setData] = useState<ExecutiveRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows, error } = await supabase.rpc(
        "reporte_desempeño_comercial",
        { dias_atras: effectiveDays }
      );
      if (!error && rows) setData(rows as ExecutiveRow[]);
      setLoading(false);
    }
    fetchData();
  }, [days]);

  if (loading) return <LoadingState rows={6} />;
  if (!data.length) return <EmptyState message="No hay datos de ventas para este período." />;

  const totalUnits = data.reduce((sum, r) => sum + (r.unidades_vendidas ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Productos activos</p>
          <p className="text-2xl font-display font-bold text-primary">{data.length}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Unidades vendidas</p>
          <p className="text-2xl font-display font-bold text-foreground">{totalUnits.toLocaleString()}</p>
        </div>
        <div className="glass-card rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Ticket Prom.</p>
          <p className="text-2xl font-display font-bold text-foreground">
            ${Math.round(data.reduce((s, r) => s + (r.precio_prom_venta ?? 0), 0) / data.length).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Product Table */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Producto</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Colección</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Uds</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Precio Prom</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Contribución</th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Perfil</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={row.sku ?? i}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {row.foto ? (
                      <img
                        src={row.foto}
                        alt={row.producto ?? ""}
                        className="w-10 h-10 rounded-lg object-cover bg-muted"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center text-lg">
                        👗
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground leading-tight line-clamp-1">
                        {row.producto ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.sku}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3"><CollectionBadge coleccion={row.coleccion} /></td>
                <td className="px-4 py-3 text-right text-sm font-medium">
                  {(row.unidades_vendidas ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm">
                  ${(row.precio_prom_venta ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(row.pct_contribucion ?? 0, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-primary w-12 text-right">
                      {(row.pct_contribucion ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge label={row.perfil_ejecutivo ?? ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
