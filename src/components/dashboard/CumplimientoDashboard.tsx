import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Target, Calendar, Store, Globe, MapPin, FlagTriangleRight, Turtle, Rabbit, Rocket, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportCumplimientoPDF } from "@/lib/cumplimiento-pdf-export";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];
const IVA_DIVISOR = 1.19;

type ConfigRow = { nombre_identificador: string; monto: number; tipo: string };
type LocationRow = { location_id: string; name: string; zona: string | null };

// ── Helpers ──
function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function fmtCOP(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function pctColor(pct: number) {
  if (pct >= 100) return "text-[hsl(var(--success))]";
  if (pct >= 80) return "text-[hsl(var(--warning))]";
  return "text-[hsl(var(--danger))]";
}

function pctBg(pct: number) {
  if (pct >= 100) return "bg-[hsl(var(--success))]";
  if (pct >= 80) return "bg-[hsl(var(--warning))]";
  return "bg-[hsl(var(--danger))]";
}

function pctBadgeVariant(pct: number): "default" | "secondary" | "destructive" {
  if (pct >= 100) return "default";
  if (pct >= 80) return "secondary";
  return "destructive";
}

// ── Types for aggregation ──
type SalesData = {
  ventaNeta: number;
  pedidos: number;
  unidades: number;
};

type DailySales = Record<string, SalesData>; // "YYYY-MM-DD" -> data

export function CumplimientoDashboard() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [salesByStore, setSalesByStore] = useState<Record<string, SalesData>>({});
  const [salesByChannel, setSalesByChannel] = useState<Record<string, SalesData>>({});
  const [dailySales, setDailySales] = useState<DailySales>({});
  const [loading, setLoading] = useState(true);

  // Helper to fetch all rows with pagination (bypasses 1000-row limit)
  async function fetchAll<T>(
    tableName: string,
    select: string,
    filters: (q: any) => any,
    pageSize = 1000
  ): Promise<T[]> {
    let allData: T[] = [];
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const query = filters((supabase.from as any)(tableName).select(select));
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) { hasMore = false; break; }
      allData = allData.concat(data as T[]);
      if (data.length < pageSize) hasMore = false;
      from += pageSize;
    }
    return allData;
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const startDate = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const endMonth = mes === 12 ? 1 : mes + 1;
      const endYear = mes === 12 ? anio + 1 : anio;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      // Parallel fetches
      const [cfgs, orders, locs] = await Promise.all([
        supabase
          .from("presupuestos_config")
          .select("nombre_identificador, monto, tipo")
          .eq("anio", anio)
          .eq("mes", mes)
          .then(r => r.data || []),
        fetchAll<any>(
          "orders",
          "shopify_order_id, location_id, total_price, source_name, created_at",
          (q: any) => q.gte("created_at", startDate).lt("created_at", endDate)
        ),
        supabase
          .from("locations")
          .select("location_id, name, zona")
          .eq("is_active", true)
          .then(r => r.data || []),
      ]);

      setConfigs(cfgs);
      setLocations(locs);

      // Fetch order_items for these orders (paginated)
      const orderIds = orders.map((o: any) => o.shopify_order_id).filter(Boolean);
      let items: any[] = [];
      // Batch order_items queries in chunks of 200 IDs
      const chunkSize = 200;
      const itemPromises = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        const chunk = orderIds.slice(i, i + chunkSize);
        itemPromises.push(
          fetchAll<any>(
            "order_items",
            "shopify_order_id, quantity",
            (q: any) => q.in("shopify_order_id", chunk)
          )
        );
      }
      const itemResults = await Promise.all(itemPromises);
      items = itemResults.flat();

      // Build location map
      const locMap: Record<string, string> = {};
      const locZonaMap: Record<string, string> = {};
      locs.forEach((l: any) => {
        locMap[l.location_id] = l.name;
        locZonaMap[l.location_id] = l.zona || "Sin Zona";
      });

      // Build units per order from order_items
      const unitsByOrder: Record<string, number> = {};
      items.forEach((item: any) => {
        if (item.shopify_order_id) {
          unitsByOrder[item.shopify_order_id] = (unitsByOrder[item.shopify_order_id] || 0) + Number(item.quantity || 0);
        }
      });

      // Aggregate
      const byStore: Record<string, SalesData> = {};
      const byChannel: Record<string, SalesData> = {};
      const byDay: DailySales = {};

      orders.forEach((o: any) => {
        const netSale = Number(o.total_price || 0) / IVA_DIVISOR;
        const units = unitsByOrder[o.shopify_order_id] || 0;
        const storeName = locMap[o.location_id] || o.location_id;

        // By store
        if (!byStore[storeName]) byStore[storeName] = { ventaNeta: 0, pedidos: 0, unidades: 0 };
        byStore[storeName].ventaNeta += netSale;
        byStore[storeName].pedidos += 1;
        byStore[storeName].unidades += units;

        // By channel
        let channel = "POS";
        if (o.source_name === "shopify_draft_order") {
          channel = "Personal Shopper";
        } else if (o.location_id === "71474315479" || o.source_name !== "pos") {
          channel = "Tienda Online";
        }
        if (!byChannel[channel]) byChannel[channel] = { ventaNeta: 0, pedidos: 0, unidades: 0 };
        byChannel[channel].ventaNeta += netSale;
        byChannel[channel].pedidos += 1;
        byChannel[channel].unidades += units;

        // By day
        const day = o.created_at?.substring(0, 10) || "";
        if (day) {
          if (!byDay[day]) byDay[day] = { ventaNeta: 0, pedidos: 0, unidades: 0 };
          byDay[day].ventaNeta += netSale;
          byDay[day].pedidos += 1;
          byDay[day].unidades += units;
        }
      });

      setSalesByStore(byStore);
      setSalesByChannel(byChannel);
      setDailySales(byDay);
      setLoading(false);
    };
    load();
  }, [anio, mes]);

  // ── Computed ──
  const totalBudget = configs.reduce((s, c) => s + Number(c.monto), 0);
  const totalVentaNeta = Object.values(salesByStore).reduce((s, v) => s + v.ventaNeta, 0);
  const totalPedidos = Object.values(salesByStore).reduce((s, v) => s + v.pedidos, 0);
  const totalUnidades = Object.values(salesByStore).reduce((s, v) => s + v.unidades, 0);
  const globalPct = totalBudget > 0 ? (totalVentaNeta / totalBudget) * 100 : 0;
  const ticketPromedio = totalPedidos > 0 ? totalVentaNeta / totalPedidos : 0;

  const storeConfigs = configs.filter(c => c.tipo === "tienda");
  const channelConfigs = configs.filter(c => c.tipo === "canal");
  const totalBudgetCanales = channelConfigs.reduce((s, c) => s + Number(c.monto), 0);
  const totalBudgetTiendas = storeConfigs.reduce((s, c) => s + Number(c.monto), 0);
  const totalVentaCanales = Object.entries(salesByChannel)
    .filter(([ch]) => ch !== "POS")
    .reduce((s, [, v]) => s + v.ventaNeta, 0);

  // Cumplimiento a la fecha: presupuesto prorrateado
  const numDaysInMonth = daysInMonth(anio, mes);
  const todayRef = new Date();
  const isCurrentMonthRef = todayRef.getFullYear() === anio && todayRef.getMonth() + 1 === mes;
  const daysElapsed = isCurrentMonthRef ? todayRef.getDate() : numDaysInMonth;
  const budgetToDate = totalBudget > 0 ? (totalBudget / numDaysInMonth) * daysElapsed : 0;
  const pctToDate = budgetToDate > 0 ? (totalVentaNeta / budgetToDate) * 100 : 0;

  // Total Tiendas aggregation
  const totalVentaTiendas = storeConfigs.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.ventaNeta || 0), 0);
  const totalPedidosTiendas = storeConfigs.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.pedidos || 0), 0);
  const totalUnidadesTiendas = storeConfigs.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.unidades || 0), 0);

  // Daily chart data
  const numDays = daysInMonth(anio, mes);
  const dailyTarget = totalBudget > 0 ? totalBudget / numDays : 0;

  const dailyData = useMemo(() => {
    const result = [];
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const data = dailySales[dateStr] || { ventaNeta: 0, pedidos: 0, unidades: 0 };
      const pct = dailyTarget > 0 ? (data.ventaNeta / dailyTarget) * 100 : 0;
      result.push({ day: d, dateStr, ...data, pct });
    }
    return result;
  }, [dailySales, numDays, dailyTarget, anio, mes]);

  // Hierarchical table rows
  const tableRows = useMemo(() => {
    const rows: Array<{
      level: "group" | "subgroup" | "item" | "total-tiendas";
      label: string;
      budget: number;
      ventaNeta: number;
      pct: number;
      pctGeneral: number;
      pctToDate: number;
      unidades: number;
      ticket: number;
    }> = [];

    const calcPctGeneral = (venta: number) => totalVentaNeta > 0 ? (venta / totalVentaNeta) * 100 : 0;
    const calcPctToDate = (budget: number, venta: number) => {
      const bToDate = budget > 0 ? (budget / numDaysInMonth) * daysElapsed : 0;
      return bToDate > 0 ? (venta / bToDate) * 100 : 0;
    };

    // ── Digital ──
    const digitalVenta = channelConfigs.reduce((s, c) => {
      const ch = salesByChannel[c.nombre_identificador];
      return s + (ch?.ventaNeta || 0);
    }, 0);
    const digitalPedidos = channelConfigs.reduce((s, c) => {
      const ch = salesByChannel[c.nombre_identificador];
      return s + (ch?.pedidos || 0);
    }, 0);
    const digitalUnidades = channelConfigs.reduce((s, c) => {
      const ch = salesByChannel[c.nombre_identificador];
      return s + (ch?.unidades || 0);
    }, 0);

    rows.push({
      level: "group",
      label: "🌐 Canales Digitales",
      budget: totalBudgetCanales,
      ventaNeta: digitalVenta,
      pct: totalBudgetCanales > 0 ? (digitalVenta / totalBudgetCanales) * 100 : 0,
      pctGeneral: calcPctGeneral(digitalVenta),
      pctToDate: calcPctToDate(totalBudgetCanales, digitalVenta),
      unidades: digitalUnidades,
      ticket: digitalPedidos > 0 ? digitalVenta / digitalPedidos : 0,
    });

    channelConfigs.forEach((c) => {
      const ch = salesByChannel[c.nombre_identificador] || { ventaNeta: 0, pedidos: 0, unidades: 0 };
      rows.push({
        level: "item",
        label: c.nombre_identificador,
        budget: Number(c.monto),
        ventaNeta: ch.ventaNeta,
        pct: Number(c.monto) > 0 ? (ch.ventaNeta / Number(c.monto)) * 100 : 0,
        pctGeneral: calcPctGeneral(ch.ventaNeta),
        pctToDate: calcPctToDate(Number(c.monto), ch.ventaNeta),
        unidades: ch.unidades,
        ticket: ch.pedidos > 0 ? ch.ventaNeta / ch.pedidos : 0,
      });
    });

    // ── Total Tiendas ──
    rows.push({
      level: "total-tiendas",
      label: "🏪 TOTAL TIENDAS",
      budget: totalBudgetTiendas,
      ventaNeta: totalVentaTiendas,
      pct: totalBudgetTiendas > 0 ? (totalVentaTiendas / totalBudgetTiendas) * 100 : 0,
      pctGeneral: calcPctGeneral(totalVentaTiendas),
      pctToDate: calcPctToDate(totalBudgetTiendas, totalVentaTiendas),
      unidades: totalUnidadesTiendas,
      ticket: totalPedidosTiendas > 0 ? totalVentaTiendas / totalPedidosTiendas : 0,
    });

    // ── Tiendas by Zona ──
    const zonaGroups: Record<string, { stores: ConfigRow[]; zona: string }> = {};
    storeConfigs.forEach((c) => {
      const loc = locations.find(l => l.name === c.nombre_identificador);
      const zona = loc?.zona || "Sin Zona";
      if (!zonaGroups[zona]) zonaGroups[zona] = { stores: [], zona };
      zonaGroups[zona].stores.push(c);
    });

    Object.entries(zonaGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([zona, { stores }]) => {
        const zonaVenta = stores.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.ventaNeta || 0), 0);
        const zonaBudget = stores.reduce((s, c) => s + Number(c.monto), 0);
        const zonaPedidos = stores.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.pedidos || 0), 0);
        const zonaUnidades = stores.reduce((s, c) => s + (salesByStore[c.nombre_identificador]?.unidades || 0), 0);

        rows.push({
          level: "subgroup",
          label: `📍 ${zona}`,
          budget: zonaBudget,
          ventaNeta: zonaVenta,
          pct: zonaBudget > 0 ? (zonaVenta / zonaBudget) * 100 : 0,
          pctGeneral: calcPctGeneral(zonaVenta),
          pctToDate: calcPctToDate(zonaBudget, zonaVenta),
          unidades: zonaUnidades,
          ticket: zonaPedidos > 0 ? zonaVenta / zonaPedidos : 0,
        });

        stores
          .sort((a, b) => a.nombre_identificador.localeCompare(b.nombre_identificador))
          .forEach((c) => {
            const st = salesByStore[c.nombre_identificador] || { ventaNeta: 0, pedidos: 0, unidades: 0 };
            rows.push({
              level: "item",
              label: c.nombre_identificador,
              budget: Number(c.monto),
              ventaNeta: st.ventaNeta,
              pct: Number(c.monto) > 0 ? (st.ventaNeta / Number(c.monto)) * 100 : 0,
              pctGeneral: calcPctGeneral(st.ventaNeta),
              pctToDate: calcPctToDate(Number(c.monto), st.ventaNeta),
              unidades: st.unidades,
              ticket: st.pedidos > 0 ? st.ventaNeta / st.pedidos : 0,
            });
          });
      });

    return rows;
  }, [configs, salesByStore, salesByChannel, locations, storeConfigs, channelConfigs, totalBudgetCanales, totalBudgetTiendas, totalVentaTiendas, totalPedidosTiendas, totalUnidadesTiendas, totalVentaNeta, numDaysInMonth, daysElapsed]);

  // Today index for daily chart
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === anio && today.getMonth() + 1 === mes;
  const currentDay = isCurrentMonth ? today.getDate() : numDays;

  // Max daily value for chart scaling
  const maxDailyValue = Math.max(dailyTarget, ...dailyData.map(d => d.ventaNeta), 1);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Cargando cumplimiento...</div>;
  }

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay presupuestos configurados para {MONTHS[mes - 1]} {anio}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Select value={anio.toString()} onValueChange={(v) => setAnio(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mes.toString()} onValueChange={(v) => setMes(Number(v))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => exportCumplimientoPDF(
            "cumplimiento-dashboard-content",
            MONTHS[mes - 1],
            anio
          )}
        >
          <FileDown className="h-4 w-4" />
          Generar PDF
        </Button>
      </div>

      <div id="cumplimiento-dashboard-content" className="space-y-6 bg-background">
      {/* ── Master KPI ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cumplimiento Mes */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Cumplimiento Mes</span>
                <FlagTriangleRight className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className={`text-3xl font-bold ${pctColor(globalPct)}`}>{globalPct.toFixed(1)}%</span>
            </div>
            <div className="relative mt-6">
              <Progress
                value={Math.min(globalPct, 100)}
                className="h-3"
                indicatorClassName={pctBg(globalPct)}
              />
              {(() => {
                const expectedPct = (daysElapsed / numDaysInMonth) * 100;
                const diff = globalPct - expectedPct;
                const PaceIcon = diff >= 10 ? Rocket : diff >= 0 ? Rabbit : Turtle;
                const paceColor = diff >= 10 ? "text-[hsl(var(--success))]" : diff >= 0 ? "text-[hsl(var(--warning))]" : "text-[hsl(var(--danger))]";
                const paceLabel = diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
                const position = Math.min(Math.max(globalPct, 5), 95);
                return (
                  <div className="absolute flex flex-col items-center" style={{ left: `${position}%`, bottom: '100%', transform: 'translateX(-50%)' }}>
                    <PaceIcon className={`h-5 w-5 ${paceColor}`} />
                    <span className={`text-[9px] font-bold ${paceColor}`}>{paceLabel}</span>
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Venta Neta: {fmtCOP(totalVentaNeta)}</span>
              <span>Meta: {fmtCOP(totalBudget)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Cumplimiento a la Fecha */}
        <Card>
          <CardContent className="py-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">Cumplimiento a la Fecha</span>
              </div>
              <span className={`text-3xl font-bold ${pctColor(pctToDate)}`}>{pctToDate.toFixed(1)}%</span>
            </div>
            <Progress
              value={Math.min(pctToDate, 100)}
              className="h-3"
              indicatorClassName={pctBg(pctToDate)}
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground">
              <span>Venta: {fmtCOP(totalVentaNeta)}</span>
              <span>Meta día {daysElapsed}: {fmtCOP(budgetToDate)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Unidades Vendidas</p>
            <p className="text-xl font-bold text-foreground">{totalUnidades.toLocaleString("es-CO")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Ticket Promedio</p>
            <p className="text-xl font-bold text-foreground">{fmtCOP(ticketPromedio)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Daily Gamified History ── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" /> Historial Diario
            </CardTitle>
            {(() => {
              const daysWithSales = dailyData.slice(0, currentDay).filter(d => d.ventaNeta > 0);
              const avgPct = daysWithSales.length > 0 ? daysWithSales.reduce((s, d) => s + d.pct, 0) / daysWithSales.length : 0;
              return (
                <span className={`text-sm font-bold ${pctColor(avgPct)}`}>
                  Promedio diario: {avgPct.toFixed(1)}%
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground">
            Objetivo diario: {fmtCOP(dailyTarget)}
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-[2px] h-40">
            {dailyData.slice(0, currentDay).map((d) => {
              const heightPct = maxDailyValue > 0 ? (d.ventaNeta / maxDailyValue) * 100 : 0;
              const barColor = d.pct >= 100
                ? "bg-[hsl(142,76%,46%)]"
                : d.pct >= 80
                ? "bg-[hsl(var(--warning))]"
                : "bg-[hsl(var(--danger))]";
              return (
                <div
                  key={d.day}
                  className="group relative flex-1 flex flex-col items-center justify-end h-full"
                >
                  <div
                    className={`w-full rounded-t-sm ${barColor} transition-all min-h-[2px]`}
                    style={{ height: `${Math.max(heightPct, 1.5)}%` }}
                  />
                  <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 bg-popover border border-border rounded-md px-2 py-1 shadow-md whitespace-nowrap">
                    <p className="text-[10px] font-semibold text-foreground">{d.day} {MONTHS[mes - 1]}</p>
                    <p className="text-[10px] text-muted-foreground">Venta: {fmtCOP(d.ventaNeta)}</p>
                    <p className={`text-[10px] font-bold ${pctColor(d.pct)}`}>{d.pct.toFixed(0)}%</p>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Day legend below */}
          <div className="flex gap-[2px] mt-1">
            {dailyData.slice(0, currentDay).map((d) => (
              <div key={d.day} className="flex-1 text-center">
                <span className="text-[8px] text-muted-foreground">{d.day}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Hierarchical Compliance Table ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="h-4 w-4" /> Tabla de Cumplimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Canal / Tienda</TableHead>
                <TableHead className="text-right font-semibold">Presupuesto</TableHead>
                <TableHead className="text-right font-semibold">Venta Neta</TableHead>
                <TableHead className="text-right font-semibold">Cumpl. General %</TableHead>
                <TableHead className="text-right font-semibold">% a la Fecha</TableHead>
                <TableHead className="text-right font-semibold">Uds.</TableHead>
                <TableHead className="text-right font-semibold">Ticket Prom.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Grand total row */}
              <TableRow className="bg-primary/5 font-bold border-b-2 border-primary/20">
                <TableCell className="font-bold text-foreground">🏆 VENTA DIRECTA</TableCell>
                <TableCell className="text-right font-bold">{fmtCOP(totalBudget)}</TableCell>
                <TableCell className="text-right font-bold">{fmtCOP(totalVentaNeta)}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={pctBadgeVariant(globalPct)} className="text-xs font-bold">
                    {globalPct.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant={pctBadgeVariant(pctToDate)} className="text-xs font-bold">
                    {pctToDate.toFixed(1)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-bold">{totalUnidades.toLocaleString("es-CO")}</TableCell>
                <TableCell className="text-right font-bold">{fmtCOP(ticketPromedio)}</TableCell>
              </TableRow>

              {tableRows.map((row, idx) => {
                const isGroup = row.level === "group";
                const isSubgroup = row.level === "subgroup";
                const isItem = row.level === "item";
                const isTotalTiendas = row.level === "total-tiendas";
                const zebraClass = isItem && idx % 2 === 0 ? "bg-muted/20" : "";

                return (
                  <TableRow
                    key={`${row.label}-${idx}`}
                    className={`
                      ${isGroup ? "bg-muted/40 font-semibold border-t-2 border-border" : ""}
                      ${isTotalTiendas ? "bg-accent/10 font-bold border-t-2 border-border" : ""}
                      ${isSubgroup ? "bg-muted/25 font-medium border-t border-border" : ""}
                      ${zebraClass}
                    `}
                  >
                    <TableCell className={`
                      ${isGroup ? "font-semibold text-foreground" : ""}
                      ${isTotalTiendas ? "font-bold text-foreground" : ""}
                      ${isSubgroup ? "font-medium text-foreground pl-6" : ""}
                      ${isItem ? "pl-10 text-sm text-muted-foreground" : ""}
                    `}>
                      <span className="flex items-center gap-1">
                        {(row.level === "item" || row.level === "subgroup" || row.level === "total-tiendas") && row.pctToDate < 100 && (
                          <Turtle className="h-3.5 w-3.5 text-[hsl(var(--danger))] shrink-0" />
                        )}
                        {row.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtCOP(row.budget)}</TableCell>
                    <TableCell className="text-right text-sm">{fmtCOP(row.ventaNeta)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={pctBadgeVariant(row.pct)} className="text-xs">
                        {row.pct.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={pctBadgeVariant(row.pctToDate)} className="text-xs">
                        {row.pctToDate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">{row.unidades.toLocaleString("es-CO")}</TableCell>
                    <TableCell className="text-right text-sm">{fmtCOP(row.ticket)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
