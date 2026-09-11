import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { TimeFilter, THIS_MONTH_SENTINEL, resolveDays, buildRpcDateParams } from "@/components/dashboard/TimeFilter";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, FileText, Search, ArrowLeft, Store, Globe, Pause, Tag, Clock } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";


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
  semanas_vida: number;
  primera_venta: string;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los Canales" },
  { value: "tiendas", label: "Tiendas de Línea" },
  { value: "outlets", label: "Outlets" },
  { value: "digital", label: "Digital" },
];

const SEMANA_VIDA_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "nuevos", label: "Nuevos · 1 a 8 semanas" },
  { value: "en-ventana", label: "En ventana · 9 a 17 semanas" },
  { value: "fuera-ventana", label: "Fuera de ventana · más de 17" },
];

const MEZCLA_TOGGLE_OPTIONS = [
  { value: "all", label: "Todas", color: null as string | null },
  { value: "Full Price", label: "Full Price", color: "bg-emerald-500" },
  { value: "Rebajas", label: "Rebajas", color: "bg-blue-500" },
  { value: "Promo", label: "Promo", color: "bg-orange-500" },
];

function MezclaToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 min-h-10">
      {MEZCLA_TOGGLE_OPTIONS.map((opt) => {
        const active = value === opt.value;
        const activeClass =
          opt.value === "all"
            ? "bg-foreground text-background border-foreground"
            : `${opt.color} text-white border-transparent`;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "h-10 px-3 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5",
              active ? activeClass : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            )}
          >
            {opt.value !== "all" && opt.color && (
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  active ? "bg-white/80" : opt.color
                )}
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

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

const SEMANAS_VENTANA = 17;

function getLifetimeInfo(semanas: number | null, primeraVenta: string | null) {
  const over = semanas != null && semanas > SEMANAS_VENTANA;
  const colorBar = over ? "bg-rose-500" : (semanas ?? 0) >= 9 ? "bg-amber-500" : "bg-emerald-500";
  const colorText = over ? "text-rose-500" : (semanas ?? 0) >= 9 ? "text-amber-500" : "text-emerald-500";
  const pct = Math.min(100, Math.max(0, ((semanas ?? 0) / SEMANAS_VENTANA) * 100));
  const fechaPrimera = primeraVenta
    ? new Date(primeraVenta).toLocaleDateString("es-CO", { day: "numeric", month: "long" })
    : null;
  const tooltipText =
    semanas == null
      ? "Sin datos de vida"
      : fechaPrimera
      ? `Semana ${semanas.toLocaleString("es-CO")} de ${SEMANAS_VENTANA} · primera venta ${fechaPrimera}`
      : `Semana ${semanas.toLocaleString("es-CO")} de ${SEMANAS_VENTANA}`;
  return { colorBar, colorText, pct, tooltipText, fechaPrimera };
}

export default function DesempenoProductosPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialCanal = searchParams.get("canal") || "all";
  const orden = searchParams.get("orden") === "BOTTOM" ? "BOTTOM" : "TOP";
  const daysQP = searchParams.get("days");
  const initialDays = daysQP && Number(daysQP) > 0 ? Number(daysQP) : THIS_MONTH_SENTINEL;
  const locationId = searchParams.get("location") || null;
  const fromQP = searchParams.get("from");
  const toQP = searchParams.get("to");
  const rangeFrom = fromQP ? new Date(`${fromQP}T00:00:00`) : undefined;
  const rangeTo = toQP ? new Date(`${toQP}T00:00:00`) : undefined;

  const [days, setDays] = useState<number>(initialDays);
  const [canal, setCanal] = useState(initialCanal);
  const [catFilter, setCatFilter] = useState("all");
  const initialSemana = searchParams.get("semana") || "all";
  const initialMezcla = searchParams.get("mezcla") || "all";
  const [semanaFilter, setSemanaFilter] = useState(initialSemana);
  const [mezclaFilter, setMezclaFilter] = useState(initialMezcla);
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
        p_limite: topN,
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
  }, [days, canal, catFilter, orden, topN]);

  // Sincronizar filtros rápidos con la URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (semanaFilter === "all") params.delete("semana");
    else params.set("semana", semanaFilter);
    if (mezclaFilter === "all") params.delete("mezcla");
    else params.set("mezcla", mezclaFilter);
    navigate({ search: params.toString() }, { replace: true });
  }, [semanaFilter, mezclaFilter]);

  const categories = useMemo(() => {
    return [...new Set(data.map(r => r.categoria).filter(Boolean))].sort();
  }, [data]);

  // Universo filtrado (colección/línea/búsqueda/filtros rápidos), antes del corte de Top N
  const universe = useMemo(() => {
    let result = data;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.producto?.toLowerCase().includes(q) || r.categoria?.toLowerCase().includes(q)
      );
    }
    if (semanaFilter !== "all") {
      result = result.filter(r => {
        const s = r.semanas_vida ?? 0;
        if (semanaFilter === "nuevos") return s >= 1 && s <= 8;
        if (semanaFilter === "en-ventana") return s >= 9 && s <= 17;
        if (semanaFilter === "fuera-ventana") return s > 17;
        return true;
      });
    }
    if (mezclaFilter !== "all") {
      result = result.filter(r => {
        const c = cleanClasificacion(r.clasificacion);
        if (mezclaFilter === "Full Price") return c.includes("Full Price");
        if (mezclaFilter === "Rebajas") return c.includes("Rebajas");
        if (mezclaFilter === "Promo") return c.includes("Promo");
        return true;
      });
    }
    return result;
  }, [data, search, semanaFilter, mezclaFilter]);

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
        "Semanas Vida": r.semanas_vida ?? "",
        "Primera Venta": r.primera_venta ?? "",
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
            <div className="space-y-3">
              {/* Línea 1: Buscador, Canal, Categoría, Semana de Vida y Cantidad */}
              <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-end gap-3">
                <div className="min-w-0 w-full sm:w-auto sm:flex-1 sm:max-w-xs">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Buscar
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Producto o categoría..."
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="pl-10 h-10"
                    />
                  </div>
                </div>
                <div className="min-w-0 w-full sm:w-auto">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Canal
                  </label>
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
                </div>
                <div className="min-w-0 w-full sm:w-auto">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Categoría
                  </label>
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
                </div>
                <div className="min-w-0 w-full sm:w-auto">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Semana de vida
                  </label>
                  <Select value={semanaFilter} onValueChange={setSemanaFilter}>
                    <SelectTrigger className="w-full sm:w-[210px] h-10">
                      <SelectValue placeholder="Semana de vida" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMANA_VIDA_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 w-full sm:w-auto">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Cantidad
                  </label>
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
                </div>
              </div>

              {/* Línea 2: Mezcla de precios a la izquierda, exportaciones a la derecha */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Mezcla de precios
                  </label>
                  <MezclaToggle value={mezclaFilter} onChange={setMezclaFilter} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filtered.length}>
                    <Download className="h-4 w-4 mr-1" /> CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!filtered.length}>
                    <FileText className="h-4 w-4 mr-1" /> PDF
                  </Button>
                </div>
              </div>

              {/* Línea 3: Total del universo filtrado */}
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
                        <TableHead className="w-[50px] text-center">#</TableHead>
                        <TableHead className="min-w-[280px]">Producto</TableHead>
                        <TableHead className="min-w-[100px]">Categoría</TableHead>
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
                            <div className="flex items-start gap-3">
                              <div className="shrink-0">
                                {row.foto ? (
                                  <ProductImageThumb src={row.foto} alt={row.producto} sku={row.sku} title={row.producto} className="w-12 h-12 rounded-lg object-cover bg-muted" onError={e => { e.currentTarget.style.display = "none"; }} />
                                ) : (
                                  <div className="w-12 h-12 rounded-lg bg-muted/50 flex items-center justify-center text-lg">📦</div>
                                )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium text-foreground line-clamp-2 max-w-[200px] pt-0.5">{row.producto}</span>
                                {(() => {
                                  const s = row.semanas_vida;
                                  if (s == null) {
                                    return <span className="text-[9px] text-muted-foreground mt-1">—</span>;
                                  }
                                  const { colorBar, colorText, pct, tooltipText } = getLifetimeInfo(s, row.primera_venta);
                                  return (
                                    <TooltipProvider>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className={`flex items-center gap-0.5 text-[10px] font-medium tabular-nums ${colorText} cursor-default`}>
                                              <Clock className="h-3 w-3" />
                                              <span>{s.toLocaleString("es-CO")}/{SEMANAS_VENTANA}</span>
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent side="bottom" className="text-xs">
                                            <p>{tooltipText}</p>
                                          </TooltipContent>
                                        </Tooltip>
                                        <CollectionBadge coleccion={row.coleccion} />
                                      </div>
                                      <div className="h-[3px] w-12 rounded-full bg-muted overflow-hidden mt-1">
                                        <div className={`h-full rounded-full ${colorBar}`} style={{ width: `${pct}%` }} />
                                      </div>
                                    </TooltipProvider>
                                  );
                                })()}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.categoria}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="font-semibold tabular-nums">
                              {(row.und_total ?? 0).toLocaleString()}
                            </div>
                            <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5" title="Tiendas físicas">
                                <Store className="h-3 w-3" />{(row.und_tiendas ?? 0).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-0.5" title="Outlets">
                                <Tag className="h-3 w-3" />{(row.und_outlets ?? 0).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-0.5" title="Digital">
                                <Globe className="h-3 w-3" />{(row.und_digital ?? 0).toLocaleString()}
                              </span>
                            </div>
                          </TableCell>
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
                          <TableCell className="text-right whitespace-nowrap">
                            <div className="font-semibold tabular-nums">
                              {(row.stock_venta_directa ?? 0).toLocaleString()}
                            </div>
                            <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground mt-0.5">
                              <span className="flex items-center gap-0.5" title="Tiendas físicas">
                                <Store className="h-3 w-3" />{(row.stock_tiendas ?? 0).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-0.5" title="Online">
                                <Globe className="h-3 w-3" />{(row.stock_online ?? 0).toLocaleString()}
                              </span>
                              <span className="flex items-center gap-0.5" title="Stand by">
                                <Pause className="h-3 w-3" />{(row.stock_standby ?? 0).toLocaleString()}
                              </span>
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
