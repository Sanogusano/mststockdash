import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingDown, TrendingUp, Target, Minus, Info, Skull, FileDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { exportProyeccionPDF } from "@/lib/proyeccion-pdf-export";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

function fmtCOP(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

function fmtCOPCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 3 })}M`;
  return fmtCOP(n);
}

type CumplimientoLevel = "sobrecumple" | "si-cumple-verde" | "si-cumple-amarillo" | "cumplimiento-regular" | "no-cumple" | "no-cumple-critico";

const CUMPLIMIENTO_OPCIONES = [
  "Sobrecumple",
  "Sí Cumple",
  "Regular",
  "No Cumple",
  "Crítico",
];

function getCumplimientoLevel(pct: number): CumplimientoLevel {
  if (pct >= 104.9) return "sobrecumple";
  if (pct >= 100) return "si-cumple-verde";
  if (pct >= 90) return "si-cumple-amarillo";
  if (pct >= 85) return "cumplimiento-regular";
  if (pct >= 75) return "no-cumple";
  return "no-cumple-critico";
}

function getCumplimientoLabel(pct: number): string {
  const level = getCumplimientoLevel(pct);
  const labels: Record<CumplimientoLevel, string> = {
    "sobrecumple": "Sobrecumple",
    "si-cumple-verde": "Sí Cumple",
    "si-cumple-amarillo": "Sí Cumple",
    "cumplimiento-regular": "Regular",
    "no-cumple": "No Cumple",
    "no-cumple-critico": "Crítico",
  };
  return labels[level];
}

function pctColor(pct: number) {
  const level = getCumplimientoLevel(pct);
  const colors: Record<CumplimientoLevel, string> = {
    "sobrecumple": "text-blue-600",
    "si-cumple-verde": "text-green-600",
    "si-cumple-amarillo": "text-yellow-600",
    "cumplimiento-regular": "text-orange-500",
    "no-cumple": "text-red-500",
    "no-cumple-critico": "text-red-800",
  };
  return colors[level];
}

function pctBg(pct: number) {
  const level = getCumplimientoLevel(pct);
  const bgs: Record<CumplimientoLevel, string> = {
    "sobrecumple": "bg-blue-600",
    "si-cumple-verde": "bg-green-600",
    "si-cumple-amarillo": "bg-yellow-500",
    "cumplimiento-regular": "bg-orange-500",
    "no-cumple": "bg-red-500",
    "no-cumple-critico": "bg-red-800",
  };
  return bgs[level];
}

function pctBadgeClass(pct: number) {
  const level = getCumplimientoLevel(pct);
  const classes: Record<CumplimientoLevel, string> = {
    "sobrecumple": "bg-blue-100 text-blue-700 border border-blue-300",
    "si-cumple-verde": "bg-green-100 text-green-700 border border-green-300",
    "si-cumple-amarillo": "bg-yellow-100 text-yellow-700 border border-yellow-300",
    "cumplimiento-regular": "bg-orange-100 text-orange-700 border border-orange-300",
    "no-cumple": "bg-red-100 text-red-700 border border-red-300",
    "no-cumple-critico": "bg-red-200 text-red-800 border border-red-400",
  };
  return classes[level];
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

// Multi-select de estados de cumplimiento (vacío = todos)

export function ProyeccionCierreDashboard() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState<ProyeccionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstados, setFiltroEstados] = useState<string[]>([]);

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

  // Global totals — tiendas + canales (Personal Shopper, Tienda Online, etc.).
  // Se excluyen presupuestos de tipo "vendedor" (metas individuales).
  const totals = useMemo(() => {
    const rows = data.filter(r => r.tipo === "tienda" || r.tipo === "canal");
    const ventaActual = rows.reduce((s, r) => s + Number(r.venta_actual), 0);
    const presupuesto = rows.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
    const conservador = rows.reduce((s, r) => s + Number(r.cierre_conservador), 0);
    const probable = rows.reduce((s, r) => s + Number(r.cierre_probable), 0);
    const optimista = rows.reduce((s, r) => s + Number(r.cierre_optimista), 0);
    const diasTranscurridos = data[0]?.dias_transcurridos ?? 0;
    const diasMes = data[0]?.dias_mes ?? 30;
    return { ventaActual, presupuesto, conservador, probable, optimista, diasTranscurridos, diasMes };
  }, [data]);

  // Hierarchical table rows builder
  type Row = {
    level: "group" | "subgroup" | "item" | "total-tiendas";
    label: string;
    ventaActual: number;
    presupuesto: number;
    pctGeneral: number;
    pctFecha: number;
    conservador: number;
    probable: number;
    optimista: number;
  };

  const buildTableRows = (sortByCumplimiento: boolean): Row[] => {
    const rows: Row[] = [];
    const channels = data.filter(r => r.tipo === "canal");
    const stores = data.filter(r => r.tipo === "tienda");

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

      const chItems = channels.map(c => ({
        level: "item" as const,
        label: c.nombre,
        ventaActual: Number(c.venta_actual),
        presupuesto: Number(c.presupuesto_mes),
        pctGeneral: Number(c.pct_cumplimiento_general),
        pctFecha: Number(c.pct_cumplimiento_fecha),
        conservador: Number(c.cierre_conservador),
        probable: Number(c.cierre_probable),
        optimista: Number(c.cierre_optimista),
      }));
      if (sortByCumplimiento) {
        chItems.sort((a, b) => {
          const pa = a.presupuesto > 0 ? (a.probable / a.presupuesto) * 100 : Infinity;
          const pb = b.presupuesto > 0 ? (b.probable / b.presupuesto) * 100 : Infinity;
          return pa - pb;
        });
      }
      rows.push(...chItems);
    }

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

      const zonaGroups: Record<string, ProyeccionRow[]> = {};
      stores.forEach(s => {
        const z = s.zona || "Sin Zona";
        if (!zonaGroups[z]) zonaGroups[z] = [];
        zonaGroups[z].push(s);
      });

      const zonaEntries = Object.entries(zonaGroups).map(([zona, zStores]) => {
        const zVenta = zStores.reduce((s, r) => s + Number(r.venta_actual), 0);
        const zPresup = zStores.reduce((s, r) => s + Number(r.presupuesto_mes), 0);
        const zCons = zStores.reduce((s, r) => s + Number(r.cierre_conservador), 0);
        const zProb = zStores.reduce((s, r) => s + Number(r.cierre_probable), 0);
        const zOpt = zStores.reduce((s, r) => s + Number(r.cierre_optimista), 0);
        const budgetToDate = zPresup > 0 ? (zPresup / totals.diasMes) * totals.diasTranscurridos : 0;
        const pctProbZona = zPresup > 0 ? (zProb / zPresup) * 100 : Infinity;
        return { zona, zStores, zVenta, zPresup, zCons, zProb, zOpt, budgetToDate, pctProbZona };
      });

      if (sortByCumplimiento) {
        zonaEntries.sort((a, b) => a.pctProbZona - b.pctProbZona);
      } else {
        zonaEntries.sort((a, b) => a.zona.localeCompare(b.zona));
      }

      zonaEntries.forEach(({ zona, zStores, zVenta, zPresup, zCons, zProb, zOpt, budgetToDate }) => {
        rows.push({
          level: "subgroup",
          label: `📍 ${zona.toUpperCase()}`,
          ventaActual: zVenta,
          presupuesto: zPresup,
          pctGeneral: zPresup > 0 ? (zVenta / zPresup) * 100 : 0,
          pctFecha: budgetToDate > 0 ? (zVenta / budgetToDate) * 100 : 0,
          conservador: zCons,
          probable: zProb,
          optimista: zOpt,
        });

        const items = zStores.map(st => ({
          level: "item" as const,
          label: st.nombre,
          ventaActual: Number(st.venta_actual),
          presupuesto: Number(st.presupuesto_mes),
          pctGeneral: Number(st.pct_cumplimiento_general),
          pctFecha: Number(st.pct_cumplimiento_fecha),
          conservador: Number(st.cierre_conservador),
          probable: Number(st.cierre_probable),
          optimista: Number(st.cierre_optimista),
        }));

        if (sortByCumplimiento) {
          items.sort((a, b) => {
            const pa = a.presupuesto > 0 ? (a.probable / a.presupuesto) * 100 : Infinity;
            const pb = b.presupuesto > 0 ? (b.probable / b.presupuesto) * 100 : Infinity;
            return pa - pb;
          });
        } else {
          items.sort((a, b) => a.label.localeCompare(b.label));
        }

        rows.push(...items);
      });
    }

    return rows;
  };

  const tableRows = useMemo(() => buildTableRows(false), [data, totals]);
  const sortedTableRows = useMemo(() => buildTableRows(true), [data, totals]);

  const [exportingPDF, setExportingPDF] = useState(false);

  const handleExportPDF = async () => {
    setExportingPDF(true);
    // Allow React to render the offscreen container with non-hidden display before capture
    await new Promise(r => setTimeout(r, 50));
    try {
      await exportProyeccionPDF("proyeccion-pdf-content", MONTHS[mes - 1], anio);
    } finally {
      setExportingPDF(false);
    }
  };

  const renderTableRows = (rows: Row[], applyFilter: boolean) =>
    rows
      .filter(row => {
        if (!applyFilter || filtroEstados.length === 0) return true;
        if (row.level !== "item") return true;
        if (row.presupuesto <= 0) return true;
        const pctProb = (row.probable / row.presupuesto) * 100;
        return filtroEstados.includes(getCumplimientoLabel(pctProb));
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
                ? "bg-muted/30 font-bold uppercase tracking-wide"
                : "hover:bg-muted/10"
            }
          >
            <TableCell className={`text-[11px] sticky left-0 z-10 min-w-[120px] max-w-[160px] whitespace-normal break-words ${
              isGroup ? "bg-muted/40" : isSubgroup ? "bg-muted/30 font-bold uppercase tracking-wide" : "bg-background"
            } ${row.level === "item" ? "pl-6" : ""}`}>
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
                <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${pctBadgeClass(pctCons)}`}>
                  {getCumplimientoLevel(pctCons) === "no-cumple-critico" && <Skull className="h-2.5 w-2.5" />}
                  {getCumplimientoLabel(pctCons).toUpperCase()} {pctCons.toFixed(0)}%
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="text-[11px] tabular-nums">{fmtCOP(row.probable)}</div>
              {row.presupuesto > 0 && (
                <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${pctBadgeClass(pctProb)}`}>
                  {getCumplimientoLevel(pctProb) === "no-cumple-critico" && <Skull className="h-2.5 w-2.5" />}
                  {getCumplimientoLabel(pctProb).toUpperCase()} {pctProb.toFixed(0)}%
                </span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="text-[11px] tabular-nums">{fmtCOP(row.optimista)}</div>
              {row.presupuesto > 0 && (
                <span className={`inline-flex items-center gap-0.5 mt-0.5 px-1 py-px rounded text-[9px] font-semibold whitespace-nowrap ${pctBadgeClass(pctOpt)}`}>
                  {getCumplimientoLevel(pctOpt) === "no-cumple-critico" && <Skull className="h-2.5 w-2.5" />}
                  {getCumplimientoLabel(pctOpt).toUpperCase()} {pctOpt.toFixed(0)}%
                </span>
              )}
            </TableCell>
          </TableRow>
        );
      });





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
      <TooltipProvider delayDuration={200}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Venta Actual MTD
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold text-foreground whitespace-normal break-words tabular-nums"><span className="sm:hidden">{fmtCOPCompact(totals.ventaActual)}</span><span className="hidden sm:inline">{fmtCOP(totals.ventaActual)}</span></p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Presupuesto: <span className="sm:hidden">{fmtCOPCompact(totals.presupuesto)}</span><span className="hidden sm:inline">{fmtCOP(totals.presupuesto)}</span>
              </p>
            </CardContent>
          </Card>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger))]/5 cursor-help">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingDown className="h-3.5 w-3.5 text-[hsl(var(--danger))]" /> Conservador
                    <Info className="h-3 w-3 text-muted-foreground/50" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-foreground whitespace-normal break-words tabular-nums"><span className="sm:hidden">{fmtCOPCompact(totals.conservador)}</span><span className="hidden sm:inline">{fmtCOP(totals.conservador)}</span></p>
                  <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupConservador)}`}>
                    {pctPresupConservador.toFixed(1)}% del presupuesto
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Venta MTD + (Run Rate diario × días restantes × 0.85). Escenario pesimista que asume un rendimiento 15% menor al ritmo actual.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5 cursor-help">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Minus className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Probable
                    <Info className="h-3 w-3 text-muted-foreground/50" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-foreground whitespace-normal break-words tabular-nums"><span className="sm:hidden">{fmtCOPCompact(totals.probable)}</span><span className="hidden sm:inline">{fmtCOP(totals.probable)}</span></p>
                  <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupProbable)}`}>
                    {pctPresupProbable.toFixed(1)}% del presupuesto
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Venta MTD + (Run Rate diario × días restantes × 1.0). Proyección lineal que mantiene el ritmo de venta actual hasta fin de mes.
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5 cursor-help">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Optimista
                    <Info className="h-3 w-3 text-muted-foreground/50" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold text-foreground whitespace-normal break-words tabular-nums"><span className="sm:hidden">{fmtCOPCompact(totals.optimista)}</span><span className="hidden sm:inline">{fmtCOP(totals.optimista)}</span></p>
                  <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupOptimista)}`}>
                    {pctPresupOptimista.toFixed(1)}% del presupuesto
                  </p>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Venta MTD + (Run Rate diario × días restantes × 1.15). Escenario optimista que asume un rendimiento 15% superior al ritmo actual.
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Hierarchical Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm font-semibold">Detalle de Cumplimiento y Proyección</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <MultiSelectFilter
                label="Estado cumplimiento"
                options={CUMPLIMIENTO_OPCIONES}
                selected={filtroEstados}
                onChange={setFiltroEstados}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportPDF}
                disabled={exportingPDF}
                className="gap-1.5"
              >
                <FileDown className="h-4 w-4" />
                {exportingPDF ? "Generando..." : "Descargar PDF"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full min-w-[690px]">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px] font-semibold sticky left-0 z-20 bg-muted/60 backdrop-blur min-w-[120px] max-w-[160px]">Nombre</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[80px]">Venta MTD</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[80px]">Presup.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[70px]">% Gral</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[70px]">% Fecha</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[90px] text-[hsl(var(--danger))]">Conserv.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[90px] text-[hsl(var(--warning))]">Probable</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right min-w-[90px] text-[hsl(var(--success))]">Optimista</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderTableRows(tableRows, true)}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Offscreen PDF-only content: sorted by Zona and % cumplimiento ascending */}
      <div
        id="proyeccion-pdf-content"
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "1180px",
          background: "#ffffff",
          padding: "16px",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Proyección de Cierre — {MONTHS[mes - 1]} {anio}
          </h2>
          <p style={{ fontSize: 11, color: "#64748b", margin: "2px 0 0" }}>
            Ordenado por Zona y % de cumplimiento (menor a mayor) — Día {totals.diasTranscurridos} de {totals.diasMes}
          </p>
        </div>

        <div data-pdf-section className="grid grid-cols-4 gap-4" style={{ marginBottom: 16 }}>
          <Card className="border-primary/20">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Venta Actual MTD</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl font-bold tabular-nums">{fmtCOP(totals.ventaActual)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Presupuesto: {fmtCOP(totals.presupuesto)}</p>
            </CardContent>
          </Card>
          <Card className="border-[hsl(var(--danger))]/20 bg-[hsl(var(--danger))]/5">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conservador</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl font-bold tabular-nums">{fmtCOP(totals.conservador)}</p>
              <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupConservador)}`}>{pctPresupConservador.toFixed(1)}% del presupuesto</p>
            </CardContent>
          </Card>
          <Card className="border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Probable</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl font-bold tabular-nums">{fmtCOP(totals.probable)}</p>
              <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupProbable)}`}>{pctPresupProbable.toFixed(1)}% del presupuesto</p>
            </CardContent>
          </Card>
          <Card className="border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/5">
            <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Optimista</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xl font-bold tabular-nums">{fmtCOP(totals.optimista)}</p>
              <p className={`text-[10px] mt-1 font-medium ${pctColor(pctPresupOptimista)}`}>{pctPresupOptimista.toFixed(1)}% del presupuesto</p>
            </CardContent>
          </Card>
        </div>

        <Card data-pdf-section>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Detalle por Zona — Cumplimiento ascendente</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-[11px] font-semibold">Nombre</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right">Venta MTD</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right">Presup.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right">% Gral</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right">% Fecha</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right text-[hsl(var(--danger))]">Conserv.</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right text-[hsl(var(--warning))]">Probable</TableHead>
                  <TableHead className="text-[11px] font-semibold text-right text-[hsl(var(--success))]">Optimista</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderTableRows(sortedTableRows, false)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

