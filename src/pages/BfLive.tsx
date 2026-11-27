import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { Activity, Crown, Maximize, Minimize, Radio, ShoppingCart, Volume2, VolumeX, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BF_EVENT_END, BF_REFRESH_INTERVAL, bogotaTime, canViewBfLive, countdown, isNewOrder, liveMoney, productThumbnail, type BfLiveData, type LiveOrder } from "@/lib/bf-live";

function useAnimatedAmount(value: number) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = value;
      setDisplay(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min((now - start) / 2000, 1);
      current.current = from + (value - from) * (1 - (1 - t) ** 3);
      setDisplay(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return display;
}

function Kpi({ label, value, note, money = false }: { label: string; value: number; note?: string; money?: boolean }) {
  const previous = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (value <= previous.current) { previous.current = value; return; }
    previous.current = value;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 1000);
    return () => window.clearTimeout(timer);
  }, [value]);
  return <article className={`bf-kpi ${flash ? "bf-kpi-flash" : ""}`}>
    <p className="text-sm text-muted-foreground">{label}</p>
    <div className="bf-kpi-number">{money ? liveMoney(value) : Number(value).toLocaleString("es-CO", { maximumFractionDigits: 2 })}</div>
    {note && <p className="text-xs text-muted-foreground">{note}</p>}
  </article>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="bf-section"><h2>{title}</h2>{children}</section>;
}

