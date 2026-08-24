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
import { Siren, AlertTriangle, Users, UserRound, Receipt, ShoppingBag, Package, Store, Globe, Lightbulb, CalendarDays, Layers } from "lucide-react";

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

interface Linea {
  linea: string;
  unidades: number;
  venta: number;
  uds_por_semana: number;
  participacion: number;
  stock_tienda: number;
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
  if (v >= 90) return "text-emerald-600";
  if (v >= 80) return "text-amber-600";
  return "text-rose-600";
}

interface Calidad { nombre: string; uds: number; pct_full: number; pct_promo: number; pct_rebaja: number }

/** Fondo de tarjeta tenue con borde superior de estado */
function tonoCumpl(v: number) {
  const top = v >= 100 ? "border-t-emerald-500" : v >= 90 ? "border-t-emerald-400" : v >= 80 ? "border-t-amber-500" : "border-t-rose-500";
  return `bg-white hover:bg-slate-50/80 border-slate-200 ${top}`;
}

function iconoCumpl(v: number) {
  if (v >= 100) return "🚀";
  if (v >= 90) return "🟢";
  if (v >= 80) return "⚠️";
  return "🐢";
}

/** Barra de cumplimiento con marca de días transcurridos */
function BarraMes({ pctv, marca }: { pctv: number; marca: number | null }) {
  const ancho = Math.max(1, Math.min(100, pctv));
  return (
    <div className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-500" style={{ width: `${ancho}%` }} />
      {marca != null && (
        <div className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ left: `${Math.min(100, Math.max(0, marca))}%` }} />
      )}
    </div>
  );
}

