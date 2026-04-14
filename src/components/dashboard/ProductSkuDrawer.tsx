import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Download, FileText, ArrowLeft, Store, Globe, Truck, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveDays, getFilterEndDate } from "./TimeFilter";

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

interface StoreStockRow {
  location_id: string;
  store_name: string;
  available: number;
  wos: number | null;
  is_current: boolean;
}

interface ProductInfo {
  product_id: string;
  producto: string;
  foto?: string;
}

interface Props {
  product: ProductInfo | null;
  days: number;
  locationId?: string | null;
  onClose: () => void;
}

const ONLINE_LOCATION_ID = "71474315479";

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

const getWosColor = (wos: number | null) => {
  if (wos === null || wos >= 999) return "text-destructive";
  if (wos > 20) return "text-destructive";
  if (wos < 4) return "text-warning";
  return "text-success";
};

export function ProductSkuDrawer({ product, days, locationId, onClose }: Props) {
  const effectiveDays = resolveDays(days);
  const hastaParam = getFilterEndDate(days);

  // SKU detail (filtered by location if provided)
  const { data: skuData, isLoading: skuLoading } = useQuery({
    queryKey: ["product-skus", product?.product_id, effectiveDays, locationId],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_skus_producto" as any, {
        dias_atras: effectiveDays,
        p_product_id: product.product_id,
        location_filtro: locationId || null,
        p_hasta: hastaParam,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SkuRow[];
    },
    enabled: !!product,
  });

  // Stock distribution across ALL stores for this product
  const { data: storeDistData, isLoading: distLoading } = useQuery({
    queryKey: ["product-store-distribution", product?.product_id, effectiveDays],
    queryFn: async () => {
      if (!product) return { stores: [] as StoreStockRow[], stockTiendas: 0, stockOnline: 0 };

      // Get all variant_ids for this product
      const { data: catalogRows } = await supabase
        .from("product_catalog")
        .select("variant_id")
        .eq("product_id", product.product_id)
        .not("variant_id", "is", null);

      if (!catalogRows?.length) return { stores: [], stockTiendas: 0, stockOnline: 0 };

      const variantIds = catalogRows.map(r => r.variant_id!).filter(Boolean);

      // Get latest snapshot date
      const { data: snapDate } = await supabase
        .from("inventory_snapshot")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1);

      const latestDate = snapDate?.[0]?.snapshot_date;
      if (!latestDate) return { stores: [], stockTiendas: 0, stockOnline: 0 };

      // Get inventory grouped by location
      const { data: invRows } = await supabase
        .from("inventory_snapshot")
        .select("location_id, available")
        .eq("snapshot_date", latestDate)
        .in("variant_id", variantIds);

      if (!invRows) return { stores: [], stockTiendas: 0, stockOnline: 0 };

      // Aggregate by location
      const byLocation = new Map<string, number>();
      for (const row of invRows) {
        if (!row.location_id) continue;
        const avail = Number(row.available ?? 0);
        if (avail <= 0) continue;
        byLocation.set(row.location_id, (byLocation.get(row.location_id) ?? 0) + avail);
      }

      // Get location names
      const locationIds = Array.from(byLocation.keys());
      if (!locationIds.length) return { stores: [], stockTiendas: 0, stockOnline: 0 };

      const { data: locRows } = await supabase
        .from("locations")
        .select("location_id, name")
        .in("location_id", locationIds);

      const locNameMap = new Map((locRows ?? []).map(l => [l.location_id, l.name]));

      // Get sales data per location for WOS calculation
      const { data: salesRows } = await supabase
        .from("inventory_snapshot")
        .select("location_id")
        .eq("snapshot_date", latestDate)
        .in("variant_id", variantIds); // reuse for counting

      // Use reporte_detalle_producto_tiendas for per-store WOS
      const { data: storeDetailRows } = await supabase.rpc("reporte_detalle_producto_tiendas" as any, {
        dias_atras: effectiveDays,
        p_producto: product.producto,
        p_hasta: hastaParam,
      });

      const wosMap = new Map<string, number>();
      if (storeDetailRows) {
        for (const r of storeDetailRows as any[]) {
          wosMap.set(r.tienda, r.wos ?? null);
        }
      }

      let stockTiendas = 0;
      let stockOnline = 0;

      const stores: StoreStockRow[] = Array.from(byLocation.entries())
        .map(([lid, avail]) => {
          const name = locNameMap.get(lid) ?? lid;
          const isOnline = lid === ONLINE_LOCATION_ID;
          if (isOnline) {
            stockOnline += avail;
          } else {
            stockTiendas += avail;
          }
          return {
            location_id: lid,
            store_name: isOnline ? "Bodega Ecommerce" : name,
            available: avail,
            wos: wosMap.get(name) ?? null,
            is_current: lid === locationId,
          };
        })
        .sort((a, b) => {
          // Current store first, then by available desc
          if (a.is_current && !b.is_current) return -1;
          if (!a.is_current && b.is_current) return 1;
          return b.available - a.available;
        });

      return { stores, stockTiendas, stockOnline };
    },
    enabled: !!product,
  });

  // Transfer suggestions for this product
  const { data: transferData, isLoading: transferLoading } = useQuery({
    queryKey: ["product-transfers", product?.product_id, effectiveDays],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_sugerencias_traslado" as any, {
        dias_atras: effectiveDays,
        p_hasta: hastaParam,
      });
      if (error) return [];
      // Filter to only this product
      const allRows = (data ?? []) as any[];
      return allRows.filter((r: any) =>
        r.producto?.toLowerCase() === product.producto?.toLowerCase()
      );
    },
    enabled: !!product,
  });

  const rows = skuData ?? [];
  const distribution = storeDistData ?? { stores: [], stockTiendas: 0, stockOnline: 0 };
  const transfers = transferData ?? [];
  const totalStock = distribution.stockTiendas + distribution.stockOnline;

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
      <SheetContent className="!max-w-3xl w-full overflow-y-auto p-0" side="right">
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
                  <p className="text-xs text-muted-foreground mt-1">Detalle por SKU / Talla · Distribución de stock</p>
                </div>
              </div>
            </SheetHeader>

            {/* Stock Summary Cards */}
            {!distLoading && totalStock > 0 && (
              <div className="px-6 pt-4 grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                    <Store className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">Tiendas</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{distribution.stockTiendas.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{totalStock > 0 ? Math.round((distribution.stockTiendas / totalStock) * 100) : 0}%</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
                    <Globe className="h-3.5 w-3.5" />
                    <span className="text-[10px] uppercase tracking-wider font-medium">Online</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{distribution.stockOnline.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{totalStock > 0 ? Math.round((distribution.stockOnline / totalStock) * 100) : 0}%</p>
                </div>
                <div className="rounded-lg border border-border bg-primary/5 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 text-primary mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-medium">Stock Total</span>
                  </div>
                  <p className="text-xl font-bold text-primary">{totalStock.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{distribution.stores.length} ubicaciones</p>
                </div>
              </div>
            )}

            {/* SKU Table */}
            <div className="px-6 py-3 flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!rows.length}>
                <FileText className="h-4 w-4 mr-1" /> PDF
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">{rows.length} SKUs</span>
            </div>

            <div className="px-6 pb-4">
              {skuLoading ? (
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

            {/* Store Distribution Table */}
            {!distLoading && distribution.stores.length > 0 && (
              <div className="px-6 pb-4">
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  Distribución actual del stock
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Tienda</TableHead>
                        <TableHead className="text-right">Uds Disponibles</TableHead>
                        <TableHead className="text-right">WOS</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {distribution.stores.map((store) => (
                        <TableRow key={store.location_id} className={store.is_current ? "bg-primary/5" : ""}>
                          <TableCell className="text-sm">
                            <div className="flex items-center gap-1.5">
                              {store.is_current && (
                                <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" />
                              )}
                              <span className={store.is_current ? "font-semibold text-foreground" : "text-foreground"}>
                                {store.store_name}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">{store.available.toLocaleString()}</TableCell>
                          <TableCell className={`text-right text-sm font-medium ${getWosColor(store.wos)}`}>
                            {store.wos === null ? "—" : store.wos >= 999 ? "∞" : `${store.wos}w`}
                          </TableCell>
                          <TableCell>
                            {store.wos === null ? (
                              <span className="text-xs text-muted-foreground">Sin datos</span>
                            ) : store.wos < 4 ? (
                              <span className="text-xs font-medium text-warning">⚠️ Bajo stock</span>
                            ) : store.wos > 20 ? (
                              <span className="text-xs font-medium text-destructive">🔴 Sobrestock</span>
                            ) : (
                              <span className="text-xs font-medium text-success">🟢 Óptimo</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Transfer Recommendations */}
            {!transferLoading && transfers.length > 0 && (
              <div className="px-6 pb-6">
                <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  Recomendaciones de traslado / reposición
                </h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead>Origen</TableHead>
                        <TableHead className="text-right">Stock Origen</TableHead>
                        <TableHead>Destino</TableHead>
                        <TableHead className="text-right">Ritmo Vta/Sem</TableHead>
                        <TableHead className="text-right">Uds Sugeridas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transfers.map((t: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell className="text-sm text-foreground">{t.tienda_origen}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{Number(t.stock_origen ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-foreground">{t.tienda_destino}</TableCell>
                          <TableCell className="text-right text-sm">{Number(t.ritmo_venta_destino ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm font-bold text-primary">{Number(t.uds_sugeridas ?? 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* No transfers message */}
            {!transferLoading && transfers.length === 0 && !distLoading && distribution.stores.length > 0 && (
              <div className="px-6 pb-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>No hay recomendaciones de traslado activas para este producto.</span>
                </div>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
