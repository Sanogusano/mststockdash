import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Download, Package, AlertTriangle, Megaphone, Clock, Layers,
  HelpCircle, X, RotateCcw, ArrowRight,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Alertas de distribución — riesgos de agotado y mala colocación.
 * Vista principal: grilla de tarjetas por tienda (alertas_por_tienda),
 * detalle SKU a SKU en panel lateral (alertas_distribucion por location_id).
 */

interface Row {
  sku: string;
  location_id: string;
  tienda: string;
  ciudad: string | null;
  zona: string | null;
  tier: string | null;
  producto: string | null;
  linea: string | null;
  color: string | null;
  talla: string | null;
  image_url: string | null;
  stock: number;
  ritmo_semanal: number;
  uds_28d: number;
  wos: number | null;
  wos_objetivo: number | null;
  stock_red_cedible: number;
  ritmo_linea_tienda: number | null;
  ritmo_red: number | null;
  tiendas_vendiendo: number | null;
  alerta: string;
  severidad: number;
  venta_perdida_semanal: number | null;
  tiene_solucion: boolean;
}

interface TiendaRow {
  location_id: string;
  tienda: string;
  ciudad: string | null;
  zona: string | null;
  tier: string | null;
  agotados: number;
  impulsar: number;
  quiebres: number;
  sobrestock: number;
  uds_impulsar: number;
  uds_sobrestock: number;
  uds_perdidas_semana: number | null;
  agotados_con_stock: number;
  total_alertas: number;
  prioridad: number | null;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

const BADGE: Record<string, string> = {
  "AGOTADO VENDIENDO":    "bg-rose-100 text-rose-800",
  "IMPULSAR":             "bg-violet-100 text-violet-800",
  "QUIEBRE EN 2 SEMANAS": "bg-amber-100 text-amber-800",
  "SOBRESTOCK":           "bg-sky-100 text-sky-800",
};

const TIPOS = [
  { key: "AGOTADO VENDIENDO", corto: "Agotados" },
  { key: "IMPULSAR", corto: "Impulsar" },
  { key: "QUIEBRE EN 2 SEMANAS", corto: "Quiebre" },
  { key: "SOBRESTOCK", corto: "Sobrestock" },
];

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <h3 className="font-semibold text-sm">Qué mira cada alerta</h3>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-rose-700">Agotado vendiendo</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            La tienda vende al menos una unidad por semana y hoy está en cero. Cada semana sin
            producto es venta que no vuelve.
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-violet-700">Impulsar</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Hay stock y cero ventas, pero la tienda sí vende esa línea y el producto sí rota en el
            resto de la red. <strong className="text-foreground">No es falta de demanda: le falta
            push.</strong>
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-amber-700">Quiebre en 2 semanas</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Al ritmo actual el stock se acaba antes de dos semanas. Todavía hay tiempo de reponer.
          </p>
        </div>
        <div className="rounded border bg-background p-3">
          <div className="font-medium text-xs mb-1 text-sky-700">Sobrestock</div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Más de 20 semanas de cobertura. Ese inventario le sirve más a otra tienda.
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed border-t pt-3">
        <strong className="text-foreground">"Hay en red" marca los casos que se resuelven moviendo
        inventario existente.</strong> Cuando no lo hay, no existe reposición posible: el producto
        se agotó y no se vuelve a producir.
      </p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        El ritmo se calcula sobre los últimos 28 días de venta.
      </p>
    </div>
  );
}

function contexto(t: TiendaRow): string | null {
  if (t.agotados > 0 && t.sobrestock > 20) return "Tiene inventario, pero el equivocado";
  if (t.agotados > 0 && t.agotados_con_stock === t.agotados)
    return `${nf(t.agotados)} agotados, todos con stock en la red — despachar hoy`;
  if (t.agotados === 0 && t.impulsar > 0)
    return `Sin agotados · ${nf(t.uds_impulsar)} uds en tienda sin rotar`;
  if (t.agotados > 0)
    return `${nf(t.agotados)} agotados · ${nf(t.agotados_con_stock)} con stock en la red`;
  return null;
}

