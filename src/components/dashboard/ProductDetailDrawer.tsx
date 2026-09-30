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
import { Download, FileText, Gauge, Store, Copy, Check } from "lucide-react";
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
  coleccion?: string | null;
}

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

interface StockTallaRow {
  talla: string;
  orden: number;
  recibidas: number;
  vendidas: number;
  stock: number;
  st: number | null;
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
const VENTANA_COMERCIAL = 16;

type Tone = "success" | "danger" | "warning" | "muted";
const TONE_CLASSES: Record<Tone, { box: string; value: string }> = {
  success: { box: "border-success/40 bg-success/5", value: "text-success" },
  danger: { box: "border-destructive/40 bg-destructive/5", value: "text-destructive" },
  warning: { box: "border-warning/40 bg-warning/5", value: "text-warning" },
  muted: { box: "border-border bg-muted/40", value: "text-muted-foreground" },
};

function MetricCard({ label, children, sub, tone }: { label: string; children: React.ReactNode; sub?: React.ReactNode; tone?: Tone }) {
  const t = tone ? TONE_CLASSES[tone] : null;
  return (
    <div className={cn("rounded-lg border border-border px-3 py-2 min-w-[130px]", t?.box)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className={cn("text-sm font-semibold text-foreground tabular-nums", t?.value)}>{children}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CompositionBar({ full, rebaja, promo }: { full: number | null; rebaja: number | null; promo: number | null }) {
  const segs = [
    { label: "Full", v: Number(full ?? 0), bar: "bg-emerald-500", text: "text-emerald-600" },
    { label: "Reb.", v: Number(rebaja ?? 0), bar: "bg-destructive", text: "text-destructive" },
    { label: "Promo", v: Number(promo ?? 0), bar: "bg-amber-500", text: "text-amber-600" },
  ];
  const total = segs.reduce((s, x) => s + x.v, 0);
  if (total <= 0) return <span className="text-xs text-muted-foreground">Sin ventas</span>;
  return (
    <div className="w-36">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((s) => s.v > 0 && <div key={s.label} className={s.bar} style={{ width: `${(s.v / total) * 100}%` }} />)}
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-semibold tabular-nums">
        {segs.map((s) => <span key={s.label} className={s.text}>{s.label} {Math.round(s.v)}%</span>)}
      </div>
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
  pct_full: number | null;
  pct_rebaja: number | null;
  pct_promo: number | null;
  sell_through_pct: number;
  wos: number | null;
  estado_salud: string;
  stock_por_talla: StockTallaRow[] | null;
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

  const { data: parentSku } = useQuery({
    queryKey: ["producto-sku-padre", product?.product_id],
    queryFn: async () => {
      if (!product) return null;
      const { data, error } = await supabase.rpc("producto_sku_padre", { p_product_id: product.product_id });
      if (error) throw new Error(error.message);
      return typeof data === "string" && data.trim() ? data.trim() : null;
    },
    enabled: !!product,
    staleTime: 5 * 60 * 1000,
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

  const productSizes = useMemo(
    () => sizeMatrix.map((size) => ({ talla: size.talla, orden: Number(size.orden_talla ?? 0) })),
    [sizeMatrix],
  );

  const stockBySize = (row: DetailRow) => {
    const values = new Map<string, StockTallaRow>();
    let stockPorTalla: unknown = row.stock_por_talla;
    if (typeof stockPorTalla === "string") {
      try {
        stockPorTalla = JSON.parse(stockPorTalla);
      } catch {
        return values;
      }
    }
    if (!Array.isArray(stockPorTalla)) return values;
    for (const size of stockPorTalla) {
      if (!size || typeof size !== "object" || !("talla" in size)) continue;
      const value = size as Record<string, unknown>;
      const talla = String(value.talla ?? "").trim();
      if (!talla) continue;
      values.set(talla, {
        talla,
        orden: Number(value.orden ?? 0),
        recibidas: Number(value.recibidas ?? 0),
        vendidas: Number(value.vendidas ?? 0),
        stock: Number(value.stock ?? 0),
        st: value.st == null ? null : Number(value.st),
      });
    }
    return values;
  };

  const isDestallada = (row: DetailRow) => {
    const values = stockBySize(row);
    return productSizes.some((size) => Number(values.get(size.talla)?.stock ?? 0) <= 0);
  };
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
        if (r.es_bodega) return false;
        if (wosFilter === "stagnant") return (r.estado_salud ?? "").includes("ESTANCADO");
        if (wosFilter === "risk") return r.wos != null && r.wos > 0 && r.wos < 4;
        if (wosFilter === "optimal") return r.wos != null && r.wos >= 4 && r.wos <= 18;
        if (wosFilter === "overstock") return r.wos == null || r.wos > 18;
        return true;
      });
    }
    if (stFilter !== "all") {
      result = result.filter((r) => {
        if (r.es_bodega) return false;
        const st = Number(r.sell_through_pct ?? 0);
        if (stFilter === "high") return st >= 70;
        if (stFilter === "medium") return st >= 30 && st < 70;
        if (stFilter === "low") return st < 30;
        return true;
      });
    }
    if (soloDestalladas) result = result.filter(isDestallada);
    return result;
  }, [rows, storeFilter, wosFilter, stFilter, soloDestalladas, productSizes]);

  // Modo detallado: una sola fila visible tras TODOS los filtros.
  const detailedMode = filtered.length === 1;

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
        "% Full": r.es_bodega ? "" : r.pct_full,
        "% Rebaja": r.es_bodega ? "" : r.pct_rebaja,
        "% Promo": r.es_bodega ? "" : r.pct_promo,
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
        Composición: r.es_bodega ? "—" : `Full ${r.pct_full ?? 0}% · Reb. ${r.pct_rebaja ?? 0}% · Promo ${r.pct_promo ?? 0}%`,
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
                  {(metrics?.coleccion?.trim() || parentSku) && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {metrics?.coleccion?.trim() && (
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{metrics.coleccion}</span>
                      )}
                      {parentSku && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => copySkus("parent", parentSku)}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                SKU padre · {parentSku}
                                {copiedSize === "parent" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">{copiedSize === "parent" ? "SKU copiado" : "Copiar SKU padre"}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  )}
                  {metrics && (() => {
                    const estado = (metrics.rdv_estado ?? "SOLO ONLINE").toUpperCase();
                    const st = RDV_STYLES[estado] ?? RDV_STYLES["SOLO ONLINE"];
                    const fmtU = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                    const d56 = <span className="text-[10px] font-normal text-muted-foreground">56d</span>;
                    const semanas = Number(metrics.semanas_en_venta ?? 0);
                    const quedan = VENTANA_COMERCIAL - semanas;
                    const wosCard = (label: string, sub: string, v: number | null | undefined) => {
                      const tone = v == null ? "muted" : v < 4 || v > 18 ? "danger" : "success";
                      return (
                        <MetricCard label={label} sub={sub} tone={tone}>
                          {v == null ? <>+99 <span className="text-[10px] font-bold">SIN ROTACIÓN</span></> : <>{fmtWos(v)} sem. {d56}</>}
                        </MetricCard>
                      );
                    };
                    return (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <MetricCard
                          label="Tiempo de vida"
                          tone={quedan < 0 ? "warning" : undefined}
                          sub={quedan < 0 ? <span className="font-semibold text-warning">fuera de ventana</span> : `quedan ${quedan.toLocaleString("es-CO")} sem.`}
                        >{semanas.toLocaleString("es-CO")} sem.</MetricCard>
                        <MetricCard label="Unidades vendidas" sub={activeDateRange}>{Number(metrics.und_vendidas ?? 0).toLocaleString("es-CO")}</MetricCard>
                        <MetricCard label="Ritmo de red" sub="TODA LA RED">
                          <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />{fmtU(metrics.ritmo_semanal)} u/sem</span> {d56}
                        </MetricCard>
                        <MetricCard label="Ritmo por tienda" sub={st.chip ? <span className={cn("inline-block text-[10px] font-medium px-1.5 rounded", st.chip)}>{estado}{metrics.rdv_indice != null ? ` (${fmtIdx(metrics.rdv_indice)})` : ""}</span> : <span className={st.text}>{estado}</span>}>
                          <span className={cn("inline-flex items-center gap-1", st.text)}><Store className="h-3 w-3" />{metrics.ritmo_pdv == null ? "—" : `${fmtU(metrics.ritmo_pdv)} u/sem`}</span> {d56}
                        </MetricCard>
                        <MetricCard label="Sell-through" sub={`ST acum. ${metrics.sell_through_pct ?? 0}%`}>{metrics.st_120d ?? 0}% <span className="text-[10px] font-normal text-muted-foreground">120d</span></MetricCard>
                        <MetricCard label="Stock total">{Number(metrics.stock_total ?? 0).toLocaleString("es-CO")}</MetricCard>
                        {wosCard("WOS general", "LO DISPONIBILIZADO", metrics.wos)}
                        {wosCard("WOS total", "TOTALIDAD DE INVENTARIO", metrics.wos_total)}
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
              {sizeMatrixLoading ? (
                <LoadingState rows={4} />
              ) : sizeMatrix.length === 0 ? (
                <EmptyState message="Sin detalle de tallas para este filtro." />
              ) : (
                <section className="space-y-6">
                  <div className="grid h-[320px] grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 overflow-hidden">
                    <div className="flex min-w-0 flex-col rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold text-foreground">Curva de tallas</p>
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
                  <div className="min-w-0 overflow-auto rounded-lg border border-border">
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold text-foreground">Indicadores por talla</p>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="sticky left-0 z-10 min-w-[110px] bg-muted py-1 text-left text-[11px] font-semibold">Talla</TableHead>
                          {sizeMatrix.map((size) => (
                            <TableHead key={size.talla} className="h-auto px-4 py-1 text-right align-bottom">
                              <p className="text-sm font-bold text-foreground leading-tight">{size.talla}</p>
                              {size.skus && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => copySkus(size.talla, size.skus)}
                                      className="text-[10px] font-normal text-muted-foreground hover:text-foreground tabular-nums"
                                    >
                                      {copiedSize === size.talla ? "Copiado" : `…${size.skus.slice(-6)}`}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">{size.skus}</TooltipContent>
                                </Tooltip>
                              )}
                            </TableHead>
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
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs font-semibold text-foreground">Distribución por tienda</p>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  Solo destalladas
                  <Switch checked={soloDestalladas} onCheckedChange={setSoloDestalladas} aria-label="Solo destalladas" />
                </label>
              </div>
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
                        <TableHead rowSpan={2} className="w-10 text-right align-middle">#</TableHead>
                        <TableHead rowSpan={2} className="align-middle">Tienda</TableHead>
                        <TableHead rowSpan={2} className="text-right align-middle">Recibido</TableHead>
                        <TableHead rowSpan={2} className="text-right align-middle">Vendidas</TableHead>
                        <TableHead rowSpan={2} className="text-right align-middle">Stock</TableHead>
                        <TableHead colSpan={(productSizes.length || 1) + (detailedMode ? 1 : 0)} className="border-x border-border text-center">Inventario por talla</TableHead>
                        <TableHead rowSpan={2} className="text-right align-middle">RDV</TableHead>
                        <TableHead rowSpan={2} className="min-w-[150px] align-middle">Composición</TableHead>
                        <TableHead rowSpan={2} className="min-w-[140px] align-middle">Sell-Through</TableHead>
                        <TableHead rowSpan={2} className="align-middle">WOS</TableHead>
                        <TableHead rowSpan={2} className="align-middle">Salud</TableHead>
                      </TableRow>
                        <TableRow className="bg-muted/30">
                        {detailedMode && <TableHead className="h-7 w-10 min-w-10 px-1" />}
                        {productSizes.length > 0 ? productSizes.map((size) => (
                          <TableHead
                            key={size.talla}
                            className={cn(
                              "h-7 w-12 min-w-12 px-2 text-center text-[10px] font-bold",
                              size === productSizes[0] && "border-l border-border",
                              size === productSizes[productSizes.length - 1] && "border-r border-border",
                            )}
                          >
                            {size.talla}
                          </TableHead>
                        )) : <TableHead className="h-7 w-12 border-x border-border px-2 text-center">—</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row) => {
                        const b = row.es_bodega;
                        const dash = <span className="text-muted-foreground">—</span>;
                        const sizeStock = stockBySize(row);
                        const acum = Number(row.st_acum ?? 0);
                        const est = row.base_st === "estimada" && (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="cursor-help text-warning font-bold ml-0.5">*</span></TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">Sin historial de traslados suficiente para este producto en esta tienda. Lo recibido se estima como vendido más stock.</TooltipContent>
                          </Tooltip>
                        );
                        const tiempoLine = !b && row.semanas_en_tienda != null
                          ? `${Math.floor(Number(row.semanas_en_tienda))} sem. (${Math.floor(Number(row.dias_en_tienda ?? 0))} días)`
                          : null;
                        return (
                        <TableRow key={`${row.orden}-${row.tienda}`}>
                          <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{row.orden}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <p className="text-sm font-medium text-foreground">{row.tienda}</p>
                            {(row.zona || tiempoLine) && (
                              <p className="text-[11px] text-muted-foreground">
                                {[row.zona, tiempoLine].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{b ? dash : (row.recibido ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{b ? dash : (row.und_vendidas ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">{(row.stock_actual ?? 0).toLocaleString("es-CO")}</TableCell>
                          {detailedMode && (
                            <TableCell className="w-10 min-w-10 px-1 py-2 text-left text-[10px] font-medium leading-5 text-muted-foreground">
                              <span className="block">Rec</span>
                              <span className="block">Ven</span>
                              <span className="block">Stk</span>
                              <span className="block text-[10px]">ST</span>
                            </TableCell>
                          )}
                          {productSizes.length > 0 ? productSizes.map((size) => {
                            const values = sizeStock.get(size.talla);
                            const stock = Number(values?.stock ?? 0);
                            const st = values?.st == null ? null : Number(values.st);
                            const isLastSize = size === productSizes[productSizes.length - 1];
                            if (!detailedMode) {
                              return (
                                <TableCell
                                  key={size.talla}
                                  className={cn(
                                    "w-12 min-w-12 px-2 text-center text-xs tabular-nums",
                                    size === productSizes[0] && "border-l border-border",
                                    isLastSize && "border-r border-border",
                                    stock <= 0 && "font-semibold text-warning",
                                  )}
                                >
                                  {stock > 0 ? stock.toLocaleString("es-CO") : "—"}
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={size.talla} className={cn(
                                "w-12 min-w-12 px-2 py-2 text-center text-xs leading-5 tabular-nums",
                                size === productSizes[0] && "border-l border-border",
                                isLastSize && "border-r border-border",
                              )}>
                                <span className="block">{Number(values?.recibidas ?? 0).toLocaleString("es-CO")}</span>
                                <span className="block">{Number(values?.vendidas ?? 0).toLocaleString("es-CO")}</span>
                                <span className={cn("block", stock <= 0 && "font-semibold text-warning")}>{stock > 0 ? stock.toLocaleString("es-CO") : "—"}</span>
                                <span className={cn("block text-[10px] text-muted-foreground", st != null && st > 80 && "font-semibold text-warning")}>{st == null ? "—" : `${st.toLocaleString("es-CO")}%`}</span>
                              </TableCell>
                            );
                          }) : <TableCell className="w-12 border-r border-border px-2 text-center text-warning">—</TableCell>}
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
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
