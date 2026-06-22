import { Fragment, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { ChevronDown, ChevronRight, Download, TrendingUp, Package, Layers, DollarSign } from "lucide-react";
import { exportToXLS } from "@/lib/xls-export";
import { cn } from "@/lib/utils";

type Trimestre = "1" | "2" | "3" | "4";
type Canal = "tiendas" | "digital" | "ambos";

interface ProyeccionRow {
  categoria: string;
  familia_color: string;
  unidades_2025: number;
  unidades_2026: number;
  promedio_ponderado: number;
  proyeccion_2027: number;
  precio_promedio: number;
  venta_proyectada: number;
  pct_categoria: number;
  pct_color_en_categoria: number;
  coleccion_proyectada: string | null;
  pct_full_price: number;
  unidades_full_price: number;
  unidades_promo: number;
  venta_full_price: number;
  venta_promo: number;
}

interface CurvaRow {
  categoria: string;
  familia_color: string;
  talla: string;
  unidades_2025: number;
  unidades_2026: number;
  proyeccion_2027: number;
  pct_talla_en_color: number;
}

const fmtNum = (n: number) => new Intl.NumberFormat("es-CO").format(Math.round(n || 0));
const fmtMoney = (n: number) =>
  "$ " + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n || 0));

const TALLA_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const sortTallas = (a: string, b: string) => {
  const ia = TALLA_ORDER.indexOf((a || "").toUpperCase());
  const ib = TALLA_ORDER.indexOf((b || "").toUpperCase());
  if (ia === -1 && ib === -1) return (a || "").localeCompare(b || "");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
};

const TRIMESTRE_LABEL: Record<Trimestre, string> = {
  "1": "Q1 (Ene–Mar)",
  "2": "Q2 (Abr–Jun)",
  "3": "Q3 (Jul–Sep)",
  "4": "Q4 (Oct–Dic)",
};

