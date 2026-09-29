import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { TimeFilter, buildRpcDateParams } from "./TimeFilter";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, ChevronDown, ChevronRight, Gauge, Clock } from "lucide-react";
import { ProductImageThumb } from "./ProductImageThumb";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ProductInfo {
  foto: string;
  producto: string;
  product_id: string;
  categoria: string;
}

export interface ProductDrawerMetrics {
  wos?: number | null;
  wos_total?: number | null;
  ritmo_semanal?: number | null;
  rdv_estado?: string | null;
  rdv_indice?: number | null;
  stock_total?: number | null;
  st_120d?: number | null;
  sell_through_pct?: number | null;
}

interface TallaRow { zona: string | null; ubicacion: string; es_bodega: boolean; talla: string; orden_talla: number; unidades: number; }

const RDV_STYLES: Record<string, { text: string; chip: string | null }> = {
  DETENIDO: { text: "text-red-600", chip: "bg-red-100 text-red-700" },
  BAJO: { text: "text-orange-600", chip: "bg-orange-100 text-orange-700" },
  REGULAR: { text: "text-amber-600", chip: "bg-amber-100 text-amber-700" },
  BUENO: { text: "text-emerald-600", chip: "bg-emerald-100 text-emerald-700" },
  EXCELENTE: { text: "text-blue-600", chip: "bg-blue-100 text-blue-700" },
  AGOTADO: { text: "text-muted-foreground", chip: "bg-muted text-muted-foreground" },
  "SOLO ONLINE": { text: "text-muted-foreground", chip: null },
  "SIN COMPARABLES": { text: "text-muted-foreground", chip: null },
};
const fmtIdx = (v: number) => (v >= 999 ? "+10×" : `${(v / 100).toFixed(1).replace(".", ",")}×`);
const fmtWos = (v: number | null | undefined) => (v == null || v > 90 ? "+99" : String(v));

