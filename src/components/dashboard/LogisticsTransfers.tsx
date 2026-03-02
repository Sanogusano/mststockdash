import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, Filter, X } from "lucide-react";
import { LoadingState, EmptyState } from "./LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CurvaRow {
  product_id: string | null;
  producto: string | null;
  color: string | null;
  foto: string | null;
  talla: string | null;
  sku: string | null;
  tienda_destino: string | null;
  stock_destino: number | null;
  ritmo_venta: number | null;
  uds_sugeridas: number | null;
  tienda_origen: string | null;
  stock_origen: number | null;
  prioridad: number | null;
}

interface GroupedProduct {
  product_id: string;
  producto: string;
  color: string;
  foto: string;
  tienda_destino: string;
  tallas: {
    talla: string;
    sku: string;
    stock_destino: number;
    ritmo_venta: number;
    uds_sugeridas: number;
    origenes: { tienda: string; stock: number; uds: number }[];
  }[];
  total_uds: number;
  origenes_unicos: string[];
  puede_una_fuente: boolean;
}

interface Props {
  days: number;
}

export function LogisticsTransfers({ days }: Props) {
  const [data, setData] = useState<CurvaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [origenFilter, setOrigenFilter] = useState<string>("all");
  const [destinoFilter, setDestinoFilter] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<GroupedProduct | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const effectiveDays = resolveDays(days);
      const { data: rows, error } = await supabase.rpc("reporte_curva_traslados" as any, {
        dias_atras: effectiveDays,
        p_origen: origenFilter === "all" ? null : origenFilter,
        p_destino: destinoFilter === "all" ? null : destinoFilter,
      });
      if (!error && rows) setData(rows as unknown as CurvaRow[]);
      else setData([]);
      setLoading(false);
    }
    fetchData();
  }, [days, origenFilter, destinoFilter]);

  // Extract unique tiendas for filters
  const { origenes, destinos } = useMemo(() => {
    const orig = new Set<string>();
    const dest = new Set<string>();
    data.forEach((r) => {
      if (r.tienda_origen) orig.add(r.tienda_origen);
      if (r.tienda_destino) dest.add(r.tienda_destino);
    });
    return {
      origenes: Array.from(orig).sort(),
      destinos: Array.from(dest).sort(),
    };
  }, [data]);

  // Group data by product_id + tienda_destino
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    data.forEach((row) => {
      if (!row.product_id || !row.tienda_destino) return;
      const key = `${row.product_id}__${row.tienda_destino}`;

      if (!map.has(key)) {
        map.set(key, {
          product_id: row.product_id,
          producto: row.producto ?? "—",
          color: row.color ?? "—",
          foto: row.foto ?? "",
          tienda_destino: row.tienda_destino,
          tallas: [],
          total_uds: 0,
          origenes_unicos: [],
          puede_una_fuente: true,
        });
      }

      const group = map.get(key)!;
      const tallaKey = row.talla ?? row.sku ?? "—";

      let tallaEntry = group.tallas.find((t) => t.talla === tallaKey);
      if (!tallaEntry) {
        tallaEntry = {
          talla: tallaKey,
          sku: row.sku ?? "—",
          stock_destino: row.stock_destino ?? 0,
          ritmo_venta: row.ritmo_venta ?? 0,
          uds_sugeridas: 0,
          origenes: [],
        };
        group.tallas.push(tallaEntry);
      }

      if ((row.prioridad ?? 1) === 1) {
        tallaEntry.uds_sugeridas = row.uds_sugeridas ?? 0;
        group.total_uds += row.uds_sugeridas ?? 0;
      }

      tallaEntry.origenes.push({
        tienda: row.tienda_origen ?? "—",
        stock: row.stock_origen ?? 0,
        uds: row.uds_sugeridas ?? 0,
      });
    });

    // Post-process: check single source feasibility
    map.forEach((group) => {
      const allOrig = new Set<string>();
      group.tallas.forEach((t) => t.origenes.forEach((o) => allOrig.add(o.tienda)));
      group.origenes_unicos = Array.from(allOrig);

      // Can one source fulfill all sizes?
      if (group.origenes_unicos.length > 1) {
        // Check if any single origin has priority 1 for all tallas
        const originCounts = new Map<string, number>();
        group.tallas.forEach((t) => {
          if (t.origenes.length > 0) {
            const primary = t.origenes[0].tienda;
            originCounts.set(primary, (originCounts.get(primary) ?? 0) + 1);
          }
        });
        group.puede_una_fuente = Array.from(originCounts.values()).some(
          (count) => count === group.tallas.length
        );
      }

      // Sort tallas naturally
      group.tallas.sort((a, b) => {
        const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
        const ai = sizeOrder.findIndex((s) => a.talla.toUpperCase().includes(s));
        const bi = sizeOrder.findIndex((s) => b.talla.toUpperCase().includes(s));
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.talla.localeCompare(b.talla, undefined, { numeric: true });
      });
    });

    return Array.from(map.values()).sort((a, b) => b.total_uds - a.total_uds);
  }, [data]);

  const exportData = grouped.map((g) => ({
    Producto: g.producto,
    Color: g.color,
    Destino: g.tienda_destino,
    "Curva (tallas)": g.tallas.map((t) => `${t.talla}:${t.uds_sugeridas}`).join(" | "),
    "Total Uds": g.total_uds,
    "Origen Principal": g.origenes_unicos[0] ?? "—",
    "Fuente Única": g.puede_una_fuente ? "Sí" : "No",
  }));

  if (loading) return <LoadingState rows={5} />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Filtros:</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={origenFilter} onValueChange={setOrigenFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los orígenes</SelectItem>
              {origenes.map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={destinoFilter} onValueChange={setDestinoFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los destinos</SelectItem>
              {destinos.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(origenFilter !== "all" || destinoFilter !== "all") && (
            <button
              onClick={() => { setOrigenFilter("all"); setDestinoFilter("all"); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" /> Limpiar
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <span className="text-sm text-muted-foreground">
            <span className="text-primary font-semibold">{grouped.length}</span> curvas sugeridas
          </span>
          <button
            onClick={() => exportToCSV(exportData as unknown as Record<string, unknown>[], `curvas_traslado_${days}d`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => exportToPDF(exportData as unknown as Record<string, unknown>[], `curvas_traslado_${days}d`, "Curvas de Traslado")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>

      {!grouped.length ? (
        <EmptyState message="No hay curvas de traslado sugeridas para este período. ✅ El inventario está bien distribuido." />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Color</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destino</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Curva de Tallas</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total Uds</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Origen</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Fuente</th>
                </tr>
              </thead>
              <tbody>
                {grouped.slice(0, 100).map((g, i) => (
                  <tr
                    key={`${g.product_id}__${g.tienda_destino}__${i}`}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setSelectedGroup(g)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {g.foto ? (
                          <img src={g.foto} alt="" className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0"
                            onError={(e) => { e.currentTarget.style.display = "none"; }} />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-sm shrink-0">👗</div>
                        )}
                        <span className="font-medium text-foreground line-clamp-2 max-w-[200px] hover:text-primary transition-colors">
                          {g.producto}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{g.color}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-primary">{g.tienda_destino}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {g.tallas.map((t) => (
                          <div
                            key={t.talla}
                            className="flex flex-col items-center px-2 py-1 rounded border border-border bg-muted/20 min-w-[40px]"
                          >
                            <span className="text-[10px] text-muted-foreground leading-none">{t.talla}</span>
                            <span className="text-xs font-bold text-primary leading-tight">{t.uds_sugeridas}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                        {g.total_uds}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {g.origenes_unicos.length <= 2 ? (
                        g.origenes_unicos.map((o, idx) => (
                          <span key={o}>
                            {idx > 0 && <span className="text-muted-foreground"> + </span>}
                            <span className="font-medium text-destructive">{o}</span>
                          </span>
                        ))
                      ) : (
                        <span className="font-medium text-destructive">
                          {g.origenes_unicos[0]} <span className="text-muted-foreground">+{g.origenes_unicos.length - 1}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {g.puede_una_fuente ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          ✅ Única
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning border border-warning/20">
                          ⚠️ Múltiple
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {grouped.length > 100 && (
            <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border bg-muted/10">
              Mostrando 100 de {grouped.length} curvas. Usa los filtros para acotar.
            </div>
          )}
        </div>
      )}

      {/* Detail Drawer */}
      <CurvaDetailDrawer group={selectedGroup} onClose={() => setSelectedGroup(null)} />
    </div>
  );
}

function CurvaDetailDrawer({ group, onClose }: { group: GroupedProduct | null; onClose: () => void }) {
  if (!group) return null;

  return (
    <Sheet open={!!group} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="!max-w-2xl w-full overflow-y-auto p-0" side="right">
        <SheetHeader className="p-6 pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            {group.foto ? (
              <img src={group.foto} alt={group.producto} className="h-16 w-16 rounded-xl object-cover border border-border shrink-0" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0 text-xs">N/A</div>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-base font-semibold text-foreground leading-tight">{group.producto}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Color: <span className="font-medium text-foreground">{group.color}</span> · Destino: <span className="font-medium text-primary">{group.tienda_destino}</span>
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  {group.total_uds} uds totales
                </span>
                {group.puede_una_fuente ? (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                    ✅ Fuente Única
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning border border-warning/20">
                    ⚠️ Múltiples Fuentes
                  </span>
                )}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Curve visualization */}
        <div className="px-6 py-4 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">Curva Sugerida</p>
          <div className="flex items-end gap-1 flex-wrap">
            {group.tallas.map((t) => {
              const maxUds = Math.max(...group.tallas.map((x) => x.uds_sugeridas), 1);
              const height = Math.max((t.uds_sugeridas / maxUds) * 60, 16);
              return (
                <div key={t.talla} className="flex flex-col items-center gap-1">
                  <span className="text-xs font-bold text-primary">{t.uds_sugeridas}</span>
                  <div
                    className="w-10 rounded-t bg-primary/20 border border-primary/30"
                    style={{ height: `${height}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground font-medium">{t.talla}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail table: per talla, show sources */}
        <div className="px-6 py-4">
          <p className="text-xs font-medium text-muted-foreground mb-3">Detalle por Talla & Origen</p>
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-xs">Talla</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-right text-xs">Stock Destino</TableHead>
                  <TableHead className="text-right text-xs">Ritmo Venta</TableHead>
                  <TableHead className="text-xs">Origen</TableHead>
                  <TableHead className="text-right text-xs">Stock Origen</TableHead>
                  <TableHead className="text-right text-xs">Uds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.tallas.map((t) =>
                  t.origenes.map((o, oi) => (
                    <TableRow key={`${t.talla}-${o.tienda}-${oi}`} className={oi > 0 ? "bg-muted/5" : ""}>
                      {oi === 0 ? (
                        <>
                          <TableCell rowSpan={t.origenes.length} className="text-sm font-medium border-r border-border/30">
                            {t.talla}
                          </TableCell>
                          <TableCell rowSpan={t.origenes.length} className="font-mono text-xs text-muted-foreground border-r border-border/30">
                            {t.sku}
                          </TableCell>
                          <TableCell rowSpan={t.origenes.length} className="text-right text-sm border-r border-border/30">
                            {t.stock_destino}
                          </TableCell>
                          <TableCell rowSpan={t.origenes.length} className="text-right text-xs text-muted-foreground border-r border-border/30">
                            {t.ritmo_venta.toFixed(1)} uds/sem
                          </TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-xs font-medium text-destructive">{o.tienda}</TableCell>
                      <TableCell className="text-right text-sm">{o.stock}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">
                          {o.uds}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
