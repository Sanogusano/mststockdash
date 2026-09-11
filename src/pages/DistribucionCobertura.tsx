import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronDown, ChevronRight, Download, FileText, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { exportarExcel, exportarPDF, nombreArchivo, type Celda } from "@/lib/distribucion-export";

/* ---------- tipos ---------- */

interface PerfilRow {
  location_id: string;
  tienda: string | null;
  tipo_tienda: string | null;
  skus_recibidos: number | null;
  skus_maduros: number | null;
  skus_agotados: number | null;
  skus_con_exceso: number | null;
  uds_recibidas: number | null;
  uds_vendidas: number | null;
  uds_sobrantes: number | null;
  stock_actual: number | null;
  sell_through: number | null;
  pct_agotados: number | null;
  pct_exceso: number | null;
  demanda_perdida: number | null;
  valor_perdido: number | null;
  valor_sobrante: number | null;
  indice_asignacion: number | null;
  perfil: string | null;
  recomendacion: string | null;
}

interface SobrestockRow {
  causa: string | null;
  product_id: string;
  producto: string | null;
  foto: string | null;
  coleccion: string | null;
  linea: string | null;
  dias_en_red: number | null;
  uds_recibidas: number | null;
  uds_vendidas: number | null;
  stock_actual: number | null;
  sell_through: number | null;
  tiendas_total: number | null;
  tiendas_agotadas: number | null;
  tiendas_con_exceso: number | null;
  demanda_perdida: number | null;
  uds_redistribuibles: number | null;
  tallas_total: number | null;
  tallas_sanas: number | null;
  talla_peor: string | null;
  st_talla_peor: number | null;
  accion: string | null;
  valor_en_juego: number | null;
}

interface OportunidadRow {
  product_id: string;
  producto: string | null;
  sku: string | null;
  talla: string | null;
  coleccion: string | null;
  linea: string | null;
  tienda_falto: string | null;
  dias_agotado: number | null;
  tienda_sobra: string | null;
  stock_disponible: number | null;
  uds_movibles: number | null;
  uds_perdidas: number | null;
  sell_through_origen: number | null;
  precio: number | null;
  valor_oportunidad: number | null;
}

