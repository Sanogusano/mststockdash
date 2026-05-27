import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, AlertTriangle, AlertCircle, CircleOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToXLS } from "@/lib/xls-export";

type Row = {
  variant_id: string;
  sku: string;
  titulo: string;
  category: string;
  color: string;
  talla: string;
  primera_venta: string;
  dias_en_tienda: number;
  semanas_en_tienda: number;
  unidades_vendidas: number;
  stock_actual: number;
  inventario_inicial: number;
  sell_through: number;
  velocidad_semanal: number;
  nivel: "atencion" | "critico" | "liquidar" | string;
};

type Location = { location_id: string; name: string };

const NIVEL_LABELS: Record<string, { label: string; emoji: string; className: string }> = {
  atencion: { label: "Atención", emoji: "🟡", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  critico: { label: "Crítico", emoji: "🔴", className: "bg-red-100 text-red-800 border-red-300" },
  liquidar: { label: "Liquidar", emoji: "⚫", className: "bg-neutral-200 text-neutral-800 border-neutral-400" },
};

const ACCION: Record<string, string> = {
  atencion: "Cambiar ubicación / Promocionar",
  critico: "Aplicar descuento / Transferir",
  liquidar: "Precio outlet / Liquidar",
};

function pct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function stBadge(st: number) {
  const v = Number(st) || 0;
  if (v < 10) return "bg-neutral-200 text-neutral-800 border-neutral-400";
  if (v < 15) return "bg-red-100 text-red-800 border-red-300";
  if (v < 30) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-green-100 text-green-800 border-green-300";
}

export default function BajaRotacionPage() {
  const [nivel, setNivel] = useState<string>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [semanasMin, setSemanasMin] = useState<string>("4");
  const [stMax, setStMax] = useState<number>(30);
  const [locationId, setLocationId] = useState<string>("todas");

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

  const { data: rows = [], isLoading, error, refetch, isFetching } = useQuery<Row[]>({
    queryKey: ["baja-rotacion", semanasMin, stMax, locationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_baja_rotacion", {
        p_semanas_minimas: Number(semanasMin),
        p_sell_through_max: stMax,
        p_location_id: locationId === "todas" ? null : locationId,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
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
      return true;
    });
  }, [rows, nivel, categoria]);

  const counts = useMemo(() => {
    const c = { atencion: 0, critico: 0, liquidar: 0 };
    rows.forEach((r) => {
      if (r.nivel in c) c[r.nivel as keyof typeof c]++;
    });
    return c;
  }, [rows]);

  const handleExport = () => {
    const data = filtered.map((r) => ({
      Producto: r.titulo,
      SKU: r.sku,
      Categoría: r.category,
      Color: r.color,
      Talla: r.talla,
      "Días en tienda": r.dias_en_tienda,
      "Semanas en tienda": r.semanas_en_tienda,
      "Unidades vendidas": r.unidades_vendidas,
      "Stock actual": r.stock_actual,
      "Inventario inicial": r.inventario_inicial,
      "Sell-through (%)": Number(r.sell_through).toFixed(2),
      "Velocidad semanal": Number(r.velocidad_semanal).toFixed(2),
      Nivel: NIVEL_LABELS[r.nivel]?.label ?? r.nivel,
      "Acción sugerida": ACCION[r.nivel] ?? "",
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
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-700">
                    <AlertTriangle className="h-4 w-4" /> 🟡 Atención
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{counts.atencion}</div>
                  <p className="text-xs text-muted-foreground mt-1">ST &lt; 30%, 4–8 sem</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" /> 🔴 Crítico
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{counts.critico}</div>
                  <p className="text-xs text-muted-foreground mt-1">ST &lt; 15%, +8 sem</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2 text-neutral-700">
                    <CircleOff className="h-4 w-4" /> ⚫ Liquidar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold">{counts.liquidar}</div>
                  <p className="text-xs text-muted-foreground mt-1">ST &lt; 10%, +12 sem</p>
                </CardContent>
              </Card>
            </div>

            {/* Filtros */}
            <Card>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                          <TableHead>Producto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead>Talla</TableHead>
                          <TableHead className="text-right">Días</TableHead>
                          <TableHead className="text-right">U. vend.</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Sell-through</TableHead>
                          <TableHead className="text-right">Vel/sem</TableHead>
                          <TableHead>Nivel</TableHead>
                          <TableHead>Acción sugerida</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((r) => {
                          const niv = NIVEL_LABELS[r.nivel];
                          return (
                            <TableRow key={r.variant_id}>
                              <TableCell>
                                <div className="font-medium text-sm">{r.titulo}</div>
                                <div className="text-xs text-muted-foreground">{r.sku}</div>
                              </TableCell>
                              <TableCell className="text-xs">{r.category}</TableCell>
                              <TableCell className="text-xs">{r.color}</TableCell>
                              <TableCell className="text-xs">{r.talla}</TableCell>
                              <TableCell className="text-right text-xs">{r.dias_en_tienda}</TableCell>
                              <TableCell className="text-right text-xs">{r.unidades_vendidas}</TableCell>
                              <TableCell className="text-right text-xs">{r.stock_actual}</TableCell>
                              <TableCell className="text-right">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stBadge(r.sell_through)}`}>
                                  {pct(r.sell_through)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {Number(r.velocidad_semanal).toFixed(2)}
                              </TableCell>
                              <TableCell>
                                {niv ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${niv.className}`}>
                                    {niv.emoji} {niv.label}
                                  </span>
                                ) : (
                                  <Badge variant="outline">{r.nivel}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {ACCION[r.nivel] ?? "—"}
                              </TableCell>
                            </TableRow>
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
