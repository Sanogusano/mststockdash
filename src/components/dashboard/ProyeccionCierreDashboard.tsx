import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Calendar, TrendingDown, TrendingUp, Target, Minus } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

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

interface ProyeccionRow {
  nombre: string;
  tipo: string;
  zona: string | null;
  venta_actual: number;
  presupuesto_mes: number;
  dias_transcurridos: number;
  dias_mes: number;
  pct_cumplimiento_general: number;
  pct_cumplimiento_fecha: number;
  cierre_conservador: number;
  cierre_probable: number;
  cierre_optimista: number;
}

type FilterStatus = "todos" | "cumple" | "no-cumple";

export function ProyeccionCierreDashboard() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ProyeccionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("todos");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase.rpc(
        "calcular_proyecciones_y_cumplimiento" as any,
        { p_anio: anio, p_mes: mes }
      );
      if (!error && rows) setData(rows as ProyeccionRow[]);
      else setData([]);
      setLoading(false);
    };
    load();
  }, [anio, mes]);

  // Global totals
  const totals = useMemo(() => {
    const ventaActual = data.reduce((s, r) => s + Number(r.venta_actual), 0);
    const presupuesto = data.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
    const conservador = data.reduce((s, r) => s + Number(r.cierre_conservador), 0);
    const probable = data.reduce((s, r) => s + Number(r.cierre_probable), 0);
    const optimista = data.reduce((s, r) => s + Number(r.cierre_optimista), 0);
    const diasTranscurridos = data[0]?.dias_transcurridos ?? 0;
    const diasMes = data[0]?.dias_mes ?? 30;
    return { ventaActual, presupuesto, conservador, probable, optimista, diasTranscurridos, diasMes };
  }, [data]);

  // Hierarchical table rows
  const tableRows = useMemo(() => {
    const rows: Array<{
      level: "group" | "subgroup" | "item" | "total-tiendas";
      label: string;
      ventaActual: number;
      presupuesto: number;
      pctGeneral: number;
      pctFecha: number;
      conservador: number;
      probable: number;
      optimista: number;
    }> = [];

    const channels = data.filter(r => r.tipo === "canal");
    const stores = data.filter(r => r.tipo === "tienda");

    // Canales Digitales group
    if (channels.length > 0) {
      const chVenta = channels.reduce((s, r) => s + Number(r.venta_actual), 0);
      const chPresup = channels.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
      const chCons = channels.reduce((s, r) => s + Number(r.cierre_conservador), 0);
      const chProb = channels.reduce((s, r) => s + Number(r.cierre_probable), 0);
      const chOpt = channels.reduce((s, r) => s + Number(r.cierre_optimista), 0);
      const budgetToDate = chPresup > 0 ? (chPresup / totals.diasMes) * totals.diasTranscurridos : 0;

      rows.push({
        level: "group",
        label: "🌐 Canales Digitales",
        ventaActual: chVenta,
        presupuesto: chPresup,
        pctGeneral: chPresup > 0 ? (chVenta / chPresup) * 100 : 0,
        pctFecha: budgetToDate > 0 ? (chVenta / budgetToDate) * 100 : 0,
        conservador: chCons,
        probable: chProb,
        optimista: chOpt,
      });

      channels.forEach(c => {
        rows.push({
          level: "item",
          label: c.nombre,
          ventaActual: Number(c.venta_actual),
          presupuesto: Number(c.presupuesto_mes),
          pctGeneral: Number(c.pct_cumplimiento_general),
          pctFecha: Number(c.pct_cumplimiento_fecha),
          conservador: Number(c.cierre_conservador),
          probable: Number(c.cierre_probable),
          optimista: Number(c.cierre_optimista),
        });
      });
    }

    // Total Tiendas
    if (stores.length > 0) {
      const stVenta = stores.reduce((s, r) => s + Number(r.venta_actual), 0);
      const stPresup = stores.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
      const stCons = stores.reduce((s, r) => s + Number(r.cierre_conservador), 0);
      const stProb = stores.reduce((s, r) => s + Number(r.cierre_probable), 0);
      const stOpt = stores.reduce((s, r) => s + Number(r.cierre_optimista), 0);
      const budgetToDate = stPresup > 0 ? (stPresup / totals.diasMes) * totals.diasTranscurridos : 0;

      rows.push({
        level: "total-tiendas",
        label: "🏪 TOTAL TIENDAS",
        ventaActual: stVenta,
        presupuesto: stPresup,
        pctGeneral: stPresup > 0 ? (stVenta / stPresup) * 100 : 0,
        pctFecha: budgetToDate > 0 ? (stVenta / budgetToDate) * 100 : 0,
        conservador: stCons,
        probable: stProb,
        optimista: stOpt,
      });

      // Group stores by zona
      const zonaGroups: Record<string, ProyeccionRow[]> = {};
      stores.forEach(s => {
        const z = s.zona || "Sin Zona";
        if (!zonaGroups[z]) zonaGroups[z] = [];
        zonaGroups[z].push(s);
      });

      Object.entries(zonaGroups)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([zona, zStores]) => {
          const zVenta = zStores.reduce((s, r) => s + Number(r.venta_actual), 0);
          const zPresup = zStores.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
          const zCons = zStores.reduce((s, r) => s + Number(r.cierre_conservador), 0);
          const zProb = zStores.reduce((s, r) => s + Number(r.cierre_probable), 0);
          const zOpt = zStores.reduce((s, r) => s + Number(r.cierre_optimista), 0);
          const budgetToDate = zPresup > 0 ? (zPresup / totals.diasMes) * totals.diasTranscurridos : 0;

          rows.push({
            level: "subgroup",
            label: `📍 ${zona}`,
            ventaActual: zVenta,
            presupuesto: zPresup,
            pctGeneral: zPresup > 0 ? (zVenta / zPresup) * 100 : 0,
            pctFecha: budgetToDate > 0 ? (zVenta / budgetToDate) * 100 : 0,
            conservador: zCons,
            probable: zProb,
            optimista: zOpt,
          });

          zStores
            .sort((a, b) => a.nombre.localeCompare(b.nombre))
            .forEach(st => {
              rows.push({
                level: "item",
                label: st.nombre,
                ventaActual: Number(st.venta_actual),
                presupuesto: Number(st.presupuesto_mes),
                pctGeneral: Number(st.pct_cumplimiento_general),
                pctFecha: Number(st.pct_cumplimiento_fecha),
                conservador: Number(st.cierre_conservador),
                probable: Number(st.cierre_probable),
                optimista: Number(st.cierre_optimista),
              });
            });
        });
    }

    return rows;
  }, [data, totals]);

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Cargando proyecciones...</div>;
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay presupuestos configurados para {MONTHS[mes - 1]} {anio}</p>
        </CardContent>
      </Card>
    );
  }

  const pctPresupConservador = totals.presupuesto > 0 ? (totals.conservador / totals.presupuesto) * 100 : 0;
  const pctPresupProbable = totals.presupuesto > 0 ? (totals.probable / totals.presupuesto) * 100 : 0;
  const pctPresupOptimista = totals.presupuesto > 0 ? (totals.optimista / totals.presupuesto) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Period Selector */}
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
        <Badge variant="outline" className="text-xs">
          Día {totals.diasTranscurridos} de {totals.diasMes}
        </Badge>
      </div>

      {/* KPI Cards - Venta Directa */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" /> Venta Actual MTD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{fmtCOP(totals.ventaActual)}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Presupuesto: {fmtCOP(totals.presupuesto)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-[hsl(var(--danger))]" /> Conservador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{fmtCOP(totals.conservador)}</p>
            <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupConservador)}`}>
              {pctPresupConservador.toFixed(1)}% del presupuesto
            </p>
          </CardContent>
        </Card>

        <Card className="border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Probable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{fmtCOP(totals.probable)}</p>
            <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupProbable)}`}>
              {pctPresupProbable.toFixed(1)}% del presupuesto
            </p>
          </CardContent>
        </Card>

        <Card className="border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Optimista
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-foreground">{fmtCOP(totals.optimista)}</p>
            <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupOptimista)}`}>
              {pctPresupOptimista.toFixed(1)}% del presupuesto
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Hierarchical Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Detalle de Cumplimiento y Proyección</CardTitle>
            <div className="flex gap-1">
              {([
                { value: "todos", label: "Todos" },
                { value: "cumple", label: "Cumple" },
                { value: "no-cumple", label: "No Cumple" },
              ] as const).map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setFilterStatus(tab.value)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    filterStatus === tab.value
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px] font-semibold w-[22%]">Nombre</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[11%]">Venta MTD</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[11%]">Presup.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[9%]">% Gral</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[9%]">% Fecha</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[13%] text-[hsl(var(--danger))]">Conserv.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[13%] text-[hsl(var(--warning))]">Probable</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right w-[13%] text-[hsl(var(--success))]">Optimista</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows
                  .filter(row => {
                    if (filterStatus === "todos") return true;
                    if (row.level !== "item") return true;
                    if (row.presupuesto <= 0) return true;
                    const pctProb = (row.probable / row.presupuesto) * 100;
                    return filterStatus === "cumple" ? pctProb >= 100 : pctProb < 100;
                  })
                  .map((row, i) => {
                  const isGroup = row.level === "group" || row.level === "total-tiendas";
                  const isSubgroup = row.level === "subgroup";
                  const pctCons = row.presupuesto > 0 ? (row.conservador / row.presupuesto) * 100 : 0;
                  const pctProb = row.presupuesto > 0 ? (row.probable / row.presupuesto) * 100 : 0;
                  const pctOpt = row.presupuesto > 0 ? (row.optimista / row.presupuesto) * 100 : 0;
                  return (
                    <TableRow
                      key={i}
                      className={
                        isGroup
                          ? "bg-muted/40 font-semibold border-t-2 border-border"
                          : isSubgroup
                          ? "bg-muted/20 font-medium"
                          : "hover:bg-muted/10"
                      }
                    >
                      <TableCell className={`text-[11px] truncate ${row.level === "item" ? "pl-6" : ""}`}>
                        {row.label}
                      </TableCell>
                      <TableCell className="text-[11px] text-right tabular-nums">{fmtCOP(row.ventaActual)}</TableCell>
                      <TableCell className="text-[11px] text-right tabular-nums text-muted-foreground">
                        {row.presupuesto > 0 ? fmtCOP(row.presupuesto) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-[11px] font-medium tabular-nums ${pctColor(row.pctGeneral)}`}>
                          {row.pctGeneral.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-[11px] font-medium tabular-nums ${pctColor(row.pctFecha)}`}>
                          {row.pctFecha.toFixed(1)}%
                          {row.pctFecha >= 100 ? " 🚀" : row.pctFecha < 80 ? " 🐢" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-[11px] tabular-nums">{fmtCOP(row.conservador)}</div>
                        {row.presupuesto > 0 && (
                          <span className={`inline-block mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${
                            pctCons >= 100 
                              ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" 
                              : "bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))]"
                          }`}>
                            {pctCons >= 100 ? "CUMPLE" : "NO CUMPLE"} {pctCons.toFixed(0)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-[11px] tabular-nums">{fmtCOP(row.probable)}</div>
                        {row.presupuesto > 0 && (
                          <span className={`inline-block mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${
                            pctProb >= 100 
                              ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" 
                              : "bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))]"
                          }`}>
                            {pctProb >= 100 ? "CUMPLE" : "NO CUMPLE"} {pctProb.toFixed(0)}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-[11px] tabular-nums">{fmtCOP(row.optimista)}</div>
                        {row.presupuesto > 0 && (
                          <span className={`inline-block mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${
                            pctOpt >= 100 
                              ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" 
                              : "bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))]"
                          }`}>
                            {pctOpt >= 100 ? "CUMPLE" : "NO CUMPLE"} {pctOpt.toFixed(0)}%
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
