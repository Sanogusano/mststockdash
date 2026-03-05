import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProductSkuDrawer } from "./ProductSkuDrawer";
import { CollectionBadge } from "./CollectionBadge";
import { resolveDays } from "./TimeFilter";
import { fetchCategoryProducts, type ProductRow } from "./categoryProductsData";


interface Props {
  categoria: string | null;
  days: number;
  locationId?: string | null;
  canal?: string | null;
  storeName?: string;
  onClose: () => void;
}

const getClasifColor = (c: string) => {
  if (c === "Full Price") return "text-emerald-600";
  if (c === "Rebajas") return "text-orange-500";
  return "text-violet-500";
};

const getWosColor = (wos: number) => {
  if (wos >= 999) return "text-destructive";
  if (wos > 20) return "text-destructive";
  if (wos < 8) return "text-warning";
  return "text-success";
};

export function CategoryProductsDrawer({ categoria, days, locationId, canal, storeName, onClose }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<{ product_id: string; producto: string; foto?: string } | null>(null);
  const effectiveDays = resolveDays(days);

  const { data, isLoading } = useQuery({
    queryKey: ["category-products", categoria, effectiveDays, locationId, canal],
    queryFn: async () => {
      if (!categoria) return [];
      return fetchCategoryProducts({ categoria, effectiveDays, locationId, canal });
    },
    enabled: !!categoria,
  });

  // Filter out products with no stock and no sales — strict check
  const rows = (data ?? []).filter(r => {
    const stock = Number(r.stock_total) || 0;
    const ventas = Number(r.und_total) || 0;
    return stock > 0 || ventas > 0;
  });

  const isStoreView = !!locationId;
  const stockColumnLabel = isStoreView ? "Stock en tienda" : "Stock";
  const drawerTitle = isStoreView && storeName
    ? `Inventario ${storeName} — ${categoria}`
    : `Productos — ${categoria}`;

  const handleExportCSV = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        Producto: r.producto,
        [stockColumnLabel]: r.stock_total,
        "Venta Prom/Sem": r.venta_prom_semanal,
        WOS: r.wos,
        Estado: r.estado_salud,
        "Uds Full Price": r.und_full_price,
        "Uds Rebajas": r.und_rebajas,
        "Uds Promo": r.und_promo,
        "Uds Total": r.und_total,
        Clasificación: r.clasificacion,
      })),
      `productos_${categoria}`
    );
  };

  const handleExportPDF = () => {
    if (!rows.length) return;
    exportToPDF(
      rows.map((r) => ({
        Producto: r.producto,
        Stock: r.stock_total,
        "Vta/Sem": r.venta_prom_semanal,
        WOS: r.wos,
        Estado: r.estado_salud,
        "Full P.": r.und_full_price,
        Rebaj: r.und_rebajas,
        Promo: r.und_promo,
        Total: r.und_total,
        Clasif: r.clasificacion,
      })),
      `productos_${categoria}`,
      drawerTitle
    );
  };

  return (
    <>
      <Sheet open={!!categoria && !selectedProduct} onOpenChange={(open) => { if (!open) onClose(); }}>
        <SheetContent className="!max-w-4xl w-full overflow-y-auto p-0" side="right">
          {categoria && (
            <>
              <SheetHeader className="p-6 pb-4 border-b border-border">
                <SheetTitle className="text-base font-semibold text-foreground">
                  {drawerTitle}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">Click en un producto para ver detalle por SKU/Talla</p>
              </SheetHeader>

              <div className="px-6 py-3 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!rows.length}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">{rows.length} productos</span>
              </div>

              <div className="px-6 pb-6">
                {isLoading ? (
                  <LoadingState rows={6} />
                ) : !rows.length ? (
                  <EmptyState message="Sin productos con datos en esta categoría." />
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table className="min-w-[800px]">
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="min-w-[200px]">Producto</TableHead>
                            <TableHead className="text-right">{stockColumnLabel}</TableHead>
                            <TableHead className="text-right">Vta/Sem</TableHead>
                            <TableHead className="text-right">WOS</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Full P.</TableHead>
                            <TableHead className="text-right">Rebaj.</TableHead>
                            <TableHead className="text-right">Promo</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Clasif.</TableHead>
                            <TableHead className="w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow
                              key={row.product_id}
                              className="cursor-pointer hover:bg-primary/5"
                              onClick={() => setSelectedProduct({ product_id: row.product_id, producto: row.producto, foto: row.foto })}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {row.foto ? (
                                    <img src={row.foto} alt="" className="h-8 w-8 rounded object-cover border border-border shrink-0" />
                                  ) : (
                                    <div className="h-8 w-8 rounded bg-muted/50 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium text-foreground line-clamp-2">{row.producto}</span>
                                    <CollectionBadge coleccion={row.coleccion} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm font-semibold">{(row.stock_total ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-sm">{(row.venta_prom_semanal ?? 0).toLocaleString()}</TableCell>
                              <TableCell className={`text-right text-sm font-medium ${getWosColor(row.wos ?? 0)}`}>
                                {row.wos >= 999 ? "∞" : `${row.wos}w`}
                              </TableCell>
                              <TableCell><StatusBadge label={row.estado_salud} /></TableCell>
                              <TableCell className="text-right text-sm text-emerald-600">{(row.und_full_price ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-sm text-orange-500">{(row.und_rebajas ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-sm text-violet-500">{(row.und_promo ?? 0).toLocaleString()}</TableCell>
                              <TableCell className="text-right text-sm font-semibold">{(row.und_total ?? 0).toLocaleString()}</TableCell>
                              <TableCell>
                                <span className={`text-xs font-medium ${getClasifColor(row.clasificacion)}`}>{row.clasificacion}</span>
                              </TableCell>
                              <TableCell>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ProductSkuDrawer
        product={selectedProduct}
        days={days}
        locationId={locationId}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}
