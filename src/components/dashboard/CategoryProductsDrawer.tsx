import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

interface ProductRow {
  foto: string;
  producto: string;
  product_id: string;
  stock_total: number;
  venta_prom_semanal: number;
  wos: number;
  estado_salud: string;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  und_total: number;
  clasificacion: string;
  coleccion: string;
}

interface Props {
  categoria: string | null;
  days: number;
  locationId?: string | null;
  canal?: string | null;
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

export function CategoryProductsDrawer({ categoria, days, locationId, canal, onClose }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<{ product_id: string; producto: string; foto?: string } | null>(null);
  const effectiveDays = resolveDays(days);

  const { data, isLoading } = useQuery({
    queryKey: ["category-products", categoria, effectiveDays, locationId, canal],
    queryFn: async () => {
      if (!categoria) return [];

      const { data: rpcData, error } = await supabase.rpc("reporte_productos_por_categoria" as any, {
        dias_atras: effectiveDays,
        p_categoria: categoria,
        p_location_id: locationId || null,
        p_canal: canal || null,
      });
      if (error) throw new Error(error.message);

      const rpcRows = (rpcData ?? []) as unknown as ProductRow[];

      // Fallback/merge inventory snapshot by category so the drawer reflects real stock even with low/no sales.
      const { data: catalogRows, error: catalogError } = await supabase
        .from("product_catalog")
        .select("product_id, title, image_url, collection_season, variant_id")
        .eq("category", categoria)
        .not("product_id", "is", null)
        .not("variant_id", "is", null);

      if (catalogError || !catalogRows?.length) return rpcRows;

      const variantToProduct = new Map<string, string>();
      const productMeta = new Map<string, { producto: string; foto: string; coleccion: string }>();
      const variantIds: string[] = [];

      for (const row of catalogRows) {
        if (!row.variant_id || !row.product_id) continue;
        variantToProduct.set(row.variant_id, row.product_id);
        variantIds.push(row.variant_id);

        if (!productMeta.has(row.product_id)) {
          productMeta.set(row.product_id, {
            producto: row.title ?? row.product_id,
            foto: row.image_url ?? "",
            coleccion: row.collection_season ?? "Otros",
          });
        }
      }

      if (!variantIds.length) return rpcRows;

      let latestSnapshotQuery = supabase
        .from("inventory_snapshot")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);

      if (locationId) latestSnapshotQuery = latestSnapshotQuery.eq("location_id", locationId);

      const { data: latestSnapshotRows } = await latestSnapshotQuery;
      const latestSnapshotDate = latestSnapshotRows?.[0]?.snapshot_date;
      if (!latestSnapshotDate) return rpcRows;

      let inventoryQuery = supabase
        .from("inventory_snapshot")
        .select("variant_id, available")
        .eq("snapshot_date", latestSnapshotDate)
        .in("variant_id", [...new Set(variantIds)]);

      if (locationId) inventoryQuery = inventoryQuery.eq("location_id", locationId);

      const { data: inventoryRows, error: inventoryError } = await inventoryQuery;
      if (inventoryError || !inventoryRows) return rpcRows;

      const stockByProduct = new Map<string, number>();
      for (const inv of inventoryRows) {
        if (!inv.variant_id) continue;
        const productId = variantToProduct.get(inv.variant_id);
        if (!productId) continue;
        const available = Number(inv.available ?? 0);
        if (available <= 0) continue;
        stockByProduct.set(productId, (stockByProduct.get(productId) ?? 0) + available);
      }

      const rpcByProduct = new Map(rpcRows.map((r) => [r.product_id, r]));
      const mergedProductIds = new Set<string>([
        ...rpcRows.map((r) => r.product_id).filter(Boolean),
        ...Array.from(stockByProduct.keys()),
      ]);

      const mergedRows: ProductRow[] = Array.from(mergedProductIds).map((productId) => {
        const existing = rpcByProduct.get(productId);
        const stockFromSnapshot = stockByProduct.get(productId) ?? 0;
        const meta = productMeta.get(productId);

        if (existing) {
          return {
            ...existing,
            stock_total: Math.max(existing.stock_total ?? 0, stockFromSnapshot),
            foto: existing.foto || meta?.foto || "",
            coleccion: existing.coleccion || meta?.coleccion || "Otros",
          };
        }

        return {
          foto: meta?.foto ?? "",
          producto: meta?.producto ?? productId,
          product_id: productId,
          stock_total: stockFromSnapshot,
          venta_prom_semanal: 0,
          wos: stockFromSnapshot > 0 ? 999 : 0,
          estado_salud: stockFromSnapshot > 0 ? "ESTANCADO" : "SIN DATOS",
          und_full_price: 0,
          und_rebajas: 0,
          und_promo: 0,
          und_total: 0,
          clasificacion: "Sin clasificación",
          coleccion: meta?.coleccion ?? "Otros",
        };
      });

      return mergedRows.sort((a, b) => (b.und_total ?? 0) - (a.und_total ?? 0) || (b.stock_total ?? 0) - (a.stock_total ?? 0));
    },
    enabled: !!categoria,
  });

  // Filter out products with no stock and no sales
  const rows = (data ?? []).filter(r => (r.stock_total ?? 0) > 0 || (r.und_total ?? 0) > 0);

  const handleExportCSV = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        Producto: r.producto,
        "Stock Total": r.stock_total,
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
      `Productos: ${categoria}`
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
                  Productos — {categoria}
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
                            <TableHead className="text-right">Stock</TableHead>
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
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}
