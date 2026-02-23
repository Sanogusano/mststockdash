import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveDays } from "./TimeFilter";
import { LoadingState, EmptyState } from "./LoadingState";
import { StatusBadge } from "./StatusBadge";
import { ProductDetailDrawer } from "./ProductDetailDrawer";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Search, Download, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 15;

interface ProductRow {
  foto: string;
  sku: string;
  producto: string;
  categoria: string;
  und_vendidas: number;
  stock_tiendas: number;
  stock_digital: number;
  clasificacion: string;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
}

export function ProductBehaviorTable({ days }: { days: number }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);

  const resolvedDays = resolveDays(days);

  const { data, isLoading, error } = useQuery({
    queryKey: ["producto-comportamiento", resolvedDays, search],
    queryFn: async () => {
      const params: { dias_atras: number; p_sku_filter?: string } = { dias_atras: resolvedDays };
      if (search.trim()) params.p_sku_filter = search.trim();
      const { data, error } = await supabase.rpc("reporte_comportamiento_producto", params);
      if (import.meta.env.DEV) console.log("[ProductBehavior] RPC response:", { data, error, params });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const rows = data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when search changes
  useMemo(() => setPage(0), [search, days]);

  const handleExportCSV = () => {
    if (!rows.length) return;
    exportToCSV(
      rows.map((r) => ({
        SKU: r.sku,
        Producto: r.producto,
        Categoría: r.categoria,
        Clasificación: r.clasificacion,
        "Und. Vendidas": r.und_vendidas,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Sell-Through %": r.sell_through_pct,
        WOS: r.wos,
        "Estado Salud": r.estado_salud,
      })),
      "comportamiento_producto"
    );
  };

  const handleExportPDF = () => {
    if (!rows.length) return;
    exportToPDF(
      rows.map((r) => ({
        SKU: r.sku,
        Producto: r.producto,
        Categoría: r.categoria,
        "Und. Vendidas": r.und_vendidas,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Sell-Through %": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      "comportamiento_producto",
      "Comportamiento de Producto"
    );
  };

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  return (
    <div className="space-y-4">
      {/* Search + Export bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!rows.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!rows.length}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><LoadingState rows={8} /></div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
            <p className="text-muted-foreground text-xs mt-1 max-w-md">{(error as Error).message}</p>
          </div>
        ) : !paged.length ? (
          <EmptyState message="No se encontraron productos para este filtro." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="min-w-[260px]">Producto</TableHead>
                  <TableHead>Clasificación</TableHead>
                  <TableHead className="text-right">Und. Vendidas</TableHead>
                  <TableHead>Stock Actual</TableHead>
                  <TableHead className="min-w-[180px]">Sell-Through</TableHead>
                  <TableHead>WOS & Salud</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row) => (
                  <TableRow key={row.sku} className="cursor-pointer" onClick={() => setSelectedProduct(row)}>
                    {/* Producto */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {row.foto ? (
                          <img
                            src={row.foto}
                            alt={row.producto}
                            className="h-14 w-14 rounded-lg object-cover border border-border shrink-0"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground text-xs shrink-0">
                            N/A
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{row.producto}</p>
                          <p className="text-xs text-muted-foreground">{row.categoria}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Clasificación */}
                    <TableCell>
                      <StatusBadge label={row.clasificacion} />
                    </TableCell>

                    {/* Unidades Vendidas */}
                    <TableCell className="text-right">
                      <span className="text-base font-semibold text-foreground">
                        {(row.und_vendidas ?? 0).toLocaleString()}
                      </span>
                    </TableCell>

                    {/* Stock Actual */}
                    <TableCell>
                      <div className="space-y-0.5 text-sm">
                        <p>🏪 Tiendas: <span className="font-medium">{(row.stock_tiendas ?? 0).toLocaleString()}</span></p>
                        <p>📦 Digital: <span className="font-medium">{(row.stock_digital ?? 0).toLocaleString()}</span></p>
                      </div>
                    </TableCell>

                    {/* Sell-Through */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={Math.min(row.sell_through_pct ?? 0, 100)}
                          className="h-2.5 flex-1 bg-muted"
                          indicatorClassName={getSellThroughColor(row.sell_through_pct ?? 0)}
                        />
                        <span className="text-sm font-medium text-foreground w-12 text-right">
                          {row.sell_through_pct ?? 0}%
                        </span>
                      </div>
                    </TableCell>

                    {/* WOS & Salud */}
                    <TableCell>
                      <p className="text-sm font-semibold text-foreground">{row.wos ?? 0} sem.</p>
                      <StatusBadge label={row.estado_salud} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  {rows.length} productos · Página {page + 1} de {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Anterior
                  </Button>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <ProductDetailDrawer
        product={selectedProduct}
        days={resolveDays(days)}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
