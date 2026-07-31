import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { TimeFilter, getDateRange, toDateStr, CUSTOM_SENTINEL } from "./TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

interface ConsumoRow {
  location_id: string | null;
  tienda: string | null;
  tipo_tienda: string | null;
  sku: string | null;
  insumo: string | null;
  unidades: number | null;
  pedidos_tienda: number | null;
  uds_producto: number | null;
  insumos_x_pedido: number | null;
}

interface TiendaGroup {
  location_id: string;
  tienda: string;
  tipo_tienda: string;
  pedidos: number;
  unidades: number;
  referencias: number;
  insumos_x_pedido: number;
  detalle: ConsumoRow[];
}

function ConsumoPorTienda() {
  const [rows, setRows] = useState<ConsumoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterValue, setFilterValue] = useState(30);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      setError(null);
      const isCustom = !!customFrom;
      const { from, to } = getDateRange(isCustom ? CUSTOM_SENTINEL : filterValue, customFrom, customTo);
      const { data, error } = await supabase.rpc("reporte_consumo_insumos_tienda", {
        p_desde: toDateStr(from),
        p_hasta: toDateStr(to),
      });
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as ConsumoRow[]);
      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [filterValue, customFrom, customTo]);

  const grupos = useMemo<TiendaGroup[]>(() => {
    const map = new Map<string, TiendaGroup>();
    for (const r of rows) {
      const key = r.location_id ?? r.tienda ?? "—";
      let g = map.get(key);
      if (!g) {
        g = {
          location_id: key,
          tienda: r.tienda ?? "—",
          tipo_tienda: r.tipo_tienda ?? "—",
          pedidos: Number(r.pedidos_tienda ?? 0),
          unidades: 0,
          referencias: 0,
          insumos_x_pedido: Number(r.insumos_x_pedido ?? 0),
          detalle: [],
        };
        map.set(key, g);
      }
      g.pedidos = Math.max(g.pedidos, Number(r.pedidos_tienda ?? 0));
      g.insumos_x_pedido = Math.max(g.insumos_x_pedido, Number(r.insumos_x_pedido ?? 0));
      g.unidades += Number(r.unidades ?? 0);
      g.detalle.push(r);
    }
    const list = Array.from(map.values());
    list.forEach((g) => {
      g.referencias = new Set(g.detalle.map((d) => d.sku).filter(Boolean)).size;
      g.detalle.sort((a, b) => Number(b.unidades ?? 0) - Number(a.unidades ?? 0));
    });
    return list.sort((a, b) => b.unidades - a.unidades);
  }, [rows]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        Tienda: r.tienda ?? "",
        Tipo: r.tipo_tienda ?? "",
        SKU: r.sku ?? "",
        Insumo: r.insumo ?? "",
        Unidades: r.unidades ?? 0,
        Pedidos: r.pedidos_tienda ?? 0,
        "Insumos x Pedido": r.insumos_x_pedido ?? 0,
      })),
      "consumo_insumos_por_tienda"
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-foreground">Consumo por tienda</h3>
          <p className="text-xs text-muted-foreground">Unidades de insumo despachadas por punto de venta</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <TimeFilter
            value={filterValue}
            onChange={(v) => { setFilterValue(v); setCustomFrom(undefined); setCustomTo(undefined); }}
            customFrom={customFrom}
            customTo={customTo}
            onCustomRangeChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
          />
          <button
            onClick={handleExport}
            disabled={!rows.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 text-xs font-medium text-foreground transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <div className="glass-card rounded-xl p-4 text-sm text-danger">{error}</div>
      ) : !grupos.length ? (
        <EmptyState message="No hay consumo de insumos en el periodo seleccionado." />
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tienda</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Pedidos</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Uds. insumo</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Referencias</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">Insumos/pedido</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const isOpen = expanded.has(g.location_id);
                  return (
                    <Fragment key={g.location_id}>
                      <tr
                        key={g.location_id}
                        onClick={() => toggle(g.location_id)}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-foreground">
                          <span className="flex items-center gap-2">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            {g.tienda}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{g.tipo_tienda}</td>
                        <td className="px-4 py-3 text-right text-sm">{g.pedidos.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm font-bold font-display">{g.unidades.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm">{g.referencias.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground">{g.insumos_x_pedido.toFixed(2)}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${g.location_id}-detalle`} className="bg-muted/20">
                          <td colSpan={6} className="px-4 py-3">
                            <table className="w-full">
                              <thead>
                                <tr className="text-left">
                                  <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">SKU</th>
                                  <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Insumo</th>
                                  <th className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-right">Unidades</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.detalle.map((d, i) => (
                                  <tr key={`${d.sku ?? i}`} className="border-t border-border/40">
                                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{d.sku ?? "—"}</td>
                                    <td className="px-2 py-1.5 text-xs text-foreground">{d.insumo ?? "—"}</td>
                                    <td className="px-2 py-1.5 text-xs text-right">{Number(d.unidades ?? 0).toLocaleString()}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

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
    return <EmptyState message="No hay insumos registrados en el CEDI." />;

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

      <ConsumoPorTienda />
    </div>
  );
}