function BarRows({ rows, units = false }: { rows: { name: string; value: number; note: string }[]; units?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return rows.length ? <div className="space-y-5">{rows.map((row, index) => <div key={`${row.name}-${index}`}>
    <div className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{row.name}</span><strong className="shrink-0 tabular-nums">{units ? row.value.toLocaleString("es-CO") : liveMoney(row.value)}</strong></div>
    <progress className="bf-bar bf-bar-small mt-2" max={max} value={Math.max(0, row.value)} aria-label={row.name} />
    <p className="mt-1 text-xs text-muted-foreground">{row.note}</p>
  </div>)}</div> : <p className="text-sm text-muted-foreground">Sin ventas registradas</p>;
}

function Budget({ budget }: { budget: BfLiveData["presupuesto_mes"] }) {
  const remaining = useAnimatedAmount(budget.falta);
  const onlineRemaining = useAnimatedAmount(budget.online_falta);
  const onlinePct = budget.online_presupuesto > 0 ? budget.online_vendido / budget.online_presupuesto * 100 : 0;
  return <section className="bf-budget">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-sm text-muted-foreground">PRESUPUESTO DE NOVIEMBRE</p><h2 className="bf-budget-title">Faltan <span className="text-success tabular-nums">{liveMoney(remaining)}</span></h2><p className="text-sm text-muted-foreground">para el presupuesto de noviembre</p></div>
      <strong className="bf-percent text-success">{Number(budget.pct).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%</strong>
    </div>
    <progress className="bf-bar mt-5" max={100} value={Math.min(100, Math.max(0, budget.pct))} aria-label="Presupuesto de noviembre" />
    <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-muted-foreground"><span>Vendido {liveMoney(budget.vendido)}</span><span>Presupuesto {liveMoney(budget.presupuesto)}</span></div>
    <div className="mt-5 flex flex-wrap justify-between gap-2 text-sm"><span>Online · faltan <strong>{liveMoney(onlineRemaining)}</strong></span><span className="text-muted-foreground">{onlinePct.toLocaleString("es-CO", { maximumFractionDigits: 1 })}% · {liveMoney(budget.online_vendido)} / {liveMoney(budget.online_presupuesto)}</span></div>
    <progress className="bf-bar bf-bar-small bf-bar-online mt-2" max={100} value={Math.min(100, Math.max(0, onlinePct))} aria-label="Presupuesto Online" />
  </section>;
}

function ProductImage({ image, name }: { image: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  return image && !failed ? <img src={productThumbnail(image)} alt={name} loading="lazy" className="bf-product-image" onError={() => setFailed(true)} /> : <div className="bf-product-image flex items-center justify-center bg-muted"><ImageOff className="h-5 w-5 text-muted-foreground" /></div>;
}

export function BfLiveBroadcast() {
  const { data, error, isPending, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["bf-live"],
    queryFn: async () => {
      const result = await supabase.rpc("bf_live");
      if (result.error) throw result.error;
      if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) throw new Error("bf_live devolvió una respuesta vacía o inválida");
      return result.data as unknown as BfLiveData;
    },
    refetchInterval: BF_REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
  });
  const screen = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(true);
  const mutedRef = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const lastOrder = useRef<LiveOrder>();
  const [newOrder, setNewOrder] = useState<LiveOrder | null>(null);
  const toastTimer = useRef<number>();
  const [fullscreenError, setFullscreenError] = useState("");

  useEffect(() => {
    const parsed = Date.parse(data?.ahora ?? "");
    if (Number.isFinite(parsed)) offset.current = parsed - dataUpdatedAt;
    setNow(Date.now() + offset.current);
  }, [data?.ahora, dataUpdatedAt]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    const changed = () => setFullscreen(document.fullscreenElement === screen.current);
    document.addEventListener("fullscreenchange", changed);
    return () => { window.clearInterval(timer); document.removeEventListener("fullscreenchange", changed); };
  }, []);
  useEffect(() => {
    const first = data?.online_vivo?.ultimos_pedidos?.[0];
    if (isNewOrder(lastOrder.current, first) && first) {
      setNewOrder(first);
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setNewOrder(null), 3000);
      if (!mutedRef.current && audio.current) {
        const ctx = audio.current;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain); gain.connect(ctx.destination);
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        oscillator.start(); oscillator.stop(ctx.currentTime + 0.22);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      }
    }
    if (first) lastOrder.current = first;
  }, [dataUpdatedAt, data]);
  useEffect(() => () => { window.clearTimeout(toastTimer.current); void audio.current?.close(); }, []);

  async function toggleSound() {
    if (muted) {
      try { audio.current ??= new AudioContext(); await audio.current.resume(); }
      catch { setFullscreenError("No se pudo activar el sonido en este navegador."); return; }
    }
    mutedRef.current = !muted;
    setMuted(!muted);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (screen.current?.requestFullscreen) await screen.current.requestFullscreen();
      else setFullscreenError("Este navegador no permite pantalla completa.");
    } catch { setFullscreenError("No se pudo abrir la pantalla completa."); }
  }

  const parts = countdown(data?.evento_fin ?? BF_EVENT_END, now);
  const orders = data?.online_vivo?.ultimos_pedidos ?? [];
  const series = data?.online_vivo?.serie_60min ?? [];
  const maxPulse = Math.max(1, ...series.map(s => s.pedidos));
  const stores = data?.top_tiendas?.slice(0, 5) ?? [];
  const zones = data?.por_zona ?? [];
  const categories = data?.top_categorias?.slice(0, 5) ?? [];
  const channels = data?.evento?.por_canal ?? [];

  return <div ref={screen} className="bf-live min-h-screen w-full min-w-0 bg-background text-foreground tabular-nums">
    <div className="bf-content">
      <header className="bf-header">
        <div className="flex items-center gap-3"><SidebarTrigger className="text-foreground" /><span className="bf-live-dot" /><span className="text-sm font-bold text-destructive">EN VIVO</span></div>
        <h1>BLACK FRIDAY <span>MONASTERY</span></h1>
        <div className="flex flex-wrap items-center gap-2">
          <time className="mr-2 text-sm text-muted-foreground">{bogotaTime(now, true)} <span className="text-xs">BOGOTÁ</span></time>
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" onClick={toggleSound} aria-label={muted ? "Activar sonido" : "Silenciar sonido"} aria-pressed={!muted}>{muted ? <VolumeX /> : <Volume2 />}</Button></TooltipTrigger><TooltipContent>{muted ? "Activar sonido" : "Silenciar sonido"}</TooltipContent></Tooltip>
          <Button variant="outline" onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}<span>{fullscreen ? "Salir" : "Pantalla completa"}</span></Button>
        </div>
      </header>
      <section className="bf-countdown" aria-label="Cuenta regresiva del evento">
        <p className="text-xs text-muted-foreground">CIERRE DEL EVENTO · 1 DIC, 23:59:59</p>
        <div className="bf-digits">{parts.map((part, index) => <div key={index} className="bf-time-part">
          {index > 0 && <span className="bf-colon">:</span>}<div><strong key={index === 3 ? part : index} className={index === 3 ? "bf-seconds" : ""}>{String(part).padStart(2, "0")}</strong><span className="bf-time-label">{["DÍAS", "HORAS", "MINUTOS", "SEGUNDOS"][index]}</span></div>
        </div>)}</div>
      </section>
      {fullscreenError && <p role="alert" className="mb-4 text-destructive">{fullscreenError}</p>}
      {error && <div role="alert" className="bf-error"><span>bf_live: {error.message}</span><Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>Reintentar</Button>{data && <span className="text-xs">Mostrando el último dato recibido · {bogotaTime(dataUpdatedAt)}</span>}</div>}
      {isPending && <div role="status" className="flex justify-center gap-3 py-16 text-muted-foreground"><Radio className="animate-pulse" />Conectando con las ventas…</div>}
      {data && <>
        <Budget budget={data.presupuesto_mes} />
        <div className="bf-kpis">
          <Kpi label="Pedidos por minuto" value={data.online_vivo.pedidos_min_15} note="online · últimos 15 min" />
          <Kpi label="Artículos por minuto" value={data.online_vivo.articulos_min_15} note="online · últimos 15 min" />
          <Kpi label="Compradores" value={data.evento.compradores} note="total del evento" />
          <Kpi label="Ticket promedio" value={data.evento.ticket_promedio} money />
          <Kpi label="Venta Online hoy" value={data.online_vivo.venta_hoy} money note={`${data.online_vivo.pedidos_hoy.toLocaleString("es-CO")} pedidos hoy`} />
          <Kpi label="Venta total del evento" value={data.evento.venta_neta} money note={`${data.evento.pedidos.toLocaleString("es-CO")} pedidos · ${data.evento.articulos.toLocaleString("es-CO")} artículos`} />
        </div>
        <section className="bf-pulse">
          <div className="flex flex-wrap justify-between gap-2"><h2 className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-success" />Pulso Online · últimos 60 minutos</h2><span className="text-sm text-muted-foreground">Última hora <strong className="text-foreground">{liveMoney(data.online_vivo.venta_ultima_hora)}</strong></span></div>
          <div className="bf-pulse-bars" role="img" aria-label="Pedidos por minuto de los últimos 60 minutos">{series.map((point, index) => <div key={index} className="bf-pulse-track" title={`${bogotaTime(point.min)} · ${point.pedidos} pedidos`}><div className="bf-pulse-bar" style={{ height: `${Math.max(0, point.pedidos) / maxPulse * 100}%` }} /></div>)}</div>
          <div className="flex justify-between text-xs text-muted-foreground"><span>{series[0] ? bogotaTime(series[0].min) : "Hace 60 min"}</span><span>{maxPulse} pedidos/min máx.</span><span>Ahora</span></div>
        </section>
        <div className="bf-grid">
          <Section title="Ventas por zona"><BarRows rows={zones.map(z => ({ name: z.zona, value: z.venta, note: `${z.pedidos.toLocaleString("es-CO")} pedidos` }))} /></Section>
          <Section title="Tienda que más vende">
            {stores[0] ? <><div className="bf-winner"><Crown className="h-8 w-8 text-success" /><h3>{stores[0].tienda}</h3><strong>{liveMoney(stores[0].venta)}</strong><p className="text-sm text-muted-foreground">{stores[0].pedidos.toLocaleString("es-CO")} pedidos</p></div>
            <ol start={2} className="mt-5 space-y-4">{stores.slice(1).map((store, index) => <li key={store.tienda} className="flex items-start gap-3 text-sm"><span className="text-muted-foreground">{index + 2}</span><div className="min-w-0 flex-1"><span>{store.tienda}</span><p className="text-xs text-muted-foreground">{store.pedidos.toLocaleString("es-CO")} pedidos</p></div><strong>{liveMoney(store.venta)}</strong></li>)}</ol></> : <p className="text-sm text-muted-foreground">Sin ventas registradas</p>}
          </Section>
          <Section title="Top 5 productos"><ol className="space-y-4">{(data.top_productos ?? []).slice(0, 5).map((product, index) => <li key={`${product.producto}-${index}`} className="flex items-center gap-3"><span className="w-3 text-xs text-muted-foreground">{index + 1}</span><ProductImage image={product.imagen} name={product.producto} /><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{product.producto}</p><p className="mt-1 text-xs text-muted-foreground">{product.unidades.toLocaleString("es-CO")} unidades</p><strong className="text-sm">{liveMoney(product.venta)}</strong></div></li>)}</ol>{!data.top_productos?.length && <p className="text-sm text-muted-foreground">Sin ventas registradas</p>}</Section>
          <Section title="Top 5 categorías"><BarRows units rows={categories.map(c => ({ name: c.categoria, value: c.unidades, note: `${c.unidades.toLocaleString("es-CO")} unidades · ${liveMoney(c.venta)}` }))} /></Section>
          <div className="bf-channels"><Section title="Ventas por canal"><BarRows rows={channels.map(c => ({ name: c.canal, value: c.venta, note: `${c.pedidos.toLocaleString("es-CO")} pedidos` }))} /></Section></div>
        </div>
        <div className="bf-ticker" aria-label="Últimos pedidos"><div className="bf-ticker-label"><ShoppingCart className="h-4 w-4" />ÚLTIMOS PEDIDOS</div><div className="bf-ticker-window">{orders.length ? <div className="bf-ticker-track">{[0, 1].map(copy => <div className="bf-ticker-copy" key={copy} aria-hidden={copy === 1}>{orders.map((order, index) => <span key={index}>🛒 {bogotaTime(order.hora)} · <strong>{liveMoney(order.venta, false)}</strong> · {order.canal}</span>)}</div>)}</div> : <span className="px-4 text-sm text-muted-foreground">Esperando nuevos pedidos</span>}</div></div>
        <footer className="py-5 text-center text-xs text-muted-foreground">Tiendas físicas actualizadas hasta {bogotaTime(data.tiendas_actualizadas_hasta)} Bogotá. Pedidos/artículos por minuto: solo online.</footer>
      </>}
    </div>
    {newOrder && <div role="status" className="bf-order-toast"><ShoppingCart className="h-7 w-7" /><div><p>¡Nuevo pedido!</p><strong>{liveMoney(newOrder.venta, false)}</strong></div></div>}
  </div>;
}

export default function BfLivePage() {
  const { data: permissions, isLoading, error } = useUserPermissions();
  const { isAdmin, loading } = useUserRole();
  if (isLoading || loading) return <div className="p-8" role="status">Verificando permisos…</div>;
  if (error) return <div className="p-8 text-destructive" role="alert">{error.message}</div>;
  if (!canViewBfLive(permissions, isAdmin)) return <Navigate to="/" replace />;
  return <SidebarProvider><div className="flex min-h-screen w-full min-w-0"><AppSidebar /><main className="min-w-0 flex-1"><BfLiveBroadcast /></main></div></SidebarProvider>;
}