export default function AlertasDistribucion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tiendasRows, setTiendasRows] = useState<TiendaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zona, setZona] = useState("all");
  const [tiendaSel, setTiendaSel] = useState("all");
  const [alerta, setAlerta] = useState("all");
  const [ayuda, setAyuda] = useState(false);

  const [detalle, setDetalle] = useState<TiendaRow | null>(null);
  const [tabDetalle, setTabDetalle] = useState("AGOTADO VENDIENDO");

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      const PAGINA = 1000;
      const acc: Row[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("alertas_distribucion")
            .select("*")
            .order("severidad", { ascending: true })
            .order("ritmo_red", { ascending: false, nullsFirst: false })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 20000) break;
        }
        const { data: tdata, error: terror } = await (supabase as any)
          .from("alertas_por_tienda")
          .select("*")
          .order("prioridad", { ascending: false, nullsFirst: false });
        if (terror) throw terror;
        if (activo) {
          setRows(acc);
          setTiendasRows((tdata ?? []) as TiendaRow[]);
        }
      } catch (e: any) {
        if (activo) setError(e?.message ?? String(e));
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const zonas = useMemo(
    () => Array.from(new Set(tiendasRows.map(t => t.zona).filter(Boolean) as string[])).sort(),
    [tiendasRows]);

  const tiendasOpciones = useMemo(
    () => tiendasRows
      .filter(t => zona === "all" || t.zona === zona)
      .map(t => ({ id: t.location_id, nombre: t.tienda }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [tiendasRows, zona]);

  const resumen = useMemo(() => {
    const por = (a: string) => rows.filter(r => r.alerta === a);
    const ag = por("AGOTADO VENDIENDO");
    const im = por("IMPULSAR");
    const so = por("SOBRESTOCK");
    return {
      agotados: ag.length,
      agotadosConStock: ag.filter(r => r.tiene_solucion).length,
      perdidaAgotados: ag.reduce((s, r) => s + (r.venta_perdida_semanal ?? 0), 0),
      impulsar: im.length,
      udsImpulsar: im.reduce((s, r) => s + r.stock, 0),
      perdidaImpulsar: im.reduce((s, r) => s + (r.venta_perdida_semanal ?? 0), 0),
      quiebres: por("QUIEBRE EN 2 SEMANAS").length,
      sobrestock: so.length,
      udsSobrestock: so.reduce((s, r) => s + r.stock, 0),
    };
  }, [rows]);

  const conteoTipo = (t: TiendaRow, tipo: string) =>
    tipo === "AGOTADO VENDIENDO" ? t.agotados
    : tipo === "IMPULSAR" ? t.impulsar
    : tipo === "QUIEBRE EN 2 SEMANAS" ? t.quiebres
    : t.sobrestock;

  const tarjetas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return tiendasRows.filter(t => {
      if (ciudad !== "all" && t.ciudad !== ciudad) return false;
      if (alerta !== "all" && conteoTipo(t, alerta) <= 0) return false;
      if (q && !(t.tienda ?? "").toLowerCase().includes(q)
             && !(t.ciudad ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tiendasRows, ciudad, alerta, busqueda]);

  const detalleRows = useMemo(() => {
    if (!detalle) return [];
    return rows.filter(r => r.location_id === detalle.location_id && r.alerta === tabDetalle);
  }, [rows, detalle, tabDetalle]);

  const limpiar = () => { setAlerta("all"); setCiudad("all"); setBusqueda(""); };

  const exportar = () => {
    const ids = new Set(tarjetas.map(t => t.location_id));
    const filtrados = rows.filter(r => ids.has(r.location_id)
      && (alerta === "all" || r.alerta === alerta));
    if (!filtrados.length) return;
    const datos = filtrados.map(r => ({
      Alerta: r.alerta, Producto: r.producto, SKU: r.sku,
      Línea: r.linea, Color: r.color, Talla: r.talla,
      Tienda: r.tienda, Ciudad: r.ciudad, Tier: r.tier,
      Stock: r.stock, "Ritmo semanal": r.ritmo_semanal, "Vendido 28d": r.uds_28d,
      "Semanas de cobertura": r.wos, "WOS objetivo": r.wos_objetivo,
      "Ritmo de la línea en la tienda": r.ritmo_linea_tienda,
      "Ritmo del producto en la red": r.ritmo_red,
      "Tiendas vendiéndolo": r.tiendas_vendiendo,
      "Venta perdida semanal": r.venta_perdida_semanal,
      "Stock disponible en red": r.stock_red_cedible,
      "Hay en red": r.tiene_solucion ? "Sí" : "No",
    }));
    const ws = XLSX.utils.aoa_to_sheet([
      ["Alertas de distribución — agotados, impulso, quiebre y sobrestock"],
      [`Ritmo sobre los últimos 28 días · ${new Date().toLocaleDateString("es-CO")}`],
    ]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    ws["!cols"] = [{ wch: 21 }, { wch: 40 }, { wch: 18 }, ...Array(17).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alertas");
    XLSX.writeFile(wb, "alertas-distribucion.xlsx");
  };

  const Tarjeta = ({ k, icono: Icono, titulo, valor, sub, color, activa }: any) => (
    <button onClick={() => setAlerta(alerta === k ? "all" : k)}
      className={`rounded-lg border p-3 text-left transition-colors ${
        activa ? color.activo : "hover:bg-muted/40"}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icono className={`h-3.5 w-3.5 ${color.icono}`} />{titulo}
      </div>
      <div className={`text-xl font-semibold tabular-nums mt-0.5 ${color.texto}`}>{valor}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </button>
  );

  const Contador = ({ label, valor, color }: { label: string; valor: number; color: string }) => (
    <div className="flex-1 min-w-0">
      <div className={`text-lg font-semibold tabular-nums leading-none ${color}`}>{nf(valor)}</div>
      <div className="text-[10px] text-muted-foreground mt-1 truncate">{label}</div>
    </div>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Alertas de distribución</h1>
              <p className="text-xs text-muted-foreground">
                Agotados, impulso, quiebre y sobrestock por tienda · últimos 28 días
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Qué mira
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Tarjeta k="AGOTADO VENDIENDO" icono={AlertTriangle} titulo="Agotado vendiendo"
                    valor={nf(resumen.agotados)}
                    sub={`−${nf(resumen.perdidaAgotados, 0)} uds/sem · ${nf(resumen.agotadosConStock)} con stock en red`}
                    activa={alerta === "AGOTADO VENDIENDO"}
                    color={{ icono: "text-rose-600", texto: "text-rose-700", activo: "bg-rose-50 border-rose-300" }} />

                  <Tarjeta k="IMPULSAR" icono={Megaphone} titulo="Impulsar"
                    valor={nf(resumen.impulsar)}
                    sub={`${nf(resumen.udsImpulsar)} uds paradas · −${nf(resumen.perdidaImpulsar, 0)} uds/sem`}
                    activa={alerta === "IMPULSAR"}
                    color={{ icono: "text-violet-600", texto: "text-violet-700", activo: "bg-violet-50 border-violet-300" }} />

                  <Tarjeta k="QUIEBRE EN 2 SEMANAS" icono={Clock} titulo="Quiebre en 2 semanas"
                    valor={nf(resumen.quiebres)} sub="aún hay tiempo de reponer"
                    activa={alerta === "QUIEBRE EN 2 SEMANAS"}
                    color={{ icono: "text-amber-600", texto: "text-amber-700", activo: "bg-amber-50 border-amber-300" }} />

                  <Tarjeta k="SOBRESTOCK" icono={Layers} titulo="Sobrestock"
                    valor={nf(resumen.sobrestock)}
                    sub={`${nf(resumen.udsSobrestock)} uds inmovilizadas`}
                    activa={alerta === "SOBRESTOCK"}
                    color={{ icono: "text-sky-600", texto: "text-sky-700", activo: "bg-sky-50 border-sky-300" }} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar tienda o ciudad…" className="pl-8 w-[210px] h-9"
                           value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  </div>

                  <Select value={ciudad} onValueChange={setCiudad}>
                    <SelectTrigger className="w-[165px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las ciudades</SelectItem>
                      {ciudades.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  {alerta !== "all" && (
                    <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${BADGE[alerta] ?? ""}`}>
                      Filtrando por {alerta}
                    </span>
                  )}

                  <Button variant="ghost" size="sm" className="h-9" onClick={limpiar}>
                    <RotateCcw className="h-4 w-4 mr-1.5" />Limpiar
                  </Button>

                  <Button variant="outline" size="sm" className="ml-auto h-9"
                          onClick={exportar} disabled={!tarjetas.length}>
                    <Download className="h-4 w-4 mr-1.5" />Excel
                  </Button>
                </div>

                {!tarjetas.length ? (
                  <EmptyState message="No hay tiendas con estos filtros." />
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                      {tarjetas.map(t => {
                        const ctx = contexto(t);
                        return (
                          <button key={t.location_id}
                            onClick={() => {
                              setDetalle(t);
                              setTabDetalle(alerta !== "all" ? alerta
                                : t.agotados > 0 ? "AGOTADO VENDIENDO"
                                : t.impulsar > 0 ? "IMPULSAR"
                                : t.quiebres > 0 ? "QUIEBRE EN 2 SEMANAS"
                                : "SOBRESTOCK");
                            }}
                            className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40 hover:border-primary/40">
                            <div className="font-medium text-sm leading-tight line-clamp-1">{t.tienda}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {[t.ciudad, t.tier].filter(Boolean).join(" · ") || "—"}
                            </div>

                            <div className="flex gap-2 mt-3">
                              <Contador label="Agotados" valor={t.agotados} color="text-rose-700" />
                              <Contador label="Impulsar" valor={t.impulsar} color="text-violet-700" />
                              <Contador label="Quiebre" valor={t.quiebres} color="text-amber-700" />
                              <Contador label="Sobrestock" valor={t.sobrestock} color="text-sky-700" />
                            </div>

                            {ctx && (
                              <div className="text-[11px] text-muted-foreground mt-3 leading-snug">
                                {ctx}
                              </div>
                            )}

                            {!!t.uds_perdidas_semana && (
                              <div className="text-xs font-medium text-rose-700 mt-1.5">
                                −{nf(t.uds_perdidas_semana, 1)} uds/sem perdidas
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                      <span>Tiendas ordenadas por prioridad</span>
                      <span>Ritmo y cobertura sobre los últimos 28 días</span>
                      <span>Sin stock en red no hay reposición: el producto no se vuelve a producir</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      <Sheet open={!!detalle} onOpenChange={(o) => { if (!o) setDetalle(null); }}>
        <SheetContent side="right" className="!max-w-3xl w-full overflow-y-auto p-0">
          {detalle && (
            <>
              <SheetHeader className="p-5 pb-3 border-b">
                <SheetTitle className="text-base">{detalle.tienda}</SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {[detalle.ciudad, detalle.tier].filter(Boolean).join(" · ")} ·{" "}
                  {nf(detalle.total_alertas)} alertas
                </p>
              </SheetHeader>

              <div className="p-5 space-y-4">
                <Tabs value={tabDetalle} onValueChange={setTabDetalle}>
                  <TabsList className="w-full">
                    {TIPOS.map(t => (
                      <TabsTrigger key={t.key} value={t.key} className="flex-1 text-xs">
                        {t.corto} ({nf(conteoTipo(detalle, t.key))})
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                {!detalleRows.length ? (
                  <EmptyState message="Sin alertas de este tipo en la tienda." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                          <th className="text-right p-2.5 font-medium">Stock</th>
                          <th className="text-right p-2.5 font-medium">Aquí</th>
                          <th className="text-right p-2.5 font-medium">En la red</th>
                          <th className="text-left p-2.5 font-medium">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalleRows.map((r, i) => (
                          <tr key={`${r.sku}-${i}`} className="border-b hover:bg-muted/20">
                            <td className="p-2 w-[52px]">
                              {r.image_url ? (
                                <img src={r.image_url} alt="" loading="lazy"
                                     className="h-11 w-11 rounded object-cover bg-muted" />
                              ) : (
                                <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground/50" />
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 min-w-[185px]">
                              <div className="font-medium leading-tight line-clamp-1">
                                {r.producto ?? r.sku}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {[r.linea, r.color, r.talla].filter(Boolean).join(" · ")}
                              </div>
                            </td>
                            <td className="p-2.5 text-right tabular-nums">
                              <span className={r.stock === 0 ? "text-rose-700 font-medium" : ""}>
                                {nf(r.stock)}
                              </span>
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="tabular-nums">{nf(r.ritmo_semanal, 1)}</div>
                              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {r.wos != null
                                  ? `${nf(Math.min(r.wos, 99), 1)} sem stock`
                                  : r.ritmo_linea_tienda != null
                                    ? `línea ${nf(r.ritmo_linea_tienda, 1)}/sem`
                                    : "uds/sem"}
                              </div>
                            </td>
                            <td className="p-2.5 text-right">
                              {r.ritmo_red != null ? (
                                <>
                                  <div className="tabular-nums">{nf(r.ritmo_red, 1)}</div>
                                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    en {r.tiendas_vendiendo} tiendas
                                  </div>
                                </>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                            <td className="p-2.5">
                              {r.alerta === "IMPULSAR" ? (
                                <span className="text-[11px] text-violet-700">
                                  Ya está en tienda · dar push
                                </span>
                              ) : r.alerta === "SOBRESTOCK" ? (
                                <span className="text-[11px] text-sky-700">Redistribuir</span>
                              ) : r.tiene_solucion ? (
                                <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                                  <ArrowRight className="h-3 w-3" />
                                  {nf(r.stock_red_cedible)} uds en red
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  Sin reposición
                                </span>
                              )}
                              {r.venta_perdida_semanal != null && (
                                <div className="text-[10px] text-rose-700 mt-0.5">
                                  −{nf(r.venta_perdida_semanal, 1)} uds/sem
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}
