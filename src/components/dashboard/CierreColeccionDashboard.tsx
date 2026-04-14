import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Award, DollarSign, Package, Truck, ShoppingBag, Palette } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap } from "recharts";
import { toast } from "sonner";
import { resolveDays } from "./TimeFilter";

// Strip common category words from extracted color names
const CATEGORY_WORDS = new Set([
  "T-SHIRT", "TSHIRT", "OVERSIZED", "HOODIE", "CROP", "TOP", "POLO",
  "SNEAKER", "SNEAKERS", "CAP", "HAT", "JEAN", "JEANS", "SHORT", "SHORTS",
  "SHIRT", "LONG", "SLEEVE", "BODY", "BODYSUIT", "DRESS", "JACKET",
  "TROUSERS", "PANTS", "PACK", "SET", "SWIM", "BOXER", "BELT",
  "BAG", "BACKPACK", "HANDLE", "FANNY", "VISOR", "WINDBREAKER",
  "BLAZER", "BLUSA", "CARGO", "BERMUDAS", "BRA", "BIKINI", "SWEATSHIRT",
  "MEN", "WOMEN", "UNISEX", "KIDS"
]);

function cleanColorName(raw: string | null, hex: string): string {
  if (!raw) return hex.toUpperCase();
  const words = raw.toUpperCase().split(/\s+/).filter(w => !CATEGORY_WORDS.has(w) && w.length > 0);
  const cleaned = words.join(" ").trim();
  return cleaned || hex.toUpperCase();
}

// Ordered collections to show
const ORDERED_COLLECTIONS = [
  "Dominus", "Imperium", "Stallion", "Horsebeat", "The King",
  "The Throne", "The Race", "Bishop", "Zero"
];

function matchesOrderedCollection(name: string): string | null {
  const upper = name.toUpperCase().trim();
  for (const col of ORDERED_COLLECTIONS) {
    if (upper === col.toUpperCase()) return col;
  }
  return null;
}

interface KPIs {
  sell_through_pct: number;
  calidad_venta_pct: number;
  ingreso_total: number;
  stock_remanente: number;
}

interface ParetoRow { categoria: string; unidades: number; pct_participacion: number }
interface ColorRow { color: string; unidades: number; color_name?: string }
interface TallaRow { talla: string; und_vendidas: number; stock_disponible: number }
interface ComposicionVentaRow { coleccion: string; unidades: number }
interface InventarioColeccionRow { coleccion: string; unidades: number; pct: number }
interface CatColRow { categoria: string; coleccion: string; unidades: number }
interface TreemapColorRow {
  color: string;
  color_name: string;
  und_vendidas: number;
  stock_disponible: number;
  pct_venta: number;
  pct_inventario: number;
}
interface RemanentRow {
  sku: string; producto: string; categoria: string; genero: string; foto: string;
  und_vendidas: number; stock_actual: number; sell_through_pct: number; precio_prom_venta: number;
}

interface Props {
  days: number;
}

