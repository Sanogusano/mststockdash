import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const DIAS = 120;

const NOTA_PIE =
  "Las unidades recibidas provienen de los traslados registrados en NetSuite desde agosto de 2025. " +
  "Las colecciones anteriores aparecen con muestra insuficiente. La evacuación se mide en los 120 días " +
  "siguientes a la llegada de cada producto a cada tienda.";

/* ---------- tipos ---------- */

interface ResumenRow {
  coleccion: string | null;
  productos: number | null;
  dias_promedio: number | null;
  en_ventana: number | null;
  uds_recibidas: number | null;
  uds_vendidas: number | null;
  stock_actual: number | null;
  pct_evacuado: number | null;
  pct_en_ventana: number | null;
  uds_fuera_ventana: number | null;
  uds_otros_canales: number | null;
  stock_outlet: number | null;
  stock_bodega: number | null;
  uds_venta_total: number | null;
  tiendas_alcanzadas: number | null;
  n_en_curso: number | null;
  n_bien: number | null;
  n_mal_repartido: number | null;
  n_falto: number | null;
  n_sobreproducido: number | null;
  n_lento: number | null;
  n_sin_muestra: number | null;
  diagnostico_dominante: string | null;
}

interface CoberturaRow {
  nivel: string | null;
  coleccion: string | null;
  product_id: string | null;
  producto: string | null;
  foto: string | null;
  linea: string | null;
  location_id: string | null;
  tienda: string | null;
  tipo_tienda: string | null;
  fecha_llegada: string | null;
  dias_desde_llegada: number | null;
  uds_recibidas: number | null;
  uds_vendidas: number | null;
  stock_actual: number | null;
  pct_evacuado: number | null;
  dias_ultima_venta: number | null;
  en_ventana: boolean | null;
  pct_proyectado: number | null;
  estado: string | null;
  tiendas_total: number | null;
  tiendas_quiebre: number | null;
  tiendas_sano: number | null;
  tiendas_regular: number | null;
  tiendas_lento: number | null;
  tiendas_estancado: number | null;
  diagnostico: string | null;
}

interface TiendaRow {
  location_id: string;
  tienda: string | null;
  tipo_tienda: string | null;
  productos: number | null;
  uds_recibidas: number | null;
  uds_vendidas: number | null;
  stock_actual: number | null;
  pct_evacuado: number | null;
  n_quiebre: number | null;
  n_sano: number | null;
  n_regular: number | null;
  n_lento: number | null;
  n_estancado: number | null;
  pct_quiebre: number | null;
  pct_estancado: number | null;
  perfil: string | null;
}

/* ---------- helpers ---------- */

