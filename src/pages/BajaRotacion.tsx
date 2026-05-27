import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, AlertTriangle, AlertCircle, CircleOff, ChevronDown, ChevronRight, Store, Tag, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToXLS } from "@/lib/xls-export";

type TallaInfo = {
  talla?: string;
  stock?: number;
  stock_linea?: number;
  stock_outlet?: number;
  stock_digital?: number;
  linea?: number;
  outlet?: number;
  digital?: number;
} & Record<string, unknown>;

type Row = {
  product_id: string;
  titulo: string;
  category: string;
  color: string;
  collection_season: string | null;
  es_rebaja: boolean;
  precio_actual: number;
  precio_original: number;
  descuento_actual: number;
  primera_venta: string;
  dias_en_tienda: number;
  semanas_en_tienda: number;
  tallas_disponibles: TallaInfo[] | null;
  tallas_con_stock: number;
  tallas_totales: number;
  cobertura_curva: number;
  unidades_vendidas: number;
  stock_actual: number;
  stock_linea?: number;
  stock_outlet?: number;
  stock_digital?: number;
  inventario_inicial: number;
  sell_through: number;
  velocidad_semanal: number;
  nivel: "atencion" | "critico" | "liquidar" | string;
  descuento_sugerido: number;
  accion: string;
};

type Location = { location_id: string; name: string };

