import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Download, Sparkles, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToXLS } from "@/lib/xls-export";

type Location = { location_id: string; name: string; tipo_tienda?: string | null };

type RotRow = {
  product_id: string;
  titulo: string;
  category: string;
  color: string;
  precio_actual: number;
  precio_original: number;
  unidades_vendidas: number;
  stock_actual: number;
  velocidad_semanal: number;
  semanas_en_tienda: number;
};

type Bundle = {
  id: string;
  category: string;
  items: (RotRow & { image_url?: string })[];
  wosProm: number;
  precioBase: number;
  descuento: number;
  precioFinal: number;
};

const EXCLUIR = ["BOLSA", "BOLSAS", "BOLSOS", "INSUMOS", "INSUMO", "EMPAQUE", "EMPAQUES"];

function fmtCOP(n: number) {
  return `$ ${(Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function wosOf(r: RotRow): number {
  const v = Number(r.velocidad_semanal) || 0;
  const s = Number(r.stock_actual) || 0;
  if (v <= 0) return s > 0 ? 999 : 0;
  return s / v;
}

/** Descuento dinámico por WOS promedio del bundle. */
function descuentoPorWos(wos: number): number {
  if (wos >= 30) return 35;
  if (wos >= 20) return 25;
  if (wos >= 16) return 20;
  return 15; // 12-16
}

/** Combinaciones sin repetición. */
function* combos<T>(arr: T[], k: number): Generator<T[]> {
  const n = arr.length;
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx.map((i) => arr[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === i + n - k) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

export default function BundleConstructionPage() {
  const [locationId, setLocationId] = useState<string>("");
  const [size, setSize] = useState<"2" | "3">(  "2");
  const [maxBundles, setMaxBundles] = useState<number>(30);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["locations-bundle"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("location_id,name,tipo_tienda")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Location[];
    },
  });

  const { data: rows = [], isLoading, error, isFetching } = useQuery<RotRow[]>({
    queryKey: ["bundle-rot", locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_baja_rotacion", {
        p_semanas_minimas: 4,
        p_sell_through_max: 100,
        p_location_id: locationId,
        p_incluir_rebajas: true,
      } as any);
      if (error) throw error;
      return (data ?? []) as RotRow[];
    },
  });

  const candidatos = useMemo(() => {
    return (rows ?? []).filter((r) => {
      const cat = (r.category || "").toUpperCase();
      if (EXCLUIR.some((x) => cat.includes(x))) return false;
      if ((Number(r.stock_actual) || 0) <= 0) return false;
      return wosOf(r) > 12; // baja rotación
    });
  }, [rows]);

  const productIds = useMemo(() => candidatos.map((r) => r.product_id), [candidatos]);
  const { data: imagesMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["bundle-imgs", productIds.length, productIds.slice(0, 5).join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (let i = 0; i < productIds.length; i += 200) {
        const chunk = productIds.slice(i, i + 200);
        const { data } = await supabase
          .from("product_catalog")
          .select("product_id,image_url")
          .in("product_id", chunk);
        (data ?? []).forEach((r: any) => {
          if (r.product_id && r.image_url && !map[r.product_id]) map[r.product_id] = r.image_url;
        });
      }
      return map;
    },
  });

  const bundles: Bundle[] = useMemo(() => {
    const k = Number(size);
    const out: Bundle[] = [];
    // Agrupar por categoría
    const byCat = new Map<string, RotRow[]>();
    candidatos.forEach((r) => {
      const c = (r.category || "OTROS").toUpperCase();
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(r);
    });
    // Ordenar por WOS desc dentro de la categoría (priorizar productos más pesados)
    for (const [cat, arr] of byCat.entries()) {
      const sorted = [...arr].sort((a, b) => wosOf(b) - wosOf(a));
      // Estrategia greedy: emparejar en ventanas (rr, rr+1, ...) para diversificar productos
      // Además consideramos color distinto para evitar bundles de misma referencia repetida
      const used = new Set<string>();
      for (let i = 0; i < sorted.length && out.length < maxBundles; i++) {
        if (used.has(sorted[i].product_id)) continue;
        const grupo: RotRow[] = [sorted[i]];
        used.add(sorted[i].product_id);
        for (let j = i + 1; j < sorted.length && grupo.length < k; j++) {
          if (used.has(sorted[j].product_id)) continue;
          // evitar duplicados de mismo product_id/color exacto
          if (grupo.some((g) => g.product_id === sorted[j].product_id)) continue;
          grupo.push(sorted[j]);
          used.add(sorted[j].product_id);
        }
        if (grupo.length !== k) continue;
        const wosProm = grupo.reduce((a, b) => a + wosOf(b), 0) / grupo.length;
        const precioBase = grupo.reduce((a, b) => a + (Number(b.precio_original) || Number(b.precio_actual) || 0), 0);
        const desc = descuentoPorWos(wosProm);
        const precioFinal = Math.round((precioBase * (1 - desc / 100)) / 100) * 100;
        out.push({
          id: `${cat}-${out.length}`,
          category: cat,
          items: grupo.map((g) => ({ ...g, image_url: imagesMap[g.product_id] })),
          wosProm,
          precioBase,
          descuento: desc,
          precioFinal,
        });
      }
    }
    return out.sort((a, b) => b.wosProm - a.wosProm);
  }, [candidatos, size, imagesMap, maxBundles]);

  const totals = useMemo(() => {
    const unidades = bundles.reduce((a, b) => a + b.items.length, 0);
    const ahorro = bundles.reduce((a, b) => a + (b.precioBase - b.precioFinal), 0);
    const valorFinal = bundles.reduce((a, b) => a + b.precioFinal, 0);
    return { bundles: bundles.length, unidades, ahorro, valorFinal };
  }, [bundles]);

  const handleExport = () => {
    const rowsX = bundles.flatMap((b, idx) =>
      b.items.map((it, i) => ({
        Bundle: `#${idx + 1}`,
        Categoría: b.category,
        Posición: i + 1,
        Producto: it.titulo,
        "Product ID": it.product_id,
        Color: it.color,
        "Stock actual": it.stock_actual,
        "Velocidad semanal": Number(it.velocidad_semanal || 0).toFixed(2),
        "WOS": wosOf(it).toFixed(1),
        "Precio individual": Number(it.precio_original || it.precio_actual || 0),
        "WOS prom bundle": b.wosProm.toFixed(1),
        "Precio base bundle": b.precioBase,
        "% Descuento": b.descuento,
        "Precio final bundle": b.precioFinal,
      })),
    );
    exportToXLS(rowsX, `bundles_${locationId}`);
  };

  const selectedLoc = locations.find((l) => l.location_id === locationId);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Bundle Construction
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  Combos de baja rotación (WOS &gt; 12) por ubicación
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!bundles.length}>
              <Download className="h-4 w-4 mr-1" /> Exportar
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            {/* Controles */}
            <Card>
              <CardContent className="pt-6 flex flex-wrap items-end gap-4">
                <div className="min-w-[240px]">
                  <label className="text-xs text-muted-foreground mb-1 block">Ubicación</label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger className="w-[280px]">
                      <SelectValue placeholder="Selecciona una ubicación..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.location_id} value={l.location_id}>
                          {l.name} {l.tipo_tienda ? <span className="text-muted-foreground text-xs ml-1">({l.tipo_tienda})</span> : null}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Productos por bundle</label>
                  <Select value={size} onValueChange={(v) => setSize(v as "2" | "3")}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 productos</SelectItem>
                      <SelectItem value="3">3 productos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Máx. bundles</label>
                  <Select value={String(maxBundles)} onValueChange={(v) => setMaxBundles(Number(v))}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 30, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="ml-auto text-xs text-muted-foreground space-y-1">
                  <div>Excluye <b>BOLSAS</b> e <b>INSUMOS</b>.</div>
                  <div>Descuentos: WOS 12–16 → 15% · 16–20 → 20% · 20–30 → 25% · 30+ → 35%</div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            {locationId && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Bundles generados" value={String(totals.bundles)} icon={<Layers className="h-4 w-4" />} />
                <KpiCard label="Unidades involucradas" value={String(totals.unidades)} icon={<Package className="h-4 w-4" />} />
                <KpiCard label="Valor final combos" value={fmtCOP(totals.valorFinal)} />
                <KpiCard label="Ahorro total ofrecido" value={fmtCOP(totals.ahorro)} />
              </div>
            )}

            {/* Contenido */}
            {!locationId && (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Selecciona una ubicación para generar bundles.
                </CardContent>
              </Card>
            )}

            {locationId && (isLoading || isFetching) && (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Analizando stock y rotación…</CardContent></Card>
            )}

            {error && (
              <Card><CardContent className="py-6 text-sm text-destructive">Error: {(error as Error).message}</CardContent></Card>
            )}

            {locationId && !isLoading && bundles.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay suficientes referencias de baja rotación en esta ubicación para armar bundles.
                </CardContent>
              </Card>
            )}

            {bundles.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {bundles.map((b, idx) => (
                  <Card key={b.id} className="overflow-hidden">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">Bundle #{idx + 1}</CardTitle>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{b.category}</div>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-primary/20">
                        -{b.descuento}%
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {b.items.map((it) => (
                          <div key={it.product_id} className="text-center">
                            <div className="aspect-square bg-muted rounded overflow-hidden flex items-center justify-center">
                              {it.image_url ? (
                                <img src={it.image_url} alt={it.titulo} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <Package className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <div className="text-[10px] mt-1 truncate" title={it.titulo}>{it.titulo}</div>
                            <div className="text-[9px] text-muted-foreground">
                              WOS {wosOf(it).toFixed(0)} · stk {it.stock_actual}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-muted-foreground">
                          WOS prom <b className="text-foreground">{b.wosProm.toFixed(1)}</b>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] line-through text-muted-foreground">{fmtCOP(b.precioBase)}</div>
                          <div className="text-sm font-semibold text-primary">{fmtCOP(b.precioFinal)}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-lg font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