export function CierreColeccionDashboard({ days }: Props) {
  const [coleccion, setColeccion] = useState<string | null>(null);
  const [genero, setGenero] = useState<string | null>(null);
  const [canal, setCanal] = useState<string | null>(null);
  const [zona, setZona] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);

  const [categoriaColor, setCategoriaColor] = useState<string | null>(null);
  const [categoriaTalla, setCategoriaTalla] = useState<string | null>(null);

  const [colecciones, setColecciones] = useState<string[]>([]);
  const [generos, setGeneros] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [tiendas, setTiendas] = useState<{ id: string; name: string }[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [pareto, setPareto] = useState<ParetoRow[]>([]);
  const [topColores, setTopColores] = useState<ColorRow[]>([]);
  const [curvaTallas, setCurvaTallas] = useState<TallaRow[]>([]);
  const [ventasColeccion, setVentasColeccion] = useState<ComposicionVentaRow[]>([]);
  const [inventarioColeccion, setInventarioColeccion] = useState<InventarioColeccionRow[]>([]);
  const [catColData, setCatColData] = useState<CatColRow[]>([]);
  const [remanentes, setRemanentes] = useState<RemanentRow[]>([]);
  const [treemapColores, setTreemapColores] = useState<TreemapColorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingColores, setLoadingColores] = useState(false);
  const [loadingTallas, setLoadingTallas] = useState(false);
  const [loadingTreemap, setLoadingTreemap] = useState(false);
  const [categoriaTreemap, setCategoriaTreemap] = useState<string | null>(null);

  useEffect(() => {
    const loadFilters = async () => {
      const [colRes, genRes, zonRes, tieRes, catRes] = await Promise.all([
        supabase.from("product_catalog").select("collection_season").not("collection_season", "is", null),
        supabase.from("product_catalog").select("target_gender").not("target_gender", "is", null),
        supabase.from("locations").select("zona").not("zona", "is", null),
        supabase.from("locations").select("location_id, name").eq("is_active", true).order("name"),
        supabase.from("product_catalog").select("category").not("category", "is", null),
      ]);
      setColecciones([...new Set((colRes.data || []).map(r => r.collection_season).filter(Boolean))] as string[]);
      setGeneros([...new Set((genRes.data || []).map(r => r.target_gender).filter(Boolean))] as string[]);
      setZonas([...new Set((zonRes.data || []).map(r => r.zona).filter(Boolean))] as string[]);
      setTiendas((tieRes.data || []).map(r => ({ id: r.location_id, name: r.name })));
      setCategorias([...new Set((catRes.data || []).map(r => r.category).filter(Boolean))].sort() as string[]);
    };
    loadFilters();
  }, []);

  const baseParams = useCallback(() => ({
    p_coleccion: coleccion || null,
    p_genero: genero || null,
    p_canal: canal || null,
    p_zona: zona || null,
    p_location_id: locationId || null,
  }), [coleccion, genero, canal, zona, locationId]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = baseParams();
    const resolvedDays = resolveDays(days);

    const [kpiRes, paretoRes, colorRes, tallaRes, remRes, compVentaRes, invColRes, catColRes] = await Promise.all([
      supabase.rpc("reporte_cierre_coleccion_kpis", params),
      supabase.rpc("reporte_cierre_coleccion_pareto_categoria", params),
      supabase.rpc("reporte_cierre_coleccion_top_colores", { ...params, p_categoria: null }),
      supabase.rpc("reporte_cierre_coleccion_curva_tallas", { ...params, p_categoria: null }),
      supabase.rpc("reporte_cierre_coleccion_remanentes", { ...params, p_limite: 50 }),
      supabase.rpc("reporte_composicion_coleccion" as any, { dias_atras: resolvedDays, p_canal: params.p_canal, p_location_id: params.p_location_id, p_zona: params.p_zona }),
      supabase.rpc("reporte_composicion_inventario_coleccion" as any, { p_location_id: params.p_location_id }),
      supabase.rpc("reporte_cierre_coleccion_categoria_coleccion", params),
    ]);

    if (kpiRes.data && kpiRes.data.length > 0) setKpis(kpiRes.data[0] as unknown as KPIs);
    else setKpis({ sell_through_pct: 0, calidad_venta_pct: 0, ingreso_total: 0, stock_remanente: 0 });

    setPareto(((paretoRes.data || []) as unknown as ParetoRow[]).filter(r => r.categoria?.toUpperCase() !== "INSUMOS"));
    setTopColores((colorRes.data || []) as unknown as ColorRow[]);
    setCurvaTallas((tallaRes.data || []) as unknown as TallaRow[]);
    setVentasColeccion((compVentaRes.data || []) as unknown as ComposicionVentaRow[]);
    setInventarioColeccion((invColRes.data || []) as unknown as InventarioColeccionRow[]);
    setCatColData((catColRes.data || []) as unknown as CatColRow[]);
    setRemanentes((remRes.data || []) as unknown as RemanentRow[]);
    setLoading(false);
  }, [baseParams, days]);

  const fetchColores = useCallback(async () => {
    setLoadingColores(true);
    const res = await supabase.rpc("reporte_cierre_coleccion_top_colores", {
      ...baseParams(),
      p_categoria: categoriaColor || null,
    });
    setTopColores((res.data || []) as unknown as ColorRow[]);
    setLoadingColores(false);
  }, [baseParams, categoriaColor]);

  const fetchTallas = useCallback(async () => {
    setLoadingTallas(true);
    const res = await supabase.rpc("reporte_cierre_coleccion_curva_tallas", {
      ...baseParams(),
      p_categoria: categoriaTalla || null,
    });
    setCurvaTallas((res.data || []) as unknown as TallaRow[]);
    setLoadingTallas(false);
  }, [baseParams, categoriaTalla]);

  const fetchTreemap = useCallback(async () => {
    setLoadingTreemap(true);
    const resolvedDays = resolveDays(days);
    const res = await supabase.rpc("reporte_cierre_coleccion_treemap_colores" as any, {
      dias_atras: resolvedDays,
      ...baseParams(),
      p_categoria: categoriaTreemap || null,
    });
    setTreemapColores((res.data || []) as unknown as TreemapColorRow[]);
    setLoadingTreemap(false);
  }, [baseParams, categoriaTreemap, days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Treemap loads independently (can be slow)
  useEffect(() => { fetchTreemap(); }, [fetchTreemap]);

  useEffect(() => {
    if (!loading) fetchColores();
  }, [categoriaColor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) fetchTallas();
  }, [categoriaTalla]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("es-CO").format(n);

  // Build category → collection breakdown map — only show ordered collections
  const catColMap = new Map<string, Record<string, number>>();
  catColData.forEach(r => {
    if (r.categoria?.toUpperCase() === "INSUMOS") return;
    const matched = matchesOrderedCollection(r.coleccion);
    if (!matched) return;
    const existing = catColMap.get(r.categoria) || {};
    existing[matched] = (existing[matched] || 0) + r.unidades;
    catColMap.set(r.categoria, existing);
  });

  // Sort ventas by units descending
  const sortedVentas = [...ventasColeccion].sort((a, b) => b.unidades - a.unidades);
  const totalVentas = sortedVentas.reduce((s, r) => s + r.unidades, 0);

  // Sort inventario by units descending
  const sortedInventario = [...inventarioColeccion].sort((a, b) => b.unidades - a.unidades);
  const totalInventario = sortedInventario.reduce((s, r) => s + r.unidades, 0);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={coleccion || "__all__"} onValueChange={v => setColeccion(v === "__all__" ? null : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Colección" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas las colecciones</SelectItem>
            {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={genero || "__all__"} onValueChange={v => setGenero(v === "__all__" ? null : v)}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Género" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            {generos.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={canal || "__all__"} onValueChange={v => setCanal(v === "__all__" ? null : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos</SelectItem>
            <SelectItem value="Tiendas">Tiendas</SelectItem>
            <SelectItem value="Digital">Digital</SelectItem>
          </SelectContent>
        </Select>
        <Select value={zona || "__all__"} onValueChange={v => setZona(v === "__all__" ? null : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Zona" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {zonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={locationId || "__all__"} onValueChange={v => setLocationId(v === "__all__" ? null : v)}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Tienda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas</SelectItem>
            {tiendas.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Sell-Through Global" value={`${kpis?.sell_through_pct ?? 0}%`} icon={<TrendingUp className="h-4 w-4" />} />
            <KpiCard title="Calidad de Venta" value={`${kpis?.calidad_venta_pct ?? 0}%`} subtitle="% Full Price" icon={<Award className="h-4 w-4" />} />
            <KpiCard title="Ingreso Total" value={fmt(kpis?.ingreso_total ?? 0)} icon={<DollarSign className="h-4 w-4" />} />
            <KpiCard title="Stock Remanente" value={fmtNum(kpis?.stock_remanente ?? 0)} subtitle="unidades" icon={<Package className="h-4 w-4" />} />
          </div>

          {/* Unidades & Participación en Venta + Inventario por Colección */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Gráfico 1: Unidades vendidas por colección (con filtro de fecha) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" /> Unidades & Participación en Venta
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Según filtro de fecha seleccionado</p>
              </CardHeader>
              <CardContent>
                {sortedVentas.length > 0 ? (
                  <div className="space-y-2.5">
                    {sortedVentas.map((v, i) => {
                      const pct = totalVentas > 0 ? ((v.unidades / totalVentas) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate max-w-[140px]">{v.coleccion}</span>
                            <span className="text-xs text-muted-foreground">
                              {fmtNum(v.unidades)} uds — <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
                            </span>
                          </div>
                          <div className="w-full h-3.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all bg-primary"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-xs text-muted-foreground text-right pt-1 border-t border-border">
                      Total: <span className="font-semibold text-foreground">{fmtNum(totalVentas)}</span> uds
                    </div>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-6">Sin datos</p>}
              </CardContent>
            </Card>

            {/* Gráfico 2: Inventario actual por colección */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Package className="h-4 w-4" /> Inventario por Colección
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Stock actual disponible</p>
              </CardHeader>
              <CardContent>
                {sortedInventario.length > 0 ? (
                  <div className="space-y-2.5">
                    {sortedInventario.map((v, i) => {
                      const pct = totalInventario > 0 ? ((v.unidades / totalInventario) * 100) : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium truncate max-w-[140px]">{v.coleccion}</span>
                            <span className="text-xs text-muted-foreground">
                              {fmtNum(v.unidades)} uds — <span className="font-semibold text-foreground">{pct.toFixed(1)}%</span>
                            </span>
                          </div>
                          <div className="w-full h-3.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all bg-accent-foreground/60"
                              style={{ width: `${Math.max(pct, 1)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="text-xs text-muted-foreground text-right pt-1 border-t border-border">
                      Total: <span className="font-semibold text-foreground">{fmtNum(totalInventario)}</span> uds
                    </div>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-6">Sin datos</p>}
              </CardContent>
            </Card>
          </div>

          {/* Pareto full width */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pareto por Categoría</CardTitle></CardHeader>
            <CardContent className="p-0">
              {pareto.length > 0 ? (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky top-0 bg-background text-xs">Categoría</TableHead>
                        <TableHead className="sticky top-0 bg-background text-xs text-right">Unidades</TableHead>
                        <TableHead className="sticky top-0 bg-background text-xs text-right">% Part.</TableHead>
                        {ORDERED_COLLECTIONS.map(col => (
                          <TableHead key={col} className="sticky top-0 bg-background text-xs text-right">{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pareto.map((r, i) => {
                        const colBreakdown = catColMap.get(r.categoria) || {};
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-2 font-medium">{r.categoria}</TableCell>
                            <TableCell className="text-xs text-right py-2">{fmtNum(r.unidades)}</TableCell>
                            <TableCell className="text-xs text-right py-2">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.pct_participacion, 100)}%` }} />
                                </div>
                                <span>{r.pct_participacion}%</span>
                              </div>
                            </TableCell>
                            {ORDERED_COLLECTIONS.map(col => (
                              <TableCell key={col} className="text-xs text-right py-2">
                                {colBreakdown[col] ? fmtNum(colBreakdown[col]) : "—"}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>}
            </CardContent>
          </Card>

          {/* Treemap de Venta por Color */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4" /> Análisis por Color — Venta & Inventario
                  </CardTitle>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tamaño por unidades vendidas · Muestra Vta% e Inv%</p>
                </div>
                <Select value={categoriaTreemap || "__all__"} onValueChange={v => setCategoriaTreemap(v === "__all__" ? null : v)}>
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Línea de producto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todas las líneas</SelectItem>
                    {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loadingTreemap ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : treemapColores.length > 0 ? (
                <ColorTreemap data={treemapColores} cleanColorName={cleanColorName} />
              ) : <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>}
            </CardContent>
          </Card>

          {/* Top 10 Colores + Curva de Tallas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Top 10 Colores</CardTitle>
                  <Select value={categoriaColor || "__all__"} onValueChange={v => setCategoriaColor(v === "__all__" ? null : v)}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Línea de producto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas las líneas</SelectItem>
                      {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingColores ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : topColores.length > 0 ? (() => {
                  const maxUnidades = Math.max(...topColores.map(c => c.unidades));
                  return (
                    <div className="space-y-2">
                      {topColores.map((c, i) => {
                        const hex = c.color.startsWith("#") ? c.color : `#${c.color}`;
                        const intensity = maxUnidades > 0 ? c.unidades / maxUnidades : 0;
                        const displayName = cleanColorName(c.color_name || null, c.color);
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded border border-border flex-shrink-0" style={{ backgroundColor: hex }} title={hex} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium truncate">{displayName}</span>
                                <span className="text-xs text-muted-foreground ml-2">{fmtNum(c.unidades)} uds</span>
                              </div>
                              <div className="w-full h-5 rounded bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded transition-all"
                                  style={{
                                    width: `${intensity * 100}%`,
                                    backgroundColor: hex,
                                    opacity: 0.7 + intensity * 0.3,
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })() : <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-medium">Curva de Tallas</CardTitle>
                  <Select value={categoriaTalla || "__all__"} onValueChange={v => setCategoriaTalla(v === "__all__" ? null : v)}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Línea de producto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas las líneas</SelectItem>
                      {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loadingTallas ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : curvaTallas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={curvaTallas} margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="talla" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmtNum(v)} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="und_vendidas" name="Vendidas" fill="hsl(160, 60%, 45%)" stackId="a" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="stock_disponible" name="Stock" fill="hsl(30, 80%, 55%)" stackId="a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>}
              </CardContent>
            </Card>
          </div>

          {/* Remnant Wall */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Muro de Remanentes — Menor Sell-Through</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky top-0 bg-background">SKU</TableHead>
                      <TableHead className="sticky top-0 bg-background">Producto</TableHead>
                      <TableHead className="sticky top-0 bg-background">Categoría</TableHead>
                      <TableHead className="sticky top-0 bg-background">Género</TableHead>
                      <TableHead className="sticky top-0 bg-background text-right">Vendidas</TableHead>
                      <TableHead className="sticky top-0 bg-background text-right">Stock</TableHead>
                      <TableHead className="sticky top-0 bg-background text-right">ST%</TableHead>
                      <TableHead className="sticky top-0 bg-background text-right">Precio Prom.</TableHead>
                      <TableHead className="sticky top-0 bg-background text-center">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remanentes.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sin remanentes</TableCell></TableRow>
                    ) : remanentes.map((r, i) => (
                      <TableRow key={`${r.sku}-${i}`}>
                        <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {r.foto && <img src={r.foto} alt="" className="h-8 w-8 rounded object-cover" />}
                            <span className="text-xs truncate max-w-[180px]">{r.producto}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{r.categoria}</TableCell>
                        <TableCell className="text-xs">{r.genero}</TableCell>
                        <TableCell className="text-right text-xs">{fmtNum(r.und_vendidas)}</TableCell>
                        <TableCell className="text-right text-xs font-medium">{fmtNum(r.stock_actual)}</TableCell>
                        <TableCell className="text-right text-xs">
                          <span className={r.sell_through_pct < 20 ? "text-destructive font-semibold" : ""}>{r.sell_through_pct}%</span>
                        </TableCell>
                        <TableCell className="text-right text-xs">{fmt(r.precio_prom_venta)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => toast.success(`Traslado a Outlet solicitado para ${r.sku}`)}
                          >
                            <Truck className="h-3 w-3" /> Outlet
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ColorTreemap({ data, cleanColorName }: { data: TreemapColorRow[]; cleanColorName: (raw: string | null, hex: string) => string }) {
  // Build treemap data with color as fill
  const treemapData = data.map(d => {
    const hex = d.color.startsWith("#") ? d.color : `#${d.color}`;
    const name = cleanColorName(d.color_name || null, d.color);
    return {
      name,
      size: Math.max(d.und_vendidas, 1),
      hex,
      pctVenta: d.pct_venta,
      pctInv: d.pct_inventario,
      undVendidas: d.und_vendidas,
      stockDisponible: d.stock_disponible,
    };
  });

  const CustomContent = (props: any) => {
    const { x, y, width, height, name, hex, pctVenta, pctInv } = props;
    if (width < 20 || height < 20) return null;

    // Determine text color based on luminance
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const textColor = lum > 0.5 ? "#000" : "#fff";

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={hex} stroke="hsl(var(--background))" strokeWidth={2} rx={4} />
        {width > 40 && height > 35 && (
          <>
            <text x={x + 6} y={y + 16} fill={textColor} fontSize={width > 80 ? 12 : 10} fontWeight="600">{name.length > (width / 7) ? name.slice(0, Math.floor(width / 7)) + "…" : name}</text>
            <text x={x + 6} y={y + 30} fill={textColor} fontSize={10} opacity={0.85}>Vta {pctVenta}%</text>
            {height > 48 && <text x={x + 6} y={y + 43} fill={textColor} fontSize={10} opacity={0.85}>Inv {pctInv}%</text>}
          </>
        )}
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={400}>
      <Treemap
        data={treemapData}
        dataKey="size"
        nameKey="name"
        content={<CustomContent />}
        isAnimationActive={false}
      >
        <Tooltip
          content={({ payload }) => {
            if (!payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                <p className="font-semibold mb-1 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-sm border border-border inline-block" style={{ backgroundColor: d.hex }} />
                  {d.name}
                </p>
                <p>Vendidas: <span className="font-medium">{d.undVendidas.toLocaleString("es-CO")}</span> — <span className="font-semibold">{d.pctVenta}%</span></p>
                <p>Stock: <span className="font-medium">{d.stockDisponible.toLocaleString("es-CO")}</span> — <span className="font-semibold">{d.pctInv}%</span></p>
              </div>
            );
          }}
        />
      </Treemap>
    </ResponsiveContainer>
  );
}

function KpiCard({ title, value, subtitle, icon }: { title: string; value: string; subtitle?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{title}</span>
          <span className="text-muted-foreground/50">{icon}</span>
        </div>
        <p className="text-xl font-semibold text-foreground">{value}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
