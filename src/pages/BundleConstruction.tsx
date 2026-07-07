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

type SizeStock = Record<string, number>; // size -> qty

type BundleItem = RotRow & {
  image_url?: string;
  sizeStock: SizeStock;
};

type Bundle = {
  id: string;
  category: string;
  items: BundleItem[];
  wosProm: number;
  precioBase: number;
  descuento: number;
  precioFinal: number;
  sharedSizes: { size: string; capacity: number }[]; // sizes en las que TODAS las prendas tienen stock
  totalPairable: number; // suma de capacidad por talla compartida
};

const EXCLUIR = ["BOLSA", "BOLSAS", "BOLSOS", "INSUMOS", "INSUMO", "EMPAQUE", "EMPAQUES"];

// Orden canónico de tallas para presentación
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "UNICA", "ÚNICA"];
function sizeSortKey(s: string): number {
  const idx = SIZE_ORDER.indexOf(s.toUpperCase());
  if (idx >= 0) return idx;
  const n = Number(s);
  if (!Number.isNaN(n)) return 1000 + n; // numéricas (36, 38...) al final ordenadas
  return 9999;
}

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
  return 15;
}

export default function BundleConstructionPage() {
  const [locationId, setLocationId] = useState<string>("");
  const [size, setSize] = useState<"2" | "3">("2");
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
      return wosOf(r) > 12;
    });
  }, [rows]);

  const productIds = useMemo(() => candidatos.map((r) => r.product_id), [candidatos]);

  // Catálogo (imagen + variantes con talla)
  const { data: catalog = { imgs: {}, variants: [] as { product_id: string; variant_id: string; size: string }[] } } =
    useQuery<{ imgs: Record<string, string>; variants: { product_id: string; variant_id: string; size: string }[] }>({
      queryKey: ["bundle-catalog", productIds.length, productIds.slice(0, 5).join(",")],
      enabled: productIds.length > 0,
      queryFn: async () => {
        const imgs: Record<string, string> = {};
        const variants: { product_id: string; variant_id: string; size: string }[] = [];
        for (let i = 0; i < productIds.length; i += 200) {
          const chunk = productIds.slice(i, i + 200);
          const { data } = await supabase
            .from("product_catalog")
            .select("product_id,image_url,variant_id,variant_name")
            .in("product_id", chunk);
          (data ?? []).forEach((r: any) => {
            if (r.product_id && r.image_url && !imgs[r.product_id]) imgs[r.product_id] = r.image_url;
            if (r.product_id && r.variant_id && r.variant_name) {
              variants.push({ product_id: r.product_id, variant_id: r.variant_id, size: String(r.variant_name) });
            }
          });
        }
        return { imgs, variants };
      },
    });

  // Snapshot más reciente para la ubicación + stock por variant_id
  const variantIds = useMemo(() => catalog.variants.map((v) => v.variant_id), [catalog.variants]);

  const { data: variantStock = {} as Record<string, number> } = useQuery<Record<string, number>>({
    queryKey: ["bundle-variant-stock", locationId, variantIds.length],
    enabled: !!locationId && variantIds.length > 0,
    queryFn: async () => {
      const { data: latest } = await supabase
        .from("inventory_snapshot")
        .select("snapshot_date")
        .eq("location_id", locationId)
        .order("snapshot_date", { ascending: false })
        .limit(1);
      const latestDate = latest?.[0]?.snapshot_date;
      if (!latestDate) return {};
      const stockMap: Record<string, number> = {};
      const uniq = [...new Set(variantIds)];
      for (let i = 0; i < uniq.length; i += 300) {
        const chunk = uniq.slice(i, i + 300);
        const { data } = await supabase
          .from("inventory_snapshot")
          .select("variant_id,available")
          .eq("snapshot_date", latestDate)
          .eq("location_id", locationId)
          .in("variant_id", chunk);
        (data ?? []).forEach((r: any) => {
          const q = Number(r.available ?? 0);
          if (q > 0 && r.variant_id) stockMap[r.variant_id] = (stockMap[r.variant_id] ?? 0) + q;
        });
      }
      return stockMap;
    },
  });

  // Stock por talla, por producto
  const sizeStockByProduct = useMemo(() => {
    const m = new Map<string, SizeStock>();
    for (const v of catalog.variants) {
      const qty = variantStock[v.variant_id] ?? 0;
      if (qty <= 0) continue;
      const bag = m.get(v.product_id) ?? {};
      bag[v.size] = (bag[v.size] ?? 0) + qty;
      m.set(v.product_id, bag);
    }
    return m;
  }, [catalog.variants, variantStock]);

  const bundles: Bundle[] = useMemo(() => {
    const k = Number(size);
    const out: Bundle[] = [];
    if (!sizeStockByProduct.size) return out;

    // Enriquecer candidatos con stock por talla
    const enriched: BundleItem[] = candidatos
      .map((r) => ({
        ...r,
        image_url: catalog.imgs[r.product_id],
        sizeStock: sizeStockByProduct.get(r.product_id) ?? {},
      }))
      .filter((r) => Object.keys(r.sizeStock).length > 0);

    // Agrupar por categoría
    const byCat = new Map<string, BundleItem[]>();
    enriched.forEach((r) => {
      const c = (r.category || "OTROS").toUpperCase();
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c)!.push(r);
    });

    for (const [cat, arr] of byCat.entries()) {
      // Ordenar por WOS desc (empujar los más pesados primero)
      const sorted = [...arr].sort((a, b) => wosOf(b) - wosOf(a));
      const used = new Set<string>();

      for (let i = 0; i < sorted.length && out.length < maxBundles; i++) {
        if (used.has(sorted[i].product_id)) continue;
        const anchor = sorted[i];
        const grupo: BundleItem[] = [anchor];
        const anchorSizes = new Set(Object.keys(anchor.sizeStock));

        // Buscar compañeros que compartan al menos 1 talla con el ancla
        for (let j = i + 1; j < sorted.length && grupo.length < k; j++) {
          if (used.has(sorted[j].product_id)) continue;
          if (grupo.some((g) => g.product_id === sorted[j].product_id)) continue;
          const cand = sorted[j];
          const shared = Object.keys(cand.sizeStock).filter((s) => {
            // debe compartir con TODOS los ya incluidos
            return grupo.every((g) => (g.sizeStock[s] ?? 0) > 0);
          });
          if (shared.length === 0) continue;
          grupo.push(cand);
        }

        if (grupo.length !== k) continue;

        // Tallas compartidas por TODO el bundle
        const sharedSizes = Object.keys(grupo[0].sizeStock)
          .filter((s) => grupo.every((g) => (g.sizeStock[s] ?? 0) > 0))
          .map((s) => ({
            size: s,
            capacity: Math.min(...grupo.map((g) => g.sizeStock[s] ?? 0)),
          }))
          .sort((a, b) => sizeSortKey(a.size) - sizeSortKey(b.size));

        if (sharedSizes.length === 0) continue;

        grupo.forEach((g) => used.add(g.product_id));

        const wosProm = grupo.reduce((a, b) => a + wosOf(b), 0) / grupo.length;
        const precioBase = grupo.reduce(
          (a, b) => a + (Number(b.precio_original) || Number(b.precio_actual) || 0),
          0,
        );
        const desc = descuentoPorWos(wosProm);
        const precioFinal = Math.round((precioBase * (1 - desc / 100)) / 100) * 100;
        const totalPairable = sharedSizes.reduce((a, b) => a + b.capacity, 0);

        out.push({
          id: `${cat}-${out.length}`,
          category: cat,
          items: grupo,
          wosProm,
          precioBase,
          descuento: desc,
          precioFinal,
          sharedSizes,
          totalPairable,
        });
      }
    }
    // Priorizar bundles con más unidades vendibles (mayor cobertura de tallas)
    return out.sort((a, b) => b.totalPairable - a.totalPairable || b.wosProm - a.wosProm);
  }, [candidatos, size, catalog.imgs, sizeStockByProduct, maxBundles]);

  const totals = useMemo(() => {
    const pairable = bundles.reduce((a, b) => a + b.totalPairable, 0);
    const ahorro = bundles.reduce((a, b) => a + (b.precioBase - b.precioFinal) * b.totalPairable, 0);
    const valorFinal = bundles.reduce((a, b) => a + b.precioFinal * b.totalPairable, 0);
    return { bundles: bundles.length, pairable, ahorro, valorFinal };
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
        WOS: wosOf(it).toFixed(1),
        "Precio individual": Number(it.precio_original || it.precio_actual || 0),
        "WOS prom bundle": b.wosProm.toFixed(1),
        "Precio base bundle": b.precioBase,
        "% Descuento": b.descuento,
        "Precio final bundle": b.precioFinal,
        "Tallas compartidas": b.sharedSizes.map((s) => `${s.size}:${s.capacity}`).join(" | "),
        "Bundles vendibles": b.totalPairable,
      })),
    );
    exportToXLS(rowsX, `bundles_${locationId}`);
  };

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
                  Combos de baja rotación (WOS &gt; 12) con tallas disponibles cruzadas
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleExport} disabled={!bundles.length}>
              <Download className="h-4 w-4 mr-1" /> Exportar
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
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
                          {l.name}{" "}
                          {l.tipo_tienda ? (
                            <span className="text-muted-foreground text-xs ml-1">({l.tipo_tienda})</span>
                          ) : null}
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
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="ml-auto text-xs text-muted-foreground space-y-1 max-w-xs">
                  <div>Excluye <b>BOLSAS</b> e <b>INSUMOS</b>.</div>
                  <div>Solo se muestran bundles donde <b>todos</b> los productos comparten al menos una talla con stock.</div>
                  <div>Descuentos: 12–16 → 15% · 16–20 → 20% · 20–30 → 25% · 30+ → 35%</div>
                </div>
              </CardContent>
            </Card>

            {locationId && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard label="Bundles generados" value={String(totals.bundles)} icon={<Layers className="h-4 w-4" />} />
                <KpiCard label="Combos vendibles" value={String(totals.pairable)} icon={<Package className="h-4 w-4" />} />
                <KpiCard label="Valor final potencial" value={fmtCOP(totals.valorFinal)} />
                <KpiCard label="Ahorro total ofrecido" value={fmtCOP(totals.ahorro)} />
              </div>
            )}

            {!locationId && (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Selecciona una ubicación para generar bundles.
                </CardContent>
              </Card>
            )}

            {locationId && (isLoading || isFetching) && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Analizando stock, tallas y rotación…
                </CardContent>
              </Card>
            )}

            {error && (
              <Card>
                <CardContent className="py-6 text-sm text-destructive">Error: {(error as Error).message}</CardContent>
              </Card>
            )}

            {locationId && !isLoading && bundles.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No hay referencias de baja rotación con tallas cruzables en esta ubicación.
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
                      <Badge className="bg-primary/10 text-primary border-primary/20">-{b.descuento}%</Badge>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {b.items.map((it) => (
                          <div key={it.product_id} className="text-center">
                            <div className="aspect-square bg-muted rounded overflow-hidden flex items-center justify-center">
                              {it.image_url ? (
                                <img
                                  src={it.image_url}
                                  alt={it.titulo}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <Package className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                            <div className="text-[10px] mt-1 truncate" title={it.titulo}>
                              {it.titulo}
                            </div>
                            <div className="text-[9px] text-muted-foreground">
                              WOS {wosOf(it).toFixed(0)} · stk {it.stock_actual}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Tallas compartidas */}
                      <div className="border-t pt-2">
                        <div className="text-[10px] text-muted-foreground mb-1">
                          Tallas disponibles en todos los productos:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {b.sharedSizes.map((s) => (
                            <Badge
                              key={s.size}
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-primary/30"
                              title={`${s.capacity} combos vendibles en talla ${s.size}`}
                            >
                              {s.size} · {s.capacity}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          Total combos vendibles: <b className="text-foreground">{b.totalPairable}</b>
                        </div>
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-lg font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
