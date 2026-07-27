import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, AlertTriangle, Info, Wallet, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";

const toNum = (v: unknown) => Number(v ?? 0);
const MES_NOMBRE = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function mesLabel(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const [y, m] = iso.split("-");
  return `${MES_NOMBRE[Number(m)]} ${y}`;
}

/* ══════════════════ TESORERÍA (pestaña Resumen) ══════════════════ */
interface FilaTes {
  mes: string | null;
  creditos: number; vendido: number;
  liquidados: number; liquidado_neto: number;
  pendientes: number; pendiente_bruto: number;
  liq_sin_transaccion: number; cobertura: string;
}

export function TabTesoreria() {
  const [data, setData] = useState<FilaTes[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, p] = await Promise.all([
          supabase.rpc("reporte_conciliacion_addi" as any),
          supabase.rpc("reporte_conciliacion_addi_pendientes" as any),
        ]);
        if (c.error) throw c.error;
        setData(((c.data ?? []) as any[]).map(r => ({
          mes: r.mes, creditos: toNum(r.creditos), vendido: toNum(r.vendido),
          liquidados: toNum(r.liquidados), liquidado_neto: toNum(r.liquidado_neto),
          pendientes: toNum(r.pendientes), pendiente_bruto: toNum(r.pendiente_bruto),
          liq_sin_transaccion: toNum(r.liq_sin_transaccion), cobertura: r.cobertura ?? "",
        })));
        setPendientes((p.data ?? []) as any[]);
      } catch (e: any) {
        toast.error(`Error cargando tesorería Addi: ${e.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  // Pendiente accionable = solo meses cubiertos por liquidaciones
  const cubiertos = data.filter(r => r.cobertura !== "sin_liquidaciones" && r.mes);
  const pendienteReal = cubiertos.reduce((s, r) => s + r.pendiente_bruto, 0);
  const sinCargar = data.filter(r => r.cobertura === "sin_liquidaciones");
  const totalPagadoNeto = data.reduce((s, r) => s + r.liquidado_neto, 0);

  const covBadge = (c: string) => {
    if (c === "sin_liquidaciones") return <Badge className="bg-slate-100 text-slate-700 border-0">Sin cargar pagos</Badge>;
    if (c === "parcial") return <Badge className="bg-amber-100 text-amber-800 border-0">Pagos en curso</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-800 border-0">Cubierto</Badge>;
  };

  function exportarPendientes() {
    try {
      exportToXLS(pendientes.map(p => ({
        fecha: p.fecha, tienda: p.nombre_tienda, cliente: p.nombre_cliente,
        monto: toNum(p.monto), dias_espera: toNum(p.dias_espera), id_credito: p.id_credito,
      })), "addi-creditos-pendientes-pago", "Pendientes");
    } catch (e: any) { toast.error(`Error exportando: ${e.message ?? e}`); }
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-emerald-200"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet className="h-4 w-4 text-emerald-600" /><p className="text-xs text-muted-foreground">Pagado neto (histórico)</p></div>
          <p className="text-2xl font-semibold text-emerald-600 tabular-nums">{fmtCOP(totalPagadoNeto)}</p>
        </CardContent></Card>
        <Card className="border-amber-200"><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-amber-600" /><p className="text-xs text-muted-foreground">Pendiente por cobrar (meses cubiertos)</p></div>
          <p className="text-2xl font-semibold text-amber-600 tabular-nums">{fmtCOP(pendienteReal)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Créditos pendientes de pago</p>
          <p className="text-2xl font-semibold tabular-nums">{fmtInt(pendientes.length)}</p>
          {pendientes.length > 0 && (
            <Button onClick={exportarPendientes} variant="outline" size="sm" className="gap-1.5 mt-2 h-7">
              <Download className="h-3.5 w-3.5" /> Exportar lista
            </Button>
          )}
        </CardContent></Card>
      </div>

      {/* Aviso de meses sin cargar */}
      {sinCargar.length > 0 && (
        <div className="flex items-start gap-2.5 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Faltan cargar los reportes de liquidación de <span className="font-semibold">{sinCargar.map(r => mesLabel(r.mes)).join(", ")}</span>.
            Sus créditos ({fmtInt(sinCargar.reduce((s, r) => s + r.creditos, 0))} por {fmtCOP(sinCargar.reduce((s, r) => s + r.vendido, 0))})
            aparecen como pendientes, pero eso refleja datos faltantes, no un saldo real adeudado. Cárgalos en la pestaña "Cargar Archivo" para conciliarlos.
          </p>
        </div>
      )}

      {/* Tabla mes a mes */}
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr className="text-left">
                <th className="px-4 py-2.5">Mes de venta</th>
                <th className="px-4 py-2.5 text-right">Créditos</th>
                <th className="px-4 py-2.5 text-right">Vendido (bruto)</th>
                <th className="px-4 py-2.5 text-right">Pagados</th>
                <th className="px-4 py-2.5 text-right">Pagado (neto)</th>
                <th className="px-4 py-2.5 text-right">Pendientes</th>
                <th className="px-4 py-2.5 text-right">Pendiente (bruto)</th>
                <th className="px-4 py-2.5">Cobertura</th>
              </tr>
            </thead>
            <tbody>
              {data.filter(r => r.mes).map((r, i) => (
                <tr key={i} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 font-medium">{mesLabel(r.mes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.creditos)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtCOP(r.vendido)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtInt(r.liquidados)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 font-medium">{r.liquidado_neto > 0 ? fmtCOP(r.liquidado_neto) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.cobertura === "sin_liquidaciones" ? "—" : fmtInt(r.pendientes)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-amber-600 font-medium">{r.cobertura === "sin_liquidaciones" ? "—" : (r.pendiente_bruto > 0 ? fmtCOP(r.pendiente_bruto) : "—")}</td>
                  <td className="px-4 py-2.5">{covBadge(r.cobertura)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground px-1">
        "Pagado neto" es lo efectivamente recibido tras tarifas y retenciones de Addi. "Pendiente bruto" es el monto de venta de créditos aún sin liquidación cruzada, solo en meses con reportes de pago cargados.
      </p>
    </div>
  );
}

/* ══════════════════ CONTABLE (pestaña Liquidaciones) ══════════════════ */
interface FilaCont {
  mes_pago: string | null; pedidos: number;
  total_ventas: number; total_cancelaciones: number;
  descuento_addi: number; descuento_comercio: number;
  total_tarifas: number; total_impuestos: number;
  total_a_pagar: number; cruzado: boolean;
}

export function TabLiquidacionesContable() {
  const [data, setData] = useState<FilaCont[]>([]);
  const [tot, setTot] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [d, t] = await Promise.all([
          supabase.rpc("reporte_conciliacion_addi_contable" as any),
          supabase.rpc("reporte_conciliacion_addi_totales" as any),
        ]);
        if (d.error) throw d.error;
        setData(((d.data ?? []) as any[]).map(r => ({
          mes_pago: r.mes_pago, pedidos: toNum(r.pedidos),
          total_ventas: toNum(r.total_ventas), total_cancelaciones: toNum(r.total_cancelaciones),
          descuento_addi: toNum(r.descuento_addi), descuento_comercio: toNum(r.descuento_comercio),
          total_tarifas: toNum(r.total_tarifas), total_impuestos: toNum(r.total_impuestos),
          total_a_pagar: toNum(r.total_a_pagar), cruzado: !!r.cruzado,
        })));
        setTot((t.data ?? [])[0] ?? null);
      } catch (e: any) {
        toast.error(`Error cargando liquidaciones: ${e.message ?? e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>;

  // Agrupar por mes, sumando cruzado + no cruzado, marcando si hay no cruzado
  const meses = new Map<string, FilaCont & { no_cruzado: number }>();
  for (const r of data) {
    const k = r.mes_pago ?? "sin";
    const prev = meses.get(k) ?? { ...r, no_cruzado: 0, pedidos: 0, total_ventas: 0, total_cancelaciones: 0, descuento_addi: 0, descuento_comercio: 0, total_tarifas: 0, total_impuestos: 0, total_a_pagar: 0 };
    prev.mes_pago = r.mes_pago;
    prev.pedidos += r.pedidos;
    prev.total_ventas += r.total_ventas;
    prev.total_cancelaciones += r.total_cancelaciones;
    prev.descuento_addi += r.descuento_addi;
    prev.descuento_comercio += r.descuento_comercio;
    prev.total_tarifas += r.total_tarifas;
    prev.total_impuestos += r.total_impuestos;
    prev.total_a_pagar += r.total_a_pagar;
    if (!r.cruzado) prev.no_cruzado += r.total_a_pagar;
    meses.set(k, prev);
  }
  const filas = Array.from(meses.values()).sort((a, b) => (a.mes_pago ?? "").localeCompare(b.mes_pago ?? ""));

  function exportar() {
    try {
      exportToXLS(filas.map(r => ({
        mes_pago: r.mes_pago, pedidos: r.pedidos,
        ventas_brutas: r.total_ventas, cancelaciones: r.total_cancelaciones,
        descuento_addi: r.descuento_addi, descuento_comercio: r.descuento_comercio,
        tarifas: r.total_tarifas, impuestos_retenciones: r.total_impuestos,
        neto_pagado: r.total_a_pagar,
      })), "addi-liquidaciones-contable", "Liquidaciones");
    } catch (e: any) { toast.error(`Error exportando: ${e.message ?? e}`); }
  }

  return (
    <div className="space-y-4">
      {/* KPIs de control */}
      {tot && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><Calculator className="h-4 w-4 text-primary" /><p className="text-xs text-muted-foreground">Neto liquidado total</p></div>
            <p className="text-xl font-semibold tabular-nums">{fmtCOP(toNum(tot.total_liquidado_neto))}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Tarifas Addi</p>
            <p className="text-xl font-semibold text-muted-foreground tabular-nums">{fmtCOP(toNum(tot.total_tarifas))}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Impuestos / retenciones</p>
            <p className="text-xl font-semibold text-muted-foreground tabular-nums">{fmtCOP(toNum(tot.total_impuestos))}</p>
          </CardContent></Card>
          <Card className="border-rose-200"><CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Sin cruzar (por identificar)</p>
            <p className="text-xl font-semibold text-rose-600 tabular-nums">{fmtCOP(toNum(tot.no_cruzado_neto))}</p>
            <p className="text-[11px] text-muted-foreground">{fmtInt(toNum(tot.no_cruzado_pedidos))} pedidos</p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={exportar} variant="outline" className="gap-2" disabled={filas.length === 0}>
          <Download className="h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      {/* Tabla contable por mes de pago */}
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr className="text-left">
                <th className="px-3 py-2.5">Mes de pago</th>
                <th className="px-3 py-2.5 text-right">Pedidos</th>
                <th className="px-3 py-2.5 text-right">Ventas brutas</th>
                <th className="px-3 py-2.5 text-right">Cancelac.</th>
                <th className="px-3 py-2.5 text-right">Tarifas</th>
                <th className="px-3 py-2.5 text-right">Impuestos</th>
                <th className="px-3 py-2.5 text-right">Neto pagado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => (
                <tr key={i} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-2.5 font-medium">
                    {mesLabel(r.mes_pago)}
                    {r.no_cruzado > 0 && (
                      <span className="ml-2 text-[10px] text-rose-600" title={`${fmtCOP(r.no_cruzado)} sin cruzar con transacciones`}>
                        ⚠
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.pedidos)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtCOP(r.total_ventas)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.total_cancelaciones !== 0 ? fmtCOP(r.total_cancelaciones) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtCOP(r.total_tarifas)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtCOP(r.total_impuestos)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{fmtCOP(r.total_a_pagar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground px-1">
        Agrupado por mes de pago (fecha en que Addi liquidó), como llega el extracto. El ⚠ marca meses con liquidaciones cuyo pedido no cruza con una transacción registrada — típicamente de meses de venta aún sin cargar. La columna "Sin cruzar" arriba es el total de control.
      </p>
    </div>
  );
}
