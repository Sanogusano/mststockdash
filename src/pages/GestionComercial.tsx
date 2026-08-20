import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Siren, AlertTriangle, Users, Receipt, ShoppingBag, Package, Flag, Store, Globe } from "lucide-react";

/**
 * Accionables — lista priorizada de puntos de venta lejos de cumplir,
 * con panel de diagnóstico (Crisis Room) al hacer clic en una fila.
 */

interface Fila {
  clave: string;
  nombre: string;
  tipo: string | null;
  zona: string | null;
  tier: string | null;
  presupuesto: number;
  presupuesto_fecha: number;
  venta_mtd: number;
  pct_cumpl: number;
  cierre_probable: number;
  pct_cierre: number;
  brecha: number;
  esfuerzo_requerido: number;
  crecimiento_yoy: number;
  tendencia_7d: number;
  dias_transcurridos?: number;
  dias_mes?: number;
  accionable: string | null;
  marcada: boolean;
  marcada_at: string | null;
  avance_desde_marca: number | null;
}

interface Diag {
  entidad: string;
  ciudad: string | null;
  zona: string | null;
  venta_mtd: number;
  presupuesto_mes: number;
  presupuesto_fecha: number;
  brecha_fecha: number;
  falta_para_meta: number;
  cierre_probable: number;
  pct_cumpl: number;
  pct_cierre: number;
  dias_mes: number;
  dias_transcurridos: number;
  dias_restantes: number;
  ritmo_actual_dia: number;
  ritmo_necesario_dia: number;
  salto_requerido_pct: number;
  gap_por_trafico: number;
  gap_por_ticket: number;
  gap_por_upt: number;
  ticket: number;
  ticket_red: number;
  upt: number;
  upt_red: number;
  transacciones: number;
  tx_dia_red: number;
  var_ano_anterior: number;
  venta_ano_anterior: number;
  tendencia_7d: number;
  pct_descuento: number;
  base_comparacion: string | null;
}

interface Prod {
  producto: string;
  linea: string | null;
  image_url: string | null;
  accion: string;
  stock_local: number;
  stock_red: number;
  ritmo_red: number;
  tiendas_vendiendo: number;
  potencial_semanal: number;
}