function Metrica({ label, value, neg, pos }: { label: string; value: string; neg?: boolean; pos?: boolean }) {
  const color = neg ? "text-rose-600" : pos ? "text-emerald-600" : "text-foreground";
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
      <div className={`text-sm font-medium tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}

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

export default function GestionComercialPage() {
  // El valor inicial se calcula en cada render (no en constante de módulo).
  const hoy = new Date();
  const [anio, setAnio] = useState<number>(hoy.getFullYear());
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1);

  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
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


  // ── Vendedores (nivel 1: referentes) ──
  const [vendedores, setVendedores] = useState<any[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.rpc("reporte_ventas_por_vendedor" as any, { p_anio: anio, p_mes: mes });
      if (!cancel) setVendedores((data as any[]) ?? []);
    })();
    return () => { cancel = true; };
  }, [anio, mes]);

  const nombresVisibles = useMemo(() => new Set(visibles.map((f) => f.nombre)), [visibles]);

  const referentes = useMemo(() => {
    const vs = vendedores.filter((v) => nombresVisibles.has(String(v.tienda ?? "")));
    const base = vs.length ? vs : (tienda === "todas" && zona === "todas" ? vendedores : []);
    if (!base.length) return 0;
    const prom = base.reduce((a, v) => a + Number(v.ticket_promedio ?? 0), 0) / base.length;
    return base.filter((v) => Number(v.ticket_promedio ?? 0) > prom).length;
  }, [vendedores, nombresVisibles, tienda, zona]);

  const resumen = useMemo(() => {
    const presupuesto = visibles.reduce((a, f) => a + f.presupuesto, 0);
    const venta = visibles.reduce((a, f) => a + f.venta_mtd, 0);
    const cierre = visibles.reduce((a, f) => a + f.cierre_probable, 0);
    const pctMes = presupuesto > 0 ? (venta / presupuesto) * 100 : 0;
    const brechaCierre = cierre - presupuesto;
    const enRiesgo = visibles.filter((f) => f.pct_cierre < 80).length;
    const dt = visibles.find((f) => f.dias_transcurridos != null)?.dias_transcurridos ?? null;
    const dm = visibles.find((f) => f.dias_mes != null)?.dias_mes ?? null;
    return { presupuesto, venta, cierre, pctMes, brechaCierre, enRiesgo, dt, dm };
  }, [visibles]);

  // ── Calidad de venta y crecimiento intermensual por entidad ──
  const [calidad, setCalidad] = useState<Record<string, Calidad>>({});
  const [mom, setMom] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancel = false;
    (async () => {
      const [c, m] = await Promise.all([
        supabase.rpc("calidad_venta_entidad" as any, { p_anio: anio, p_mes: mes }),
        supabase.rpc("crecimiento_mom" as any, { p_anio: anio, p_mes: mes }),
      ]);
      if (cancel) return;
      const cm: Record<string, Calidad> = {};
      ((c.data as any[]) ?? []).forEach((r) => {
        cm[String(r.nombre ?? "")] = {
          nombre: String(r.nombre ?? ""),
          uds: Number(r.uds ?? 0),
          pct_full: Number(r.pct_full ?? 0),
          pct_promo: Number(r.pct_promo ?? 0),
          pct_rebaja: Number(r.pct_rebaja ?? 0),
        };
      });
      setCalidad(cm);
      const mm: Record<string, number> = {};
      ((m.data as any[]) ?? []).forEach((r) => { mm[String(r.nombre ?? "")] = Number(r.var_pct ?? 0); });
      setMom(mm);
    })();
    return () => { cancel = true; };
  }, [anio, mes]);

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

            {/* ── Nivel 1: tarjetas de red ── */}
            {!loading && visibles.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <CardRed
                  titulo="Cumplimiento del mes"
                  valor={`${nf(resumen.pctMes, 0)}%`}
                  detalle={resumen.dt && resumen.dm ? `día ${resumen.dt} de ${resumen.dm}` : money(resumen.venta)}
                  tono="neutral"
                  icon={Receipt}
                />
                <CardRed
                  titulo="Cierre probable"
                  valor={money(resumen.cierre)}
                  detalle={
                    resumen.brechaCierre < 0
                      ? <span className="text-rose-600 font-medium">Faltan {money(Math.abs(resumen.brechaCierre))}</span>
                      : <span className="text-emerald-600 font-medium">+{money(resumen.brechaCierre)} sobre meta</span>
                  }
                  tono={resumen.brechaCierre < 0 ? "rose" : "emerald"}
                  icon={ShoppingBag}
                />
                <CardRed
                  titulo="En riesgo"
                  valor={String(resumen.enRiesgo)}
                  detalle="entidades bajo 80% de cierre"
                  tono="amber"
                  icon={AlertTriangle}
                />
                <CardRed
                  titulo="Referentes"
                  valor={String(referentes)}
                  detalle="vendedores sobre el ticket promedio"
                  tono="emerald"
                  icon={Users}
                />
              </div>
            )}

            {/* ── Nivel 2: tarjetas de todas las entidades ── */}
            {!loading && visibles.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold mb-2">Entidades</h2>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibles.map((f) => {
                    const pctMesEnt = f.presupuesto > 0 ? (f.venta_mtd / f.presupuesto) * 100 : 0;
                    const marca = f.dias_mes ? ((f.dias_transcurridos ?? 0) / f.dias_mes) * 100 : null;
                    const varMom = mom[f.nombre];
                    const c = calidad[f.nombre];
                    return (
                      <button
                        key={f.clave}
                        onClick={() => setSel(f)}
                        className={`text-left rounded-xl border border-t-[3px] p-4 hover:shadow-md transition-shadow ${tonoCumpl(f.pct_cierre)}`}
                      >
                        {/* 1. Encabezado */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <TipoIcon tipo={f.tipo} />
                            <span className="font-medium text-sm truncate">{f.nombre}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Cierre proyectado</div>
                            <div className={`text-2xl font-semibold tabular-nums ${colorPct(f.pct_cierre)}`}>
                              <span className="text-base">{iconoCumpl(f.pct_cierre)}</span>
                              {nf(f.pct_cierre, 0)}%
                            </div>
                          </div>
                        </div>

                        {/* 2. Progreso */}
                        <div className="mt-3">
                          <BarraMes pctv={pctMesEnt} marca={marca} />
                          <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                            {money(f.venta_mtd)} de {money(f.presupuesto)} · día {f.dias_transcurridos ?? "—"} de {f.dias_mes ?? "—"}
                          </div>
                        </div>

                        {/* 3. Métricas */}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <Metrica label="Ticket" value={money((f as any).ticket)} />
                          <Metrica label="UPT" value={nf((f as any).upt, 2)} />
                          <Metrica label="Intermensual" value={varMom == null ? "—" : pct(varMom, 0)} neg={Number(varMom) < 0} pos={Number(varMom) > 0} />
                          <Metrica label="Interanual" value={pct(f.crecimiento_yoy, 0)} neg={f.crecimiento_yoy < 0} pos={f.crecimiento_yoy > 0} />
                          <Metrica label="Tendencia 7d" value={pct(f.tendencia_7d, 0)} neg={f.tendencia_7d < 0} pos={f.tendencia_7d > 0} />
                          <Metrica label="Esfuerzo" value={f.esfuerzo_requerido > 0 ? `+${nf(f.esfuerzo_requerido, 0)}%` : "Alcanzable"} pos={f.esfuerzo_requerido > 0} />
                        </div>

                        {/* 4. Composición de venta */}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <div className="rounded-md bg-slate-50 p-2 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <div>
                              <div className="text-[10px] text-muted-foreground">Full</div>
                              <div className="text-sm font-medium tabular-nums">{nf(c?.pct_full ?? 0, 0)}%</div>
                            </div>
                          </div>
                          <div className="rounded-md bg-slate-50 p-2 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                            <div>
                              <div className="text-[10px] text-muted-foreground">Promo</div>
                              <div className="text-sm font-medium tabular-nums">{nf(c?.pct_promo ?? 0, 0)}%</div>
                            </div>
                          </div>
                          <div className="rounded-md bg-slate-50 p-2 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                            <div>
                              <div className="text-[10px] text-muted-foreground">Rebaja</div>
                              <div className="text-sm font-medium tabular-nums">{nf(c?.pct_rebaja ?? 0, 0)}%</div>
                            </div>
                          </div>
                        </div>

                        {/* 5. Recomendación */}
                        {f.accionable && (
                          <div className="mt-3 flex gap-2 rounded-lg bg-slate-50/80 border border-slate-100 p-2.5 text-xs text-muted-foreground">
                            <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                            <span>{f.accionable}</span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
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

  // ── Datos del panel Producto ──
  const [combinar, setCombinar] = useState<any[]>([]);
  const [mejorDia, setMejorDia] = useState<any[]>([]);
  const [calidadEnt, setCalidadEnt] = useState<Calidad | null>(null);
  const [top5, setTop5] = useState<any[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [fullVendedor, setFullVendedor] = useState<Record<string, number>>({});
  const [tabProd, setTabProd] = useState("PEDIR");

  useEffect(() => {
    let cancel = false;
    (async () => {
      const clave = fila.clave ?? fila.nombre;
      const [cb, md, cv, tp, ln] = await Promise.all([
        supabase.rpc("productos_combinar" as any, { p_clave: clave, p_limite: 12 }),
        supabase.rpc("mejor_dia_semana" as any, { p_clave: clave, p_dias: 90 }),
        supabase.rpc("calidad_venta_entidad" as any, { p_anio: anio, p_mes: mes }),
        supabase.rpc("top_productos_tienda" as any, { p_clave: clave, p_limite: 5, p_dias: 30 }),
        supabase.rpc("lineas_tienda" as any, { p_clave: clave, p_dias: 30 }),
      ]);
      if (cancel) return;
      setCombinar(((cb.data as any[]) ?? []));
      setMejorDia(((md.data as any[]) ?? []));
      setTop5(((tp.data as any[]) ?? []));
      setLineas(((ln.data as any[]) ?? []).map((l) => ({
        linea: String(l.linea ?? ""),
        unidades: Number(l.unidades ?? 0),
        venta: Number(l.venta ?? 0),
        uds_por_semana: Number(l.uds_por_semana ?? 0),
        participacion: Number(l.participacion ?? 0),
        stock_tienda: Number(l.stock_tienda ?? 0),
      })) as Linea[]);
      const fila_cv = ((cv.data as any[]) ?? []).find((r) => String(r.nombre ?? "") === fila.nombre);
      setCalidadEnt(fila_cv ? {
        nombre: fila.nombre,
        uds: Number(fila_cv.uds ?? 0),
        pct_full: Number(fila_cv.pct_full ?? 0),
        pct_promo: Number(fila_cv.pct_promo ?? 0),
        pct_rebaja: Number(fila_cv.pct_rebaja ?? 0),
      } : null);
    })();
    return () => { cancel = true; };
  }, [fila.clave, fila.nombre, anio, mes]);

  // Top 5 más vendido y % venta full por vendedor (solo tiendas físicas)
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!esTienda) { setFullVendedor({}); return; }
      const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const finMes = new Date(anio, mes, 1);
      const hasta = `${finMes.getFullYear()}-${String(finMes.getMonth() + 1).padStart(2, "0")}-01`;
      const { data } = await supabase
        .from("order_items")
        .select("sku,quantity,price,category,manual_discount_amount,is_markdown,orders!inner(created_at,user_id)")
        .eq("location_id", fila.clave)
        .gte("orders.created_at", desde)
        .lt("orders.created_at", hasta)
        .limit(20000);
      if (cancel) return;
      const rows = ((data as any[]) ?? []).filter((r) => {
        const c = String(r.category ?? "").toUpperCase();
        return !c.includes("BOLSA") && !c.includes("INSUMO");
      });


      // % venta full por vendedor
      const acum: Record<string, { full: number; total: number }> = {};
      rows.forEach((r) => {
        const uid = String(r.orders?.user_id ?? "");
        if (!uid) return;
        const val = Number(r.price ?? 0) * Number(r.quantity ?? 0);
        const esFull = !r.is_markdown && Number(r.manual_discount_amount ?? 0) === 0;
        acum[uid] ||= { full: 0, total: 0 };
        acum[uid].total += val;
        if (esFull) acum[uid].full += val;
      });
      const uids = Object.keys(acum);
      const res: Record<string, number> = {};
      if (uids.length) {
        const { data: staff } = await supabase.from("staff_members").select("shopify_user_id,nombre").in("shopify_user_id", uids);
        ((staff as any[]) ?? []).forEach((s) => {
          const a = acum[String(s.shopify_user_id)];
          if (a && a.total > 0) res[String(s.nombre ?? "")] = (a.full / a.total) * 100;
        });
      }
      if (!cancel) setFullVendedor(res);
    })();
    return () => { cancel = true; };
  }, [fila.clave, esTienda, anio, mes]);


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
  const negativas = useMemo(() => [...palancas].filter((p) => p.valor < 0).sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)), [palancas]);
  const dominanteNegativa = negativas[0] ?? null;
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

    </div>
  );

  const ListaProductos = (accion: "PEDIR" | "IMPULSAR") => {
    const items = prods.filter((p) => (p.accion ?? "").toUpperCase().includes(accion));
    if (!items.length) return <EmptyState message={`Sin productos para ${accion.toLowerCase()}`} />;
    return (
      <ul className="divide-y">
        {items.map((p, i) => (
          <li key={`${p.producto}-${i}`} className="flex items-center gap-3 py-2.5">
            {p.image_url ? (
              <ProductImageThumb src={p.image_url} alt={p.producto} title={p.producto} className="h-11 w-11 rounded-md object-cover border shrink-0" />
            ) : (
              <div className="h-11 w-11 rounded-md border bg-muted flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{p.producto}</div>
              <div className="text-xs text-muted-foreground">
                Vende {nf(p.ritmo_red, 1)} uds/semana en {p.tiendas_vendiendo} tiendas{p.linea ? ` · ${p.linea}` : ""}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground shrink-0">
              <div>Tienda: {p.stock_local} uds</div>
              <div>Red: {(p as any).stock_red ?? "—"} uds</div>
            </div>
            {accion === "PEDIR" && (
              <div className="w-40 shrink-0 text-xs text-sky-700 leading-tight">
                {(p as any).donde_hay ?? "—"}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  const diaTop = mejorDia.find((d) => d.es_mejor) ?? [...mejorDia].sort((a, b) => Number(b.venta_promedio_dia ?? 0) - Number(a.venta_promedio_dia ?? 0))[0];

  const PanelProducto = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <Package className="h-3.5 w-3.5" /> Top 5 más vendido
          </div>
          {top5.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin datos de venta en el mes</p>
          ) : (
            <ol className="space-y-2">
              {top5.map((t, i) => (
                <li key={`${t.producto}-${i}`} className="flex items-center gap-2 text-sm">
                  <span className="w-3 text-[11px] text-muted-foreground shrink-0">{i + 1}</span>
                  {t.image_url ? (
                    <ProductImageThumb src={t.image_url} alt={t.producto} title={t.producto} className="h-9 w-9 rounded-md object-cover border shrink-0" />
                  ) : (
                    <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{t.producto}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{t.linea ?? "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular-nums text-sm font-medium">{nf(t.unidades, 0)}</div>
                    <div className="text-[10px] text-emerald-700 tabular-nums">{nf(t.pct_full, 0)}% full</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="rounded-xl border bg-card p-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5" /> Mejor día de la semana
          </div>
          {!diaTop ? (
            <p className="text-xs text-muted-foreground">Sin datos</p>
          ) : (
            <>
              <div className="text-2xl font-semibold text-emerald-700">{diaTop.dia_semana}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {money(Number(diaTop.venta_promedio_dia ?? 0))} promedio · {nf(diaTop.transacciones, 0)} tx
              </div>
              <div className="mt-2 space-y-1">
                {mejorDia.map((d) => {
                  const max = Math.max(1, ...mejorDia.map((x) => Number(x.venta_promedio_dia ?? 0)));
                  const w = (Number(d.venta_promedio_dia ?? 0) / max) * 100;
                  return (
                    <div key={d.dow} className="flex items-center gap-2">
                      <span className="w-16 text-[10px] text-muted-foreground truncate">{d.dia_semana}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${d.es_mejor ? "bg-emerald-500" : "bg-slate-300"}`} style={{ width: `${Math.max(2, w)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {(() => {
        if (!lineas.length) return null;
        const fuerte = lineas[0];
        const debil = [...lineas].reverse().find((l) => Number(l.stock_tienda ?? 0) > 0) ?? null;
        const CardLinea = ({ l, titulo, tono }: { l: Linea; titulo: string; tono: string }) => (
          <section className={`rounded-xl border p-4 ${tono}`}>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{titulo}</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold truncate">{l.linea ?? "—"}</span>
              <span className="text-2xl font-semibold tabular-nums">{nf(l.unidades, 0)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {money(l.venta)} · {nf(l.uds_por_semana, 1)} uds/semana · {nf(l.participacion, 1)}% share
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Stock en tienda: <span className="text-foreground font-medium tabular-nums">{nf(l.stock_tienda, 0)} uds</span>
            </div>
          </section>
        );
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <CardLinea l={fuerte} titulo="Línea más fuerte" tono="bg-emerald-50/60 border-emerald-200" />
            {debil && debil !== fuerte && <CardLinea l={debil} titulo="Línea más débil" tono="bg-rose-50/60 border-rose-200" />}
          </div>
        );
      })()}



      <Tabs value={tabProd} onValueChange={setTabProd}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="PEDIR">PEDIR</TabsTrigger>
          <TabsTrigger value="IMPULSAR">IMPULSAR</TabsTrigger>
          <TabsTrigger value="COMBINAR">COMBINAR</TabsTrigger>
        </TabsList>
        <TabsContent value="PEDIR" className="mt-3">
          <div className="rounded-xl border bg-card p-4">{ListaProductos("PEDIR")}</div>
        </TabsContent>
        <TabsContent value="IMPULSAR" className="mt-3">
          <div className="rounded-xl border bg-card p-4">{ListaProductos("IMPULSAR")}</div>
        </TabsContent>
        <TabsContent value="COMBINAR" className="mt-3">
          <div className="rounded-xl border bg-card overflow-x-auto">
            {combinar.length === 0 ? (
              <div className="p-4"><EmptyState message="Sin combinaciones frecuentes" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Producto</th>
                    <th className="px-3 py-2 text-left font-medium">Combina con</th>
                    <th className="px-3 py-2 text-right font-medium">Veces juntos</th>
                    <th className="px-3 py-2 text-right font-medium">De cada 10</th>
                  </tr>
                </thead>
                <tbody>
                  {combinar.map((c, i) => (
                    <tr key={`${c.producto}-${i}`} className="border-b last:border-b-0 hover:bg-muted/40" title={c.frase ?? undefined}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.image_url ? (
                            <ProductImageThumb src={c.image_url} alt={c.producto} title={c.producto} className="h-9 w-9 rounded-md object-cover border shrink-0" />
                          ) : (
                            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate max-w-[180px]">{c.producto}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {c.imagen_combina ? (
                            <ProductImageThumb src={c.imagen_combina} alt={c.combina_con} title={c.combina_con} className="h-9 w-9 rounded-md object-cover border shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          )}
                          <span className="truncate max-w-[180px]">{c.combina_con}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{nf(c.veces_juntos, 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="tabular-nums font-medium text-sky-700">{nf(c.de_cada_10, 1)}</div>
                        <div className={`text-[10px] font-medium ${String(c.fuerza).toLowerCase() === "alta" ? "text-emerald-600" : String(c.fuerza).toLowerCase() === "media" ? "text-amber-600" : "text-muted-foreground"}`}>
                          {c.fuerza ?? "—"}
                        </div>
                        {c.frase && <div className="text-[10px] text-muted-foreground max-w-[220px] whitespace-normal">{c.frase}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>
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
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              <TabsTrigger value="producto">Producto</TabsTrigger>
              <TabsTrigger value="equipo">Equipo</TabsTrigger>
            </TabsList>
            <TabsContent value="diagnostico" className="mt-4">
              {Diagnostico}
            </TabsContent>
            <TabsContent value="producto" className="mt-4">
              {PanelProducto}
            </TabsContent>
            <TabsContent value="equipo" className="mt-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" /> Equipo
              </h3>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">Ticket promedio tienda</div>
                  <div className="text-xl font-semibold tabular-nums">{money(ticketPromedio)}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">UPT promedio tienda</div>
                  <div className="text-xl font-semibold tabular-nums">{nf(uptPromedio, 2)}</div>
                </div>
                <div className="rounded-xl border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">% venta full tienda</div>
                  <div className="text-xl font-semibold tabular-nums text-emerald-700">
                    {calidadEnt ? `${nf(calidadEnt.pct_full, 0)}%` : "—"}
                  </div>
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
                      <th className="px-3 py-2 text-right font-medium">% Full</th>
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
                          <td className="px-3 py-2 font-medium max-w-[160px]">
                            <span className="flex items-center gap-2">
                              <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{e.vendedor}</span>
                            </span>
                          </td>
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
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-700">
                            {fullVendedor[e.vendedor] != null ? `${nf(fullVendedor[e.vendedor], 0)}%` : "—"}
                          </td>
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
                        <td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">
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
          <Tabs value={tab === "equipo" ? "diagnostico" : tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
              <TabsTrigger value="producto">Producto</TabsTrigger>
            </TabsList>
            <TabsContent value="diagnostico" className="mt-4">{Diagnostico}</TabsContent>
            <TabsContent value="producto" className="mt-4">{PanelProducto}</TabsContent>
          </Tabs>
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