function MetricCard({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2 min-w-[130px]">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm font-semibold text-foreground tabular-nums">{children}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

interface DetailRow {
  orden: number;
  zona: string | null;
  tienda: string;
  es_bodega: boolean;
  dias_en_tienda: number | null;
  semanas_en_tienda: number | null;
  recibido: number;
  und_vendidas_vida: number;
  st_120d: number | null;
  st_acum: number | null;
  base_st: string | null;
  ritmo_semanal: number | null;
  und_vendidas: number;
  ingresos: number;
  stock_actual: number;
  pct_full_price: number;
  pct_descuento: number;
  sell_through_pct: number;
  wos: number | null;
  estado_salud: string;
}

const WOS_OPTIONS = [
  { value: "all", label: "Todos los WOS" },
  { value: "risk", label: "🟡 Riesgo (<4 sem)" },
  { value: "optimal", label: "🟢 Óptimo (4-12 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>12 sem)" },
  { value: "stagnant", label: "🔴 Estancado (0 ventas)" },
];

const ST_OPTIONS = [
  { value: "all", label: "Todos los %ST" },
  { value: "high", label: "🟢 Alto (≥70%)" },
  { value: "medium", label: "🟡 Medio (30-69%)" },
  { value: "low", label: "🔴 Bajo (<30%)" },
];

export function ProductDetailDrawer({
  product,
  days,
  onClose,
  rangeValue,
  customFrom,
  customTo,
  metrics,
}: {
  product: ProductInfo | null;
  days: number;
  onClose: () => void;
  /** Valor del TimeFilter de la página (preset/sentinela). Si no llega, se usa `days`. */
  rangeValue?: number;
  customFrom?: Date;
  customTo?: Date;
  metrics?: ProductDrawerMetrics | null;
}) {
  const [dVal, setDVal] = useState<number>(rangeValue ?? days);
  const [dFrom, setDFrom] = useState<Date | undefined>(customFrom);
  const [dTo, setDTo] = useState<Date | undefined>(customTo);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [soloDestalladas, setSoloDestalladas] = useState(false);
  useEffect(() => {
    if (product) { setDVal(rangeValue ?? days); setDFrom(customFrom); setDTo(customTo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.product_id]);
  const { dias_atras, p_hasta } = buildRpcDateParams(dVal, dFrom, dTo);
  const [storeFilter, setStoreFilter] = useState("all");
  const [wosFilter, setWosFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["detalle-producto-tiendas", product?.product_id, dias_atras, p_hasta],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_producto_tiendas", {
        dias_atras,
        p_product_id: product.product_id,
        p_hasta,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as DetailRow[]).map((r) => ({ ...r, sell_through_pct: Number(r.st_acum ?? 0) }));
    },
    enabled: !!product,
  });

  const rows = data ?? [];

  const { data: tallasData } = useQuery({
    queryKey: ["tallas-producto-ubicacion", product?.product_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_tallas_producto_ubicacion" as any, { p_product_id: product!.product_id });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TallaRow[];
    },
    enabled: !!product,
  });

  const tallas = useMemo(() => {
    const m = new Map<string, { talla: string; orden: number; unidades: number }>();
    for (const r of tallasData ?? []) {
      const t = m.get(r.talla) ?? { talla: r.talla, orden: Number(r.orden_talla ?? 0), unidades: 0 };
      t.unidades += Number(r.unidades ?? 0);
      m.set(r.talla, t);
    }
    return [...m.values()].sort((a, b) => a.orden - b.orden);
  }, [tallasData]);
  const totalTallasUnd = tallas.reduce((a, t) => a + t.unidades, 0);

  const tallasPorUbic = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const r of tallasData ?? []) {
      const u = m.get(r.ubicacion) ?? new Map<string, number>();
      u.set(r.talla, (u.get(r.talla) ?? 0) + Number(r.unidades ?? 0));
      m.set(r.ubicacion, u);
    }
    return m;
  }, [tallasData]);
  const tallasConStock = (ubic: string) => {
    const u = tallasPorUbic.get(ubic);
    return u ? [...u.values()].filter((v) => v > 0).length : 0;
  };
  const matrixRows = useMemo(() => {
    const names: string[] = [];
    for (const r of rows) if (!names.includes(r.tienda)) names.push(r.tienda);
    for (const n of tallasPorUbic.keys()) if (!names.includes(n)) names.push(n);
    const list = names.filter((n) => tallasPorUbic.has(n) || rows.some((r) => r.tienda === n));
    return soloDestalladas ? list.filter((n) => tallasConStock(n) < tallas.length) : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tallasPorUbic, soloDestalladas, tallas.length]);

  const storeGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      const z = r.zona ?? "Sin zona";
      const list = m.get(z) ?? [];
      if (!list.includes(r.tienda)) list.push(r.tienda);
      m.set(z, list);
    }
    return [...m.entries()];
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (storeFilter !== "all") result = result.filter((r) => r.tienda === storeFilter);
    if (wosFilter !== "all") {
      result = result.filter((r) => {
        if (r.es_bodega) return true;
        if (wosFilter === "stagnant") return r.estado_salud.includes("ESTANCADO");
        if (wosFilter === "risk") return r.wos != null && r.wos > 0 && r.wos < 4;
        if (wosFilter === "optimal") return r.wos != null && r.wos >= 4 && r.wos <= 18;
        if (wosFilter === "overstock") return r.wos == null || r.wos > 18;
        return true;
      });
    }
    if (stFilter !== "all") {
      result = result.filter((r) => {
        if (r.es_bodega) return true;
        if (stFilter === "high") return r.sell_through_pct >= 70;
        if (stFilter === "medium") return r.sell_through_pct >= 30 && r.sell_through_pct < 70;
        if (stFilter === "low") return r.sell_through_pct < 30;
        return true;
      });
    }
    return result;
  }, [rows, storeFilter, wosFilter, stFilter]);

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  const handleExportCSV = () => {
    if (!filtered.length || !product) return;
    exportToCSV(
      filtered.map((r) => ({
        Producto: product.producto,
        "Product ID": product.product_id,
        Zona: r.zona ?? "",
        Tienda: r.tienda,
        "Semanas en tienda": r.es_bodega ? "" : r.semanas_en_tienda ?? "",
        "Días en tienda": r.es_bodega ? "" : r.dias_en_tienda ?? "",
        Recibido: r.es_bodega ? "" : r.recibido,
        "Und. Vendidas": r.es_bodega ? "" : r.und_vendidas,
        "Vendidas de vida": r.es_bodega ? "" : r.und_vendidas_vida,
        "RDV (u/sem)": r.es_bodega ? "" : r.ritmo_semanal ?? "",
        "% Full Price": r.es_bodega ? "" : r.pct_full_price,
        "% Descuento": r.es_bodega ? "" : r.pct_descuento,
        Stock: r.stock_actual,
        "ST 120d": r.es_bodega ? "" : r.st_120d ?? "",
        "ST acum.": r.es_bodega ? "" : r.st_acum ?? "",
        WOS: r.es_bodega ? "" : r.wos ?? "SIN ROTACIÓN",
        Salud: r.estado_salud,
      })),
      `detalle_${product.product_id}`
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length || !product) return;
    exportToPDF(
      filtered.map((r) => ({
        Zona: r.zona ?? "",
        Tienda: r.tienda,
        Tiempo: r.es_bodega || (r.semanas_en_tienda == null && r.dias_en_tienda == null)
          ? "—"
          : `${Math.floor(Number(r.semanas_en_tienda ?? 0))} sem · ${Math.floor(Number(r.dias_en_tienda ?? 0))} días`,
        Recibido: r.es_bodega ? "—" : r.recibido,
        "Und.": r.es_bodega ? "—" : r.und_vendidas,
        "Vida": r.es_bodega ? "—" : r.und_vendidas_vida,
        RDV: r.es_bodega || r.ritmo_semanal == null
          ? "—"
          : `${Number(r.ritmo_semanal).toLocaleString("es-CO", { maximumFractionDigits: 2 })} u/sem`,
        "% Full": r.es_bodega ? "—" : r.pct_full_price,
        "% Dto.": r.es_bodega ? "—" : r.pct_descuento,
        Stock: r.stock_actual,
        "ST 120d": r.es_bodega ? "—" : r.st_120d ?? "—",
        "ST acum.": r.es_bodega ? "—" : r.st_acum ?? "—",
        WOS: r.es_bodega ? "—" : r.wos ?? "SIN ROTACIÓN",
        Salud: r.estado_salud,
      })),
      `detalle_${product.product_id}`,
      `Detalle: ${product.producto}`
    );
  };

  return (
    <Sheet open={!!product} onOpenChange={(open) => { if (!open) { onClose(); setStoreFilter("all"); setWosFilter("all"); setStFilter("all"); } }}>
      <SheetContent className="!max-w-full w-full overflow-y-auto p-0" side="right">
        {product && (
          <>
            {/* Header */}
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-start gap-4">
                {product.foto ? (
                  <ProductImageThumb
                    src={product.foto}
                    alt={product.producto}
                    productId={product.product_id}
                    title={product.producto}
                    className="h-20 w-20 rounded-xl object-cover border border-border shrink-0"
                    loading="eager"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">N/A</div>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold text-foreground leading-tight">{product.producto}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{product.categoria}</p>
                  {metrics && (() => {
                    const estado = (metrics.rdv_estado ?? "SOLO ONLINE").toUpperCase();
                    const st = RDV_STYLES[estado] ?? RDV_STYLES["SOLO ONLINE"];
                    const rs = Number(metrics.ritmo_semanal ?? 0);
                    return (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <MetricCard label="WOS general" sub="LO DISPONIBILIZADO">{fmtWos(metrics.wos)} sem.</MetricCard>
                        <MetricCard label="WOS total" sub="TOTALIDAD DE INVENTARIO">{fmtWos(metrics.wos_total)} sem.</MetricCard>
                        <MetricCard label="RDV" sub={st.chip ? <span className={cn("inline-block text-[10px] font-medium px-1.5 rounded", st.chip)}>{estado}{metrics.rdv_indice != null ? ` (${fmtIdx(metrics.rdv_indice)})` : ""}</span> : <span className={st.text}>{estado}</span>}>
                          <span className={cn("inline-flex items-center gap-1", st.text)}><Gauge className="h-3 w-3" />{rs > 0 ? rs.toLocaleString("es-CO", { maximumFractionDigits: 1 }) : "0"} u/sem</span>
                        </MetricCard>
                        <MetricCard label="Stock total">{Number(metrics.stock_total ?? 0).toLocaleString("es-CO")}</MetricCard>
                        <MetricCard label="Sell-through" sub={`ST acum. ${metrics.sell_through_pct ?? 0}%`}>{metrics.st_120d ?? 0}% <span className="text-[10px] font-normal text-muted-foreground">120d</span></MetricCard>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </SheetHeader>

            {/* Filters */}
            <div className="px-6 pt-4 pb-2 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <TimeFilter
                value={dVal}
                onChange={(v) => { setDFrom(undefined); setDTo(undefined); setDVal(v); }}
                customFrom={dFrom}
                customTo={dTo}
                onCustomRangeChange={(f, t) => { setDFrom(f); setDTo(t); }}
              />
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Todas las tiendas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las tiendas</SelectItem>
                  {storeGroups.map(([zona, names]) => (
                    <SelectGroup key={zona}>
                      <SelectLabel className="text-xs text-muted-foreground">{zona}</SelectLabel>
                      {names.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Select value={wosFilter} onValueChange={setWosFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Filtrar por WOS" />
                </SelectTrigger>
                <SelectContent>
                  {WOS_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={stFilter} onValueChange={setStFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-9 text-sm">
                  <SelectValue placeholder="Filtrar por %ST" />
                </SelectTrigger>
                <SelectContent>
                  {ST_OPTIONS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export buttons */}
            <div className="px-6 pb-2 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
            </div>

            {/* Disponibilidad por talla */}
            {tallas.length > 0 && (
              <div className="px-6 pb-2">
                <p className="text-xs font-semibold text-foreground mb-2">Disponibilidad por talla</p>
                <div className="flex flex-wrap gap-2">
                  {tallas.map((t) => {
                    const pct = totalTallasUnd > 0 ? (t.unidades / totalTallasUnd) * 100 : 0;
                    const tone = t.unidades === 0 ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : pct < 10 ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-muted/30 text-foreground";
                    return (
                      <div key={t.talla} className={cn("rounded-lg border px-3 py-1.5 min-w-[72px] text-center", tone)}>
                        <p className="text-xs font-bold">{t.talla}</p>
                        <p className="text-sm font-semibold tabular-nums">{t.unidades.toLocaleString("es-CO")}</p>
                        <p className="text-[10px] tabular-nums opacity-80">{pct.toFixed(1).replace(".", ",")}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Detail Table */}
            <div className="px-6 pb-6">
              {isLoading ? (
                <LoadingState rows={5} />
              ) : !filtered.length ? (
                <EmptyState message="Sin datos para este filtro." />
              ) : (
                <TooltipProvider delayDuration={200}>
                <div className="border border-border rounded-lg overflow-x-auto mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-10 text-right">#</TableHead>
                        <TableHead>Tienda</TableHead>
                        <TableHead>Tiempo</TableHead>
                        <TableHead className="text-right">Recibido</TableHead>
                        <TableHead className="text-right">Vendidas</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">RDV</TableHead>
                        <TableHead className="text-right">% Full</TableHead>
                        <TableHead className="text-right">% Dto.</TableHead>
                        <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                        <TableHead>WOS</TableHead>
                        <TableHead className="text-right">Tallas</TableHead>
                        <TableHead>Salud</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row) => {
                        const b = row.es_bodega;
                        const dash = <span className="text-muted-foreground">—</span>;
                        const acum = Number(row.st_acum ?? 0);
                        const est = row.base_st === "estimada" && (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-help text-warning font-bold ml-0.5">*</span></TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">Sin historial de traslados suficiente para este producto en esta tienda. Lo recibido se estima como vendido más stock.</TooltipContent>
                          </Tooltip>
                        );
                        return (
                        <TableRow key={`${row.orden}-${row.tienda}`}>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{row.orden}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p className="text-sm font-medium text-foreground">{row.tienda}</p>
                            {row.zona && <p className="text-[11px] text-muted-foreground">{row.zona}</p>}
                          </TableCell>
                          <TableCell>
                            {b || (row.semanas_en_tienda == null && row.dias_en_tienda == null) ? dash : (
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <div className="leading-tight">
                                  <p className="text-sm font-medium text-foreground tabular-nums">{Math.floor(Number(row.semanas_en_tienda ?? 0))} sem.</p>
                                  <p className="text-[10px] text-muted-foreground tabular-nums">{Math.floor(Number(row.dias_en_tienda ?? 0))} días</p>
                                </div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{b ? dash : (row.recibido ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{b ? dash : (row.und_vendidas ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">{(row.stock_actual ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right">
                            {b || row.ritmo_semanal == null ? dash : (
                              <span className="text-sm tabular-nums text-foreground">
                                {Number(row.ritmo_semanal).toLocaleString("es-CO", { maximumFractionDigits: 2 })} u/sem
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{b ? dash : <span className="text-sm font-medium text-success">{row.pct_full_price}%</span>}</TableCell>
                          <TableCell className="text-right">{b ? dash : <span className="text-sm font-medium text-warning">{row.pct_descuento}%</span>}</TableCell>
                          <TableCell>
                            {b ? dash : (
                              <div className="w-32">
                                <p className="text-sm font-semibold tabular-nums leading-tight">
                                  {row.st_120d == null ? "—" : `${row.st_120d}%`} <span className="text-[10px] font-normal text-muted-foreground">120d</span>{est}
                                </p>
                                <p className="text-xs tabular-nums text-muted-foreground leading-tight">
                                  {row.st_acum == null ? "—" : `${row.st_acum}%`} <span className="text-[10px]">acum.</span>{est}
                                </p>
                                <Progress value={Math.min(acum, 100)} className="h-2 mt-1 bg-muted" indicatorClassName={getSellThroughColor(acum)} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {b ? dash : (
                              <>
                                <p className="text-sm font-semibold tabular-nums">{row.wos == null || row.wos > 90 ? "+99" : row.wos}</p>
                                {row.wos == null && (
                                  <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-destructive/10 text-destructive">SIN ROTACIÓN</span>
                                )}
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">
                            {tallas.length === 0 ? dash : (() => { const n = tallasConStock(row.tienda); return <span className={n < tallas.length ? "text-destructive" : "text-success"}>{n}/{tallas.length}</span>; })()}
                          </TableCell>
                          <TableCell><StatusBadge label={row.estado_salud} /></TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                </TooltipProvider>
              )}

              {tallas.length > 0 && (
                <div className="mt-4 border border-border rounded-lg">
                  <div className="flex items-center justify-between px-3 py-2">
                    <button className="flex items-center gap-1 text-sm font-semibold text-foreground" onClick={() => setMatrixOpen((o) => !o)}>
                      {matrixOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Detalle por talla
                    </button>
                    {matrixOpen && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={soloDestalladas} onCheckedChange={setSoloDestalladas} /> Solo destalladas
                      </label>
                    )}
                  </div>
                  {matrixOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead>Ubicación</TableHead>
                            {tallas.map((t) => <TableHead key={t.talla} className="text-center font-bold">{t.talla}</TableHead>)}
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {matrixRows.map((name) => {
                            const u = tallasPorUbic.get(name);
                            let tot = 0;
                            return (
                              <TableRow key={name}>
                                <TableCell className="text-sm whitespace-nowrap">{name}</TableCell>
                                {tallas.map((t) => {
                                  const v = u?.get(t.talla) ?? 0; tot += v;
                                  return <TableCell key={t.talla} className={cn("text-center text-sm tabular-nums", v === 0 && "bg-destructive/10 text-destructive")}>{v || ""}</TableCell>;
                                })}
                                <TableCell className="text-right text-sm font-semibold tabular-nums">{tot.toLocaleString("es-CO")}</TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-muted/40 font-semibold">
                            <TableCell className="text-sm">TOTAL</TableCell>
                            {tallas.map((t) => <TableCell key={t.talla} className="text-center text-sm tabular-nums">{t.unidades.toLocaleString("es-CO")}</TableCell>)}
                            <TableCell className="text-right text-sm tabular-nums">{totalTallasUnd.toLocaleString("es-CO")}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