const NIVEL_LABELS: Record<string, { label: string; emoji: string; className: string }> = {
  atencion: { label: "Atención", emoji: "🟡", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  critico: { label: "Crítico", emoji: "🔴", className: "bg-red-100 text-red-800 border-red-300" },
  liquidar: { label: "Liquidar", emoji: "⚫", className: "bg-neutral-200 text-neutral-800 border-neutral-400" },
};

function pct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function fmtCOP(n: number) {
  const v = Number(n) || 0;
  return `$ ${v.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function fmtInt(n: number) {
  return (Number(n) || 0).toLocaleString("es-CO");
}

function stBadge(st: number) {
  const v = Number(st) || 0;
  if (v < 10) return "bg-neutral-200 text-neutral-800 border-neutral-400";
  if (v < 15) return "bg-red-100 text-red-800 border-red-300";
  if (v < 30) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-green-100 text-green-800 border-green-300";
}

function coberturaBadge(con: number, total: number) {
  if (!total) return "bg-muted text-muted-foreground border-border";
  const r = con / total;
  if (r >= 0.8) return "bg-green-100 text-green-800 border-green-300";
  if (r >= 0.4) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function toHexColor(color?: string): string | null {
  if (!color) return null;
  const t = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.toUpperCase()}`;
  return null;
}

type TallaParsed = {
  talla: string;
  stock: number;
  linea: number;
  outlet: number;
  digital: number;
};

function parseTallas(t: Row["tallas_disponibles"]): TallaParsed[] {
  if (!t) return [];
  const arr = Array.isArray(t) ? t : [];
  return arr
    .map((x: any) => {
      const linea = Number(x?.stock_linea ?? x?.linea ?? x?.tiendas ?? 0) || 0;
      const outlet = Number(x?.stock_outlet ?? x?.outlet ?? x?.outlets ?? 0) || 0;
      const digital = Number(x?.stock_digital ?? x?.digital ?? x?.cedi ?? x?.ecommerce ?? 0) || 0;
      const stockRaw = Number(x?.stock ?? x?.available ?? x?.qty ?? 0) || 0;
      const stock = stockRaw || linea + outlet + digital;
      return {
        talla: String(x?.talla ?? x?.size ?? x?.name ?? ""),
        stock,
        linea,
        outlet,
        digital,
      };
    })
    .filter((x) => x.talla);
}

export default function BajaRotacionPage() {
  const [nivel, setNivel] = useState<string>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [semanasMin, setSemanasMin] = useState<string>("4");
  const [stMax, setStMax] = useState<number>(30);
  const [locationId, setLocationId] = useState<string>("todas");
  const [incluirRebajas, setIncluirRebajas] = useState<boolean>(true);
  const [tipoTienda, setTipoTienda] = useState<string>("todas");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["locations-baja-rot"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("location_id,name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });

  const { data: rows = [], isLoading, error, isFetching } = useQuery<Row[]>({
    queryKey: ["baja-rotacion", semanasMin, stMax, locationId, incluirRebajas],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_baja_rotacion", {
        p_semanas_minimas: Number(semanasMin),
        p_sell_through_max: stMax,
        p_location_id: locationId === "todas" ? null : locationId,
        p_incluir_rebajas: incluirRebajas,
      } as any);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const productIds = useMemo(() => rows.map((r) => r.product_id).filter(Boolean), [rows]);
  const { data: imagesMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["baja-rot-images", productIds.length, productIds.slice(0, 5).join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const chunkSize = 200;
      for (let i = 0; i < productIds.length; i += chunkSize) {
        const chunk = productIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("product_catalog")
          .select("product_id,image_url")
          .in("product_id", chunk);
        if (error) throw error;
        (data ?? []).forEach((r: any) => {
          if (r.product_id && r.image_url && !map[r.product_id]) map[r.product_id] = r.image_url;
        });
      }
      return map;
    },
  });

  const categorias = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (nivel !== "todos" && r.nivel !== nivel) return false;
      if (categoria !== "todas" && r.category !== categoria) return false;
      if (tipoTienda === "linea" && !(Number(r.stock_linea) > 0)) return false;
      if (tipoTienda === "outlet" && !(Number(r.stock_outlet) > 0)) return false;
      return true;
    });
  }, [rows, nivel, categoria, tipoTienda]);

  const counts = useMemo(() => {
    const c = {
      atencion: { full: 0, rebaja: 0 },
      critico: { full: 0, rebaja: 0 },
      liquidar: { full: 0, rebaja: 0 },
    };
    rows.forEach((r) => {
      if (r.nivel in c) {
        const k = r.nivel as keyof typeof c;
        if (r.es_rebaja) c[k].rebaja++;
        else c[k].full++;
      }
    });
    return c;
  }, [rows]);

  const stockTotals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.linea += Number(r.stock_linea) || 0;
        acc.outlet += Number(r.stock_outlet) || 0;
        acc.digital += Number(r.stock_digital) || 0;
        return acc;
      },
      { linea: 0, outlet: 0, digital: 0 },
    );
  }, [filtered]);

  const handleExport = () => {
    const data = filtered.map((r) => ({
      Producto: r.titulo,
      "Product ID": r.product_id,
      Categoría: r.category,
      Color: r.color,
      Colección: r.collection_season ?? "",
      "Tallas con stock": r.tallas_con_stock,
      "Tallas totales": r.tallas_totales,
      "Cobertura curva (%)": Number(r.cobertura_curva).toFixed(1),
      "Semanas en tienda": Number(r.semanas_en_tienda).toFixed(1),
      "Días en tienda": r.dias_en_tienda,
      "Unidades vendidas": r.unidades_vendidas,
      "Stock actual": r.stock_actual,
      "Stock Línea": Number(r.stock_linea) || 0,
      "Stock Outlet": Number(r.stock_outlet) || 0,
      "Stock Digital/CEDI": Number(r.stock_digital) || 0,
      "Inventario inicial": r.inventario_inicial,
      "Sell-through (%)": Number(r.sell_through).toFixed(2),
      "Velocidad semanal": Number(r.velocidad_semanal).toFixed(2),
      "Precio actual": Number(r.precio_actual) || 0,
      "Precio original": Number(r.precio_original) || 0,
      "Es rebaja": r.es_rebaja ? "Sí" : "No",
      "Descuento actual (%)": Number(r.descuento_actual).toFixed(1),
      "Descuento sugerido (%)": Number(r.descuento_sugerido).toFixed(1),
      Nivel: NIVEL_LABELS[r.nivel]?.label ?? r.nivel,
      "Acción sugerida": r.accion,
    }));
    exportToXLS(data, `baja-rotacion-${new Date().toISOString().slice(0, 10)}`, "Baja Rotación");
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Baja Rotación</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Productos con bajo sell-through y antigüedad en tienda
                </p>
              </div>
            </div>
            <Button onClick={handleExport} disabled={!filtered.length} size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            {/* KPIs - Fila 1: Niveles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="h-4 w-4" /> 🟡 Atención
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">
                    {counts.atencion.full + counts.atencion.rebaja}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {counts.atencion.full} full + {counts.atencion.rebaja} rebajas · ST &lt; 30%, 4–8 sem
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" /> 🔴 Crítico
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">
                    {counts.critico.full + counts.critico.rebaja}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {counts.critico.full} full + {counts.critico.rebaja} rebajas · ST &lt; 15%, +8 sem
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-neutral-700">
                    <CircleOff className="h-4 w-4" /> ⚫ Liquidar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">
                    {counts.liquidar.full + counts.liquidar.rebaja}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {counts.liquidar.full} full + {counts.liquidar.rebaja} rebajas · ST &lt; 10%, +12 sem
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* KPIs - Fila 2: Stock por canal */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                    <Store className="h-4 w-4" /> 🏪 Tiendas línea
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{fmtInt(stockTotals.linea)}</div>
                  <p className="text-xs text-muted-foreground mt-1">unidades en tiendas de línea</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                    <Tag className="h-4 w-4" /> 🏷️ Outlets
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{fmtInt(stockTotals.outlet)}</div>
                  <p className="text-xs text-muted-foreground mt-1">unidades en outlets</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                    <Globe className="h-4 w-4" /> 🌐 Digital / CEDI
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{fmtInt(stockTotals.digital)}</div>
                  <p className="text-xs text-muted-foreground mt-1">unidades en CEDI/Ecommerce</p>
                </CardContent>
              </Card>
            </div>

            {/* Filtros */}
            <Card>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nivel</label>
                  <Select value={nivel} onValueChange={setNivel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="atencion">🟡 Atención</SelectItem>
                      <SelectItem value="critico">🔴 Crítico</SelectItem>
                      <SelectItem value="liquidar">⚫ Liquidar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                  <Select value={categoria} onValueChange={setCategoria}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Tipo tienda</label>
                  <Select value={tipoTienda} onValueChange={setTipoTienda}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="linea">🏪 Solo línea</SelectItem>
                      <SelectItem value="outlet">🏷️ Solo outlet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Ubicación</label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Semanas mínimas</label>
                  <Select value={semanasMin} onValueChange={setSemanasMin}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 semanas</SelectItem>
                      <SelectItem value="8">8 semanas</SelectItem>
                      <SelectItem value="12">12 semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Sell-through máximo: {stMax}%
                  </label>
                  <Slider
                    value={[stMax]}
                    min={0}
                    max={50}
                    step={1}
                    onValueChange={(v) => setStMax(v[0])}
                    className="pt-2"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Incluir rebajas</label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={incluirRebajas} onCheckedChange={setIncluirRebajas} />
                    <span className="text-xs text-muted-foreground">
                      {incluirRebajas ? "Sí" : "No"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabla */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Resultados <span className="text-muted-foreground font-normal">({filtered.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {error ? (
                  <div className="text-sm text-destructive py-8 text-center">
                    Error: {(error as Error).message}
                  </div>
                ) : isLoading || isFetching ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Cargando…</div>
                ) : filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    Sin productos que cumplan los filtros.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="w-16">Foto</TableHead>
                          <TableHead>Producto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead>Colección</TableHead>
                          <TableHead className="text-center">Tallas</TableHead>
                          <TableHead className="text-right">Sem.</TableHead>
                          <TableHead className="text-right">U. vend.</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">🏪 Línea</TableHead>
                          <TableHead className="text-right">🏷️ Outlet</TableHead>
                          <TableHead className="text-right">🌐 Digital</TableHead>
                          <TableHead className="text-right">Sell-through</TableHead>
                          <TableHead className="text-right">Vel/sem</TableHead>
                          <TableHead className="text-right">Precio</TableHead>
                          <TableHead className="text-right">Dcto. actual</TableHead>
                          <TableHead className="text-right">Dcto. sugerido</TableHead>
                          <TableHead>Nivel</TableHead>
                          <TableHead>Acción sugerida</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((r) => {
                          const niv = NIVEL_LABELS[r.nivel];
                          const img = imagesMap[r.product_id];
                          const hex = toHexColor(r.color);
                          const tallas = parseTallas(r.tallas_disponibles);
                          const isOpen = expanded.has(r.product_id);
                          return (
                            <Fragment key={r.product_id}>
                              <TableRow className="cursor-pointer" onClick={() => toggleExpand(r.product_id)}>
                                <TableCell className="p-2">
                                  {isOpen ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {img ? (
                                    <img
                                      src={img}
                                      alt={r.titulo}
                                      loading="lazy"
                                      className="h-12 w-12 rounded object-cover border border-border bg-muted"
                                    />
                                  ) : (
                                    <div className="h-12 w-12 rounded border border-dashed border-border bg-muted" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium text-sm">{r.titulo}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{r.product_id}</div>
                                </TableCell>
                                <TableCell className="text-xs">{r.category}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex items-center gap-2">
                                    {hex && (
                                      <span
                                        className="inline-block h-4 w-4 rounded-full border border-border shadow-sm"
                                        style={{ backgroundColor: hex }}
                                        title={hex}
                                      />
                                    )}
                                    <span className="font-mono">{hex ?? r.color}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {r.collection_season ?? "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${coberturaBadge(
                                      r.tallas_con_stock,
                                      r.tallas_totales,
                                    )}`}
                                  >
                                    {r.tallas_con_stock}/{r.tallas_totales}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {Number(r.semanas_en_tienda).toFixed(1)}
                                </TableCell>
                                <TableCell className="text-right text-xs">{r.unidades_vendidas}</TableCell>
                                <TableCell className="text-right text-xs font-semibold">{r.stock_actual}</TableCell>
                                <TableCell className="text-right text-xs">
                                  {Number(r.stock_linea) > 0 ? (
                                    fmtInt(r.stock_linea ?? 0)
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {Number(r.stock_outlet) > 0 ? (
                                    fmtInt(r.stock_outlet ?? 0)
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {Number(r.stock_digital) > 0 ? (
                                    fmtInt(r.stock_digital ?? 0)
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stBadge(
                                      r.sell_through,
                                    )}`}
                                  >
                                    {pct(r.sell_through)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {Number(r.velocidad_semanal).toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  <div className="font-medium">{fmtCOP(r.precio_actual)}</div>
                                  {r.es_rebaja && r.precio_original > r.precio_actual && (
                                    <div className="text-[10px] text-muted-foreground line-through">
                                      {fmtCOP(r.precio_original)}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {r.es_rebaja ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-100 text-orange-800 border-orange-300">
                                      -{pct(r.descuento_actual)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/30">
                                    -{pct(r.descuento_sugerido)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {niv ? (
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${niv.className}`}
                                    >
                                      {niv.emoji} {niv.label}
                                    </span>
                                  ) : (
                                    <Badge variant="outline">{r.nivel}</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                                  {r.accion}
                                </TableCell>
                              </TableRow>
                              {isOpen && (
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableCell colSpan={20} className="py-3">
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        Stock por talla y canal
                                      </div>
                                      {tallas.length === 0 ? (
                                        <div className="text-xs text-muted-foreground">Sin detalle de tallas</div>
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {tallas.map((t, i) => {
                                            const cls =
                                              t.stock <= 0
                                                ? "bg-red-50 text-red-700 border-red-200"
                                                : t.stock < 3
                                                  ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                                                  : "bg-green-50 text-green-800 border-green-200";
                                            return (
                                              <div
                                                key={`${t.talla}-${i}`}
                                                className={`inline-flex flex-col gap-1 px-2.5 py-1.5 rounded-md border text-xs ${cls}`}
                                              >
                                                <div className="flex items-center gap-1.5 font-semibold">
                                                  <span>{t.talla}</span>
                                                  <span className="opacity-60">·</span>
                                                  <span>{t.stock}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[10px] font-normal opacity-90">
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🏪 {t.linea}
                                                  </span>
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🏷️ {t.outlet}
                                                  </span>
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🌐 {t.digital}
                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
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
