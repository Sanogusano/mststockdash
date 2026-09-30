import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { TimeFilter, buildRpcDateParams, getDateRange } from "./TimeFilter";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, Gauge, Clock, Store, Copy, Check } from "lucide-react";
import { ProductImageThumb } from "./ProductImageThumb";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip as RTooltip } from "recharts";
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
  ritmo_pdv?: number | null;
  rdv_estado?: string | null;
  rdv_indice?: number | null;
  stock_total?: number | null;
  st_120d?: number | null;
  sell_through_pct?: number | null;
  und_vendidas?: number | null;
  semanas_en_venta?: number | null;
  dias_en_venta?: number | null;
}

interface TallaRow { zona: string | null; ubicacion: string; es_bodega: boolean; talla: string; orden_talla: number; unidades: number; }

interface TallaMatrixRow {
  talla: string;
  orden_talla: number;
  skus: string | null;
  stock_tiendas: number;
  stock_bodega: number;
  cargado_pct: number | null;
  ritmo_semanal: number | null;
  demanda_pct: number | null;
  brecha_pct: number | null;
  wos_talla: number | null;
  ubicaciones_con_talla: number;
  ubicaciones_total: number;
  und_vendidas: number | null;
  und_vendidas_vida: number;
  sell_through_pct: number | null;
  estado: string | null;
}

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
const ONLINE_LOCATION_ID = "71474315479";

