import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveDays } from "./TimeFilter";

interface SkuRow {
  sku: string;
  talla: string;
  unidades_vendidas: number;
  stock_disponible: number;
  precio_prom_venta: number;
  sell_through_pct: number;
  wos: number;
  clasificacion: string;
}

interface ProductInfo {
  product_id: string;
  producto: string;
  foto?: string;
}

interface Props {
  product: ProductInfo | null;
  days: number;
  onClose: () => void;
}

const getSellThroughColor = (pct: number) => {
  if (pct >= 70) return "bg-success";
  if (pct >= 30) return "bg-warning";
  return "bg-danger";
};

const getClasifColor = (c: string) => {
  if (c === "Full Price") return "text-emerald-600";
  if (c === "Rebajas") return "text-orange-500";
  return "text-violet-500";
};

export function ProductSkuDrawer({ product, days, onClose }: Props) {
  const effectiveDays = resolveDays(days);

  const { data, isLoading } = useQuery({
    queryKey: ["product-skus", product?.product_id, effectiveDays],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_skus_producto" as any, {
        dias_atras: effectiveDays,
        p_product_id: product.product_id,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SkuRow[];
    },
    enabled: !!product,
  });

  const rows = data ?? [];

  const handleExportCSV = () => {
    if (!rows.length || !product) return;
    exportToCSV(
      rows.map((r) => ({
        SKU: r.sku,
        Talla: r.talla,
        Stock: r.stock_disponible,
        "Uds Vendidas": r.unidades_vendidas,
        Clasificación: r.clasificacion,
        "ST%": r.sell_through_pct,
        WOS: r.wos,
      })),
      `skus_${product.product_id}`
    );
  };

  const handleExportPDF = () => {
    if (!rows.length || !product) return;
    exportToPDF(
      rows.map((r) => ({
        SKU: r.sku,
        Talla: r.talla,
        Stock: r.stock_disponible,
        "Uds Vendidas": r.unidades_vendidas,
        Clasif: r.clasificacion,
        "ST%": r.sell_through_pct,
        WOS: r.wos,
      })),
      `skus_${product.product_id}`,
      `SKUs: ${product.producto}`
    );
  };

  return (
    <Sheet open={!!product} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="!max-w-2xl w-full overflow-y-auto p-0" side="right">
        {product && (
          <>
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-start gap-4">
                <button onClick={onClose} className="mt-1 text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {product.foto ? (
                  <img src={product.foto} alt={product.producto} className="h-16 w-16 rounded-xl object-cover border border-border shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0 text-xs">N/A</div>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold text-foreground leading-tight">{product.producto}</SheetTitle>
                  <p className="text-xs text-muted-foreground mt-1">Detalle por SKU / Talla</p>
                </div>
              </div>
            </SheetHeader>

            <div className="px-6 py-3 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!rows.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">{rows.length} SKUs</span>
            </div>

            <div className="px-6 pb-6">
              {isLoading ? (
                <LoadingState rows={5} />
              ) : !rows.length ? (
                <EmptyState message="Sin SKUs con datos." />
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>SKU</TableHead>
                        <TableHead>Talla</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-right">Uds Vendidas</TableHead>
                        <TableHead>Clasif.</TableHead>
                        <TableHead className="min-w-[100px]">ST%</TableHead>
                        <TableHead className="text-right">WOS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.sku}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.sku}</TableCell>
                          <TableCell className="text-sm font-medium">{row.talla || "—"}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{(row.stock_disponible ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{(row.unidades_vendidas ?? 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <span className={`text-xs font-medium ${getClasifColor(row.clasificacion)}`}>{row.clasificacion}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={Math.min(row.sell_through_pct ?? 0, 100)}
                                className="h-2 flex-1 bg-muted"
                                indicatorClassName={getSellThroughColor(row.sell_through_pct ?? 0)}
                              />
                              <span className="text-xs font-medium w-10 text-right">{row.sell_through_pct ?? 0}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{row.wos ?? 0}w</TableCell>
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
