import { useEffect, useMemo, useState } from "react";
import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Download, ArrowUp, ArrowDown, Minus, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";

type Preset = "hoy" | "7d" | "14d" | "mes_anterior" | "custom";
const PRESETS: { value: Preset; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "Últimos 7 días" },
  { value: "14d", label: "Últimos 14 días" },
  { value: "mes_anterior", label: "Mes anterior" },
  { value: "custom", label: "Personalizado" },
];

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function resolvePreset(p: Preset, customDesde?: Date, customHasta?: Date): { desde: Date; hasta: Date } {
  const today = startOfDay(new Date());
  if (p === "hoy") return { desde: today, hasta: endOfDay(today) };
  if (p === "7d") return { desde: addDays(today, -6), hasta: endOfDay(today) };
  if (p === "14d") return { desde: addDays(today, -13), hasta: endOfDay(today) };
  if (p === "mes_anterior") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { desde: first, hasta: endOfDay(last) };
  }
  // custom
  const d = customDesde ? startOfDay(customDesde) : today;
  const h = customHasta ? endOfDay(customHasta) : endOfDay(today);
  return { desde: d, hasta: h };
}


type RawOrder = {
  created_at: string;
  source_name: string | null;
  payment_gateway: string | null;
  total_price: number | null;
  shopify_order_id: string;
};

const CANALES_MAP: Record<string, string> = {
  "271832285185": "Addi Marketplace",
  "pos": "POS Tienda",
  "shopify_draft_order": "Personal Shopper",
  "web": "Tienda Online",
};

const CANAL_COLORS: Record<string, string> = {
  "POS Tienda": "#3b82f6",
  "Tienda Online": "#10b981",
  "Personal Shopper": "#f97316",
  "Addi Marketplace": "#8b5cf6",
};

function classifyCanal(source: string | null) {
  if (!source) return "Otros";
  return CANALES_MAP[source] ?? source;
}

function classifyMetodo(gateway: string | null): string {
  const g = (gateway ?? "").trim().toLowerCase();
  if (!g) return "Otros";
  if (/(mastercard|visa|amex|american express|dinners|diners|redeban|alkosto)/.test(g)) return "Tarjetas débito/crédito";
  if (g === "cash" || /efectivo/.test(g)) return "Efectivo";
  if (/addi/.test(g)) return "Addi";
  if (/wompi/.test(g)) return "Wompi";
  if (/mercado/.test(g) || /mercadopago/.test(g)) return "Mercado Pago";
  if (/sistecredito/.test(g) || /siste/.test(g)) return "Sistecredito";
  if (/(manual|transferencia|saldo)/.test(g)) return "Manual/Transferencia";
  return "Otros";
}

const METODO_COLORS = [
  "#3b82f6", "#10b981", "#8b5cf6", "#f97316",
  "#ef4444", "#06b6d4", "#eab308", "#64748b",
];

function thisMonthDefault() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = new Date(y, m - 1, 1);
  const hasta = new Date(y, m, 1);
  return { desde, hasta };
}

