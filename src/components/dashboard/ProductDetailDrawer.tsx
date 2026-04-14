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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ProductInfo {
  foto: string;
  producto: string;
  sku: string;
  categoria: string;
}

interface DetailRow {
  tienda: string;
  und_vendidas: number;
  ingresos: number;
  stock_actual: number;
  pct_full_price: number;
  pct_descuento: number;
  sell_through_pct: number;
  wos: number;
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
    queryKey: ["detalle-producto-tiendas", product?.producto, days],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_producto_tiendas", {
        dias_atras: days,
        p_producto: product.producto,
        p_hasta: getFilterEndDate(days),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as DetailRow[];
    },
    enabled: !!product,
  });

  const rows = data ?? [];

  const storeNames = useMemo(() => [...new Set(rows.map((r) => r.tienda))].sort(), [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (storeFilter !== "all") result = result.filter((r) => r.tienda === storeFilter);
    if (wosFilter !== "all") {
      result = result.filter((r) => {
        if (wosFilter === "stagnant") return r.estado_salud.includes("ESTANCADO");
        if (wosFilter === "risk") return r.wos > 0 && r.wos < 4;
        if (wosFilter === "optimal") return r.wos >= 4 && r.wos <= 12;
        if (wosFilter === "overstock") return r.wos > 12;
        return true;
      });
    }
    if (stFilter !== "all") {
      result = result.filter((r) => {
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

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n);

  const handleExportCSV = () => {
    if (!filtered.length || !product) return;
    exportToCSV(
      filtered.map((r) => ({
        Producto: product.producto,
        SKU: product.sku,
        Tienda: r.tienda,
        "Und. Vendidas": r.und_vendidas,
        Ingresos: r.ingresos,
        "% Full Price": r.pct_full_price,
        "% Descuento": r.pct_descuento,
        Stock: r.stock_actual,
        "Sell-Through %": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      `detalle_${product.sku}`
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length || !product) return;
    exportToPDF(
      filtered.map((r) => ({
        Tienda: r.tienda,
        "Und.": r.und_vendidas,
        Ingresos: r.ingresos,
        "% Full": r.pct_full_price,
        "% Dto.": r.pct_descuento,
        Stock: r.stock_actual,
        "ST%": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      `detalle_${product.sku}`,
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
                  <img src={product.foto} alt={product.producto} className="h-20 w-20 rounded-xl object-cover border border-border shrink-0" />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">N/A</div>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold text-foreground leading-tight">{product.producto}</SheetTitle>
                  <p className="text-sm text-muted-foreground font-mono mt-1">{product.sku}</p>
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
                  {storeNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
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
                <div className="border border-border rounded-lg overflow-hidden mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Tienda</TableHead>
                        <TableHead className="text-right">Und.</TableHead>
                        <TableHead className="text-right">Ingresos</TableHead>
                        <TableHead className="text-right">% Full</TableHead>
                        <TableHead className="text-right">% Dto.</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="min-w-[120px]">ST%</TableHead>
                        <TableHead>WOS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row) => (
                        <TableRow key={row.tienda}>
                          <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">{row.tienda}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{row.und_vendidas.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(row.ingresos)}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-success">{row.pct_full_price}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-warning">{row.pct_descuento}%</span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{row.stock_actual.toLocaleString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={Math.min(row.sell_through_pct, 100)}
                                className="h-2 flex-1 bg-muted"
                                indicatorClassName={getSellThroughColor(row.sell_through_pct)}
                              />
                              <span className="text-xs font-medium w-10 text-right">{row.sell_through_pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-semibold">{row.wos}</p>
                            <StatusBadge label={row.estado_salud} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