export default function ProyeccionDemandaPage() {
  const [trimestre, setTrimestre] = useState<Trimestre>("1");
  const [canal, setCanal] = useState<Canal>("ambos");
  const [crecimiento, setCrecimiento] = useState<number>(15);

  const [applied, setApplied] = useState<{ t: Trimestre; c: Canal; g: number } | null>({
    t: "1", c: "ambos", g: 15,
  });

  const [expandedColor, setExpandedColor] = useState<Set<string>>(new Set());
  const [collapsedCat, setCollapsedCat] = useState<Set<string>>(new Set());

  const proyQuery = useQuery({
    queryKey: ["proyeccion-demanda-v3", applied?.t, applied?.c, applied?.g],
    enabled: !!applied,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_proyeccion_demanda", {
        p_trimestre: Number(applied!.t),
        p_canal: applied!.c,
        p_crecimiento: applied!.g,
      });
      if (error) throw error;
      return (data ?? []) as ProyeccionRow[];
    },
  });

  const curvaQuery = useQuery({
    queryKey: ["curva-tallas-v3", applied?.t, applied?.c, applied?.g],
    enabled: !!applied,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_curva_tallas", {
        p_trimestre: Number(applied!.t),
        p_canal: applied!.c,
        p_crecimiento: applied!.g,
      });
      if (error) throw error;
      return (data ?? []) as CurvaRow[];
    },
  });

  const rows = proyQuery.data ?? [];
  const curvas = curvaQuery.data ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, ProyeccionRow[]>();
    for (const r of rows) {
      const arr = map.get(r.categoria) ?? [];
      arr.push(r);
      map.set(r.categoria, arr);
    }
    // sort colors within each category by proy desc
    for (const arr of map.values()) arr.sort((a, b) => Number(b.proyeccion_2027) - Number(a.proyeccion_2027));
    // sort categories by total desc
    return Array.from(map.entries()).sort((a, b) => {
      const ta = a[1].reduce((s, r) => s + Number(r.proyeccion_2027 || 0), 0);
      const tb = b[1].reduce((s, r) => s + Number(r.proyeccion_2027 || 0), 0);
      return tb - ta;
    });
  }, [rows]);

  const curvaIndex = useMemo(() => {
    const map = new Map<string, CurvaRow[]>();
    for (const c of curvas) {
      const key = `${c.categoria}||${c.familia_color}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => sortTallas(a.talla, b.talla));
    return map;
  }, [curvas]);

  const kpis = useMemo(() => {
    const totalUnits = rows.reduce((s, r) => s + Number(r.proyeccion_2027 || 0), 0);
    const totalSales = rows.reduce((s, r) => s + Number(r.venta_proyectada || 0), 0);
    const totalFull = rows.reduce((s, r) => s + Number(r.venta_full_price || 0), 0);
    const totalPromo = rows.reduce((s, r) => s + Number(r.venta_promo || 0), 0);
    const categorias = new Set(rows.map((r) => r.categoria)).size;
    const precioPond = totalUnits > 0 ? totalSales / totalUnits : 0;
    const pctFull = totalSales > 0 ? (totalFull / totalSales) * 100 : 0;
    return { totalUnits, totalSales, categorias, precioPond, totalFull, totalPromo, pctFull };
  }, [rows]);

  const toggleColor = (key: string) => {
    setExpandedColor((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };
  const toggleCat = (cat: string) => {
    setCollapsedCat((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  };

  const handleCalcular = () => {
    setApplied({ t: trimestre, c: canal, g: crecimiento });
  };

  const handleExport = () => {
    const out: Record<string, unknown>[] = [];
    for (const r of rows) {
      const curva = curvaIndex.get(`${r.categoria}||${r.familia_color}`) ?? [];
      if (curva.length === 0) {
        out.push({
          Categoria: r.categoria,
          Color: r.familia_color,
          Talla: "-",
          "Und 2025": Number(r.unidades_2025),
          "Und 2026": Number(r.unidades_2026),
          "Proyeccion 2027": Number(r.proyeccion_2027),
          "% Talla": 0,
          "Precio Promedio": Number(r.precio_promedio),
          "Venta Proyectada": Number(r.venta_proyectada),
        });
        continue;
      }
      for (const c of curva) {
        out.push({
          Categoria: r.categoria,
          Color: r.familia_color,
          Talla: c.talla,
          "Und 2025": Number(c.unidades_2025),
          "Und 2026": Number(c.unidades_2026),
          "Proyeccion 2027": Number(c.proyeccion_2027),
          "% Talla": Number(c.pct_talla_en_color),
          "Precio Promedio": Number(r.precio_promedio),
          "Venta Proyectada": Math.round(Number(c.proyeccion_2027) * Number(r.precio_promedio)),
        });
      }
    }
    exportToXLS(out, `proyeccion-demanda-Q${applied?.t}-${applied?.c}-${applied?.g}pct`, "Proyeccion");
  };

  const loading = proyQuery.isLoading || curvaQuery.isLoading;
  const error = proyQuery.error || curvaQuery.error;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">
                  Proyección de Demanda
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Categoría · Color · Curva de tallas
                </p>
              </div>
            </div>
            <Button onClick={handleExport} disabled={!rows.length} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Exportar Excel
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* Config */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Configuración</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <Label className="text-xs mb-1.5 block">Trimestre</Label>
                    <Select value={trimestre} onValueChange={(v) => setTrimestre(v as Trimestre)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">{TRIMESTRE_LABEL["1"]}</SelectItem>
                        <SelectItem value="2">{TRIMESTRE_LABEL["2"]}</SelectItem>
                        <SelectItem value="3">{TRIMESTRE_LABEL["3"]}</SelectItem>
                        <SelectItem value="4">{TRIMESTRE_LABEL["4"]}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Canal</Label>
                    <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tiendas">Tiendas Línea</SelectItem>
                        <SelectItem value="digital">Digital</SelectItem>
                        <SelectItem value="ambos">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1.5 block">Crecimiento %</Label>
                    <Input
                      type="number"
                      value={crecimiento}
                      onChange={(e) => setCrecimiento(Number(e.target.value) || 0)}
                      step="1"
                    />
                  </div>
                  <div>
                    <Button onClick={handleCalcular} className="w-full">
                      Calcular proyección
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(applied?.t === "3" || applied?.t === "4") && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
                <strong className="font-semibold">Nota Q{applied?.t}:</strong>{" "}
                La proyección se basa únicamente en datos de 2025 (datos 2026 no disponibles aún).
                Ajustar manualmente según plan de aperturas de tiendas 2027.
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Package className="h-3.5 w-3.5" /> Unidades proyectadas
                  </div>
                  <div className="text-2xl font-semibold">{fmtNum(kpis.totalUnits)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="h-3.5 w-3.5" /> Venta proyectada
                  </div>
                  <div className="text-2xl font-semibold">{fmtMoney(kpis.totalSales)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Layers className="h-3.5 w-3.5" /> Categorías activas
                  </div>
                  <div className="text-2xl font-semibold">{kpis.categorias}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <DollarSign className="h-3.5 w-3.5" /> Precio prom. ponderado
                  </div>
                  <div className="text-2xl font-semibold">{fmtMoney(kpis.precioPond)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Tabla */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Proyección por categoría y color</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <LoadingState />
                ) : error ? (
                  <div className="text-sm text-destructive p-3 border border-destructive/30 rounded-md">
                    {(error as Error).message}
                  </div>
                ) : rows.length === 0 ? (
                  <EmptyState message="No hay datos para los filtros seleccionados." />
                ) : (
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8" />
                          <TableHead>Color</TableHead>
                          <TableHead className="text-right">Und 2025</TableHead>
                          <TableHead className="text-right">Und 2026</TableHead>
                          <TableHead className="text-right">Proy. 2027</TableHead>
                          <TableHead className="text-right">Precio prom.</TableHead>
                          <TableHead className="text-right">Venta proy.</TableHead>
                          <TableHead className="text-right">% Color en cat.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grouped.map(([categoria, colors]) => {
                          const isCollapsed = collapsedCat.has(categoria);
                          const catUnits = colors.reduce((s, r) => s + Number(r.proyeccion_2027 || 0), 0);
                          const catSales = colors.reduce((s, r) => s + Number(r.venta_proyectada || 0), 0);
                          const catPct = colors[0] ? Number(colors[0].pct_categoria) : 0;
                          return (
                            <Fragment key={categoria}>
                              {/* Category header */}
                              <TableRow
                                className="cursor-pointer bg-slate-800 hover:bg-slate-800/90 dark:bg-slate-900"
                                onClick={() => toggleCat(categoria)}
                              >
                                <TableCell className="py-2.5">
                                  {isCollapsed
                                    ? <ChevronRight className="h-4 w-4 text-slate-200" />
                                    : <ChevronDown className="h-4 w-4 text-slate-200" />}
                                </TableCell>
                                <TableCell className="py-2.5 text-slate-100 font-semibold uppercase tracking-wide text-xs">
                                  {categoria}
                                </TableCell>
                                <TableCell colSpan={3} className="py-2.5 text-right text-slate-200 tabular-nums text-xs">
                                  {fmtNum(catUnits)} un proy.
                                </TableCell>
                                <TableCell colSpan={2} className="py-2.5 text-right text-slate-200 tabular-nums text-xs">
                                  {fmtMoney(catSales)} proy.
                                </TableCell>
                                <TableCell className="py-2.5 text-right text-slate-200 tabular-nums text-xs">
                                  {catPct.toFixed(1)}%
                                </TableCell>
                              </TableRow>

                              {/* Color rows */}
                              {!isCollapsed && colors.map((r) => {
                                const key = `${r.categoria}||${r.familia_color}`;
                                const isOpen = expandedColor.has(key);
                                const curva = curvaIndex.get(key) ?? [];
                                return (
                                  <Fragment key={key}>
                                    <TableRow
                                      className="cursor-pointer bg-background"
                                      onClick={() => toggleColor(key)}
                                    >
                                      <TableCell className="py-2 pl-6">
                                        {isOpen
                                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                      </TableCell>
                                      <TableCell className="py-2">{r.familia_color}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums">{fmtNum(r.unidades_2025)}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums">{fmtNum(r.unidades_2026)}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums font-medium">{fmtNum(r.proyeccion_2027)}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums">{fmtMoney(r.precio_promedio)}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums">{fmtMoney(r.venta_proyectada)}</TableCell>
                                      <TableCell className="py-2 text-right tabular-nums">
                                        {Number(r.pct_color_en_categoria).toFixed(1)}%
                                      </TableCell>
                                    </TableRow>
                                    {isOpen && (
                                      <TableRow key={`${key}-curva`} className="bg-muted/30 hover:bg-muted/30">
                                        <TableCell />
                                        <TableCell colSpan={7} className="py-3">
                                          {curva.length === 0 ? (
                                            <div className="text-xs text-muted-foreground">Sin curva de tallas disponible.</div>
                                          ) : (
                                            <div>
                                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                                                Curva de tallas
                                              </div>
                                              <div className="flex flex-wrap gap-2">
                                                {curva.map((c) => (
                                                  <div
                                                    key={`${key}-${c.talla}`}
                                                    className="flex flex-col items-center min-w-[72px] px-3 py-2 rounded-md border bg-background"
                                                  >
                                                    <div className="flex items-baseline gap-1.5">
                                                      <span className="font-semibold text-sm">{c.talla}</span>
                                                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                                        {Number(c.pct_talla_en_color).toFixed(0)}%
                                                      </Badge>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
                                                      {fmtNum(c.proyeccion_2027)} un
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
