import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays, buildRpcDateParams } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Search, ArrowLeft, Store, Globe, Pause, Tag } from "lucide-react";
import { CollectionBadge } from "@/components/dashboard/CollectionBadge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { exportDesempenoPDF } from "@/lib/desempeno-pdf-export";
import { exportToCSV } from "@/lib/csv-export";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { ProductDetailDrawer } from "@/components/dashboard/ProductDetailDrawer";


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
  pct_rebajas: number;
  pct_descuento: number;
  clasificacion: string;
  coleccion: string;
  stock_venta_directa: number;
  stock_tiendas: number;
  stock_online: number;
  stock_standby: number;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los Canales" },
  { value: "tiendas", label: "Tiendas de Línea" },
  { value: "outlets", label: "Outlets" },
  { value: "digital", label: "Digital" },
];

function cleanClasificacion(c: string) {
  return (c || "").replace(/[🏆🏷️🧲]/g, "").trim();
}

function PriceTypeBars({ fp, reb, promo }: { fp: number; reb: number; promo: number }) {
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center gap-1.5">
        <div className="w-[60px] h-2 rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fp}%` }} />
        </div>
        <span className="text-[10px] font-medium text-emerald-600 w-[36px] text-right">{fp}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-[60px] h-2 rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${reb}%` }} />
        </div>
        <span className="text-[10px] font-medium text-blue-500 w-[36px] text-right">{reb}%</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-[60px] h-2 rounded-full bg-muted/40 overflow-hidden">
          <div className="h-full rounded-full bg-orange-500" style={{ width: `${promo}%` }} />
        </div>
        <span className="text-[10px] font-medium text-orange-500 w-[36px] text-right">{promo}%</span>
      </div>
    </div>
  );
}

export default function DesempenoProductosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCanal = searchParams.get("canal") || "all";
  const orden = searchParams.get("orden") === "BOTTOM" ? "BOTTOM" : "TOP";
  const daysQP = searchParams.get("days");
  const initialDays = daysQP && Number(daysQP) > 0 ? Number(daysQP) : THIS_MONTH_SENTINEL;

  const [days, setDays] = useState<number>(initialDays);
  const [canal, setCanal] = useState(initialCanal);
  const [catFilter, setCatFilter] = useState("all");
  const [topN, setTopN] = useState(50);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<{ foto: string; producto: string; sku: string; categoria: string } | null>(null);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      setError(null);
      const { dias_atras: effectiveDays, p_hasta: hastaParam } = buildRpcDateParams(days);
      const canalParam = canal === "all" ? null : canal;
      const catParam = catFilter === "all" ? null : catFilter;
      const { data: rows, error: err } = await supabase.rpc("reporte_top_productos_global" as any, {
        dias_atras: effectiveDays,
        p_canal: canalParam,
        p_categoria: catParam,
        p_orden: orden,
        p_limite: 500,
        p_hasta: hastaParam,
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
  }, [days, canal, catFilter, orden]);

  const categories = useMemo(() => {
    return [...new Set(data.map(r => r.categoria).filter(Boolean))].sort();
  }, [data]);

  // Universo filtrado (colección/línea/búsqueda), antes del corte de Top N
  const universe = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r =>
      r.producto?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
    );
  }, [data, search]);

  const totalUnidadesUniverso = useMemo(
    () => universe.reduce((s, r) => s + (r.und_total ?? 0), 0),
    [universe]
  );

  const filtered = useMemo(() => universe.slice(0, topN), [universe, topN]);

  const handleExportCSV = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map((r, i) => ({
        Posicion: i + 1,
        Producto: r.producto,
        Categoria: r.categoria,
        Coleccion: r.coleccion || "Otros",
        "Uds Tiendas": r.und_tiendas,
        "Uds Outlets": r.und_outlets,
        "Uds Digital": r.und_digital,
        "Total Uds": r.und_total,
        "Full Price %": r.pct_full_price,
        "Rebajas %": r.pct_rebajas,
        "Desc Promo %": r.pct_descuento,
        Clasificacion: cleanClasificacion(r.clasificacion),
        "Stock Venta Directa": r.stock_venta_directa ?? 0,
        "Stock Tiendas": r.stock_tiendas ?? 0,
        "Stock Online": r.stock_online ?? 0,
        "Stock Stand By": r.stock_standby ?? 0,
      })),
      `desempeno_productos_${new Date().toISOString().slice(0, 10)}`
    );
  };

  const handleExportPDF = () => {
    if (!filtered.length) return;
    exportDesempenoPDF(filtered, resolveDays(days));
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
                <h1 className="text-base sm:text-lg font-semibold text-foreground">{orden === "BOTTOM" ? "Menor Rotación — Venta Directa" : "Top Productos — Venta Directa"}</h1>
                <p className="text-[10px] sm:text-xs text-muted-foreground">{orden === "BOTTOM" ? "Productos con menor rotación, mezcla de precios y stock actualizado" : "Ranking por unidades vendidas, mezcla de precios y stock actualizado"}</p>
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
              <Select value={String(topN)} onValueChange={v => setTopN(Number(v))}>
                <SelectTrigger className="w-full sm:w-[150px] h-10">
                  <SelectValue placeholder="Cantidad" />
                </SelectTrigger>
                <SelectContent>
                  {[5, 10, 20, 50, 100].map(n => (
                    <SelectItem key={n} value={String(n)}>
                      {orden === "BOTTOM" ? `Bottom ${n}` : `Top ${n}`}
                    </SelectItem>
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

            {/* Total del universo filtrado (antes del corte de Top N) */}
            <div className="glass-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-widest">Unidades vendidas — universo filtrado</p>
                <p className="text-2xl font-display font-bold text-primary tabular-nums">
                  {totalUnidadesUniverso.toLocaleString("es-CO")}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {universe.length.toLocaleString("es-CO")} referencias · mostrando {filtered.length.toLocaleString("es-CO")}
              </p>
            </div>


            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Full Price</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Rebajas</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" /> Desc Promo</span>
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
                  <Table className="min-w-[1100px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead className="min-w-[240px]">Producto</TableHead>
                        <TableHead className="min-w-[100px]">Categoría</TableHead>
                        <TableHead className="min-w-[100px]">Colección</TableHead>
                        <TableHead className="text-right min-w-[140px]">Ventas</TableHead>
                        <TableHead className="min-w-[140px]">Mezcla de Precios</TableHead>
                        <TableHead className="min-w-[130px]">Clasificación</TableHead>
                        <TableHead className="text-right min-w-[140px]">Inventario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((row, i) => (
                        <TableRow
                          key={`${row.producto}-${i}`}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setSelectedProduct({
                            foto: row.foto, producto: row.producto, sku: row.sku, categoria: row.categoria,
                          })}
                        >
                          <TableCell className="text-center text-sm font-bold text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {row.foto ? (
                                <ProductImageThumb src={row.foto} alt={row.producto} sku={row.sku} title={row.producto} className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-lg shrink-0">📦</div>
                              )}
                              <span className="text-sm font-medium text-foreground line-clamp-2 max-w-[200px]">{row.producto}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.categoria}</TableCell>
                          <TableCell><CollectionBadge coleccion={row.coleccion} /></TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{(row.und_tiendas ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{(row.und_outlets ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{(row.und_digital ?? 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm font-bold tabular-nums">{(row.und_total ?? 0).toLocaleString()}</TableCell>
                          <TableCell>
                            <PriceTypeBars fp={row.pct_full_price ?? 0} reb={row.pct_rebajas ?? 0} promo={row.pct_descuento ?? 0} />
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                              row.clasificacion?.includes("Full Price")
                                ? "bg-emerald-500/10 text-emerald-600"
                                : row.clasificacion?.includes("Rebajas")
                                ? "bg-blue-500/10 text-blue-600"
                                : "bg-orange-500/10 text-orange-600"
                            }`}>
                              {cleanClasificacion(row.clasificacion)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
                                <Store className="h-3.5 w-3.5 text-muted-foreground" />
                                {(row.stock_tiendas ?? 0).toLocaleString()}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
                                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                                {(row.stock_online ?? 0).toLocaleString()}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs tabular-nums text-foreground">
                                <Pause className="h-3.5 w-3.5 text-muted-foreground" />
                                {(row.stock_standby ?? 0).toLocaleString()}
                              </div>
                            </div>
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
      <ProductDetailDrawer
        product={selectedProduct}
        days={resolveDays(days)}
        onClose={() => setSelectedProduct(null)}
      />
    </SidebarProvider>
  );
}
