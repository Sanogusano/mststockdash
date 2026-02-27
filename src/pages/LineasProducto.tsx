import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Search } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface LineRow {
  categoria: string;
  stock_tiendas: number;
  stock_digital: number;
  und_tiendas: number;
  und_outlets: number;
  und_digital: number;
  und_total: number;
  pct_participacion: number;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los Canales" },
  { value: "tiendas", label: "Tiendas de Línea" },
  { value: "outlets", label: "Outlets" },
  { value: "digital", label: "Digital" },
];

export default function LineasProductoPage() {
  const [searchParams] = useSearchParams();
  const initialCanal = searchParams.get("canal") || "all";

  const [days, setDays] = useState(THIS_MONTH_SENTINEL);
  const [canal, setCanal] = useState(initialCanal);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      const effectiveDays = resolveDays(days);
      const canalParam = canal === "all" ? null : canal;
      const { data: rows, error: err } = await supabase.rpc("reporte_desempeno_por_linea" as any, {
        dias_atras: effectiveDays,
        p_canal: canalParam,
      });
      if (err) {
        setError(err.message);
        setData([]);
      } else {
        setData((rows ?? []) as unknown as LineRow[]);
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    return data.filter(r => r.categoria?.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const getSellThroughColor = (pct: number) => {
    if (pct >= 70) return "bg-success";
    if (pct >= 30) return "bg-warning";
    return "bg-danger";
  };

  const handleExportCSV = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map(r => ({
        Categoría: r.categoria,
        "Stock Tiendas": r.stock_tiendas,
        "Stock Digital": r.stock_digital,
        "Uds Tiendas": r.und_tiendas,
        "Uds Outlets": r.und_outlets,
        "Uds Digital": r.und_digital,
        "Uds Total": r.und_total,
        "% Participación": r.pct_participacion,
        "Sell-Through %": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      "desempeno_lineas"
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length) return;
    exportToPDF(
      filtered.map(r => ({
        Categoría: r.categoria,
        "Stock Total": (r.stock_tiendas + r.stock_digital),
        "Uds Tiendas": r.und_tiendas,
        "Uds Outlets": r.und_outlets,
        "Uds Digital": r.und_digital,
        "Total": r.und_total,
        "% Part.": r.pct_participacion,
        "%ST": r.sell_through_pct,
        WOS: r.wos,
        Salud: r.estado_salud,
      })),
      "desempeno_lineas",
      "Desempeño por Línea de Producto"
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Desempeño por Línea</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Stock, ventas por canal, participación, sell-through y salud por categoría</p>
              </div>
            </div>
            <TimeFilter value={days} onChange={setDays} />
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar categoría..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger className="w-full sm:w-[200px] h-10">
                  <SelectValue placeholder="Todos los Canales" />
                </SelectTrigger>
                <SelectContent>
                  {CANAL_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="glass-card overflow-hidden">
              {loading ? (
                <div className="p-6"><LoadingState rows={8} /></div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-4xl mb-3">⚠️</p>
                  <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
                  <p className="text-muted-foreground text-xs mt-1 max-w-md">{error}</p>
                </div>
              ) : !filtered.length ? (
                <EmptyState message="No se encontraron líneas para estos filtros." />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[160px]">Categoría</TableHead>
                        <TableHead className="text-right">Stock Tiendas</TableHead>
                        <TableHead className="text-right">Stock Digital</TableHead>
                        <TableHead className="text-right">Uds Tiendas</TableHead>
                        <TableHead className="text-right">Uds Outlets</TableHead>
                        <TableHead className="text-right">Uds Digital</TableHead>
                        <TableHead className="text-right">Total Uds</TableHead>
                        <TableHead className="text-right">% Participación</TableHead>
                        <TableHead className="min-w-[140px]">Sell-Through</TableHead>
                        <TableHead>WOS & Salud</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(row => (
                        <TableRow key={row.categoria}>
                          <TableCell>
                            <span className="text-sm font-medium text-foreground">{row.categoria}</span>
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {(row.stock_tiendas ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {(row.stock_digital ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {(row.und_tiendas ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {(row.und_outlets ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {(row.und_digital ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm">
                            {(row.und_total ?? 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-semibold text-foreground">{row.pct_participacion ?? 0}%</span>
                          </TableCell>
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
                          <TableCell>
                            <p className="text-sm font-semibold text-foreground">{row.wos ?? 0} sem.</p>
                            <StatusBadge label={row.estado_salud} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
