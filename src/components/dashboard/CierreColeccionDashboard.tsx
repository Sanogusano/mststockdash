import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, Award, DollarSign, Package, Truck } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";


interface KPIs {
  sell_through_pct: number;
  calidad_venta_pct: number;
  ingreso_total: number;
  stock_remanente: number;
}

interface ParetoRow { categoria: string; unidades: number; pct_participacion: number }
interface ColorRow { color: string; unidades: number }
interface TallaRow { talla: string; und_vendidas: number; stock_disponible: number }
interface RemanentRow {
  sku: string; producto: string; categoria: string; genero: string; foto: string;
  und_vendidas: number; stock_actual: number; sell_through_pct: number; precio_prom_venta: number;
}

export function CierreColeccionDashboard() {
  const [coleccion, setColeccion] = useState<string | null>(null);
  const [genero, setGenero] = useState<string | null>(null);
  const [canal, setCanal] = useState<string | null>(null);
  const [zona, setZona] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);

  const [colecciones, setColecciones] = useState<string[]>([]);
  const [generos, setGeneros] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);
  const [tiendas, setTiendas] = useState<{ id: string; name: string }[]>([]);

  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [pareto, setPareto] = useState<ParetoRow[]>([]);
  const [topColores, setTopColores] = useState<ColorRow[]>([]);
  const [curvaTallas, setCurvaTallas] = useState<TallaRow[]>([]);
  const [remanentes, setRemanentes] = useState<RemanentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      const [colRes, genRes, zonRes, tieRes] = await Promise.all([
        supabase.from("product_catalog").select("collection_season").not("collection_season", "is", null),
        supabase.from("product_catalog").select("target_gender").not("target_gender", "is", null),
        supabase.from("locations").select("zona").not("zona", "is", null),
        supabase.from("locations").select("location_id, name").eq("is_active", true).order("name"),
      ]);

      const uniqueCol = [...new Set((colRes.data || []).map(r => r.collection_season).filter(Boolean))] as string[];
      const uniqueGen = [...new Set((genRes.data || []).map(r => r.target_gender).filter(Boolean))] as string[];
      const uniqueZon = [...new Set((zonRes.data || []).map(r => r.zona).filter(Boolean))] as string[];

      setColecciones(uniqueCol.sort());
      setGeneros(uniqueGen.sort());
      setZonas(uniqueZon.sort());
      setTiendas((tieRes.data || []).map(r => ({ id: r.location_id, name: r.name })));
    };
    loadFilters();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = {
      p_coleccion: coleccion || null,
      p_genero: genero || null,
      p_canal: canal || null,
      p_zona: zona || null,
      p_location_id: locationId || null,
    };

    const [kpiRes, paretoRes, colorRes, tallaRes, remRes] = await Promise.all([
      supabase.rpc("reporte_cierre_coleccion_kpis", params),
      supabase.rpc("reporte_cierre_coleccion_pareto_categoria", params),
      supabase.rpc("reporte_cierre_coleccion_top_colores", params),
      supabase.rpc("reporte_cierre_coleccion_curva_tallas", params),
      supabase.rpc("reporte_cierre_coleccion_remanentes", { ...params, p_limite: 50 }),
    ]);

    if (kpiRes.data && kpiRes.data.length > 0) setKpis(kpiRes.data[0] as unknown as KPIs);
    else setKpis({ sell_through_pct: 0, calidad_venta_pct: 0, ingreso_total: 0, stock_remanente: 0 });

    setPareto((paretoRes.data || []) as unknown as ParetoRow[]);
    setTopColores((colorRes.data || []) as unknown as ColorRow[]);
    setCurvaTallas((tallaRes.data || []) as unknown as TallaRow[]);
    setRemanentes((remRes.data || []) as unknown as RemanentRow[]);
    setLoading(false);
  }, [coleccion, genero, canal, zona, locationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("es-CO").format(n);

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

          {/* Pareto + Colores + Tallas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pareto - Tabla */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pareto por Categoría</CardTitle></CardHeader>
              <CardContent className="p-0">
                {pareto.length > 0 ? (
                  <div className="overflow-auto max-h-[280px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky top-0 bg-background text-xs">Categoría</TableHead>
                          <TableHead className="sticky top-0 bg-background text-xs text-right">Unidades</TableHead>
                          <TableHead className="sticky top-0 bg-background text-xs text-right">% Part.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pareto.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-2">{r.categoria}</TableCell>
                            <TableCell className="text-xs text-right py-2">{fmtNum(r.unidades)}</TableCell>
                            <TableCell className="text-xs text-right py-2">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(r.pct_participacion, 100)}%` }} />
                                </div>
                                <span>{r.pct_participacion}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>}
              </CardContent>
            </Card>

            {/* Top Colores - Mapa de calor */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Top 5 Colores</CardTitle></CardHeader>
              <CardContent>
                {topColores.length > 0 ? (() => {
                  const maxUnidades = Math.max(...topColores.map(c => c.unidades));
                  return (
                    <div className="space-y-2">
                      {topColores.map((c, i) => {
                        const hex = c.color.startsWith("#") ? c.color : `#${c.color}`;
                        const intensity = maxUnidades > 0 ? c.unidades / maxUnidades : 0;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded border border-border flex-shrink-0" style={{ backgroundColor: hex }} title={hex} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium truncate">{c.color}</span>
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

            {/* Curva de Tallas */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Curva de Tallas</CardTitle></CardHeader>
              <CardContent>
                {curvaTallas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
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
