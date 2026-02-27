import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Download, FileText, Search, ArrowLeft } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ProductRow {
  foto: string;
  producto: string;
  sku: string;
  categoria: string;
  und_tiendas: number;
  und_outlets: number;
  und_digital: number;
  und_total: number;
  pct_full_price: number;
  pct_descuento: number;
  clasificacion: string;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los Canales" },
  { value: "tiendas", label: "Tiendas de Línea" },
  { value: "outlets", label: "Outlets" },
  { value: "digital", label: "Digital" },
];

export default function DesempenoProductosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCanal = searchParams.get("canal") || "all";

  const [days, setDays] = useState(THIS_MONTH_SENTINEL);
  const [canal, setCanal] = useState(initialCanal);
  const [catFilter, setCatFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      const effectiveDays = resolveDays(days);
      const canalParam = canal === "all" ? null : canal;
      const catParam = catFilter === "all" ? null : catFilter;
      const { data: rows, error: err } = await supabase.rpc("reporte_top_productos_global" as any, {
        dias_atras: effectiveDays,
        p_canal: canalParam,
        p_categoria: catParam,
        p_orden: "TOP",
        p_limite: 50,
      });
      if (err) {
        setError(err.message);
        setData([]);
      } else {
        setData((rows ?? []) as unknown as ProductRow[]);
      }
      setLoading(false);
    }
    fetch();
  }, [days, canal, catFilter]);

  // Extract unique categories for filter
  const categories = useMemo(() => {
    const cats = [...new Set(data.map(r => r.categoria).filter(Boolean))].sort();
    return cats;
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.producto?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map(r => ({
        Producto: r.producto,
        Categoría: r.categoria,
        "Uds Tiendas": r.und_tiendas,
        "Uds Outlets": r.und_outlets,
        "Uds Digital": r.und_digital,
        "Total Uds": r.und_total,
        "% Full Price": r.pct_full_price,
        "% Descuento": r.pct_descuento,
        Clasificación: r.clasificacion,
      })),
      "desempeno_productos_global"
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length) return;
    exportToPDF(
      filtered.map(r => ({
        Producto: r.producto,
        Categoría: r.categoria,
        Tiendas: r.und_tiendas,
        Outlets: r.und_outlets,
        Digital: r.und_digital,
        Total: r.und_total,
        "%FP": r.pct_full_price,
        "%Desc": r.pct_descuento,
        Clasif: r.clasificacion,
      })),
      "desempeno_productos_global",
      "Desempeño de Productos — Todos los Canales"
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
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-base sm:text-lg font-semibold text-foreground">Top Productos — Venta Directa</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Unidades por canal, % Full Price vs Descuento y clasificación global</p>
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
                  placeholder="Buscar producto o categoría..."
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
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-full sm:w-[200px] h-10">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
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
                <div className="p-6"><LoadingState rows={10} /></div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-4xl mb-3">⚠️</p>
                  <p className="text-destructive text-sm font-medium">Error al cargar datos</p>
                  <p className="text-muted-foreground text-xs mt-1 max-w-md">{error}</p>
                </div>
              ) : !filtered.length ? (
                <EmptyState message="No se encontraron productos para estos filtros." />
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[1000px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[220px]">Producto</TableHead>
                        <TableHead className="min-w-[100px]">Categoría</TableHead>
                        <TableHead className="text-right">Tiendas</TableHead>
                        <TableHead className="text-right">Outlets</TableHead>
                        <TableHead className="text-right">Digital</TableHead>
                        <TableHead className="text-right font-semibold">Total</TableHead>
                        <TableHead className="text-right">% Full Price</TableHead>
                        <TableHead className="text-right">% Descuento</TableHead>
                        <TableHead>Clasificación</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row, i) => (
                        <TableRow key={`${row.producto}-${i}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {row.foto ? (
                                <img src={row.foto} alt="" className="w-10 h-10 rounded-lg object-cover bg-muted shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center text-sm shrink-0">👗</div>
                              )}
                              <span className="text-sm font-medium text-foreground line-clamp-2 max-w-[180px]">{row.producto}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.categoria}</TableCell>
                          <TableCell className="text-right text-sm">{(row.und_tiendas ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{(row.und_outlets ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{(row.und_digital ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm font-semibold">{(row.und_total ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-emerald-600">{row.pct_full_price ?? 0}%</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium text-orange-500 cursor-pointer hover:underline"
                              onClick={() => navigate(`/pedidos?tipo=descuento&days=${resolveDays(days)}`)}
                            >
                              {row.pct_descuento ?? 0}%
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.clasificacion?.includes("Full Price")
                                ? "bg-primary/10 text-primary"
                                : "bg-warning/10 text-warning"
                            }`}>
                              {row.clasificacion}
                            </span>
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
