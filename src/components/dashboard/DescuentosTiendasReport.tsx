import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LineChart, Line,
} from "recharts";
import { Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { TimeFilter, THIS_MONTH_SENTINEL, getDateRange, toDateStr } from "@/components/dashboard/TimeFilter";
import { formatKpiMoney } from "@/lib/kpi-money";
import { cn } from "@/lib/utils";

const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v) || 0);
const fmtNum = (v: unknown) => new Intl.NumberFormat("es-CO").format(n(v));
const fmtPct = (v: unknown) => `${n(v).toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtCOP = (v: unknown) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n(v));
const pctOf = (a: unknown, b: unknown) => (n(b) > 0 ? (n(a) / n(b)) * 100 : 0);

export const ORIGEN_OPTIONS = ["Promoción NetSuite", "Manual con nota", "Manual sin nota"] as const;
const ORIGEN_COLOR: Record<string, string> = {
  "Promoción NetSuite": "hsl(var(--primary))",
  "Manual con nota": "hsl(var(--warning))",
  "Manual sin nota": "hsl(var(--destructive))",
};

type Row = Record<string, any>;
interface ReportData {
  kpis: Row; por_tienda: Row[]; por_vendedor: Row[]; por_motivo: Row[]; por_rango: Row[];
  por_dia: Row[]; notas: Row[]; tiendas: string[]; vendedores: string[];
}

const th = "px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap";
const thR = "px-3 py-2 text-right font-medium text-muted-foreground whitespace-nowrap";
const td = "px-3 py-1.5 whitespace-nowrap";
const tdR = "px-3 py-1.5 text-right tabular-nums whitespace-nowrap";

function Kpi({ title, value, sub, danger }: { title: string; value: string; sub?: string; danger?: boolean }) {
  return (
    <Card className={cn("h-full", danger && "border-destructive bg-destructive/5")}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className={cn("text-xl font-semibold", danger ? "text-destructive" : "text-foreground")}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function DescuentosTiendasReport() {
  const [days, setDays] = useState<number>(THIS_MONTH_SENTINEL);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [tienda, setTienda] = useState<string>("");
  const [vendedor, setVendedor] = useState<string>("");
  const [origen, setOrigen] = useState<string>("");
  const [tab, setTab] = useState("tienda");
  const [notaQ, setNotaQ] = useState("");
  const [page, setPage] = useState(0);

  const { from, to } = getDateRange(days, customFrom, customTo);
  const params = {
    p_desde: toDateStr(from),
    p_hasta: toDateStr(to),
    p_tienda: tienda || null,
    p_vendedor: vendedor || null,
    p_origen: origen || null,
    p_motivo: null,
  };

  const report = useQuery({
    queryKey: ["descuentos-tiendas", params],
    queryFn: async (): Promise<ReportData> => {
      const { data, error } = await supabase.rpc("reporte_descuentos_tiendas" as any, params as any);
      if (error) throw error;
      const d = (data ?? {}) as any;
      return {
        kpis: d.kpis ?? {}, por_tienda: d.por_tienda ?? [], por_vendedor: d.por_vendedor ?? [],
        por_motivo: d.por_motivo ?? [], por_rango: d.por_rango ?? [], por_dia: d.por_dia ?? [],
        notas: d.notas ?? [], tiendas: d.tiendas ?? [], vendedores: d.vendedores ?? [],
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const detalle = useQuery({
    queryKey: ["descuentos-tiendas-detalle", params],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("reporte_descuentos_tiendas_detalle" as any, { ...params, p_limite: 3000 } as any);
      if (error) throw error;
      return (data as Row[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => setPage(0), [detalle.data]);

  const d = report.data;
  const k = d?.kpis ?? {};
  const porTienda = useMemo(() => [...(d?.por_tienda ?? [])].sort((a, b) => n(b.und_sin_nota) - n(a.und_sin_nota)), [d]);
  const porVendedor = useMemo(() => [...(d?.por_vendedor ?? [])].sort((a, b) => n(b.und_sin_nota) - n(a.und_sin_nota)), [d]);
  const porMotivo = useMemo(() => [...(d?.por_motivo ?? [])].sort((a, b) => n(b.unidades) - n(a.unidades)), [d]);
  const porRango = useMemo(() => (d?.por_rango ?? []).map((r) => ({ ...r, und_promo: n(r.und_promo), und_con_nota: n(r.und_con_nota), und_sin_nota: n(r.und_sin_nota) })), [d]);
  const porDia = useMemo(() => (d?.por_dia ?? []).map((r) => ({ ...r, unidades: n(r.unidades), und_sin_nota: n(r.und_sin_nota) })), [d]);
  const notas = useMemo(() => {
    const q = notaQ.trim().toLowerCase();
    const all = d?.notas ?? [];
    return q ? all.filter((r) => `${r.nota ?? ""} ${r.motivo ?? ""}`.toLowerCase().includes(q)) : all;
  }, [d, notaQ]);
  const det = detalle.data ?? [];
  const pageRows = det.slice(page * 50, page * 50 + 50);
  const pages = Math.max(1, Math.ceil(det.length / 50));

  const total = n(k.und_vendidas_total);
  const actualizado = k.actualizado
    ? new Date(k.actualizado).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })
    : null;

  const pickTienda = (t: string) => { setTienda(t); setVendedor(""); };
  const pickVendedor = (r: Row) => { if (r.tienda) setTienda(r.tienda); setVendedor(r.vendedor); setTab("detalle"); };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const add = (rows: Row[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{}]), name);
    add(porTienda.map((r) => ({
      Tienda: r.tienda, "Und vendidas": n(r.und_total), "Und con desc.": n(r.und_desc), "% con desc.": +pctOf(r.und_desc, r.und_total).toFixed(1),
      "Desc. prom. %": n(r.desc_prom_pct), "Promo NS": n(r.und_promo), "Con nota": n(r.und_con_nota), "Sin nota": n(r.und_sin_nota),
      "% sin nota": n(r.pct_sin_nota), "Und ≥60%": n(r.und_60), "Descuento $": n(r.desc_valor),
    })), "Por tienda");
    add(porVendedor.map((r) => ({
      Tienda: r.tienda, Vendedor: r.vendedor, "Código": r.cod_vendedor, "Und vendidas": n(r.und_total), "% und con desc.": n(r.pct_und_con_descuento),
      "Desc. prom. %": n(r.desc_prom_pct), "Promo NS": n(r.und_promo), "Con nota": n(r.und_con_nota), "Sin nota": n(r.und_sin_nota),
      "% sin nota": n(r.pct_sin_nota), "Sin nota ≥50%": n(r.und_sin_nota_50), "Motivo principal": r.motivo_principal,
    })), "Por vendedor");
    add(porMotivo.map((r) => ({ Origen: r.origen, Motivo: r.motivo, "Líneas": n(r.lineas), Unidades: n(r.unidades), "Desc. prom. %": n(r.desc_prom_pct), "Descuento $": n(r.desc_valor) })), "Por motivo");
    add((d?.notas ?? []).map((r) => ({ Nota: r.nota, "Motivo asignado": r.motivo, Veces: n(r.veces), Unidades: n(r.unidades) })), "Notas");
    add(det.map((r) => ({
      Fecha: r.fecha, Tienda: r.tienda, Vendedor: r.vendedor, "Orden NetSuite": r.orden_netsuite, SKU: String(r.sku ?? ""), Producto: r.producto,
      Und: n(r.unidades), "Precio lista sin IVA": n(r.precio_lista_sin_iva), "Desc %": n(r.pct), "Descuento $": n(r.descuento_sin_iva),
      Origen: r.origen, "Promoción": r.promocion ?? "", Nota: r.nota ?? "", Motivo: r.motivo ?? "",
    })), "Detalle");
    XLSX.writeFile(wb, `descuentos_tiendas_${params.p_desde}_${params.p_hasta}.xlsx`);
  };

  return (
    <div className="space-y-4 min-w-0">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <TimeFilter
          value={days}
          onChange={setDays}
          customFrom={customFrom}
          customTo={customTo}
          onCustomRangeChange={(f, t) => { setCustomFrom(f); setCustomTo(t); }}
        />
        <Select value={tienda || "all"} onValueChange={(v) => pickTienda(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[200px] h-8 text-xs bg-card"><SelectValue placeholder="Tienda" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las tiendas</SelectItem>
            {(d?.tiendas ?? []).map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {tienda && !(d?.tiendas ?? []).includes(tienda) && <SelectItem value={tienda}>{tienda}</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={vendedor || "all"} onValueChange={(v) => setVendedor(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px] h-8 text-xs bg-card"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los vendedores</SelectItem>
            {(d?.vendedores ?? []).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            {vendedor && !(d?.vendedores ?? []).includes(vendedor) && <SelectItem value={vendedor}>{vendedor}</SelectItem>}
          </SelectContent>
        </Select>
        <Select value={origen || "all"} onValueChange={(v) => setOrigen(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px] h-8 text-xs bg-card"><SelectValue placeholder="Origen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los orígenes</SelectItem>
            {ORIGEN_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          {actualizado && <span className="text-[11px] text-muted-foreground">Actualizado: {actualizado}</span>}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={exportExcel} disabled={!d}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {report.error && (
        <div className="rounded-md border border-destructive bg-destructive/5 p-3 text-xs text-destructive">
          Error al cargar el reporte: {(report.error as any)?.message ?? String(report.error)}
        </div>
      )}

      {report.isLoading ? <LoadingState /> : d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 items-stretch">
            <Kpi title="Unidades con descuento" value={fmtNum(k.und_con_descuento)} sub={`${fmtPct(k.pct_und_con_descuento)} de ${fmtNum(total)} vendidas`} />
            <Kpi title="Descuento promedio" value={fmtPct(k.desc_promedio_pct)} sub={`${formatKpiMoney(n(k.descuento_valor))} sin IVA`} />
            <Kpi title="Promoción NetSuite" value={fmtNum(k.und_promo)} sub={`${fmtPct(pctOf(k.und_promo, total))} del total`} />
            <Kpi title="Manual con nota" value={fmtNum(k.und_con_nota)} sub={`${fmtPct(pctOf(k.und_con_nota, total))} del total`} />
            <Kpi title="Manual SIN nota" value={`${fmtNum(k.und_sin_nota)} · ${fmtPct(k.pct_sin_nota)}`} sub={`${fmtNum(k.und_sin_nota_50)} al 50% o más`} danger={n(k.pct_sin_nota) > 15} />
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <div className="overflow-x-auto">
              <TabsList>
                <TabsTrigger value="tienda">Por tienda</TabsTrigger>
                <TabsTrigger value="vendedor">Por vendedor</TabsTrigger>
                <TabsTrigger value="motivo">Por motivo</TabsTrigger>
                <TabsTrigger value="rangos">Rangos</TabsTrigger>
                <TabsTrigger value="dia">Por día</TabsTrigger>
                <TabsTrigger value="notas">Notas</TabsTrigger>
                <TabsTrigger value="detalle">Detalle</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="tienda">
              {porTienda.length === 0 ? <EmptyState message="Sin datos para los filtros seleccionados" /> : (
                <Card><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="border-b border-border"><tr>
                    <th className={th}>Tienda</th><th className={thR}>Und vendidas</th><th className={thR}>Und con desc.</th><th className={thR}>% con desc.</th>
                    <th className={thR}>Desc. prom. %</th><th className={thR}>Promo NS</th><th className={thR}>Con nota</th><th className={thR}>Sin nota</th>
                    <th className={thR}>% sin nota</th><th className={thR}>Und ≥60%</th>
                  </tr></thead>
                  <tbody>{porTienda.map((r) => {
                    const bad = n(r.pct_sin_nota) > 30;
                    return (
                      <tr key={r.tienda} onClick={() => pickTienda(r.tienda)} className={cn("border-b border-border cursor-pointer hover:bg-muted/50", bad && "bg-destructive/5 text-destructive")}>
                        <td className={cn(td, "font-medium")}>{r.tienda}</td><td className={tdR}>{fmtNum(r.und_total)}</td><td className={tdR}>{fmtNum(r.und_desc)}</td>
                        <td className={tdR}>{fmtPct(pctOf(r.und_desc, r.und_total))}</td><td className={tdR}>{fmtPct(r.desc_prom_pct)}</td><td className={tdR}>{fmtNum(r.und_promo)}</td>
                        <td className={tdR}>{fmtNum(r.und_con_nota)}</td><td className={cn(tdR, "font-semibold")}>{fmtNum(r.und_sin_nota)}</td>
                        <td className={tdR}>{fmtPct(r.pct_sin_nota)}</td><td className={tdR}>{fmtNum(r.und_60)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table></div></Card>
              )}
            </TabsContent>

            <TabsContent value="vendedor">
              {porVendedor.length === 0 ? <EmptyState message="Sin datos para los filtros seleccionados" /> : (
                <Card><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="border-b border-border"><tr>
                    <th className={th}>Tienda</th><th className={th}>Vendedor</th><th className={th}>Código</th><th className={thR}>Und vendidas</th>
                    <th className={thR}>% und con desc.</th><th className={thR}>Desc. prom. %</th><th className={thR}>Promo NS</th><th className={thR}>Con nota</th>
                    <th className={thR}>Sin nota</th><th className={thR}>% sin nota</th><th className={thR}>Sin nota ≥50%</th><th className={th}>Motivo principal</th>
                  </tr></thead>
                  <tbody>{porVendedor.map((r, i) => (
                    <tr key={`${r.tienda}-${r.vendedor}-${i}`} onClick={() => pickVendedor(r)} className="border-b border-border cursor-pointer hover:bg-muted/50">
                      <td className={td}>{r.tienda}</td><td className={cn(td, "font-medium")}>{r.vendedor}</td><td className={td}>{r.cod_vendedor}</td>
                      <td className={tdR}>{fmtNum(r.und_total)}</td><td className={tdR}>{fmtPct(r.pct_und_con_descuento)}</td><td className={tdR}>{fmtPct(r.desc_prom_pct)}</td>
                      <td className={tdR}>{fmtNum(r.und_promo)}</td><td className={tdR}>{fmtNum(r.und_con_nota)}</td><td className={cn(tdR, "font-semibold")}>{fmtNum(r.und_sin_nota)}</td>
                      <td className={tdR}>{fmtPct(r.pct_sin_nota)}</td>
                      <td className={cn(tdR, n(r.und_sin_nota_50) > 0 && "bg-destructive/10 text-destructive font-semibold")}>{fmtNum(r.und_sin_nota_50)}</td>
                      <td className={td}>{r.motivo_principal ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table></div></Card>
              )}
            </TabsContent>

            <TabsContent value="motivo" className="space-y-3">
              {porMotivo.length === 0 ? <EmptyState message="Sin datos para los filtros seleccionados" /> : (<>
                <Card><CardContent className="p-3">
                  <div className="flex flex-wrap gap-3 mb-2 text-[11px]">
                    {ORIGEN_OPTIONS.map((o) => <span key={o} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ORIGEN_COLOR[o] }} />{o}</span>)}
                  </div>
                  <div style={{ height: Math.max(200, Math.min(porMotivo.length, 25) * 24) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={porMotivo.slice(0, 25)} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="motivo" width={200} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => fmtNum(v)} />
                        <Bar dataKey="unidades" name="Unidades">
                          {porMotivo.slice(0, 25).map((r, i) => <Cell key={i} fill={ORIGEN_COLOR[r.origen] ?? "hsl(var(--muted-foreground))"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent></Card>
                <Card><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="border-b border-border"><tr>
                    <th className={th}>Origen</th><th className={th}>Motivo</th><th className={thR}>Líneas</th><th className={thR}>Unidades</th><th className={thR}>Desc. prom. %</th><th className={thR}>Descuento $</th>
                  </tr></thead>
                  <tbody>{porMotivo.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className={td}><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ORIGEN_COLOR[r.origen] }} />{r.origen}</span></td>
                      <td className={td}>{r.motivo}</td><td className={tdR}>{fmtNum(r.lineas)}</td><td className={tdR}>{fmtNum(r.unidades)}</td>
                      <td className={tdR}>{fmtPct(r.desc_prom_pct)}</td><td className={tdR}>{fmtCOP(r.desc_valor)}</td>
                    </tr>
                  ))}</tbody>
                </table></div></Card>
              </>)}
            </TabsContent>

            <TabsContent value="rangos">
              <Card><CardContent className="p-3 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porRango}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="rango" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtNum(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="und_promo" stackId="a" name="Promoción NetSuite" fill={ORIGEN_COLOR["Promoción NetSuite"]} />
                    <Bar dataKey="und_con_nota" stackId="a" name="Manual con nota" fill={ORIGEN_COLOR["Manual con nota"]} />
                    <Bar dataKey="und_sin_nota" stackId="a" name="Manual sin nota" fill={ORIGEN_COLOR["Manual sin nota"]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="dia">
              <Card><CardContent className="p-3 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={porDia}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="fecha" tick={{ fontSize: 10 }} tickFormatter={(f: string) => f?.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtNum(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="unidades" name="Unidades con descuento" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="und_sin_nota" name="Sin nota" stroke="hsl(var(--destructive))" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="notas" className="space-y-3">
              <div className="relative max-w-xs">
                <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input value={notaQ} onChange={(e) => setNotaQ(e.target.value)} placeholder="Buscar nota o motivo" className="pl-8 h-8 text-xs" />
              </div>
              <Card><div className="overflow-x-auto max-h-[600px]"><table className="w-full text-xs">
                <thead className="border-b border-border sticky top-0 bg-card"><tr>
                  <th className={th}>Nota</th><th className={th}>Motivo asignado</th><th className={thR}>Veces</th><th className={thR}>Unidades</th>
                </tr></thead>
                <tbody>{notas.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-1.5">{r.nota}</td><td className={td}>{r.motivo}</td><td className={tdR}>{fmtNum(r.veces)}</td><td className={tdR}>{fmtNum(r.unidades)}</td>
                  </tr>
                ))}</tbody>
              </table></div></Card>
            </TabsContent>

            <TabsContent value="detalle" className="space-y-2">
              {detalle.error && <div className="text-xs text-destructive">Error al cargar el detalle: {(detalle.error as any)?.message}</div>}
              {detalle.isLoading ? <LoadingState /> : det.length === 0 ? <EmptyState message="Sin datos para los filtros seleccionados" /> : (<>
                <Card><div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead className="border-b border-border"><tr>
                    <th className={th}>Fecha</th><th className={th}>Tienda</th><th className={th}>Vendedor</th><th className={th}>Orden NetSuite</th><th className={th}>SKU</th>
                    <th className={th}>Producto</th><th className={thR}>Und</th><th className={thR}>Precio lista sin IVA</th><th className={thR}>Desc %</th><th className={thR}>Descuento $</th>
                    <th className={th}>Origen</th><th className={th}>Promoción</th><th className={th}>Nota</th><th className={th}>Motivo</th>
                  </tr></thead>
                  <tbody>{pageRows.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className={td}>{r.fecha}</td><td className={td}>{r.tienda}</td><td className={td}>{r.vendedor}</td><td className={td}>{r.orden_netsuite}</td>
                      <td className={td}>{r.sku}</td><td className={td}>{r.producto}</td><td className={tdR}>{fmtNum(r.unidades)}</td><td className={tdR}>{fmtCOP(r.precio_lista_sin_iva)}</td>
                      <td className={tdR}>{fmtPct(r.pct)}</td><td className={tdR}>{fmtCOP(r.descuento_sin_iva)}</td>
                      <td className={td}><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ORIGEN_COLOR[r.origen] }} />{r.origen}</span></td>
                      <td className={td}>{r.promocion ?? "—"}</td><td className="px-3 py-1.5 min-w-[160px]">{r.nota ?? "—"}</td><td className={td}>{r.motivo ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table></div></Card>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtNum(det.length)} líneas{det.length >= 3000 ? " (límite 3.000)" : ""}</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                    <span>Página {page + 1} de {pages}</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
                  </div>
                </div>
              </>)}
            </TabsContent>
          </Tabs>
        </>
      )}

      <p className="text-[11px] text-muted-foreground">
        Fuente: órdenes de Next Sale en NetSuite, actualizado cada hora. 'Promoción NetSuite' se deduce por tienda, fecha y % igual a una promoción activa (NetSuite no amarra la venta a la promoción). Montos sin IVA.
      </p>
    </div>
  );
}

export default DescuentosTiendasReport;
