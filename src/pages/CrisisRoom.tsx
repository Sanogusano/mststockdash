import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Siren, AlertTriangle, Users, Receipt, ShoppingBag, Package } from "lucide-react";

/**
 * Crisis Room — diagnóstico de una tienda en el mes en curso.
 *
 * El panel no promete recuperación: cuando el salto requerido supera el 150%
 * lo dice explícitamente, porque un plan imposible es peor que ninguno.
 */

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

export default function CrisisRoomPage() {
  // El valor inicial se calcula en cada render (no en una constante de módulo)
  // para que el panel no se congele en el mes en que se cargó el bundle.
  const hoy = new Date();
  const [anio, setAnio] = useState<number>(hoy.getFullYear());
  const [mes, setMes] = useState<number>(hoy.getMonth() + 1);

  const [tiendas, setTiendas] = useState<{ location_id: string; name: string }[]>([]);
  const [tienda, setTienda] = useState<string>("");

  const [diag, setDiag] = useState<Diag | null>(null);
  const [prods, setProds] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("locations")
        .select("location_id,name")
        .eq("is_active", true)
        .order("name");
      const rows = (data ?? []) as { location_id: string; name: string }[];
      setTiendas(rows);
      if (rows.length && !tienda) setTienda(rows[0].name);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha de corte: hoy si es el mes en curso, si no el último día del mes.
  const fechaCorte = useMemo(() => {
    const ahora = new Date();
    if (anio === ahora.getFullYear() && mes === ahora.getMonth() + 1) {
      return `${anio}-${String(mes).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
    }
    const ultimo = new Date(anio, mes, 0).getDate();
    return `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
  }, [anio, mes]);

  useEffect(() => {
    if (!tienda) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [d, p] = await Promise.all([
        supabase.rpc("crisis_room_tienda", { p_clave: tienda, p_fecha: fechaCorte }),
        supabase.rpc("crisis_room_productos", { p_clave: tienda, p_limite: 20 }),
      ]);
      if (cancel) return;
      if (d.error) setError(d.error.message);
      else if (p.error) setError(p.error.message);
      setDiag(((d.data as Diag[]) ?? [])[0] ?? null);
      setProds(((p.data as Prod[]) ?? []) as Prod[]);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [tienda, fechaCorte, anio, mes]);

  const anios = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y];
  }, []);

  const palancas = useMemo(() => {
    if (!diag) return [];
    return [
      { key: "trafico", label: "Tráfico", valor: Number(diag.gap_por_trafico ?? 0), titulo: "Entran menos clientes que el promedio de la red", icon: Users },
      { key: "ticket", label: "Ticket", valor: Number(diag.gap_por_ticket ?? 0), titulo: "Cada venta es más pequeña", icon: Receipt },
      { key: "upt", label: "UPT", valor: Number(diag.gap_por_upt ?? 0), titulo: "Se lleva menos unidades por compra", icon: ShoppingBag },
    ];
  }, [diag]);

  const maxPalanca = Math.max(1, ...palancas.map((p) => Math.abs(p.valor)));
  const dominante = palancas.length ? palancas.reduce((a, b) => (Math.abs(b.valor) > Math.abs(a.valor) ? b : a)) : null;

  const maxRitmo = diag ? Math.max(1, Number(diag.ritmo_actual_dia ?? 0), Number(diag.ritmo_necesario_dia ?? 0)) : 1;
  const saltoAlto = diag ? Number(diag.salto_requerido_pct ?? 0) > 150 : false;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <SidebarTrigger />
            <Siren className="h-5 w-5 text-rose-600" />
            <h1 className="text-base font-semibold">Crisis Room</h1>
          </header>

          <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
            {/* Selectores */}
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <Select value={tienda} onValueChange={setTienda}>
                <SelectTrigger className="h-9 w-[280px]">
                  <SelectValue placeholder="Selecciona una tienda" />
                </SelectTrigger>
                <SelectContent>
                  {tiendas.map((t) => (
                    <SelectItem key={t.location_id} value={t.name}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                    ))}
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

            {loading && <LoadingState rows={4} />}

            {!loading && !diag && !error && (
              <EmptyState message="Sin datos para esta tienda en el mes seleccionado" />
            )}

            {!loading && diag && (
              <>
                {/* Bloque 1 — La situación */}
                <section className="rounded-xl border bg-card p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                    La situación · {diag.entidad}{diag.ciudad ? ` · ${diag.ciudad}` : ""}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Venta del mes</div>
                      <div className="text-3xl font-semibold tabular-nums">{money(diag.venta_mtd)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Meta {money(diag.presupuesto_mes)} · {nf(diag.pct_cumpl, 0)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Cierre probable</div>
                      <div className="text-3xl font-semibold tabular-nums">{money(diag.cierre_probable)}</div>
                      <div className="text-xs text-muted-foreground mt-1">{nf(diag.pct_cierre, 0)}% de la meta</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Brecha</div>
                      <div className={`text-3xl font-semibold tabular-nums ${Number(diag.falta_para_meta) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {money(diag.falta_para_meta)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {Number(diag.falta_para_meta) > 0 ? "Falta para la meta" : "Por encima de la meta"}
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 border-t pt-4">
                    <div className="text-2xl font-semibold">Quedan {diag.dias_restantes} días</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {diag.dias_transcurridos} de {diag.dias_mes} días transcurridos
                    </div>
                  </div>
                </section>

                {/* Bloque 2 — El ritmo */}
                <section className="rounded-xl border bg-card p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">El ritmo</div>
                  <div className="space-y-3">
                    {[
                      { label: "Ritmo actual", v: Number(diag.ritmo_actual_dia ?? 0), c: "bg-slate-400" },
                      { label: "Ritmo necesario", v: Number(diag.ritmo_necesario_dia ?? 0), c: "bg-rose-500" },
                    ].map((b) => (
                      <div key={b.label} className="flex items-center gap-3">
                        <div className="w-32 shrink-0 text-xs text-muted-foreground">{b.label}</div>
                        <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${b.c}`} style={{ width: `${Math.max(2, (b.v / maxRitmo) * 100)}%` }} />
                        </div>
                        <div className="w-24 text-right text-sm font-medium tabular-nums">{money(b.v)}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm">
                    Viene haciendo <span className="font-semibold">{money(diag.ritmo_actual_dia)}</span> por día.
                    Necesita <span className="font-semibold">{money(diag.ritmo_necesario_dia)}</span>.
                  </p>
                  {saltoAlto && (
                    <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Un salto de {nf(diag.salto_requerido_pct, 0)}% no es alcanzable. La conversación es de
                        contención, no de recuperación.
                      </span>
                    </div>
                  )}
                </section>

                {/* Bloque 3 — Por dónde se está perdiendo */}
                <section className="rounded-xl border bg-card p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">
                    Por dónde se está perdiendo
                  </div>
                  {dominante && (
                    <p className="text-sm font-medium mb-4">{dominante.titulo}</p>
                  )}
                  <div className="space-y-3">
                    {palancas.map((p) => {
                      const esDominante = dominante?.key === p.key;
                      const negativo = p.valor < 0;
                      return (
                        <div key={p.key} className={`flex items-center gap-3 rounded-lg px-2 py-2 ${esDominante ? "bg-muted/60" : ""}`}>
                          <div className="w-32 shrink-0 flex items-center gap-2 text-xs">
                            <p.icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className={esDominante ? "font-semibold" : "text-muted-foreground"}>{p.label}</span>
                          </div>
                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${negativo ? "bg-emerald-500" : esDominante ? "bg-rose-600" : "bg-rose-300"}`}
                              style={{ width: `${Math.max(2, (Math.abs(p.valor) / maxPalanca) * 100)}%` }}
                            />
                          </div>
                          <div className={`w-24 text-right text-sm font-medium tabular-nums ${negativo ? "text-emerald-600" : "text-rose-600"}`}>
                            {money(p.valor)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    En verde, la palanca está por encima del promedio de la red.
                  </p>
                </section>

                {/* Bloque 4 — Contexto */}
                <section className="rounded-xl border bg-card p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Contexto</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <div className="rounded-lg border p-4">
                      <div className={`text-2xl font-semibold tabular-nums ${Number(diag.var_ano_anterior) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {pct(diag.var_ano_anterior)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        vs. {MESES[mes - 1].toLowerCase()} del año pasado ({money(diag.venta_ano_anterior)})
                      </div>
                    </div>
                    <div className="rounded-lg border p-4">
                      <div className={`text-2xl font-semibold tabular-nums ${Number(diag.tendencia_7d) < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {pct(diag.tendencia_7d)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Transacciones vs. la semana anterior
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {[
                      { l: "Ticket", a: diag.ticket, b: diag.ticket_red, fmt: money },
                      { l: "UPT", a: diag.upt, b: diag.upt_red, fmt: (v: number) => nf(v, 2) },
                      { l: "Transacciones/día", a: Number(diag.transacciones ?? 0) / Math.max(1, Number(diag.dias_transcurridos ?? 1)), b: diag.tx_dia_red, fmt: (v: number) => nf(v, 1) },
                    ].map((k) => (
                      <div key={k.l} className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">{k.l}</div>
                        <div className={`text-lg font-semibold tabular-nums ${Number(k.a) < Number(k.b) ? "text-rose-600" : "text-emerald-600"}`}>
                          {k.fmt(Number(k.a))}
                        </div>
                        <div className="text-[11px] text-muted-foreground">Red: {k.fmt(Number(k.b))}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Bloque 5 — Qué hacer */}
                <section className="rounded-xl border bg-card p-5">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">Qué hacer</div>
                  {prods.length === 0 ? (
                    <EmptyState message="Sin acciones de producto sugeridas" />
                  ) : (
                    <ul className="divide-y">
                      {prods.map((p, i) => {
                        const impulsar = (p.accion ?? "").toUpperCase().includes("IMPULSAR");
                        return (
                          <li key={`${p.producto}-${i}`} className="flex items-center gap-3 py-3">
                            {p.image_url ? (
                              <ProductImageThumb
                                src={p.image_url}
                                alt={p.producto}
                                title={p.producto}
                                className="h-12 w-12 rounded-md object-cover border shrink-0"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
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
                                Vende {nf(p.ritmo_red, 1)} uds/semana en {p.tiendas_vendiendo} tiendas
                                {p.linea ? ` · ${p.linea}` : ""}
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
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