const nf = new Intl.NumberFormat("es-CO");
const num = (v: number | null | undefined) => nf.format(Math.round(Number(v ?? 0)));
const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toFixed(1).replace(".", ",")}%`;
const fecha = (v: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Clase de color por palabra clave del diagnóstico / estado / perfil. */
function toneOf(text: string | null | undefined) {
  const t = (text ?? "").toUpperCase();
  if (t.includes("QUIEBRE") || t.includes("FALTÓ") || t.includes("FALTO") || t.includes("SUBIR")) return "rose";
  if (t.includes("MAL REPARTIDO")) return "orange";
  if (t.includes("BIEN") || t.includes("SANO") || t.includes("CORRECTA")) return "emerald";
  if (t.includes("SOBREPRODU") || t.includes("SE PRODUJO") || t.includes("BAJAR")) return "orange";
  if (t.includes("ESTANCADO") || t.includes("INSUFICIENTE")) return "slate";
  if (t.includes("LENT")) return "amber";
  if (t.includes("REGULAR") || t.includes("REVISAR")) return "amber";
  return "sky";
}

const TONE_CLS: Record<string, string> = {
  rose: "bg-rose-100 text-rose-700 border-rose-200",
  orange: "bg-orange-100 text-orange-700 border-orange-200",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  emerald: "bg-emerald-100 text-emerald-700 border-emerald-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
  sky: "bg-sky-100 text-sky-700 border-sky-200",
};

function Badge({ label }: { label: string | null | undefined }) {
  if (!label) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        TONE_CLS[toneOf(label)],
      )}
    >
      {label}
    </span>
  );
}

interface Seg { label: string; value: number; color: string }

function StackedBar({ segments, className }: { segments: Seg[]; className?: string }) {
  const total = segments.reduce((a, s) => a + (s.value || 0), 0);
  if (total <= 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <div className={cn("flex h-2.5 w-full min-w-[120px] overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((s) =>
        s.value > 0 ? (
          <div
            key={s.label}
            title={`${s.label}: ${num(s.value)}`}
            style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
          />
        ) : null,
      )}
    </div>
  );
}

const C = {
  quiebre: "#dc2626",
  sano: "#16a34a",
  regular: "#f59e0b",
  lento: "#f97316",
  estancado: "#94a3b8",
  enCurso: "#0ea5e9",
  bien: "#16a34a",
  mal: "#f97316",
  falto: "#dc2626",
  sobre: "#a855f7",
  sinMuestra: "#cbd5e1",
};

const distSegments = (r: CoberturaRow): Seg[] => [
  { label: "Quiebre", value: r.tiendas_quiebre ?? 0, color: C.quiebre },
  { label: "Sano", value: r.tiendas_sano ?? 0, color: C.sano },
  { label: "Regular", value: r.tiendas_regular ?? 0, color: C.regular },
  { label: "Lento", value: r.tiendas_lento ?? 0, color: C.lento },
  { label: "Estancado", value: r.tiendas_estancado ?? 0, color: C.estancado },
];

const ORDEN_ESTADO = ["QUIEBRE", "SANO", "REGULAR", "LENTO", "ESTANCADO"];
const rankEstado = (e: string | null) => {
  const t = (e ?? "").toUpperCase();
  const i = ORDEN_ESTADO.findIndex((k) => t.includes(k));
  return i === -1 ? 99 : i;
};

/* ---------- página ---------- */

export default function CoberturaDistribucionPage() {
  const [coleccion, setColeccion] = useState<string | null>(null);
  const [linea, setLinea] = useState("all");
  const [diagnostico, setDiagnostico] = useState("all");
  const [productId, setProductId] = useState<string | null>(null);

  const resumenQ = useQuery({
    queryKey: ["cobertura_resumen", DIAS],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_cobertura_resumen", { p_dias_ventana: DIAS });
      if (error) throw error;
      return (data ?? []) as unknown as ResumenRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const productosQ = useQuery({
    queryKey: ["cobertura_productos", coleccion, DIAS],
    enabled: !!coleccion,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_cobertura_coleccion", {
        p_coleccion: coleccion,
        p_linea: null,
        p_product_id: null,
        p_dias_ventana: DIAS,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CoberturaRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const tiendasQ = useQuery({
    queryKey: ["cobertura_tiendas", coleccion, linea, DIAS],
    enabled: !!coleccion,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_cobertura_tiendas", {
        p_coleccion: coleccion,
        p_linea: linea === "all" ? null : linea,
        p_dias_ventana: DIAS,
      });
      if (error) throw error;
      return (data ?? []) as unknown as TiendaRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const detalleQ = useQuery({
    queryKey: ["cobertura_detalle", productId, DIAS],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_cobertura_coleccion", {
        p_coleccion: null,
        p_linea: null,
        p_product_id: productId,
        p_dias_ventana: DIAS,
      });
      if (error) throw error;
      return (data ?? []) as unknown as CoberturaRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const productos = useMemo(
    () => (productosQ.data ?? []).filter((r) => (r.nivel ?? "producto") === "producto"),
    [productosQ.data],
  );

  const lineas = useMemo(
    () => Array.from(new Set(productos.map((r) => r.linea).filter((v): v is string => !!v))).sort(),
    [productos],
  );
  const diagnosticos = useMemo(
    () => Array.from(new Set(productos.map((r) => r.diagnostico).filter((v): v is string => !!v))).sort(),
    [productos],
  );

  const productosFiltrados = useMemo(
    () =>
      productos
        .filter((r) => linea === "all" || r.linea === linea)
        .filter((r) => diagnostico === "all" || r.diagnostico === diagnostico),
    [productos, linea, diagnostico],
  );

  const detalleTiendas = useMemo(() => {
    const rows = (detalleQ.data ?? []).filter((r) => !!r.location_id);
    return [...rows].sort(
      (a, b) => rankEstado(a.estado) - rankEstado(b.estado) || (b.uds_recibidas ?? 0) - (a.uds_recibidas ?? 0),
    );
  }, [detalleQ.data]);

  const cabezaDetalle = useMemo(() => (detalleQ.data ?? []).find((r) => !r.location_id) ?? null, [detalleQ.data]);

  const desbalance = useMemo(() => {
    if (detalleTiendas.length === 0) return null;
    const quiebre = detalleTiendas.filter((r) => (r.estado ?? "").toUpperCase().includes("QUIEBRE"));
    const parado = detalleTiendas.filter((r) => (r.estado ?? "").toUpperCase().includes("ESTANCADO"));
    if (quiebre.length === 0 || parado.length === 0) return null;
    const peor = [...parado].sort((a, b) => (b.stock_actual ?? 0) - (a.stock_actual ?? 0))[0];
    const mejor = [...quiebre].sort((a, b) => (b.uds_vendidas ?? 0) - (a.uds_vendidas ?? 0))[0];
    return `Se agotó en ${quiebre.length} tienda${quiebre.length === 1 ? "" : "s"} y quedó parado en ${parado.length}. ` +
      `${peor.tienda} recibió ${num(peor.uds_recibidas)} y vendió ${num(peor.uds_vendidas)}; ` +
      `${mejor.tienda} recibió ${num(mejor.uds_recibidas)} y vendió ${num(mejor.uds_vendidas)}.`;
  }, [detalleTiendas]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            {coleccion && (
              <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => { setColeccion(null); setLinea("all"); setDiagnostico("all"); }}>
                <ChevronLeft className="h-4 w-4" /> Colecciones
              </Button>
            )}
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">
                Cobertura de Distribución{coleccion ? ` · ${coleccion}` : ""}
              </h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                ¿El producto llegó bien repartido o se agotó en unas tiendas mientras sobraba en otras?
              </p>
            </div>
          </header>

          <div className="flex-1 p-4 sm:p-6 space-y-5">
            {!coleccion ? (
              <NivelColecciones
                loading={resumenQ.isLoading}
                error={resumenQ.error as Error | null}
                rows={resumenQ.data ?? []}
                onPick={setColeccion}
              />
            ) : (
              <Tabs defaultValue="productos">
                <TabsList>
                  <TabsTrigger value="productos">Productos</TabsTrigger>
                  <TabsTrigger value="tiendas">Desempeño por tienda</TabsTrigger>
                </TabsList>

                <TabsContent value="productos" className="space-y-4 pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Línea</p>
                      <Select value={linea} onValueChange={setLinea}>
                        <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas las líneas</SelectItem>
                          {lineas.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Diagnóstico</p>
                      <Select value={diagnostico} onValueChange={setDiagnostico}>
                        <SelectTrigger className="h-8 w-[280px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos los diagnósticos</SelectItem>
                          {diagnosticos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="pb-1.5 text-xs text-muted-foreground">
                      {num(productosFiltrados.length)} de {num(productos.length)} productos
                    </p>
                  </div>

                  {productosQ.isLoading ? (
                    <LoadingState />
                  ) : productosQ.error ? (
                    <ErrorBox error={productosQ.error as Error} />
                  ) : productosFiltrados.length === 0 ? (
                    <EmptyState message="No hay productos con estos filtros" />
                  ) : (
                    <Card>
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[64px]">Foto</TableHead>
                              <TableHead>Producto</TableHead>
                              <TableHead>Línea</TableHead>
                              <TableHead className="text-right">Recibidas</TableHead>
                              <TableHead className="text-right">Vendidas</TableHead>
                              <TableHead className="text-right">Stock</TableHead>
                              <TableHead className="text-right">% Evacuado</TableHead>
                              <TableHead className="min-w-[160px]">Distribución</TableHead>
                              <TableHead>Diagnóstico</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {productosFiltrados.map((r) => (
                              <TableRow
                                key={r.product_id ?? r.producto}
                                className="cursor-pointer"
                                onClick={() => setProductId(r.product_id)}
                              >
                                <TableCell>
                                  {r.foto ? (
                                    <ProductImageThumb
                                      src={r.foto}
                                      alt={r.producto ?? ""}
                                      productId={r.product_id}
                                      title={r.producto}
                                      className="h-11 w-11 rounded-md object-cover border border-border"
                                    />
                                  ) : (
                                    <div className="h-11 w-11 rounded-md bg-muted" />
                                  )}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-foreground max-w-[240px]">
                                  {r.producto ?? "—"}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">{r.linea ?? "—"}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums">{num(r.uds_recibidas)}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums">{num(r.uds_vendidas)}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums">{num(r.stock_actual)}</TableCell>
                                <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                                  <span className="font-semibold">{pct(r.pct_evacuado)}</span>
                                  {r.en_ventana && r.pct_proyectado != null && (
                                    <span className="text-muted-foreground"> · proyecta {pct(r.pct_proyectado)}</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <StackedBar segments={distSegments(r)} />
                                  <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                                    {num(r.tiendas_total)} tiendas
                                  </p>
                                </TableCell>
                                <TableCell><Badge label={r.diagnostico} /></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="tiendas" className="pt-4">
                  {tiendasQ.isLoading ? (
                    <LoadingState />
                  ) : tiendasQ.error ? (
                    <ErrorBox error={tiendasQ.error as Error} />
                  ) : (tiendasQ.data ?? []).length === 0 ? (
                    <EmptyState message="Sin datos de tiendas para esta colección" />
                  ) : (
                    <Card>
                      <CardContent className="p-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tienda</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead className="text-right">Productos</TableHead>
                              <TableHead className="text-right">Recibidas</TableHead>
                              <TableHead className="text-right">Vendidas</TableHead>
                              <TableHead className="text-right">% Evacuado</TableHead>
                              <TableHead className="text-right">% Quiebre</TableHead>
                              <TableHead className="text-right">% Estancado</TableHead>
                              <TableHead>Perfil</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...(tiendasQ.data ?? [])]
                              .sort((a, b) => (b.pct_evacuado ?? 0) - (a.pct_evacuado ?? 0))
                              .map((t) => (
                                <TableRow key={t.location_id}>
                                  <TableCell className="text-xs font-medium">{t.tienda ?? t.location_id}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{t.tipo_tienda ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{num(t.productos)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{num(t.uds_recibidas)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{num(t.uds_vendidas)}</TableCell>
                                  <TableCell className="text-right text-xs font-semibold tabular-nums">{pct(t.pct_evacuado)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{pct(t.pct_quiebre)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{pct(t.pct_estancado)}</TableCell>
                                  <TableCell><Badge label={t.perfil} /></TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            )}

            <p className="text-[11px] leading-relaxed text-muted-foreground">{NOTA_PIE}</p>
          </div>
        </main>
      </div>

      <Sheet open={!!productId} onOpenChange={(o) => !o && setProductId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">
              {cabezaDetalle?.producto ?? detalleTiendas[0]?.producto ?? "Detalle por tienda"}
            </SheetTitle>
          </SheetHeader>

          {detalleQ.isLoading ? (
            <LoadingState />
          ) : detalleQ.error ? (
            <ErrorBox error={detalleQ.error as Error} />
          ) : (
            <div className="space-y-4 pt-4">
              {desbalance && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {desbalance}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Llegada</TableHead>
                    <TableHead className="text-right">Rec.</TableHead>
                    <TableHead className="text-right">Vend.</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">%</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalleTiendas.map((r) => (
                    <TableRow key={r.location_id}>
                      <TableCell className="text-xs font-medium">{r.tienda ?? r.location_id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.tipo_tienda ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fecha(r.fecha_llegada)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{num(r.uds_recibidas)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{num(r.uds_vendidas)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{num(r.stock_actual)}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">{pct(r.pct_evacuado)}</TableCell>
                      <TableCell><Badge label={r.estado} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{NOTA_PIE}</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

/* ---------- nivel 1 ---------- */

function NivelColecciones({
  loading, error, rows, onPick,
}: {
  loading: boolean;
  error: Error | null;
  rows: ResumenRow[];
  onPick: (c: string) => void;
}) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorBox error={error} />;
  if (rows.length === 0) return <EmptyState message="Sin colecciones con traslados registrados" />;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((r) => (
        <Card
          key={r.coleccion ?? "—"}
          className="cursor-pointer transition hover:border-primary/40 hover:shadow-sm"
          onClick={() => r.coleccion && onPick(r.coleccion)}
        >
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.coleccion ?? "Sin colección"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {num(r.dias_promedio)} días desde la llegada · {num(r.en_ventana)} de {num(r.productos)} en ventana
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{pct(r.pct_evacuado)}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">evacuado</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-muted/50 py-1.5">
                <p className="text-xs font-semibold tabular-nums text-foreground">{num(r.uds_recibidas)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Despachadas<br/>a tiendas</p>
              </div>
              <div className="rounded-md bg-muted/50 py-1.5">
                <p className="text-xs font-semibold tabular-nums text-foreground">{num(r.uds_vendidas)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Vendidas<br/>en ventana</p>
                <p className="text-[9px] text-muted-foreground/70 leading-tight">primeros 120 días<br/>en cada tienda</p>
              </div>
              <div className="rounded-md bg-muted/50 py-1.5">
                <p className="text-xs font-semibold tabular-nums text-foreground">{num(r.stock_actual)}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Stock actual<br/>en tiendas</p>
              </div>
            </div>

            <StackedBar
              segments={[
                { label: "En curso", value: r.n_en_curso ?? 0, color: C.enCurso },
                { label: "Bien distribuido", value: r.n_bien ?? 0, color: C.bien },
                { label: "Mal repartido", value: r.n_mal_repartido ?? 0, color: C.mal },
                { label: "Faltó producto", value: r.n_falto ?? 0, color: C.falto },
                { label: "Sobreproducido", value: r.n_sobreproducido ?? 0, color: C.sobre },
                { label: "Rotación lenta", value: r.n_lento ?? 0, color: C.regular },
                { label: "Muestra insuficiente", value: r.n_sin_muestra ?? 0, color: C.sinMuestra },
              ]}
            />

            <div className="flex items-start gap-2">
              <Badge label={r.diagnostico_dominante} />
            </div>
            <p className="text-[10px] text-muted-foreground/80 leading-snug pt-1 border-t border-border/40">
              No incluye venta posterior a la ventana ni de outlet y online.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorBox({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error.message}
    </div>
  );
}
