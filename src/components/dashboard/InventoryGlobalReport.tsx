import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { Filter } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface WosCatGlobalRow {
  tienda: string;
  location_id: string;
  categoria: string;
  inventario_total: number;
  venta_promedio_semanal: number;
  semanas_inventario: number | null;
  pct_full_price: number;
  pct_rebajado: number;
  estado_salud: string;
}

const getBarColor = (semanas: number | null) => {
  if (!semanas) return "hsl(240,10%,40%)";
  if (semanas > 20) return "hsl(0,72%,51%)";
  if (semanas < 8) return "hsl(38,92%,50%)";
  return "hsl(152,60%,40%)";
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  days: number;
}

export function InventoryGlobalReport({ open, onOpenChange, days }: Props) {
  const [data, setData] = useState<WosCatGlobalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selCanal, setSelCanal] = useState<string[]>([]);
  const [selTienda, setSelTienda] = useState<string[]>([]);
  const [selEstado, setSelEstado] = useState<string[]>([]);

  const [locTipoMap, setLocTipoMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    async function fetch() {
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const [res, locRes] = await Promise.all([
        supabase.rpc("reporte_wos_categoria_global", { dias_atras: effectiveDays }),
        supabase.from("locations").select("location_id, tipo_tienda").eq("is_active", true),
      ]);
      if (res.data) setData(res.data as unknown as WosCatGlobalRow[]);
      if (locRes.data) {
        const m = new Map<string, string>();
        for (const l of locRes.data) m.set(l.location_id, (l.tipo_tienda ?? '').toUpperCase());
        setLocTipoMap(m);
      }
      setLoading(false);
    }
    fetch();
  }, [open, days]);

  const getCanal = (row: WosCatGlobalRow) => {
    const tipo = locTipoMap.get(row.location_id) ?? '';
    if (tipo === 'OUTLET') return 'Outlets';
    if (row.location_id === '71474315479') return 'Digital';
    return 'Tiendas';
  };

  const canalOptions = useMemo(() => {
    const set = new Set<string>();
    data.forEach((r) => set.add(getCanal(r)));
    return [...set].sort();
  }, [data, locTipoMap]);

  const tiendaOptions = useMemo(() => [...new Set(data.map((r) => r.tienda))].sort(), [data]);
  const estadoOptions = useMemo(() => [...new Set(data.map((r) => r.estado_salud))], [data]);

  const filtered = useMemo(() => {
    return data.filter((row) => {
      // Canal filter
      if (selCanal.length > 0) {
        if (!selCanal.includes(getCanal(row))) return false;
      }
      if (selTienda.length > 0 && !selTienda.includes(row.tienda)) return false;
      if (selEstado.length > 0 && !selEstado.some((e) => row.estado_salud.includes(e))) return false;
      return true;
    });
  }, [data, selCanal, selTienda, selEstado]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Informe General — WOS por Categoría (Todos los canales)</DialogTitle>
        </DialogHeader>

        {loading ? (
          <LoadingState rows={6} />
        ) : data.length === 0 ? (
          <EmptyState message="No hay datos disponibles." />
        ) : (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <MultiSelectFilter label="Canal" options={canalOptions} selected={selCanal} onChange={setSelCanal} />
              <MultiSelectFilter label="Tienda" options={tiendaOptions} selected={selTienda} onChange={setSelTienda} />
              <MultiSelectFilter label="Estado" options={estadoOptions} selected={selEstado} onChange={setSelEstado} />
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                     <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tienda</th>
                     <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categoría</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Total</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Venta Prom/Sem</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">WOS</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">% Full Price (Stock)</th>
                     <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">% Rebajado (Stock)</th>
                     <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Estado</th>
                   </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                     <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                         No hay datos con los filtros seleccionados.
                       </td>
                    </tr>
                  ) : (
                    filtered.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground">{row.tienda}</td>
                        <td className="px-4 py-2.5 text-xs text-foreground">{row.categoria}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{(row.inventario_total ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-xs">{(row.venta_promedio_semanal ?? 0).toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: getBarColor(row.semanas_inventario) }}>
                          {row.semanas_inventario == null ? "∞" : row.semanas_inventario > 99 ? "+99w" : `${row.semanas_inventario.toFixed(1)}w`}
                        </td>
                         <td className="px-4 py-2.5 text-right text-xs">
                           <span className="text-emerald-600 font-medium">{row.pct_full_price.toFixed(1)}%</span>
                         </td>
                         <td className="px-4 py-2.5 text-right text-xs">
                           <span className="text-orange-500 font-medium">{row.pct_rebajado.toFixed(1)}%</span>
                         </td>
                         <td className="px-4 py-2.5 text-center">
                           <StatusBadge label={row.estado_salud} />
                         </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">{filtered.length} filas</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
