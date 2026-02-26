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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

const WOS_FILTERS = [
  { value: "all", label: "Todos los WOS" },
  { value: "risk", label: "🟡 Riesgo (<4 sem)" },
  { value: "optimal", label: "🟢 Óptimo (4-12 sem)" },
  { value: "overstock", label: "🔴 Sobrestock (>12 sem)" },
  { value: "stagnant", label: "🔴 Estancado (0 ventas)" },
];

const ST_FILTERS = [
  { value: "all", label: "Todos los %ST" },
  { value: "high", label: "🟢 Alto (≥70%)" },
  { value: "medium", label: "🟡 Medio (30-69%)" },
  { value: "low", label: "🔴 Bajo (<30%)" },
];

interface LocationOption {
  location_id: string;
  name: string;
}

export function ProductBehaviorTable({ days }: { days: number }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null);
  const [wosFilter, setWosFilter] = useState("all");
  const [stFilter, setStFilter] = useState("all");
  const [locationId, setLocationId] = useState("all");

  const resolvedDays = resolveDays(days);

  const { data: locations } = useQuery({
    queryKey: ["locations-active"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("location_id, name").eq("is_active", true).order("name");
      return (data ?? []) as LocationOption[];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["producto-comportamiento", resolvedDays, search, locationId],
    queryFn: async () => {
      const params: { dias_atras: number; p_sku_filter?: string; p_location_id?: string } = { dias_atras: resolvedDays };
      if (search.trim()) params.p_sku_filter = search.trim();
      if (locationId !== "all") params.p_location_id = locationId;
      const { data, error } = await supabase.rpc("reporte_comportamiento_producto", params);
      if (import.meta.env.DEV) console.log("[ProductBehavior] RPC response:", { data, error, params });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProductRow[];
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
  const rows = useMemo(() => {
    let all = data ?? [];
    if (wosFilter !== "all") {
      all = all.filter((r) => {
        if (wosFilter === "stagnant") return r.estado_salud.includes("ESTANCADO");
        if (wosFilter === "risk") return r.wos > 0 && r.wos < 4;
        if (wosFilter === "optimal") return r.wos >= 4 && r.wos <= 12;
        if (wosFilter === "overstock") return r.wos > 12;
        return true;
      });
    }
    if (stFilter !== "all") {
      all = all.filter((r) => {
        if (stFilter === "high") return r.sell_through_pct >= 70;
        if (stFilter === "medium") return r.sell_through_pct >= 30 && r.sell_through_pct < 70;
        if (stFilter === "low") return r.sell_through_pct < 30;
        return true;
      });
    }
    return all;
  }, [data, wosFilter, stFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const paged = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useMemo(() => setPage(0), [search, days, wosFilter, stFilter, locationId]);

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
      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="relative flex-1 w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por SKU o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10"
          />
        </div>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger className="w-full sm:w-[200px] h-10">
            <SelectValue placeholder="Todas las tiendas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {(locations ?? []).map((loc) => (
              <SelectItem key={loc.location_id} value={loc.location_id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={wosFilter} onValueChange={setWosFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-10">
            <SelectValue placeholder="Filtrar por WOS" />
          </SelectTrigger>
          <SelectContent>
            {WOS_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stFilter} onValueChange={setStFilter}>
          <SelectTrigger className="w-full sm:w-[200px] h-10">
            <SelectValue placeholder="Filtrar por %ST" />
          </SelectTrigger>
          <SelectContent>
            {ST_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
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
            </div>

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
