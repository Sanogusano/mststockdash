import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
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

export function ProductDetailDrawer({
  product,
  days,
  onClose,
}: {
  product: ProductInfo | null;
  days: number;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["detalle-producto-tiendas", product?.producto, days],
    queryFn: async () => {
      if (!product) return [];
      const { data, error } = await supabase.rpc("reporte_detalle_producto_tiendas", {
        dias_atras: days,
        p_producto: product.producto,
      });
      console.log("[ProductDetail] RPC response:", { data, error, producto: product.producto, days });
      if (error) throw new Error(error.message);
      return (data ?? []) as DetailRow[];
    },
    enabled: !!product,
  });

  const rows = data ?? [];
  const filtered = useMemo(() => {
    if (!filter.trim()) return rows;
    const q = filter.toLowerCase();
    return rows.filter((r) => r.tienda.toLowerCase().includes(q));
  }, [rows, filter]);

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(n);

  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto p-0">
        {product && (
          <>
            {/* Header */}
            <SheetHeader className="p-6 pb-4 border-b border-border">
              <div className="flex items-start gap-4">
                {product.foto ? (
                  <img
                    src={product.foto}
                    alt={product.producto}
                    className="h-20 w-20 rounded-xl object-cover border border-border shrink-0"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                    N/A
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-base font-semibold text-foreground leading-tight">
                    {product.producto}
                  </SheetTitle>
                  <p className="text-sm text-muted-foreground font-mono mt-1">{product.sku}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{product.categoria}</p>
                </div>
              </div>
            </SheetHeader>

            {/* Filter */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filtrar por tienda..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {/* Detail Table */}
            <div className="px-6 pb-6">
              {isLoading ? (
                <LoadingState rows={5} />
              ) : !filtered.length ? (
                <EmptyState message="Sin datos para este SKU." />
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
                          <TableCell className="text-sm font-medium text-foreground whitespace-nowrap">
                            {row.tienda}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {row.und_vendidas.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatCurrency(row.ingresos)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-success">
                              {row.pct_full_price}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-warning">
                              {row.pct_descuento}%
                            </span>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {row.stock_actual.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={Math.min(row.sell_through_pct, 100)}
                                className="h-2 flex-1 bg-muted"
                                indicatorClassName={getSellThroughColor(row.sell_through_pct)}
                              />
                              <span className="text-xs font-medium w-10 text-right">
                                {row.sell_through_pct}%
                              </span>
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
