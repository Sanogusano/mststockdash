import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { getFilterEndDate } from "./TimeFilter";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText } from "lucide-react";
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

interface DetailRow {
  orden: number;
  zona: string | null;
  tienda: string;
  es_bodega: boolean;
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
}: {
  product: ProductInfo | null;
  days: number;
  onClose: () => void;
}) {
  const [storeFilter, setStoreFilter] = useState("all");
  const [wosFilter, setWosFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["detalle-producto-tiendas", product?.product_id, days],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_producto_tiendas", {
        dias_atras: days,
        p_product_id: product.product_id,
        p_hasta: getFilterEndDate(days),
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown as DetailRow[]).map((r) => ({ ...r, sell_through_pct: Number(r.st_acum ?? 0) }));
    },
    enabled: !!product,
  });

  const rows = data ?? [];

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
        if (wosFilter === "optimal") return r.wos != null && r.wos >= 4 && r.wos <= 12;
        if (wosFilter === "overstock") return r.wos == null || r.wos > 12;
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
        Recibido: r.es_bodega ? "" : r.recibido,
        "Und. Vendidas": r.es_bodega ? "" : r.und_vendidas,
        "Vendidas de vida": r.es_bodega ? "" : r.und_vendidas_vida,
        Ingresos: r.ingresos,
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
        Recibido: r.es_bodega ? "—" : r.recibido,
        "Und.": r.es_bodega ? "—" : r.und_vendidas,
        "Vida": r.es_bodega ? "—" : r.und_vendidas_vida,
        Ingresos: r.ingresos,
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
                </div>
              </div>
            </SheetHeader>

            {/* Filters */}
            <div className="px-6 pt-4 pb-2 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
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
                        <TableHead className="text-right">Recibido</TableHead>
                        <TableHead className="text-right">Vendidas</TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">% Full</TableHead>
                        <TableHead className="text-right">% Dto.</TableHead>
                        <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                        <TableHead>WOS</TableHead>
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
                          <TableCell className="text-right text-sm tabular-nums">{b ? dash : (row.recibido ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm font-semibold tabular-nums">{b ? dash : (row.und_vendidas ?? 0).toLocaleString("es-CO")}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{b ? dash : `$ ${(row.ingresos ?? 0).toLocaleString("es-CO")}`}</TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">{(row.stock_actual ?? 0).toLocaleString("es-CO")}</TableCell>
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