/* ---------- helpers ---------- */

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : Math.round(Number(n)).toLocaleString("es-CO");
const fmtCOP = (n: number | null | undefined) =>
  n == null ? "—" : "$ " + Math.round(Number(n)).toLocaleString("es-CO");
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toFixed(1).replace(".", ",")}%`;

const PERFIL_CLS: Record<string, string> = {
  "SE QUEDA CORTA": "bg-rose-100 text-rose-700 border-rose-200",
  "LE SOBRA": "bg-amber-100 text-amber-700 border-amber-200",
  "MEZCLA EQUIVOCADA": "bg-purple-100 text-purple-700 border-purple-200",
  EQUILIBRADA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "SIN MADUREZ": "bg-slate-100 text-slate-600 border-slate-200",
};

const PERFILES = ["SE QUEDA CORTA", "LE SOBRA", "MEZCLA EQUIVOCADA", "EQUILIBRADA", "SIN MADUREZ"];

function PerfilBadge({ perfil }: { perfil: string | null }) {
  if (!perfil) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        PERFIL_CLS[perfil.toUpperCase()] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {perfil}
    </span>
  );
}

/** Barra doble: agotados hacia la izquierda (rojo), exceso hacia la derecha (gris). */
function BarraDoble({ agotados, exceso }: { agotados: number | null; exceso: number | null }) {
  const a = Math.min(Math.max(Number(agotados ?? 0), 0), 100);
  const e = Math.min(Math.max(Number(exceso ?? 0), 0), 100);
  return (
    <div className="min-w-[180px]">
      <div className="flex h-3 items-center">
        <div className="flex h-3 flex-1 justify-end overflow-hidden rounded-l-sm bg-muted/50">
          <div className="h-3 rounded-l-sm bg-rose-500" style={{ width: `${a}%` }} />
        </div>
        <div className="h-4 w-px bg-border" />
        <div className="flex h-3 flex-1 overflow-hidden rounded-r-sm bg-muted/50">
          <div className="h-3 rounded-r-sm bg-slate-400" style={{ width: `${e}%` }} />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums">
        <span className="text-rose-600">{fmtPct(agotados)} agotados</span>
        <span className="text-slate-500">{fmtPct(exceso)} exceso</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function ErrorBox({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {error.message}
    </div>
  );
}

const VENTANAS = [60, 90, 120, 180];

/* ---------- página ---------- */

export default function DistribucionCoberturaPage() {
  const [params, setParams] = useSearchParams();
  const coleccion = params.get("coleccion") ?? "all";
  const linea = params.get("linea") ?? "all";
  const ventana = Number(params.get("ventana") ?? 120);
  const tab = params.get("tab") ?? "perfil";

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const pColeccion = coleccion === "all" ? null : coleccion;
  const pLinea = linea === "all" ? null : linea;
  const subtitulo = `Colección: ${coleccion === "all" ? "todas" : coleccion} · Línea: ${
    linea === "all" ? "todas" : linea
  } · Ventana: ${ventana} días`;

  /* opciones de filtro (una sola consulta sin filtros) */
  const opcionesQ = useQuery({
    queryKey: ["distribucion_opciones", ventana],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_diagnostico_sobrestock", {
        p_coleccion: null, p_linea: null, p_dias_ventana: ventana,
      });
      if (error) throw error;
      const rows = (data ?? []) as unknown as SobrestockRow[];
      const uniq = (vals: (string | null)[]) =>
        Array.from(new Set(vals.filter((v): v is string => !!v))).sort();
      return {
        colecciones: uniq(rows.map((r) => r.coleccion)),
        lineas: uniq(rows.map((r) => r.linea)),
      };
    },
    staleTime: 10 * 60 * 1000,
  });

  const perfilQ = useQuery({
    queryKey: ["perfil_tienda_distribucion", pColeccion, pLinea, ventana],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_perfil_tienda_distribucion", {
        p_coleccion: pColeccion, p_linea: pLinea, p_dias_ventana: ventana,
      });
      if (error) throw error;
      return (data ?? []) as unknown as PerfilRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const sobrestockQ = useQuery({
    queryKey: ["diagnostico_sobrestock", pColeccion, pLinea, ventana],
    enabled: tab === "sobrestock",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_diagnostico_sobrestock", {
        p_coleccion: pColeccion, p_linea: pLinea, p_dias_ventana: ventana,
      });
      if (error) throw error;
      return (data ?? []) as unknown as SobrestockRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const oportunidadQ = useQuery({
    queryKey: ["oportunidad_redistribucion", pColeccion, ventana],
    enabled: tab === "oportunidades",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_oportunidad_redistribucion", {
        p_coleccion: pColeccion, p_dias_ventana: ventana,
      });
      if (error) throw error;
      return (data ?? []) as unknown as OportunidadRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  /* orden: SIN MADUREZ al final */
  const tiendas = useMemo(() => {
    const rows = perfilQ.data ?? [];
    const sinMadurez = (r: PerfilRow) => (r.perfil ?? "").toUpperCase() === "SIN MADUREZ";
    return [...rows].sort((a, b) => {
      if (sinMadurez(a) !== sinMadurez(b)) return sinMadurez(a) ? 1 : -1;
      return (b.demanda_perdida ?? 0) - (a.demanda_perdida ?? 0);
    });
  }, [perfilQ.data]);

  const kpis = useMemo(() => {
    const rows = perfilQ.data ?? [];
    const conteos: Record<string, number> = {};
    rows.forEach((r) => {
      const p = (r.perfil ?? "—").toUpperCase();
      conteos[p] = (conteos[p] ?? 0) + 1;
    });
    return {
      demandaUds: rows.reduce((a, r) => a + Number(r.demanda_perdida ?? 0), 0),
      demandaCOP: rows.reduce((a, r) => a + Number(r.valor_perdido ?? 0), 0),
      valorParado: rows.reduce((a, r) => a + Number(r.valor_sobrante ?? 0), 0),
      conteos,
    };
  }, [perfilQ.data]);

  /* agrupación por causa */
  const [causaAbierta, setCausaAbierta] = useState<string | null>(null);
  const causas = useMemo(() => {
    const map = new Map<string, { causa: string; items: SobrestockRow[]; valor: number }>();
    (sobrestockQ.data ?? []).forEach((r) => {
      const causa = r.causa ?? "SIN CAUSA";
      const g = map.get(causa) ?? { causa, items: [], valor: 0 };
      g.items.push(r);
      g.valor += Number(r.valor_en_juego ?? 0);
      map.set(causa, g);
    });
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  }, [sobrestockQ.data]);

  /* ---------- exportaciones ---------- */

  const PERFIL_HEAD = [
    "Tienda", "Tipo", "SKU maduros", "Sell-through", "% Agotados", "% Exceso",
    "Demanda perdida", "Valor perdido", "Valor parado", "Índice", "Perfil", "Recomendación",
  ];
  const perfilBody = (): Celda[][] =>
    tiendas.map((r) => [
      r.tienda ?? r.location_id, r.tipo_tienda ?? "-", fmtInt(r.skus_maduros),
      fmtPct(r.sell_through), fmtPct(r.pct_agotados), fmtPct(r.pct_exceso),
      fmtInt(r.demanda_perdida), fmtCOP(r.valor_perdido), fmtCOP(r.valor_sobrante),
      r.indice_asignacion == null ? "-" : String(r.indice_asignacion),
      r.perfil ?? "-", r.recomendacion ?? "-",
    ]);

  const SOBRE_HEAD = [
    "Causa", "Producto", "Colección", "Línea", "Recibidas", "Vendidas", "Stock",
    "Sell-through", "Tiendas agotadas", "Tiendas con exceso", "Demanda perdida",
    "Acción sugerida", "Valor en juego",
  ];
  const sobreBody = (): Celda[][] =>
    causas.flatMap((g) =>
      g.items.map((r) => [
        g.causa, r.producto ?? "-", r.coleccion ?? "-", r.linea ?? "-",
        fmtInt(r.uds_recibidas), fmtInt(r.uds_vendidas), fmtInt(r.stock_actual),
        fmtPct(r.sell_through), fmtInt(r.tiendas_agotadas), fmtInt(r.tiendas_con_exceso),
        fmtInt(r.demanda_perdida), r.accion ?? "-", fmtCOP(r.valor_en_juego),
      ]),
    );

  const OPO_HEAD = [
    "SKU", "Producto", "Talla", "Tienda donde faltó", "Días agotado",
    "Tienda donde sobra", "Stock disponible", "Unidades movibles", "Valor",
  ];
  const opoBody = (): Celda[][] =>
    (oportunidadQ.data ?? []).map((r) => [
      r.sku ?? "-", r.producto ?? "-", r.talla ?? "-", r.tienda_falto ?? "-",
      fmtInt(r.dias_agotado), r.tienda_sobra ?? "-", fmtInt(r.stock_disponible),
      fmtInt(r.uds_movibles), fmtCOP(r.valor_oportunidad),
    ]);

  const exportar = (
    tipo: "xls" | "pdf",
    titulo: string,
    head: string[],
    body: Celda[][],
    numericas: number[],
  ) => {
    const args = {
      titulo, subtitulo, head, body,
      archivo: nombreArchivo(`${titulo} Monastery`),
      numericas,
    };
    if (tipo === "pdf") void exportarPDF(args);
    else void exportarExcel(args);
  };

  const Exportaciones = ({
    titulo, head, body, numericas,
  }: { titulo: string; head: string[]; body: () => Celda[][]; numericas: number[] }) => (
    <div className="ml-auto flex gap-2">
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
        onClick={() => exportar("xls", titulo, head, body(), numericas)}>
        <Download className="h-3.5 w-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs"
        onClick={() => exportar("pdf", titulo, head, body(), numericas)}>
        <FileText className="h-3.5 w-3.5" /> PDF
      </Button>
    </div>
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4 sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div>
              <h1 className="font-display text-base font-semibold text-foreground sm:text-lg">
                Distribución y Cobertura
              </h1>
              <p className="text-[10px] text-muted-foreground sm:text-xs">
                ¿Qué tiendas se quedan sin producto y cuáles lo acumulan? Para calibrar la próxima siembra.
              </p>
            </div>
          </header>

          <div className="flex-1 space-y-5 p-4 sm:p-6">
            {/* filtros comunes */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Colección</p>
                <Select value={coleccion} onValueChange={(v) => setParam("coleccion", v)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {(opcionesQ.data?.colecciones ?? []).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Línea</p>
                <Select value={linea} onValueChange={(v) => setParam("linea", v)}>
                  <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las líneas</SelectItem>
                    {(opcionesQ.data?.lineas ?? []).map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ventana</p>
                <Select value={String(ventana)} onValueChange={(v) => setParam("ventana", v)}>
                  <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VENTANAS.map((v) => (
                      <SelectItem key={v} value={String(v)}>{v} días</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "perfil" ? "" : v)}>
              <TabsList>
                <TabsTrigger value="perfil">Perfil de tiendas</TabsTrigger>
                <TabsTrigger value="sobrestock">Diagnóstico de sobrestock</TabsTrigger>
                <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
              </TabsList>

              {/* ---------- Pantalla 1 ---------- */}
              <TabsContent value="perfil" className="space-y-4 pt-4">
                {perfilQ.isLoading ? (
                  <LoadingState />
                ) : perfilQ.error ? (
                  <ErrorBox error={perfilQ.error as Error} />
                ) : tiendas.length === 0 ? (
                  <EmptyState message="Sin tiendas con estos filtros" />
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Kpi label="Demanda perdida" value={`${fmtInt(kpis.demandaUds)} uds`} hint={fmtCOP(kpis.demandaCOP)} />
                      <Kpi label="Valor de inventario parado" value={fmtCOP(kpis.valorParado)} />
                      <Kpi
                        label="Tiendas que se quedan cortas"
                        value={fmtInt(kpis.conteos["SE QUEDA CORTA"] ?? 0)}
                        hint={`Le sobra: ${fmtInt(kpis.conteos["LE SOBRA"] ?? 0)} · Mezcla equivocada: ${fmtInt(kpis.conteos["MEZCLA EQUIVOCADA"] ?? 0)}`}
                      />
                      <Kpi
                        label="Equilibradas"
                        value={fmtInt(kpis.conteos["EQUILIBRADA"] ?? 0)}
                        hint={`Sin madurez: ${fmtInt(kpis.conteos["SIN MADUREZ"] ?? 0)}`}
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {PERFILES.map((p) => (
                        <span key={p} className="text-[10px] text-muted-foreground">
                          <PerfilBadge perfil={p} /> {fmtInt(kpis.conteos[p] ?? 0)}
                        </span>
                      ))}
                      <Exportaciones
                        titulo="Perfil de Tiendas"
                        head={PERFIL_HEAD}
                        body={perfilBody}
                        numericas={[2, 3, 4, 5, 6, 7, 8, 9]}
                      />
                    </div>

                    <Card>
                      <CardContent className="overflow-x-auto p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tienda</TableHead>
                              <TableHead>Tipo</TableHead>
                              <TableHead className="text-right">SKU maduros</TableHead>
                              <TableHead className="text-right">Sell-through</TableHead>
                              <TableHead className="min-w-[190px]">Agotados vs exceso</TableHead>
                              <TableHead className="text-right">Demanda perdida</TableHead>
                              <TableHead className="text-right">Valor parado</TableHead>
                              <TableHead className="text-right">Índice</TableHead>
                              <TableHead>Perfil</TableHead>
                              <TableHead>Recomendación</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tiendas.map((r) => {
                              const sinMadurez = (r.perfil ?? "").toUpperCase() === "SIN MADUREZ";
                              return (
                                <TableRow key={r.location_id}>
                                  <TableCell className="text-xs font-medium">{r.tienda ?? r.location_id}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">{r.tipo_tienda ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.skus_maduros)}</TableCell>
                                  <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtPct(r.sell_through)}</TableCell>
                                  <TableCell>
                                    {sinMadurez ? (
                                      <span className="text-[11px] text-muted-foreground">—</span>
                                    ) : (
                                      <BarraDoble agotados={r.pct_agotados} exceso={r.pct_exceso} />
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">
                                    {fmtInt(r.demanda_perdida)}
                                    <span className="block text-[10px] text-muted-foreground">{fmtCOP(r.valor_perdido)}</span>
                                  </TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{fmtCOP(r.valor_sobrante)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">
                                    {sinMadurez || r.indice_asignacion == null ? "—" : r.indice_asignacion}
                                  </TableCell>
                                  <TableCell><PerfilBadge perfil={r.perfil} /></TableCell>
                                  <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                                    {r.recomendacion ?? "—"}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>

              {/* ---------- Pantalla 2 ---------- */}
              <TabsContent value="sobrestock" className="space-y-4 pt-4">
                {sobrestockQ.isLoading ? (
                  <LoadingState />
                ) : sobrestockQ.error ? (
                  <ErrorBox error={sobrestockQ.error as Error} />
                ) : causas.length === 0 ? (
                  <EmptyState message="Sin sobrestock con estos filtros" />
                ) : (
                  <>
                    <div className="flex items-center">
                      <Exportaciones
                        titulo="Diagnóstico de Sobrestock"
                        head={SOBRE_HEAD}
                        body={sobreBody}
                        numericas={[4, 5, 6, 7, 8, 9, 10, 12]}
                      />
                    </div>

                    <div className="space-y-3">
                      {causas.map((g) => {
                        const abierta = causaAbierta === g.causa;
                        return (
                          <Card key={g.causa}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                              onClick={() => setCausaAbierta(abierta ? null : g.causa)}
                            >
                              {abierta ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">{g.causa}</p>
                                <p className="text-[11px] text-muted-foreground">{fmtInt(g.items.length)} productos</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold tabular-nums text-foreground">{fmtCOP(g.valor)}</p>
                                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">valor en juego</p>
                              </div>
                            </button>

                            {abierta && (
                              <CardContent className="overflow-x-auto border-t border-border p-0">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[64px]">Foto</TableHead>
                                      <TableHead>Producto</TableHead>
                                      <TableHead className="text-right">Recibidas</TableHead>
                                      <TableHead className="text-right">Vendidas</TableHead>
                                      <TableHead className="text-right">Stock</TableHead>
                                      <TableHead className="text-right">Sell-through</TableHead>
                                      <TableHead className="text-right">T. agotadas</TableHead>
                                      <TableHead className="text-right">T. con exceso</TableHead>
                                      <TableHead className="text-right">Demanda perdida</TableHead>
                                      <TableHead>Acción sugerida</TableHead>
                                      <TableHead className="text-right">Valor en juego</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {g.items.map((r) => (
                                      <TableRow key={`${g.causa}-${r.product_id}`}>
                                        <TableCell>
                                          {r.foto ? (
                                            <ProductImageThumb
                                              src={r.foto}
                                              alt={r.producto ?? ""}
                                              productId={r.product_id}
                                              title={r.producto}
                                              className="h-11 w-11 rounded-md border border-border object-cover"
                                            />
                                          ) : (
                                            <div className="h-11 w-11 rounded-md bg-muted" />
                                          )}
                                        </TableCell>
                                        <TableCell className="max-w-[240px] text-xs font-medium text-foreground">
                                          {r.producto ?? "—"}
                                          <span className="block text-[10px] text-muted-foreground">
                                            {r.coleccion ?? "—"} · {r.linea ?? "—"}
                                          </span>
                                        </TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.uds_recibidas)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.uds_vendidas)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.stock_actual)}</TableCell>
                                        <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtPct(r.sell_through)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums text-rose-600">{fmtInt(r.tiendas_agotadas)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums text-slate-500">{fmtInt(r.tiendas_con_exceso)}</TableCell>
                                        <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.demanda_perdida)}</TableCell>
                                        <TableCell className="max-w-[220px] text-xs text-muted-foreground">{r.accion ?? "—"}</TableCell>
                                        <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtCOP(r.valor_en_juego)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* ---------- Pantalla 3 ---------- */}
              <TabsContent value="oportunidades" className="space-y-4 pt-4">
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    El agotado promedio dura 47 días. Con despachos cada dos semanas y seis días de tránsito,
                    buena parte de esta demanda no era recuperable con un traslado. La cifra sirve para calibrar
                    la próxima siembra, no como meta de recuperación.
                  </p>
                </div>

                {oportunidadQ.isLoading ? (
                  <LoadingState />
                ) : oportunidadQ.error ? (
                  <ErrorBox error={oportunidadQ.error as Error} />
                ) : (oportunidadQ.data ?? []).length === 0 ? (
                  <EmptyState message="Sin oportunidades con estos filtros" />
                ) : (
                  <>
                    <div className="flex items-center">
                      <Exportaciones
                        titulo="Oportunidades de Redistribución"
                        head={OPO_HEAD}
                        body={opoBody}
                        numericas={[4, 6, 7, 8]}
                      />
                    </div>
                    <Card>
                      <CardContent className="overflow-x-auto p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Producto</TableHead>
                              <TableHead>Talla</TableHead>
                              <TableHead>Tienda donde faltó</TableHead>
                              <TableHead className="text-right">Días agotado</TableHead>
                              <TableHead>Tienda donde sobra</TableHead>
                              <TableHead className="text-right">Stock disponible</TableHead>
                              <TableHead className="text-right">Uds. movibles</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(oportunidadQ.data ?? []).map((r, i) => (
                              <Fragment key={`${r.sku}-${r.tienda_falto}-${i}`}>
                                <TableRow>
                                  <TableCell className="text-[11px] tabular-nums text-muted-foreground">{r.sku ?? "—"}</TableCell>
                                  <TableCell className="max-w-[220px] text-xs font-medium">{r.producto ?? "—"}</TableCell>
                                  <TableCell className="text-xs">{r.talla ?? "—"}</TableCell>
                                  <TableCell className="text-xs text-rose-600">{r.tienda_falto ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.dias_agotado)}</TableCell>
                                  <TableCell className="text-xs text-slate-600">{r.tienda_sobra ?? "—"}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{fmtInt(r.stock_disponible)}</TableCell>
                                  <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtInt(r.uds_movibles)}</TableCell>
                                  <TableCell className="text-right text-xs tabular-nums">{fmtCOP(r.valor_oportunidad)}</TableCell>
                                </TableRow>
                              </Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
