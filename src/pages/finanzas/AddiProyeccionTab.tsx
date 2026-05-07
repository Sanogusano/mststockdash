import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid, LineChart, Line,
} from "recharts";

type Row = {
  fecha_pago_estimada: string;
  tipo_venta: "Crédito" | "Débito (PSE)" | string;
  transacciones: number;
  monto_bruto: number;
  tarifas_estimadas: number;
  monto_neto_estimado: number;
  recibido_real: number;
  esta_recibido: boolean;
};

const fmtFechaCorta = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

function nextMonthDefault() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function getRange(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { desde, hasta, lastDay };
}

function weekOf(day: number) {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

export function TabProyeccionPagos() {
  const [mes, setMes] = useState<string>(nextMonthDefault());
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function cargar() {
    setLoading(true);
    try {
      const { desde, hasta } = getRange(mes);
      const { data, error } = await (supabase as any).rpc("proyeccion_pagos_addi", {
        p_fecha_desde: desde,
        p_fecha_hasta: hasta,
      });
      if (error) throw error;
      setRows((data ?? []) as Row[]);
    } catch (e: any) {
      toast.error(`Error cargando proyección: ${e.message ?? e}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const kpis = useMemo(() => {
    let neto = 0, credito = 0, pse = 0, bruto = 0;
    for (const r of rows) {
      neto += Number(r.monto_neto_estimado) || 0;
      bruto += Number(r.monto_bruto) || 0;
      if (r.tipo_venta === "Crédito") credito += Number(r.monto_neto_estimado) || 0;
      else if (r.tipo_venta === "Débito (PSE)") pse += Number(r.monto_neto_estimado) || 0;
    }
    return { neto, credito, pse, tarifas: bruto - neto };
  }, [rows]);

  const semanasData = useMemo(() => {
    const buckets: Record<number, { semana: string; Crédito: number; PSE: number }> = {
      1: { semana: "Sem 1 (1-7)", Crédito: 0, PSE: 0 },
      2: { semana: "Sem 2 (8-14)", Crédito: 0, PSE: 0 },
      3: { semana: "Sem 3 (15-21)", Crédito: 0, PSE: 0 },
      4: { semana: "Sem 4 (22-fin)", Crédito: 0, PSE: 0 },
    };
    for (const r of rows) {
      const day = new Date(r.fecha_pago_estimada + "T00:00:00").getDate();
      const w = weekOf(day);
      if (r.tipo_venta === "Crédito") buckets[w].Crédito += Number(r.monto_neto_estimado) || 0;
      else if (r.tipo_venta === "Débito (PSE)") buckets[w].PSE += Number(r.monto_neto_estimado) || 0;
    }
    return Object.values(buckets);
  }, [rows]);

  const acumuladoData = useMemo(() => {
    const { lastDay } = getRange(mes);
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const byDay: Record<string, { proy: number; real: number }> = {};
    for (const r of rows) {
      const k = r.fecha_pago_estimada;
      if (!byDay[k]) byDay[k] = { proy: 0, real: 0 };
      byDay[k].proy += Number(r.monto_neto_estimado) || 0;
      byDay[k].real += Number(r.recibido_real) || 0;
    }
    const [y, m] = mes.split("-").map(Number);
    let accProy = 0, accReal = 0;
    const arr: { dia: string; proyectado: number; real: number | null }[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const v = byDay[key] ?? { proy: 0, real: 0 };
      accProy += v.proy;
      accReal += v.real;
      arr.push({
        dia: String(d),
        proyectado: accProy,
        real: key <= todayKey ? accReal : null,
      });
    }
    return arr;
  }, [rows, mes]);

  const tablaConSubtotales = useMemo(() => {
    type T = Row & { _subtotal?: false };
    type S = { _subtotal: true; semana: number; transacciones: number; monto_bruto: number; tarifas_estimadas: number; monto_neto_estimado: number };
    const sorted = [...rows].sort((a, b) => a.fecha_pago_estimada.localeCompare(b.fecha_pago_estimada));
    const out: (T | S)[] = [];
    let curWeek = 0;
    let acc = { transacciones: 0, monto_bruto: 0, tarifas_estimadas: 0, monto_neto_estimado: 0 };
    for (const r of sorted) {
      const d = new Date(r.fecha_pago_estimada + "T00:00:00").getDate();
      const w = weekOf(d);
      if (curWeek && w !== curWeek) {
        out.push({ _subtotal: true, semana: curWeek, ...acc });
        acc = { transacciones: 0, monto_bruto: 0, tarifas_estimadas: 0, monto_neto_estimado: 0 };
      }
      curWeek = w;
      acc.transacciones += Number(r.transacciones) || 0;
      acc.monto_bruto += Number(r.monto_bruto) || 0;
      acc.tarifas_estimadas += Number(r.tarifas_estimadas) || 0;
      acc.monto_neto_estimado += Number(r.monto_neto_estimado) || 0;
      out.push(r as T);
    }
    if (curWeek) out.push({ _subtotal: true, semana: curWeek, ...acc });
    return out;
  }, [rows]);

  const totalGeneral = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        tx: acc.tx + (Number(r.transacciones) || 0),
        bruto: acc.bruto + (Number(r.monto_bruto) || 0),
        tarifas: acc.tarifas + (Number(r.tarifas_estimadas) || 0),
        neto: acc.neto + (Number(r.monto_neto_estimado) || 0),
      }),
      { tx: 0, bruto: 0, tarifas: 0, neto: 0 },
    );
  }, [rows]);

  const todayKey = new Date().toISOString().slice(0, 10);

  function estadoFor(r: Row) {
    if (r.esta_recibido) return { label: "✅ Recibido", cls: "bg-emerald-100 text-emerald-800" };
    if (r.fecha_pago_estimada > todayKey) return { label: "🔵 Proyectado", cls: "bg-blue-100 text-blue-800" };
    return { label: "⏳ Pendiente", cls: "bg-amber-100 text-amber-800" };
  }

  function exportar() {
    const data = rows.map((r) => ({
      fecha_pago_estimada: r.fecha_pago_estimada,
      tipo: r.tipo_venta,
      transacciones: Number(r.transacciones) || 0,
      monto_bruto: Number(r.monto_bruto) || 0,
      tarifas_estimadas: Number(r.tarifas_estimadas) || 0,
      monto_neto_estimado: Number(r.monto_neto_estimado) || 0,
      recibido_real: Number(r.recibido_real) || 0,
      estado: estadoFor(r).label.replace(/^[^\s]+\s/, ""),
    }));
    exportToXLS(data, `proyeccion-pagos-addi-${mes}`, "Proyección");
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mes de proyección</label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="h-9 w-40" />
          </div>
          <Button onClick={exportar} variant="outline" className="gap-2 ml-auto" disabled={loading || rows.length === 0}>
            <Download className="h-4 w-4" /> Exportar proyección
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total a recibir</p>
          <p className="text-2xl font-semibold text-emerald-600">{fmtCOP(kpis.neto)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">De Créditos (D+30)</p>
          <p className="text-2xl font-semibold text-blue-600">{fmtCOP(kpis.credito)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">De PSE (D+1)</p>
          <p className="text-2xl font-semibold text-emerald-700">{fmtCOP(kpis.pse)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Tarifas estimadas Addi (3.85%)</p>
          <p className="text-2xl font-semibold text-rose-600">{fmtCOP(kpis.tarifas)}</p>
        </CardContent></Card>
      </div>

      {/* Charts */}
      {loading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Pagos esperados por semana</p>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={semanasData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="semana" fontSize={12} />
                  <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} fontSize={12} />
                  <Tooltip formatter={(v: any) => fmtCOP(Number(v))} />
                  <Legend />
                  <Bar dataKey="Crédito" stackId="a" fill="#2563eb" />
                  <Bar dataKey="PSE" stackId="a" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-4">
            <p className="text-sm font-medium mb-2">Acumulado: proyectado vs real</p>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={acumuladoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" fontSize={12} />
                  <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(0)}M`} fontSize={12} />
                  <Tooltip formatter={(v: any) => v == null ? "—" : fmtCOP(Number(v))} />
                  <Legend />
                  <Line type="monotone" dataKey="proyectado" stroke="#2563eb" strokeDasharray="5 5" dot={false} name="Proyectado" />
                  <Line type="monotone" dataKey="real" stroke="#10b981" dot={false} name="Real recibido" connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Sin proyección para el mes seleccionado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr className="text-left">
                    <th className="px-3 py-2">Fecha pago</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Transacciones</th>
                    <th className="px-3 py-2 text-right">Monto bruto</th>
                    <th className="px-3 py-2 text-right">Tarifas (3.85%)</th>
                    <th className="px-3 py-2 text-right">Neto estimado</th>
                    <th className="px-3 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {tablaConSubtotales.map((row, i) => {
                    if ("_subtotal" in row) {
                      return (
                        <tr key={`s-${i}`} className="bg-muted/40 font-medium">
                          <td colSpan={2} className="px-3 py-2">Subtotal Semana {row.semana}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtInt(row.transacciones)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(row.monto_bruto)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-rose-600">{fmtCOP(row.tarifas_estimadas)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtCOP(row.monto_neto_estimado)}</td>
                          <td />
                        </tr>
                      );
                    }
                    const r = row as Row;
                    const est = estadoFor(r);
                    return (
                      <tr key={i} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2">{fmtFechaCorta(r.fecha_pago_estimada)}</td>
                        <td className="px-3 py-2">
                          {r.tipo_venta === "Crédito" ? (
                            <Badge className="bg-blue-100 text-blue-800 border-0">Crédito</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0">PSE</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtInt(r.transacciones)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(r.monto_bruto)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-600">{fmtCOP(r.tarifas_estimadas)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">{fmtCOP(r.monto_neto_estimado)}</td>
                        <td className="px-3 py-2"><Badge className={`${est.cls} border-0`}>{est.label}</Badge></td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 bg-muted/60 font-semibold">
                    <td colSpan={2} className="px-3 py-2">TOTAL {mes}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(totalGeneral.tx)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(totalGeneral.bruto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">{fmtCOP(totalGeneral.tarifas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{fmtCOP(totalGeneral.neto)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          <strong>PSE</strong> se paga D+1 (al día siguiente de la venta). <strong>Crédito</strong> se paga D+30.
          Tarifa estimada del 3.85% (promedio real de liquidaciones). Proyección estimada basada en condiciones contractuales;
          valores reales pueden variar según liquidaciones oficiales de Addi.
        </p>
      </div>
    </div>
  );
}
