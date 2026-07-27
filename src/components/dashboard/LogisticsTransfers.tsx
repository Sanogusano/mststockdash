import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isValidDays } from "@/lib/validation";
import { buildRpcDateParams } from "@/components/dashboard/TimeFilter";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { exportToXLS } from "@/lib/xls-export";
import { Download, FileText, FileSpreadsheet, Filter, X, Package } from "lucide-react";
import { LoadingState, EmptyState } from "./LoadingState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

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
  stock_general: number;
  origenes_unicos: string[];
  puede_una_fuente: boolean;
}

interface Props {
  days: number;
  customFrom?: Date;
  customTo?: Date;
}

// Flat export row for downloads
function buildFlatExport(grouped: GroupedProduct[]) {
  const rows: Record<string, unknown>[] = [];
  grouped.forEach((g) => {
    g.tallas.forEach((t) => {
      t.origenes.forEach((o) => {
        if (o.uds > 0) {
          rows.push({
            SKU: t.sku,
            Producto: g.producto,
            Color: g.color,
            Talla: t.talla,
            Origen: o.tienda,
            Destino: g.tienda_destino,
            "Stock Origen": o.stock,
            "Stock Destino": t.stock_destino,
            "Stock General": g.stock_general,
            Cantidad: o.uds,
          });
        }
      });
    });
  });
  return rows;
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];

function sortTallas(tallas: GroupedProduct["tallas"]) {
  return tallas.sort((a, b) => {
    const ai = SIZE_ORDER.findIndex((s) => a.talla.toUpperCase().includes(s));
    const bi = SIZE_ORDER.findIndex((s) => b.talla.toUpperCase().includes(s));
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.talla.localeCompare(b.talla, undefined, { numeric: true });
  });
}