interface EquipoRow {
  vendedor: string;
  rol: string | null;
  shopify_user_id: string | null;
  transacciones: number;
  unidades: number;
  venta: number;
  ticket: number;
  upt: number;
  pct_descuento: number;
  ticket_tienda: number;
  upt_tienda: number;
  var_ticket_pct: number;
  var_upt_pct: number;
  participacion_venta: number;
  dias_con_venta: number;
  desempeno: string | null;
  palanca_a_trabajar: string | null;
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const money = (v: number | null | undefined) => {
  if (v == null || !isFinite(Number(v))) return "—";
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (a >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })}M`;
  if (a >= 1_000) return `$${(n / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}K`;
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
};

const nf = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

const pct = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(Number(v)) ? "—" : `${Number(v) > 0 ? "+" : ""}${nf(v, d)}%`;

function TipoIcon({ tipo, className = "h-3.5 w-3.5" }: { tipo: string | null; className?: string }) {
  const esCanal = (tipo ?? "").toLowerCase() === "canal";
  return esCanal
    ? <Globe className={`${className} text-sky-600 shrink-0`} />
    : <Store className={`${className} text-muted-foreground shrink-0`} />;
}

function colorPct(v: number) {
  if (v >= 100) return "text-emerald-600";
  if (v >= 90) return "text-amber-600";
  if (v >= 80) return "text-orange-600";
  return "text-rose-600";
}

interface SerieRow { entidad: string; dia: string; venta: number; acumulado: number; meta_dia: number }

/** Tarjeta de red (nivel 1) */
function CardRed({
  titulo, valor, detalle, tono, icon: Icon,
}: {
  titulo: string; valor: string; detalle?: React.ReactNode;
  tono: "neutral" | "rose" | "amber" | "emerald"; icon: any;
}) {
  const tonos = {
    neutral: "bg-slate-50 border-slate-200 text-slate-700",
    rose: "bg-rose-50 border-rose-200 text-rose-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  }[tono];
  return (
    <div className={`rounded-xl border p-4 ${tonos}`}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-medium opacity-80">
        <Icon className="h-3.5 w-3.5" />
        {titulo}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{valor}</div>
      {detalle && <div className="mt-1 text-xs text-muted-foreground">{detalle}</div>}
    </div>
  );
}

/** Curva de acumulado vs meta (nivel 2) */
function CurvaAcumulado({ serie }: { serie: SerieRow[] }) {
  const W = 260, H = 56, P = 3;
  if (!serie.length) {
    return <div className="h-[56px] flex items-center text-[11px] text-muted-foreground">Sin serie diaria</div>;
  }
  let metaAcum = 0;
  const puntos = serie.map((s) => {
    metaAcum += Number(s.meta_dia ?? 0);
    return { acum: Number(s.acumulado ?? 0), meta: metaAcum };
  });
  const max = Math.max(1, ...puntos.map((p) => Math.max(p.acum, p.meta)));
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, puntos.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = (key: "acum" | "meta") =>
    puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[56px]" preserveAspectRatio="none">
      <path d={path("meta")} fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth={1.2} strokeDasharray="4 3" />
      <path d={path("acum")} fill="none" stroke="currentColor" className="text-rose-500" strokeWidth={1.8} />
    </svg>
  );
}

export default function GestionComercialPage() {
  // El valor inicial se calcula en cada render (no en constante de módulo).
  const hoy = new Date();
  const [anio, setAnio] = useState<number>(hoy.getFullYear());
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [sel, setSel] = useState<Fila | null>(null);
  const [zona, setZona] = useState<string>("todas");
  const [tienda, setTienda] = useState<string>("todas");

  const anios = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  const cargar = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("gestion_comercial" as any, { p_anio: anio, p_mes: mes });
    if (error) {
      setError(error.message);
      setFilas([]);
    } else {
      const rows = ((data as any[]) ?? []).map((r) => ({
        ...r,
        presupuesto: Number(r.presupuesto ?? 0),
        presupuesto_fecha: Number(r.presupuesto_fecha ?? 0),
        venta_mtd: Number(r.venta_mtd ?? 0),
        pct_cumpl: Number(r.pct_cumpl ?? 0),
        cierre_probable: Number(r.cierre_probable ?? 0),
        pct_cierre: Number(r.pct_cierre ?? 0),
        brecha: Number(r.brecha ?? 0),
        esfuerzo_requerido: Number(r.esfuerzo_requerido ?? 0),
        crecimiento_yoy: Number(r.crecimiento_yoy ?? 0),
        tendencia_7d: Number(r.tendencia_7d ?? 0),
      })) as Fila[];
      rows.sort((a, b) => {
        if (a.marcada !== b.marcada) return a.marcada ? -1 : 1;
        return a.pct_cierre - b.pct_cierre;
      });
      setFilas(rows);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anio, mes]);

  const marcar = async (f: Fila) => {
    setMarcando(f.nombre);
    const { error } = await supabase.rpc("gestion_comercial_marcar" as any, {
      p_nombre: f.nombre,
      p_marcar: !f.marcada,
      p_nota: null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(f.marcada ? `Seguimiento cerrado en ${f.nombre}` : `Seguimiento iniciado en ${f.nombre}`);
      await cargar();
    }
    setMarcando(null);
  };

  const esCanal = (f: Fila) => (f.tipo ?? "").toLowerCase() === "canal";

  const filasZona = useMemo(() => {
    if (zona === "todas") return filas;
    if (zona === "canales") return filas.filter(esCanal);
    return filas.filter((f) => !esCanal(f) && (f.zona ?? "") === zona);
  }, [filas, zona]);

  const tiendasDisponibles = useMemo(
    () => Array.from(new Set(filasZona.map((f) => f.nombre))).sort((a, b) => a.localeCompare(b, "es")),
    [filasZona]
  );

  useEffect(() => {
    if (tienda !== "todas" && !tiendasDisponibles.includes(tienda)) setTienda("todas");
  }, [tiendasDisponibles, tienda]);

  const visibles = useMemo(
    () => (tienda === "todas" ? filasZona : filasZona.filter((f) => f.nombre === tienda)),
    [filasZona, tienda]
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <SidebarTrigger />
            <Siren className="h-5 w-5 text-rose-600" />
            <h1 className="text-base font-semibold">Accionables</h1>
          </header>

          <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <p className="text-sm text-muted-foreground">
                Ordenado por cierre probable: las más lejos de cumplir, primero.
              </p>
              <div className="flex items-center gap-2">
                <Select value={zona} onValueChange={setZona}>
                  <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Zona" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las zonas</SelectItem>
                    <SelectItem value="Zona 1">Zona 1</SelectItem>
                    <SelectItem value="Zona 2">Zona 2</SelectItem>
                    <SelectItem value="canales">Canales</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={tienda} onValueChange={setTienda}>
                  <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Tienda" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {tiendasDisponibles.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
                  <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {anios.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
            )}

            {loading && <LoadingState rows={6} />}

            {!loading && !error && visibles.length === 0 && (
              <EmptyState message={`Sin presupuestos configurados para ${MESES[mes - 1]} ${anio}`} />
            )}

            {!loading && visibles.length > 0 && (
              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="w-10 px-2 py-2"></th>
                      <th className="px-3 py-2 text-left font-medium">Entidad</th>
                      <th className="px-3 py-2 text-left font-medium">Zona</th>
                      <th className="px-3 py-2 text-right font-medium">Venta</th>
                      <th className="px-3 py-2 text-right font-medium">Cumpl. a la fecha</th>
                      <th className="px-3 py-2 text-right font-medium">Cierre probable</th>
                      <th className="px-3 py-2 text-right font-medium">Esfuerzo req.</th>
                      <th className="px-3 py-2 text-right font-medium">Interanual</th>
                      <th className="px-3 py-2 text-right font-medium">Tend. 7d</th>
                      <th className="px-3 py-2 text-left font-medium">Accionable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((f) => (
                      <tr
                        key={f.clave}
                        onClick={() => setSel(f)}
                        className={`border-b cursor-pointer transition-colors ${
                          f.marcada ? "bg-amber-50/70 hover:bg-amber-100/70" : "hover:bg-muted/40"
                        }`}
                      >
                        <td className="px-2 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); marcar(f); }}
                            disabled={marcando === f.nombre}
                            title={f.marcada ? "Quitar marca" : "Marcar para seguimiento"}
                            className="p-1 rounded hover:bg-muted"
                          >
                            <Flag className={`h-4 w-4 ${f.marcada ? "text-amber-600 fill-amber-500" : "text-muted-foreground"}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <TipoIcon tipo={f.tipo} />
                            <span className="font-medium truncate max-w-[220px]">{f.nombre}</span>
                          </div>
                          {f.marcada && f.avance_desde_marca != null && (
                            <div className="text-[11px] text-amber-700">
                              Desde la marca: {money(Number(f.avance_desde_marca))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{f.zona ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(f.venta_mtd)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${colorPct(f.pct_cumpl)}`}>
                          {nf(f.pct_cumpl, 0)}%
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-semibold ${colorPct(f.pct_cierre)}`}>
                          {nf(f.pct_cierre, 0)}%
                          <div className="text-[11px] font-normal text-muted-foreground">{money(f.cierre_probable)}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {f.esfuerzo_requerido > 0 ? `+${nf(f.esfuerzo_requerido, 0)}%` : "Alcanzable"}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${f.crecimiento_yoy < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {pct(f.crecimiento_yoy, 0)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${f.tendencia_7d < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {pct(f.tendencia_7d, 0)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[280px]">{f.accionable ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {sel && <DetalleTienda fila={sel} anio={anio} mes={mes} />}
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

function DetalleTienda({ fila, anio, mes }: { fila: Fila; anio: number; mes: number }) {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [prods, setProds] = useState<Prod[]>([]);
  const [equipo, setEquipo] = useState<EquipoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("diagnostico");

  const esTienda = (fila.tipo ?? "").toLowerCase() === "tienda";

  const fechaCorte = useMemo(() => {
    const ahora = new Date();
    if (anio === ahora.getFullYear() && mes === ahora.getMonth() + 1) {
      return `${anio}-${String(mes).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
    }
    const ultimo = new Date(anio, mes, 0).getDate();
    return `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  }, [anio, mes]);

  useEffect(() => {
    setTab("diagnostico");
  }, [fila.clave, fila.nombre]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      const clave = fila.clave ?? fila.nombre;
      const calls: any[] = [
        supabase.rpc("crisis_room_tienda", { p_clave: clave, p_fecha: fechaCorte }),
        supabase.rpc("crisis_room_productos", { p_clave: clave, p_limite: 20 }),
        esTienda ? supabase.rpc("equipo_tienda", { p_clave: clave, p_fecha: fechaCorte }) : null,
      ];
      const [d, p, e] = await Promise.all(calls);
      if (cancel) return;
      if (d.error) setError(d.error.message);
      else if (p.error) setError(p.error.message);
      else if (e && e.error) setError(e.error.message);
      setDiag(((d.data as any[]) ?? [])[0] ?? null);
      setProds(((p.data as any[]) ?? []) as Prod[]);
      if (e && e.data) {
        setEquipo(
          ((e.data as any[]) ?? []).map((r) => ({
            ...r,
            transacciones: Number(r.transacciones ?? 0),
            unidades: Number(r.unidades ?? 0),
            venta: Number(r.venta ?? 0),
            ticket: Number(r.ticket ?? 0),
            upt: Number(r.upt ?? 0),
            pct_descuento: Number(r.pct_descuento ?? 0),
            ticket_tienda: Number(r.ticket_tienda ?? 0),
            upt_tienda: Number(r.upt_tienda ?? 0),
            var_ticket_pct: Number(r.var_ticket_pct ?? 0),
            var_upt_pct: Number(r.var_upt_pct ?? 0),
            participacion_venta: Number(r.participacion_venta ?? 0),
            dias_con_venta: Number(r.dias_con_venta ?? 0),
          })) as EquipoRow[]
        );
      } else {
        setEquipo([]);
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [fila.clave, fila.nombre, fechaCorte, anio, mes, esTienda]);

  const palancas = useMemo(() => {
    if (!diag) return [];
    return [
      { key: "trafico", label: "Tráfico", valor: Number(diag.gap_por_trafico ?? 0), titulo: "Entran menos clientes que el promedio de la red", icon: Users },
      { key: "ticket", label: "Ticket", valor: Number(diag.gap_por_ticket ?? 0), titulo: "Cada venta es más pequeña", icon: Receipt },
      { key: "upt", label: "UPT", valor: Number(diag.gap_por_upt ?? 0), titulo: "Se lleva menos unidades por compra", icon: ShoppingBag },
    ];
  }, [diag]);

  const equipoOrdenado = useMemo(() => {
    return [...equipo].sort((a, b) => Number(b.ticket) - Number(a.ticket));
  }, [equipo]);

  const ticketPromedio = equipo[0]?.ticket_tienda ?? 0;
  const uptPromedio = equipo[0]?.upt_tienda ?? 0;
  const sobrePromedio = useMemo(
    () => equipo.filter((e) => Number(e.ticket) > Number(ticketPromedio)).length,
    [equipo, ticketPromedio]
  );

  const maxPalanca = Math.max(1, ...palancas.map((p) => Math.abs(p.valor)));
  const dominante = palancas.length ? palancas.reduce((a, b) => (Math.abs(b.valor) > Math.abs(a.valor) ? b : a)) : null;
  const maxRitmo = diag ? Math.max(1, Number(diag.ritmo_actual_dia ?? 0), Number(diag.ritmo_necesario_dia ?? 0)) : 1;
  const saltoAlto = diag ? Number(diag.salto_requerido_pct ?? 0) > 150 : false;

  const Diagnostico = (
    <div className="space-y-5">
      {/* 1 — La situación */}
      <section className="rounded-xl border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">La situación</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Venta del mes</div>
            <div className="text-2xl font-semibold tabular-nums">{money(diag?.venta_mtd)}</div>
            <div className="text-xs text-muted-foreground mt-1">Meta {money(diag?.presupuesto_mes)} · {nf(diag?.pct_cumpl, 0)}%</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Cierre probable</div>
            <div className="text-2xl font-semibold tabular-nums">{money(diag?.cierre_probable)}</div>
            <div className="text-xs text-muted-foreground mt-1">{nf(diag?.pct_cierre, 0)}% de la meta</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Brecha</div>
            <div className={`text-2xl font-semibold tabular-nums ${Number(diag?.brecha_fecha) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {money(diag?.brecha_fecha)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Falta para la meta: {money(diag?.falta_para_meta)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Días restantes</div>
            <div className="text-2xl font-semibold tabular-nums">{diag?.dias_restantes}</div>
            <div className="text-xs text-muted-foreground mt-1">de {diag?.dias_mes} días del mes</div>
          </div>
        </div>
      </section>

      {/* 2 — El ritmo */}
      <section className="rounded-xl border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">El ritmo</div>
        <div className="space-y-2">
          {[
            { label: "Ritmo actual/día", v: Number(diag?.ritmo_actual_dia ?? 0), c: "bg-slate-400" },
            { label: "Ritmo necesario/día", v: Number(diag?.ritmo_necesario_dia ?? 0), c: "bg-rose-500" },
          ].map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <div className="w-36 shrink-0 text-xs text-muted-foreground">{b.label}</div>
              <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${b.c}`} style={{ width: `${Math.max(2, (b.v / maxRitmo) * 100)}%` }} />
              </div>
              <div className="w-20 text-right text-sm font-medium tabular-nums">{money(b.v)}</div>
            </div>
          ))}
        </div>
        {saltoAlto && (
          <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Un salto de {nf(diag?.salto_requerido_pct, 0)}% no es alcanzable. La conversación es de contención, no de recuperación.
            </span>
          </div>
        )}
      </section>

      {/* 3 — Palancas */}
      <section className="rounded-xl border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Por dónde se está perdiendo</div>
        {dominante && <p className="text-sm font-medium mb-3">{dominante.titulo}</p>}
        <div className="space-y-2">
          {palancas.map((p) => {
            const esDominante = dominante?.key === p.key;
            const negativo = p.valor < 0;
            return (
              <div key={p.key} className={`flex items-center gap-3 rounded-lg px-2 py-2 ${esDominante ? "bg-muted/60" : ""}`}>
                <div className="w-28 shrink-0 flex items-center gap-2 text-xs">
                  <p.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={esDominante ? "font-semibold" : "text-muted-foreground"}>{p.label}</span>
                </div>
                <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${negativo ? "bg-emerald-500" : esDominante ? "bg-rose-600" : "bg-rose-300"}`}
                    style={{ width: `${Math.max(2, (Math.abs(p.valor) / maxPalanca) * 100)}%` }}
                  />
                </div>
                <div className={`w-20 text-right text-sm font-medium tabular-nums ${negativo ? "text-emerald-600" : "text-rose-600"}`}>
                  {money(p.valor)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">En verde, la palanca está por encima del promedio de la red.</p>
      </section>

      {/* 4 — Contexto */}
      <section className="rounded-xl border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Contexto</div>
        <p className="text-xs text-muted-foreground mb-3">
          Base de comparación: {diag?.base_comparacion ?? "Promedio de la red de tiendas"}
        </p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border p-3">
            <div className={`text-xl font-semibold tabular-nums ${Number(diag?.var_ano_anterior) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {pct(diag?.var_ano_anterior)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              vs. {MESES[mes - 1].toLowerCase()} del año pasado ({money(diag?.venta_ano_anterior)})
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className={`text-xl font-semibold tabular-nums ${Number(diag?.tendencia_7d) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
              {pct(diag?.tendencia_7d)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Transacciones vs. la semana anterior</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          {[
            { l: "Ticket", a: diag?.ticket ?? 0, b: diag?.ticket_red ?? 0, fmt: money },
            { l: "UPT", a: diag?.upt ?? 0, b: diag?.upt_red ?? 0, fmt: (v: number) => nf(v, 2) },
            { l: "Tx/día", a: Number(diag?.transacciones ?? 0) / Math.max(1, Number(diag?.dias_transcurridos ?? 1)), b: diag?.tx_dia_red ?? 0, fmt: (v: number) => nf(v, 1) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border p-2.5">
              <div className="text-xs text-muted-foreground">{k.l}</div>
              <div className={`text-base font-semibold tabular-nums ${Number(k.a) < Number(k.b) ? "text-rose-600" : "text-emerald-600"}`}>
                {k.fmt(Number(k.a))}
              </div>
              <div className="text-[11px] text-muted-foreground">Base: {k.fmt(Number(k.b))}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 5 — Qué hacer */}
      <section className="rounded-xl border bg-card p-4">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Qué hacer</div>
        {prods.length === 0 ? (
          <EmptyState message="Sin acciones de producto sugeridas" />
        ) : (
          <ul className="divide-y">
            {prods.map((p, i) => {
              const impulsar = (p.accion ?? "").toUpperCase().includes("IMPULSAR");
              return (
                <li key={`${p.producto}-${i}`} className="flex items-center gap-3 py-2.5">
                  {p.image_url ? (
                    <ProductImageThumb src={p.image_url} alt={p.producto} title={p.producto} className="h-11 w-11 rounded-md object-cover border shrink-0" />
                  ) : (
                    <div className="h-11 w-11 rounded-md border bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.producto}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${impulsar ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"}`}>
                        {impulsar ? "IMPULSAR" : "PEDIR"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Vende {nf(p.ritmo_red, 1)} uds/semana en {p.tiendas_vendiendo} tiendas{p.linea ? ` · ${p.linea}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    <div>Tienda: {p.stock_local} uds</div>
                    <div>Red: {p.stock_red} uds</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );

  return (
    <div className="space-y-5 pt-2">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TipoIcon tipo={fila.tipo} className="h-4 w-4" />
          {fila.nombre}
        </h2>
        <p className="text-xs text-muted-foreground">
          {[fila.zona, fila.tipo, fila.tier].filter(Boolean).join(" · ") || "—"} · {MESES[mes - 1]} {anio}
        </p>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading && <LoadingState rows={4} />}
      {!loading && !diag && !error && <EmptyState message="Sin datos para esta entidad en el mes seleccionado" />}

      {!loading && diag && (
        esTienda ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              <TabsTrigger value="equipo">Equipo</TabsTrigger>
            </TabsList>
            <TabsContent value="diagnostico" className="mt-4">
              {Diagnostico}
            </TabsContent>
            <TabsContent value="equipo" className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Ticket promedio tienda</div>
                  <div className="text-xl font-semibold tabular-nums">{money(ticketPromedio)}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">UPT promedio tienda</div>
                  <div className="text-xl font-semibold tabular-nums">{nf(uptPromedio, 2)}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Sobre el promedio</div>
                  <div className="text-xl font-semibold tabular-nums">{sobrePromedio} <span className="text-sm font-normal text-muted-foreground">vendedores</span></div>
                </div>
              </div>

              <div className="rounded-xl border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Vendedor</th>
                      <th className="px-3 py-2 text-left font-medium">Rol</th>
                      <th className="px-3 py-2 text-right font-medium">Trans.</th>
                      <th className="px-3 py-2 text-right font-medium">Venta</th>
                      <th className="px-3 py-2 text-right font-medium">Ticket</th>
                      <th className="px-3 py-2 text-right font-medium">UPT</th>
                      <th className="px-3 py-2 text-right font-medium">% Desc.</th>
                      <th className="px-3 py-2 text-right font-medium">Particip.</th>
                      <th className="px-3 py-2 text-center font-medium">Desempeño</th>
                      <th className="px-3 py-2 text-left font-medium">Palanca</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipoOrdenado.map((e, i) => {
                      const perf = badgeDesempeno(e.desempeno);
                      return (
                        <tr key={`${e.shopify_user_id ?? e.vendedor}-${i}`} className="border-b last:border-b-0 hover:bg-muted/40">
                          <td className="px-3 py-2 font-medium truncate max-w-[140px]">{e.vendedor}</td>
                          <td className="px-3 py-2 text-muted-foreground">{e.rol ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(e.transacciones, 0)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(e.venta)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {money(e.ticket)}
                            <div className={`text-[11px] tabular-nums ${varColor(e.var_ticket_pct)}`}>{pct(e.var_ticket_pct, 1)}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {nf(e.upt, 2)}
                            <div className={`text-[11px] tabular-nums ${varColor(e.var_upt_pct)}`}>{pct(e.var_upt_pct, 1)}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(e.pct_descuento, 1)}%</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nf(e.participacion_venta, 1)}%</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${perf.className}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${perf.dot}`} />
                              {perf.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-left">
                            {e.palanca_a_trabajar ? (
                              <span className="inline-block rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 border border-sky-100">
                                {e.palanca_a_trabajar}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {equipoOrdenado.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-6 text-center text-sm text-muted-foreground">
                          Sin datos de equipo para esta tienda
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          Diagnostico
        )
      )}
    </div>
  );
}

function varColor(v: number) {
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-rose-600";
  return "text-muted-foreground";
}

function badgeDesempeno(d: string | null) {
  const n = (d ?? "").toLowerCase().trim();
  if (n.includes("referente")) return { label: "Referente", className: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" };
  if (n.includes("sobre")) return { label: "Sobre el promedio", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-400" };
  if (n.includes("necesita")) return { label: "Necesita apoyo", className: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
  return { label: "En el promedio", className: "bg-muted text-muted-foreground", dot: "bg-slate-400" };
}