function shortMonthLabel(d: Date) {
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

async function fetchAllOrders(desdeISO: string): Promise<RawOrder[]> {
  const out: RawOrder[] = [];
  const PAGE = 1000;
  let from = 0;
  // Loop guard
  for (let i = 0; i < 200; i++) {
    const { data, error } = await supabase
      .from("orders")
      .select("created_at, source_name, payment_gateway, total_price, shopify_order_id")
      .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
      .not("payment_gateway", "is", null)
      .gte("created_at", desdeISO)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const chunk = (data ?? []) as RawOrder[];
    out.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export default function MediosDePagoPage() {
  const [preset, setPreset] = useState<Preset>("mes_anterior");
  const [customDesde, setCustomDesde] = useState<Date | undefined>();
  const [customHasta, setCustomHasta] = useState<Date | undefined>();
  const [canalFiltro, setCanalFiltro] = useState<string>("todos");
  const [agruparPor, setAgruparPor] = useState<"metodo" | "canal">("metodo");
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<RawOrder[]>([]);

  // Rango seleccionado y rango previo (mismo largo, justo antes)
  const { desdeSel, hastaSel, desdePrev, hastaPrev } = useMemo(() => {
    const { desde, hasta } = resolvePreset(preset, customDesde, customHasta);
    const lenMs = hasta.getTime() - desde.getTime();
    const hastaPrev = new Date(desde.getTime() - 1);
    const desdePrev = new Date(hastaPrev.getTime() - lenMs);
    return { desdeSel: desde, hastaSel: hasta, desdePrev, hastaPrev };
  }, [preset, customDesde, customHasta]);

  // Fetch: 6 meses atrás del fin del rango (para barras y líneas)
  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hastaSel.getTime()]);

  async function cargar() {
    setLoading(true);
    try {
      const fetchDesde = new Date(hastaSel.getFullYear(), hastaSel.getMonth() - 5, 1);
      // También cubrir el rango previo si es muy antiguo
      const fetchDesdeFinal = desdePrev < fetchDesde ? desdePrev : fetchDesde;
      const data = await fetchAllOrders(fetchDesdeFinal.toISOString());
      setOrders(data);
    } catch (e: any) {
      console.error("[MediosDePago] error:", e);
      toast.error(`Error cargando órdenes: ${e.message ?? e}`);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }


  const ordenesEnriched = useMemo(() => {
    return orders.map((o) => ({
      ...o,
      canal: classifyCanal(o.source_name),
      metodo: classifyMetodo(o.payment_gateway),
      _date: new Date(o.created_at),
      total: Number(o.total_price) || 0,
    }));
  }, [orders]);

  const ordenesMes = useMemo(() => {
    return ordenesEnriched.filter((o) => o._date >= desdeSel && o._date <= hastaSel);
  }, [ordenesEnriched, desdeSel, hastaSel]);

  const ordenesMesPrev = useMemo(() => {
    return ordenesEnriched.filter((o) => o._date >= desdePrev && o._date <= hastaPrev);
  }, [ordenesEnriched, desdePrev, hastaPrev]);

  const ordenesMesFiltradas = useMemo(() => {
    if (canalFiltro === "todos") return ordenesMes;
    return ordenesMes.filter((o) => o.canal === canalFiltro);
  }, [ordenesMes, canalFiltro]);

  // KPIs
  const kpis = useMemo(() => {
    const ventas = ordenesMesFiltradas.reduce((a, o) => a + o.total, 0);
    const ordenes = ordenesMesFiltradas.length;
    const ticketProm = ordenes ? ventas / ordenes : 0;

    // Método más usado por órdenes
    const porMetodo: Record<string, number> = {};
    for (const o of ordenesMesFiltradas) porMetodo[o.metodo] = (porMetodo[o.metodo] || 0) + 1;
    const metodoTop = Object.entries(porMetodo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    // Canal con mayor venta (sin filtrar canal)
    const porCanal: Record<string, number> = {};
    for (const o of ordenesMes) porCanal[o.canal] = (porCanal[o.canal] || 0) + o.total;
    const canalTop = Object.entries(porCanal).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    return { ventas, ticketProm, metodoTop, canalTop };
  }, [ordenesMesFiltradas, ordenesMes]);

  // Vista 1 — Tortas por método de pago
  const tortaVentas = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of ordenesMesFiltradas) map[o.metodo] = (map[o.metodo] || 0) + o.total;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [ordenesMesFiltradas]);

  const tortaOrdenes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of ordenesMesFiltradas) map[o.metodo] = (map[o.metodo] || 0) + 1;
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [ordenesMesFiltradas]);

  // Vista 2 — Barras apiladas por mes y canal (últimos 6 meses incluyendo el seleccionado)
  const barrasMensuales = useMemo(() => {
    const anchor = hastaSel;
    const y = anchor.getFullYear(); const m = anchor.getMonth() + 1;
    const meses: { key: string; label: string; data: Record<string, number> }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      meses.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: shortMonthLabel(d),
        data: {},
      });
    }
    const idx: Record<string, number> = {};
    meses.forEach((mm, i) => (idx[mm.key] = i));
    for (const o of ordenesEnriched) {
      const k = `${o._date.getFullYear()}-${String(o._date.getMonth() + 1).padStart(2, "0")}`;
      const i = idx[k];
      if (i == null) continue;
      meses[i].data[o.canal] = (meses[i].data[o.canal] || 0) + o.total;
    }
    return meses.map((mm) => ({
      mes: mm.label,
      "POS Tienda": mm.data["POS Tienda"] || 0,
      "Tienda Online": mm.data["Tienda Online"] || 0,
      "Personal Shopper": mm.data["Personal Shopper"] || 0,
      "Addi Marketplace": mm.data["Addi Marketplace"] || 0,
    }));
  }, [ordenesEnriched, hastaSel]);

  // Vista 3 — Tabla detallada (Método x Canal con tendencia vs mes anterior)
  type FilaTabla = {
    key: string;
    metodo: string;
    canal: string;
    ordenes: number;
    ventas: number;
    pct: number;
    ticketProm: number;
    tendencia: number | null; // % vs mes anterior
  };

  const [sortKey, setSortKey] = useState<keyof FilaTabla>("ventas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filasTabla: FilaTabla[] = useMemo(() => {
    const aggCur = new Map<string, { ventas: number; ordenes: number; metodo: string; canal: string }>();
    for (const o of ordenesMesFiltradas) {
      const k = `${o.metodo}__${o.canal}`;
      const cur = aggCur.get(k) ?? { ventas: 0, ordenes: 0, metodo: o.metodo, canal: o.canal };
      cur.ventas += o.total; cur.ordenes += 1;
      aggCur.set(k, cur);
    }
    const aggPrev = new Map<string, number>();
    for (const o of ordenesMesPrev) {
      if (canalFiltro !== "todos" && o.canal !== canalFiltro) continue;
      const k = `${o.metodo}__${o.canal}`;
      aggPrev.set(k, (aggPrev.get(k) ?? 0) + o.total);
    }
    const total = Array.from(aggCur.values()).reduce((a, c) => a + c.ventas, 0);
    const arr: FilaTabla[] = Array.from(aggCur.entries()).map(([k, v]) => {
      const prev = aggPrev.get(k) ?? 0;
      const tendencia = prev > 0 ? ((v.ventas - prev) / prev) * 100 : null;
      return {
        key: k,
        metodo: v.metodo,
        canal: v.canal,
        ordenes: v.ordenes,
        ventas: v.ventas,
        pct: total > 0 ? (v.ventas / total) * 100 : 0,
        ticketProm: v.ordenes > 0 ? v.ventas / v.ordenes : 0,
        tendencia,
      };
    });
    arr.sort((a, b) => {
      const va = a[sortKey] as any; const vb = b[sortKey] as any;
      if (va == null) return 1; if (vb == null) return -1;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
    return arr;
  }, [ordenesMesFiltradas, ordenesMesPrev, canalFiltro, sortKey, sortDir]);

  // Vista 4 — Líneas por canal (ticket promedio mensual)
  const lineasTicket = useMemo(() => {
    const anchor = hastaSel;
    const y = anchor.getFullYear(); const m = anchor.getMonth() + 1;
    const meses: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      meses.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: shortMonthLabel(d) });
    }
    const idx: Record<string, number> = {};
    meses.forEach((mm, i) => (idx[mm.key] = i));
    const rows = meses.map(() => ({} as Record<string, { v: number; c: number }>));
    for (const o of ordenesEnriched) {
      const k = `${o._date.getFullYear()}-${String(o._date.getMonth() + 1).padStart(2, "0")}`;
      const i = idx[k]; if (i == null) continue;
      const r = rows[i];
      r[o.canal] = r[o.canal] ?? { v: 0, c: 0 };
      r[o.canal].v += o.total; r[o.canal].c += 1;
    }
    return meses.map((mm, i) => {
      const out: any = { mes: mm.label };
      for (const canal of Object.keys(CANAL_COLORS)) {
        const r = rows[i][canal];
        out[canal] = r && r.c > 0 ? Math.round(r.v / r.c) : null;
      }
      return out;
    });
  }, [ordenesEnriched, hastaSel]);

  // Insights
  const insights = useMemo(() => {
    // Mejor método por ticket en mes
    const mp: Record<string, { v: number; c: number }> = {};
    for (const o of ordenesMes) {
      const k = o.payment_gateway || "—";
      mp[k] = mp[k] ?? { v: 0, c: 0 };
      mp[k].v += o.total; mp[k].c += 1;
    }
    const topMet = Object.entries(mp)
      .filter(([_, x]) => x.c >= 5)
      .map(([k, x]) => ({ k, t: x.v / x.c }))
      .sort((a, b) => b.t - a.t)[0];

    const canalDigital: Record<string, { v: number; c: number }> = {};
    const digitales = new Set(["Tienda Online", "Personal Shopper", "Addi Marketplace"]);
    for (const o of ordenesMes) {
      if (!digitales.has(o.canal)) continue;
      canalDigital[o.canal] = canalDigital[o.canal] ?? { v: 0, c: 0 };
      canalDigital[o.canal].v += o.total; canalDigital[o.canal].c += 1;
    }
    const topDig = Object.entries(canalDigital)
      .map(([k, x]) => ({ k, t: x.c > 0 ? x.v / x.c : 0 }))
      .sort((a, b) => b.t - a.t)[0];

    const addi = canalDigital["Addi Marketplace"];
    const ticketAddi = addi && addi.c > 0 ? addi.v / addi.c : null;

    return { topMet, topDig, ticketAddi };
  }, [ordenesMes]);

  function exportar() {
    const data = filasTabla.map((f) => ({
      metodo: f.metodo,
      canal: f.canal,
      ordenes: f.ordenes,
      ventas_totales: Math.round(f.ventas),
      pct_total: Number(f.pct.toFixed(2)),
      ticket_promedio: Math.round(f.ticketProm),
      tendencia_pct: f.tendencia == null ? "" : Number(f.tendencia.toFixed(2)),
    }));
    const tag = `${format(desdeSel, "yyyy-MM-dd")}_${format(hastaSel, "yyyy-MM-dd")}`;
    exportToXLS(data, `medios-de-pago-${tag}`, "Medios de pago");
  }

  function toggleSort(k: keyof FilaTabla) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  }

  const ticketBg = (v: number) =>
    v > 800_000 ? "bg-emerald-50" : v >= 500_000 ? "bg-amber-50" : "";

  return (
    <FinanzasLayout title="Medios de Pago">
      {/* Filtros */}
      <Card className="mb-4">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Período</label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Desde</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("h-9 w-40 justify-start font-normal", !customDesde && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customDesde ? format(customDesde, "dd MMM yyyy", { locale: es }) : "Elegir"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDesde}
                      onSelect={setCustomDesde}
                      locale={es}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("h-9 w-40 justify-start font-normal", !customHasta && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customHasta ? format(customHasta, "dd MMM yyyy", { locale: es }) : "Elegir"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customHasta}
                      onSelect={setCustomHasta}
                      locale={es}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
          <div className="text-xs text-muted-foreground self-end pb-2">
            {format(desdeSel, "dd MMM", { locale: es })} – {format(hastaSel, "dd MMM yyyy", { locale: es })}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Canal</label>
            <Select value={canalFiltro} onValueChange={setCanalFiltro}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="POS Tienda">POS Tienda</SelectItem>
                <SelectItem value="Tienda Online">Tienda Online</SelectItem>
                <SelectItem value="Personal Shopper">Personal Shopper</SelectItem>
                <SelectItem value="Addi Marketplace">Addi Marketplace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Agrupar por</label>
            <Select value={agruparPor} onValueChange={(v) => setAgruparPor(v as any)}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="metodo">Método de pago</SelectItem>
                <SelectItem value="canal">Canal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportar} variant="outline" className="gap-2 ml-auto" disabled={loading || filasTabla.length === 0}>
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ventas del período</p>
          {loading ? <Skeleton className="h-7 w-32 mt-1" /> :
            <p className="text-2xl font-semibold text-emerald-600">{fmtCOP(kpis.ventas)}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Ticket promedio general</p>
          {loading ? <Skeleton className="h-7 w-32 mt-1" /> :
            <p className="text-2xl font-semibold text-blue-600">{fmtCOP(kpis.ticketProm)}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Método más usado</p>
          {loading ? <Skeleton className="h-7 w-32 mt-1" /> :
            <p className="text-xl font-semibold">{kpis.metodoTop}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Canal con mayor venta</p>
          {loading ? <Skeleton className="h-7 w-32 mt-1" /> :
            <p className="text-xl font-semibold">{kpis.canalTop}</p>}
        </CardContent></Card>
      </div>

      {/* Vista 1 — Tortas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card><CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Distribución por método (% ventas)</p>
          <div className="h-72">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={tortaVentas} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                    {tortaVentas.map((_, i) => <Cell key={i} fill={METODO_COLORS[i % METODO_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtCOP(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm font-medium mb-2">Distribución por método (% órdenes)</p>
          <div className="h-72">
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={tortaOrdenes} dataKey="value" nameKey="name" outerRadius={90} label={(e: any) => `${((e.percent ?? 0) * 100).toFixed(0)}%`}>
                    {tortaOrdenes.map((_, i) => <Cell key={i} fill={METODO_COLORS[i % METODO_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtInt(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent></Card>
      </div>

      {/* Vista 2 — Barras apiladas */}
      <Card className="mb-4"><CardContent className="p-4">
        <p className="text-sm font-medium mb-2">Ventas mensuales por canal (últimos 6 meses)</p>
        <div className="h-80">
          {loading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer>
              <BarChart data={barrasMensuales}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" fontSize={12} />
                <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} fontSize={12} />
                <Tooltip formatter={(v: any) => fmtCOP(Number(v))} />
                <Legend />
                <Bar dataKey="POS Tienda" stackId="a" fill={CANAL_COLORS["POS Tienda"]} />
                <Bar dataKey="Tienda Online" stackId="a" fill={CANAL_COLORS["Tienda Online"]} />
                <Bar dataKey="Personal Shopper" stackId="a" fill={CANAL_COLORS["Personal Shopper"]} />
                <Bar dataKey="Addi Marketplace" stackId="a" fill={CANAL_COLORS["Addi Marketplace"]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent></Card>

      {/* Vista 3 — Tabla */}
      <Card className="mb-4"><CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filasTabla.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Sin datos para los filtros seleccionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr className="text-left">
                  {[
                    { k: "metodo", label: "Método", align: "left" },
                    { k: "canal", label: "Canal", align: "left" },
                    { k: "ordenes", label: "Órdenes", align: "right" },
                    { k: "ventas", label: "Ventas", align: "right" },
                    { k: "pct", label: "% Total", align: "right" },
                    { k: "ticketProm", label: "Ticket Prom.", align: "right" },
                    { k: "tendencia", label: "vs Mes Ant.", align: "right" },
                  ].map((c) => (
                    <th
                      key={c.k}
                      onClick={() => toggleSort(c.k as any)}
                      className={`px-3 py-2 cursor-pointer select-none ${c.align === "right" ? "text-right" : ""} ${sortKey === c.k ? "text-foreground" : ""}`}
                    >
                      {c.label}{sortKey === c.k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filasTabla.map((f) => (
                  <tr key={f.key} className={`border-t hover:bg-muted/20 ${ticketBg(f.ticketProm)}`}>
                    <td className="px-3 py-2 font-medium">{f.metodo}</td>
                    <td className="px-3 py-2">{f.canal}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(f.ordenes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(f.ventas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(f.ticketProm)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {f.tendencia == null ? (
                        <span className="text-muted-foreground inline-flex items-center gap-1"><Minus className="h-3 w-3" />—</span>
                      ) : f.tendencia >= 0 ? (
                        <span className="text-emerald-600 inline-flex items-center gap-1 justify-end"><ArrowUp className="h-3 w-3" />{f.tendencia.toFixed(1)}%</span>
                      ) : (
                        <span className="text-rose-600 inline-flex items-center gap-1 justify-end"><ArrowDown className="h-3 w-3" />{Math.abs(f.tendencia).toFixed(1)}%</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent></Card>
    </FinanzasLayout>
  );
}