export function LogisticsTransfers({ days, customFrom, customTo }: Props) {
  const [data, setData] = useState<CurvaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [origenFilter, setOrigenFilter] = useState<string>("all");
  const [destinoFilter, setDestinoFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedGroup, setSelectedGroup] = useState<GroupedProduct | null>(null);
  const [modeCurva, setModeCurva] = useState(true); // true = Curvas, false = Unidades

  // Fetch stock general per product_id
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchData() {
      if (!isValidDays(days)) return;
      setLoading(true);
      const { dias_atras: effectiveDays, p_hasta: hastaParam } = buildRpcDateParams(days, customFrom, customTo);
      const { data: rows, error } = await supabase.rpc("reporte_curva_traslados" as any, {
        dias_atras: effectiveDays,
        p_origen: origenFilter === "all" ? null : origenFilter,
        p_destino: destinoFilter === "all" ? null : destinoFilter,
        p_hasta: hastaParam,
      });
      if (!error && rows) setData(rows as unknown as CurvaRow[]);
      else setData([]);
      setLoading(false);
    }
    fetchData();
  }, [days, origenFilter, destinoFilter, customFrom, customTo]);

  // Fetch stock general via RPC (avoids 1000-row limit)
  useEffect(() => {
    async function fetchStock() {
      const { data: rows, error } = await supabase.rpc("stock_general_por_producto" as any);
      if (error || !rows) return;
      const map: Record<string, number> = {};
      (rows as any[]).forEach((r: any) => {
        if (r.product_id) map[r.product_id] = Number(r.stock_total) || 0;
      });
      setStockMap(map);
    }
    fetchStock();
  }, []);

  // Categories + Product → category mapping scoped to current reporte rows
  const [categories, setCategories] = useState<string[]>([]);
  const [productCategoryMap, setProductCategoryMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchCategoryMapForCurrentData() {
      const productIds = Array.from(
        new Set(data.map((r) => r.product_id).filter((id): id is string => !!id))
      );

      if (!productIds.length) {
        setProductCategoryMap({});
        setCategories([]);
        return;
      }

      const chunkSize = 500;
      const map: Record<string, string> = {};

      for (let i = 0; i < productIds.length; i += chunkSize) {
        const chunk = productIds.slice(i, i + chunkSize);
        // Fetch in pages to bypass the 1000-row default limit
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data: catalog } = await supabase
            .from("product_catalog")
            .select("product_id, category")
            .in("product_id", chunk)
            .not("category", "is", null)
            .range(from, from + pageSize - 1);

          if (!catalog || catalog.length === 0) {
            hasMore = false;
            break;
          }
          catalog.forEach((c: any) => {
            if (c.product_id && c.category) {
              map[c.product_id] = String(c.category).toUpperCase();
            }
          });
          if (catalog.length < pageSize) {
            hasMore = false;
          } else {
            from += pageSize;
          }
        }
      }

      const categorySet = new Set<string>();
      Object.values(map).forEach((cat) => {
        if (cat && !["BOLSA", "INSUMOS"].includes(cat)) categorySet.add(cat);
      });

      setProductCategoryMap(map);
      setCategories(Array.from(categorySet).sort());
    }

    fetchCategoryMapForCurrentData();
  }, [data]);

  useEffect(() => {
    if (categoryFilter !== "all" && !categories.includes(categoryFilter)) {
      setCategoryFilter("all");
    }
  }, [categoryFilter, categories]);

  const { origenes, destinos } = useMemo(() => {
    const orig = new Set<string>();
    const dest = new Set<string>();
    data.forEach((r) => {
      if (r.tienda_origen) orig.add(r.tienda_origen);
      if (r.tienda_destino) dest.add(r.tienda_destino);
    });
    return { origenes: Array.from(orig).sort(), destinos: Array.from(dest).sort() };
  }, [data]);

  // Group data
  const grouped = useMemo(() => {
    const map = new Map<string, GroupedProduct>();

    data.forEach((row) => {
      if (!row.product_id || !row.tienda_destino) return;

      // Category filter
      if (categoryFilter !== "all") {
        const cat = productCategoryMap[row.product_id];
        if (cat !== categoryFilter) return;
      }

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
          stock_general: stockMap[row.product_id] ?? 0,
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

      const udsSugeridas = Number(row.uds_sugeridas ?? 0);
      if (udsSugeridas > tallaEntry.uds_sugeridas) {
        tallaEntry.uds_sugeridas = udsSugeridas;
      }

      tallaEntry.origenes.push({
        tienda: row.tienda_origen ?? "—",
        stock: row.stock_origen ?? 0,
        uds: row.uds_sugeridas ?? 0,
      });
    });

    map.forEach((group) => {
      group.total_uds = group.tallas.reduce((acc, talla) => acc + talla.uds_sugeridas, 0);

      const allOrig = new Set<string>();
      group.tallas.forEach((t) => t.origenes.forEach((o) => allOrig.add(o.tienda)));
      group.origenes_unicos = Array.from(allOrig);

      if (group.origenes_unicos.length > 1) {
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

      sortTallas(group.tallas);
    });

    return Array.from(map.values()).sort((a, b) => b.total_uds - a.total_uds);
  }, [data, categoryFilter, productCategoryMap, stockMap]);

  const flatExport = useMemo(() => buildFlatExport(grouped), [grouped]);

  const downloadFilename = `traslados_${modeCurva ? "curvas" : "unidades"}_${days}d`;

  if (loading) return <LoadingState rows={5} />;

  return (
    <div className="space-y-4">
      {/* Mode Switch + Filters */}
      <div className="flex flex-col gap-3">
        {/* Top row: mode switch */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 bg-muted/40 rounded-lg px-3 py-2 border border-border">
            <Label htmlFor="mode-switch" className={`text-xs font-medium transition-colors ${modeCurva ? "text-primary" : "text-muted-foreground"}`}>
              Curvas
            </Label>
            <Switch
              id="mode-switch"
              checked={!modeCurva}
              onCheckedChange={(checked) => setModeCurva(!checked)}
            />
            <Label htmlFor="mode-switch" className={`text-xs font-medium transition-colors ${!modeCurva ? "text-primary" : "text-muted-foreground"}`}>
              Unidades
            </Label>
          </div>
          <span className="text-xs text-muted-foreground">
            {modeCurva ? "Vista por curva de tallas agrupada" : "Vista por unidades sugeridas por producto"}
          </span>
        </div>

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Filtros:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={origenFilter} onValueChange={setOrigenFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
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
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Destino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los destinos</SelectItem>
                {destinos.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(origenFilter !== "all" || destinoFilter !== "all" || categoryFilter !== "all") && (
              <button
                onClick={() => { setOrigenFilter("all"); setDestinoFilter("all"); setCategoryFilter("all"); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-sm text-muted-foreground">
              <span className="text-primary font-semibold">{grouped.length}</span> {modeCurva ? "curvas" : "productos"}
            </span>
            <button
              onClick={() => exportToXLS(flatExport, downloadFilename, "Traslados")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> XLS
            </button>
            <button
              onClick={() => exportToCSV(flatExport, downloadFilename)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
            <button
              onClick={() => exportToPDF(flatExport, downloadFilename, "Traslados Sugeridos")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
          </div>
        </div>
      </div>

      {!grouped.length ? (
        <EmptyState message="No hay sugerencias de traslado para este período. ✅ El inventario está bien distribuido." />
      ) : modeCurva ? (
        <CurvaView grouped={grouped} onSelect={setSelectedGroup} />
      ) : (
        <UnidadesView grouped={grouped} onSelect={setSelectedGroup} />
      )}

      <CurvaDetailDrawer group={selectedGroup} onClose={() => setSelectedGroup(null)} />
    </div>
  );
}

/* ─── Curva View ─── */
function CurvaView({ grouped, onSelect }: { grouped: GroupedProduct[]; onSelect: (g: GroupedProduct) => void }) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Color</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destino</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Curva de Tallas</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Total Uds</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Gral.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Origen</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground">Fuente</th>
            </tr>
          </thead>
          <tbody>
            {grouped.slice(0, 100).map((g, i) => (
              <tr
                key={`${g.product_id}__${g.tienda_destino}__${i}`}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => onSelect(g)}
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
                      <div key={t.talla} className="flex flex-col items-center px-2 py-1 rounded border border-border bg-muted/20 min-w-[40px]">
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
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{g.stock_general}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs">
                  <OrigenBadges origenes={g.origenes_unicos} />
                </td>
                <td className="px-4 py-3 text-center">
                  <FuenteBadge unica={g.puede_una_fuente} />
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
  );
}

/* ─── Unidades View ─── */
function UnidadesView({ grouped, onSelect }: { grouped: GroupedProduct[]; onSelect: (g: GroupedProduct) => void }) {
  // Flatten: one row per product+talla+destino
  const rows = useMemo(() => {
    const flat: { group: GroupedProduct; talla: GroupedProduct["tallas"][0] }[] = [];
    grouped.forEach((g) => {
      g.tallas.forEach((t) => {
        if (t.uds_sugeridas > 0) flat.push({ group: g, talla: t });
      });
    });
    return flat;
  }, [grouped]);

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1000px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Color</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Talla</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Destino</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Destino</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Ritmo Vta.</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Uds Sugeridas</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Stock Gral.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Origen</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((r, i) => (
              <tr
                key={`${r.talla.sku}__${r.group.tienda_destino}__${i}`}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                onClick={() => onSelect(r.group)}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {r.group.foto ? (
                      <img src={r.group.foto} alt="" className="w-8 h-8 rounded object-cover bg-muted shrink-0"
                        onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : null}
                    <span className="font-medium text-foreground text-xs line-clamp-1 max-w-[180px]">{r.group.producto}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.group.color}</td>
                <td className="px-4 py-2.5 text-xs font-medium">{r.talla.talla}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{r.talla.sku}</td>
                <td className="px-4 py-2.5 text-xs font-medium text-primary">{r.group.tienda_destino}</td>
                <td className="px-4 py-2.5 text-right text-xs">{r.talla.stock_destino}</td>
                <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">{r.talla.ritmo_venta.toFixed(1)}/sem</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                    {r.talla.uds_sugeridas}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{r.group.stock_general}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <OrigenBadges origenes={r.talla.origenes.map(o => o.tienda)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 200 && (
        <div className="px-4 py-2 text-xs text-muted-foreground text-center border-t border-border bg-muted/10">
          Mostrando 200 de {rows.length} líneas. Usa los filtros para acotar.
        </div>
      )}
    </div>
  );
}

/* ─── Small reusable pieces ─── */
function OrigenBadges({ origenes }: { origenes: string[] }) {
  const unique = [...new Set(origenes)];
  if (unique.length <= 2) {
    return (
      <span>
        {unique.map((o, idx) => (
          <span key={o}>
            {idx > 0 && <span className="text-muted-foreground"> + </span>}
            <span className="font-medium text-destructive">{o}</span>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className="font-medium text-destructive">
      {unique[0]} <span className="text-muted-foreground">+{unique.length - 1}</span>
    </span>
  );
}

function FuenteBadge({ unica }: { unica: boolean }) {
  return unica ? (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
      ✅ Única
    </span>
  ) : (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-warning/10 text-warning border border-warning/20">
      ⚠️ Múltiple
    </span>
  );
}

/* ─── Detail Drawer ─── */
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
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  {group.total_uds} uds totales
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                  <Package className="h-3 w-3" /> Stock Gral: {group.stock_general}
                </span>
                <FuenteBadge unica={group.puede_una_fuente} />
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

        {/* Detail table */}
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
                          <TableCell rowSpan={t.origenes.length} className="text-sm font-medium border-r border-border/30">{t.talla}</TableCell>
                          <TableCell rowSpan={t.origenes.length} className="font-mono text-xs text-muted-foreground border-r border-border/30">{t.sku}</TableCell>
                          <TableCell rowSpan={t.origenes.length} className="text-right text-sm border-r border-border/30">{t.stock_destino}</TableCell>
                          <TableCell rowSpan={t.origenes.length} className="text-right text-xs text-muted-foreground border-r border-border/30">{t.ritmo_venta.toFixed(1)} uds/sem</TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-xs font-medium text-destructive">{o.tienda}</TableCell>
                      <TableCell className="text-right text-sm">{o.stock}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary">{o.uds}</span>
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