const formatDecimal = (value: number | null | undefined) => value == null
  ? "—"
  : Number(value).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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
  { value: "optimal", label: "🟢 Óptimo (4-18 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>18 sem)" },
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
  const [copiedSize, setCopiedSize] = useState<string | null>(null);
  const [soloDestalladas, setSoloDestalladas] = useState(false);
  useEffect(() => {
    if (product) { setDVal(rangeValue ?? days); setDFrom(customFrom); setDTo(customTo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.product_id]);
  const { dias_atras, p_hasta } = buildRpcDateParams(dVal, dFrom, dTo);
  const [storeFilter, setStoreFilter] = useState("all");
  const [wosFilter, setWosFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");

  const { data: locationsData } = useQuery({
    queryKey: ["locations-product-detail"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("location_id, name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!product,
    staleTime: 5 * 60 * 1000,
  });

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

  const locationIdByName = useMemo(() => {
    const map = new Map((locationsData ?? []).map((location) => [location.name, location.location_id]));
    map.set("Bodega Ecommerce", ONLINE_LOCATION_ID);
    return map;
  }, [locationsData]);

  const selectedLocationId = storeFilter === "all" ? null : locationIdByName.get(storeFilter) ?? null;

  const { data: sizeMatrixData, isLoading: sizeMatrixLoading } = useQuery({
    queryKey: ["matriz-tallas-producto", product?.product_id, selectedLocationId],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_matriz_tallas_producto" as any, {
        p_product_id: product.product_id,
        p_location_id: selectedLocationId,
        p_umbral_brecha: null,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as TallaMatrixRow[]).sort((a, b) => Number(a.orden_talla ?? 0) - Number(b.orden_talla ?? 0));
    },
    enabled: !!product && (storeFilter === "all" || selectedLocationId != null),
  });

  const sizeMatrix = sizeMatrixData ?? [];

  const { data: tallasData } = useQuery({
    queryKey: ["tallas-producto-ubicacion", product?.product_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_tallas_producto_ubicacion" as any, { p_product_id: product!.product_id });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as TallaRow[];
    },
    enabled: !!product,
  });

  const { tallas } = useMemo(() => {
    const m = new Map<string, { talla: string; orden: number; unidades: number; enBodega: number; ubics: Set<string> }>();
    const allUbic = new Set<string>();
    for (const r of tallasData ?? []) {
      const t = m.get(r.talla) ?? { talla: r.talla, orden: Number(r.orden_talla ?? 0), unidades: 0, enBodega: 0, ubics: new Set<string>() };
      const u = Number(r.unidades ?? 0);
      if (r.es_bodega) {
        t.enBodega += u;
      } else {
        t.unidades += u;
        allUbic.add(r.ubicacion);
        if (u > 0) t.ubics.add(r.ubicacion);
      }
      m.set(r.talla, t);
    }
    return {
      tallas: [...m.values()].sort((a, b) => a.orden - b.orden).map((t) => ({ ...t, cobertura: t.ubics.size })),
    };
  }, [tallasData]);

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
  const ubicacionesTallas = useMemo(() => {
    const metadata = new Map<string, { zona: string | null; esBodega: boolean }>();
    for (const row of tallasData ?? []) {
      if (!metadata.has(row.ubicacion)) metadata.set(row.ubicacion, { zona: row.zona, esBodega: row.es_bodega });
    }
    return [...metadata.entries()]
      .map(([ubicacion, meta]) => ({ ubicacion, ...meta, tallasConStock: tallasConStock(ubicacion) }))
      .filter((row) => !soloDestalladas || row.tallasConStock < tallas.length)
      .sort((a, b) => Number(a.esBodega) - Number(b.esBodega) || a.ubicacion.localeCompare(b.ubicacion, "es"));
  }, [tallasData, tallasPorUbic, tallas.length, soloDestalladas]);
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

  const activeDateRange = useMemo(() => {
    const { from, to } = getDateRange(dVal, dFrom, dTo);
    const dateLabel = (date: Date) => format(date, "d MMM", { locale: es });
    return `${dateLabel(from)} – ${dateLabel(to)}`;
  }, [dVal, dFrom, dTo]);

  const copySkus = async (size: string, skus: string | null) => {
    if (!skus) return;
    await navigator.clipboard.writeText(skus);
    setCopiedSize(size);
    window.setTimeout(() => setCopiedSize((current) => current === size ? null : current), 1500);
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
                    const fmtU = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                    const d56 = <span className="text-[10px] font-normal text-muted-foreground">56d</span>;
                    return (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <MetricCard label="Tiempo de vida" sub={`${Number(metrics.dias_en_venta ?? 0).toLocaleString("es-CO")} días`}>{Number(metrics.semanas_en_venta ?? 0).toLocaleString("es-CO")} sem.</MetricCard>
                        <MetricCard label="Unidades vendidas" sub={activeDateRange}>{Number(metrics.und_vendidas ?? 0).toLocaleString("es-CO")}</MetricCard>
                        <MetricCard label="Ritmo de red" sub="TODA LA RED">
                          <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />{fmtU(metrics.ritmo_semanal)} u/sem</span> {d56}
                        </MetricCard>
                        <MetricCard label="Ritmo por tienda" sub={st.chip ? <span className={cn("inline-block text-[10px] font-medium px-1.5 rounded", st.chip)}>{estado}{metrics.rdv_indice != null ? ` (${fmtIdx(metrics.rdv_indice)})` : ""}</span> : <span className={st.text}>{estado}</span>}>
                          <span className={cn("inline-flex items-center gap-1", st.text)}><Store className="h-3 w-3" />{metrics.ritmo_pdv == null ? "—" : `${fmtU(metrics.ritmo_pdv)} u/sem`}</span> {d56}
                        </MetricCard>
                        <MetricCard label="Sell-through" sub={`ST acum. ${metrics.sell_through_pct ?? 0}%`}>{metrics.st_120d ?? 0}% <span className="text-[10px] font-normal text-muted-foreground">120d</span></MetricCard>
                        <MetricCard label="Stock total">{Number(metrics.stock_total ?? 0).toLocaleString("es-CO")}</MetricCard>
                        <MetricCard label="WOS general" sub="LO DISPONIBILIZADO">{fmtWos(metrics.wos)} sem. {d56}</MetricCard>
                        <MetricCard label="WOS total" sub="TOTALIDAD DE INVENTARIO">{fmtWos(metrics.wos_total)} sem. {d56}</MetricCard>
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

            {/* Detalle por talla */}
            <div className="px-6 pb-4">
              <p className="text-xs font-semibold text-foreground mb-2">Detalle por talla</p>
              {sizeMatrixLoading ? (
                <LoadingState rows={4} />
              ) : sizeMatrix.length === 0 ? (
                <EmptyState message="Sin detalle de tallas para este filtro." />
              ) : (
                <section className="space-y-6">
                  <div className="grid h-[320px] grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 overflow-hidden">
                    <div className="flex min-w-0 flex-col rounded-lg border border-border p-3">
                    <div className="min-h-0 flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={sizeMatrix.map((s) => ({ talla: s.talla, cargadas: Number(s.stock_tiendas ?? 0), ventas: Number(s.und_vendidas ?? 0) }))} margin={{ top: 10, right: 8, bottom: 0, left: 8 }}>
                          <XAxis dataKey="talla" tick={{ fontSize: 11, fontWeight: 600 }} axisLine tickLine={false} />
                          <YAxis hide domain={[0, "dataMax"]} />
                          <RTooltip formatter={(v: number, n: string) => [Number(v).toLocaleString("es-CO"), n === "cargadas" ? "Cargadas" : "Ventas"]} />
                          <Area type="monotone" dataKey="cargadas" stroke="hsl(var(--muted-foreground) / 0.45)" fill="hsl(var(--muted-foreground) / 0.2)" isAnimationActive={false} />
                          <Line type="monotone" dataKey="ventas" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex justify-center gap-4 text-[10px] text-muted-foreground">
                      <span>■ Cargadas</span>
                      <span className="text-primary">● Ventas</span>
                    </div>
                  </div>
                  <div className="min-w-0 overflow-hidden rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="sticky left-0 z-10 min-w-[110px] bg-muted py-1 text-left text-[11px] font-semibold">Talla</TableHead>
                          {sizeMatrix.map((size) => (
                            <TableHead key={size.talla} className="px-4 py-1 text-right text-xs font-bold text-foreground">{size.talla}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          { group: "VENTA", rows: [
                            { label: "Ventas", sub: "56 días", render: (s: TallaMatrixRow) => Number(s.und_vendidas ?? 0).toLocaleString("es-CO") },
                            { label: "RDV", render: (s: TallaMatrixRow) => s.ritmo_semanal == null ? "—" : `${formatDecimal(s.ritmo_semanal)} u/sem` },
                          ] },
                          { group: storeFilter === "all" ? "INVENTARIO" : `INVENTARIO · ${storeFilter}`, rows: [
                            { label: "Cargadas", render: (s: TallaMatrixRow) => Number(s.stock_tiendas ?? 0).toLocaleString("es-CO") },
                            { label: "En bodega", render: (s: TallaMatrixRow) => Number(s.stock_bodega ?? 0) > 0 ? Number(s.stock_bodega).toLocaleString("es-CO") : "—" },
                            { label: "WOS", render: (s: TallaMatrixRow) => formatDecimal(s.wos_talla) },
                          ] },
                          { group: "COBERTURA", rows: [
                            { label: "Ubicaciones", render: (s: TallaMatrixRow) => `${Number(s.ubicaciones_con_talla ?? 0)}/${Number(s.ubicaciones_total ?? 0)}` },
                          ] },
                        ].flatMap((block) => [
                          <TableRow key={block.group} className="border-0 hover:bg-transparent">
                            <TableCell colSpan={sizeMatrix.length + 1} className="h-5 border-b border-border py-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{block.group}</TableCell>
                          </TableRow>,
                          ...block.rows.map((metric) => (
                            <TableRow key={metric.label} className="h-7">
                              <TableCell className="sticky left-0 z-10 bg-background py-0 text-[11px] font-medium">
                                {metric.label}
                                {"sub" in metric && metric.sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">({metric.sub})</span>}
                              </TableCell>
                              {sizeMatrix.map((size) => (
                                <TableCell key={size.talla} className="px-4 py-0 text-right text-xs tabular-nums">
                                  {metric.render(size)}
                                </TableCell>
                              ))}
                            </TableRow>
                          )),
                        ])}
                      </TableBody>
                    </Table>
                  </div>
                  </div>

                </section>
              )}
            </div>

            {/* Distribución por tienda */}
            <div className="px-6 pb-6">
              <p className="text-xs font-semibold text-foreground">Distribución por tienda</p>
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
                        <TableHead className="min-w-[150px]">Composición</TableHead>
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
                          <TableCell>{b ? dash : <CompositionBar full={row.pct_full} rebaja={row.pct_rebaja} promo={row.pct_promo} />}</TableCell>
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
            </div>

            {/* Talla × ubicación */}
            <div className="px-6 pb-6">
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between gap-4 border-b border-border px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Talla × ubicación</p>
                    <p className="text-[10px] text-muted-foreground">Inventario disponible por tienda y talla</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    Solo destalladas
                    <Switch checked={soloDestalladas} onCheckedChange={setSoloDestalladas} aria-label="Solo destalladas" />
                  </label>
                </div>
                <div className="max-h-[320px] overflow-auto">
                  <Table className="min-w-max">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="sticky left-0 z-10 min-w-[210px] bg-muted">Ubicación</TableHead>
                        {tallas.map((size) => <TableHead key={size.talla} className="min-w-[64px] text-center font-bold">{size.talla}</TableHead>)}
                        <TableHead className="min-w-[76px] text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ubicacionesTallas.map((row) => {
                        const values = tallasPorUbic.get(row.ubicacion);
                        const total = [...(values?.values() ?? [])].reduce((sum, value) => sum + value, 0);
                        return (
                          <TableRow key={row.ubicacion}>
                            <TableCell className="sticky left-0 z-10 bg-background">
                              <p className="text-xs font-medium text-foreground">{row.ubicacion}</p>
                              <p className="text-[10px] text-muted-foreground">{row.esBodega ? "Bodega" : row.zona ?? "Sin zona"}</p>
                            </TableCell>
                            {tallas.map((size) => {
                              const units = values?.get(size.talla) ?? 0;
                              return (
                                <TableCell
                                  key={size.talla}
                                  className={cn(
                                    "text-center text-xs tabular-nums",
                                    soloDestalladas
                                      ? units <= 0 ? "bg-warning/20 font-bold text-warning" : "text-muted-foreground/50"
                                      : units === 0 && "text-muted-foreground",
                                  )}
                                >
                                  {units > 0 ? units : "—"}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right text-xs font-semibold tabular-nums">{total.toLocaleString("es-CO")}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {ubicacionesTallas.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No hay ubicaciones destalladas.</div>}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
