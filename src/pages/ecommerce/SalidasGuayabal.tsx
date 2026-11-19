import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { cn } from "@/lib/utils";

type Linea = {
  to_id: number; tranid: string | null; item_id: number | null; sku: string | null; nombre: string | null;
  destino: string | null; creado_por: string | null; estado_to: string | null; fecha: string | null;
  ordenado: number | null; despachado: number | null; cerrado: boolean | number | null;
  reservado_shopify: number | null; descontado_shopify: number | null; ultimo_error: string | null; actualizado_en: string | null;
};
type Log = { id: number; corrida_en: string; tranid: string | null; sku: string | null; accion: string; cantidad: number | null; ok: boolean | null; error: string | null };

export const ESTADOS: Record<string, { label: string; cls: string }> = {
  A: { label: "Pendiente de aprobación", cls: "bg-muted text-muted-foreground" },
  B: { label: "Pendiente de despacho", cls: "bg-amber-100 text-amber-800" },
  D: { label: "Parcialmente despachado", cls: "bg-orange-100 text-orange-800" },
  E: { label: "Parcialmente despachado", cls: "bg-orange-100 text-orange-800" },
  F: { label: "En tránsito", cls: "bg-blue-100 text-blue-800" },
  G: { label: "Recibido", cls: "bg-emerald-100 text-emerald-800" },
  H: { label: "Cerrado", cls: "bg-slate-200 text-slate-700" },
  C: { label: "Rechazado", cls: "bg-red-100 text-red-800" },
};
const CERRADOS = new Set(["G", "H", "C"]);
const n = (v: unknown) => Number(v) || 0;
const fmt = (v: number) => v.toLocaleString("es-CO");
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const haceDias = (d: number) => new Date(Date.now() - d * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtFecha = (s: string | null) => s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) : "—";
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? String(e);

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}


export default function SalidasGuayabal() {
  const [desde, setDesde] = useState(haceDias(6));
  const [hasta, setHasta] = useState(hoy());
  const [destino, setDestino] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const cfgQ = useQuery({
    queryKey: ["salidas-guayabal-config"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("traslados_salida_config").select("modo, ultima_corrida").limit(1).maybeSingle();
      if (error) throw error;
      return data as { modo: string | null; ultima_corrida: string | null } | null;
    },
    refetchInterval: 60_000,
  });

  const lineasQ = useQuery({
    queryKey: ["salidas-guayabal", desde, hasta],
    queryFn: () => fetchAll<Linea>((f, t) => (supabase as any).from("traslados_salida_guayabal").select("*")
      .gte("fecha", desde).lte("fecha", `${hasta}T23:59:59`).order("to_id").order("item_id").range(f, t)),
  });

  const logQ = useQuery({
    queryKey: ["salidas-guayabal-log"],
    queryFn: () => fetchAll<Log>((f, t) => (supabase as any).from("traslados_salida_log").select("id, corrida_en, tranid, sku, accion, cantidad, ok, error")
      .gte("corrida_en", new Date(Date.now() - 7 * 864e5).toISOString()).order("corrida_en", { ascending: false }).order("id", { ascending: false }).range(f, t)),
  });

  const all = lineasQ.data ?? [];
  const destinos = useMemo(() => [...new Set(all.map((l) => l.destino ?? "—"))].sort(), [all]);
  const filas = useMemo(() => all.filter((l) => (destino === "todos" || (l.destino ?? "—") === destino) && (estado === "todos" || ESTADOS[l.estado_to ?? ""]?.label === estado)), [all, destino, estado]);

  const kpis = useMemo(() => ({
    salieron: filas.reduce((s, l) => s + n(l.ordenado), 0),
    pendientes: filas.filter((l) => !CERRADOS.has(l.estado_to ?? "") && l.cerrado !== true).reduce((s, l) => s + Math.max(n(l.ordenado) - n(l.despachado), 0), 0),
    reservadas: filas.reduce((s, l) => s + n(l.reservado_shopify), 0),
    alertas: filas.filter((l) => l.ultimo_error).length,
  }), [filas]);

  const grupos = useMemo(() => {
    const m = new Map<number, { to_id: number; tranid: string; fecha: string | null; destino: string; creado_por: string; estado_to: string; unidades: number; despachadas: number; reservadas: number; alertas: number; lineas: Linea[] }>();
    for (const l of filas) {
      let g = m.get(l.to_id);
      if (!g) { g = { to_id: l.to_id, tranid: l.tranid ?? String(l.to_id), fecha: l.fecha, destino: l.destino ?? "—", creado_por: l.creado_por ?? "—", estado_to: l.estado_to ?? "", unidades: 0, despachadas: 0, reservadas: 0, alertas: 0, lineas: [] }; m.set(l.to_id, g); }
      g.unidades += n(l.ordenado); g.despachadas += n(l.despachado); g.reservadas += n(l.reservado_shopify); if (l.ultimo_error) g.alertas++; g.lineas.push(l);
    }
    return [...m.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.to_id - a.to_id);
  }, [filas]);

  const porDestino = useMemo(() => {
    const m = new Map<string, number>();
    filas.forEach((l) => m.set(l.destino ?? "—", (m.get(l.destino ?? "—") ?? 0) + n(l.ordenado)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [filas]);
  const maxDest = Math.max(1, ...porDestino.map((d) => d[1]));

  const minutos = cfgQ.data?.ultima_corrida ? Math.max(0, Math.round((Date.now() - new Date(cfgQ.data.ultima_corrida).getTime()) / 60000)) : null;
  const real = (cfgQ.data?.modo ?? "").toLowerCase() === "real";

  const exportar = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Salidas Guayabal");
    ws.columns = [
      { header: "TO", key: "to", width: 14 }, { header: "Fecha", key: "fecha", width: 12 }, { header: "Destino", key: "destino", width: 24 },
      { header: "Creado por", key: "creado", width: 22 }, { header: "Estado", key: "estado", width: 24 }, { header: "SKU", key: "sku", width: 18 },
      { header: "Nombre", key: "nombre", width: 40 }, { header: "Unidades", key: "ord", width: 10 }, { header: "Despachadas", key: "desp", width: 12 },
      { header: "Reservadas en Shopify", key: "res", width: 12 }, { header: "Descontadas en Shopify", key: "desc", width: 12 }, { header: "Alerta", key: "err", width: 40 },
    ];
    for (const g of grupos) for (const l of g.lineas) ws.addRow({
      to: g.tranid, fecha: l.fecha?.slice(0, 10) ?? "", destino: g.destino, creado: g.creado_por, estado: ESTADOS[g.estado_to]?.label ?? g.estado_to,
      sku: l.sku ?? "", nombre: l.nombre ?? "", ord: n(l.ordenado), desp: n(l.despachado), res: n(l.reservado_shopify), desc: n(l.descontado_shopify), err: l.ultimo_error ?? "",
    });
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "L1" };
    ws.getColumn("sku").numFmt = "@";
    saveAs(new Blob([await wb.xlsx.writeBuffer()]), `Salidas_Guayabal_${hoy()}.xlsx`);
  };

  const toggle = (id: number) => setAbiertos((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const Pill = ({ e }: { e: string }) => <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", ESTADOS[e]?.cls ?? "bg-muted")}>{ESTADOS[e]?.label ?? (e || "—")}</span>;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Salidas de Guayabal</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Traslados que salen del CEDI online. Selliq reserva en Shopify al aprobarse y descuenta al despacharse.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={cn("rounded-full px-2.5 py-0.5 font-medium", real ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>{cfgQ.data ? (real ? "Real" : "Simulación") : "—"}</span>
              <span className="text-muted-foreground">{minutos === null ? "Sin revisiones" : `Última revisión hace ${fmt(minutos)} min`}</span>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            <Tabs defaultValue="traslados">
              <TabsList><TabsTrigger value="traslados">Traslados</TabsTrigger><TabsTrigger value="historial">Historial</TabsTrigger></TabsList>

              <TabsContent value="traslados" className="space-y-6 mt-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div><p className="text-xs text-muted-foreground mb-1">Desde</p><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" /></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Hasta</p><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" /></div>
                  <Select value={destino} onValueChange={setDestino}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Destino" /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos los destinos</SelectItem>{destinos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger className="w-52"><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{[...new Set(Object.values(ESTADOS).map((e) => e.label))].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="ml-auto" onClick={exportar} disabled={!grupos.length}><Download className="h-4 w-4 mr-1" />Excel</Button>
                </div>

                {lineasQ.error && <p className="text-sm text-destructive">Error: {errMsg(lineasQ.error)}</p>}

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[["Unidades que salieron", kpis.salieron], ["Pendientes de despacho", kpis.pendientes], ["Reservadas en Shopify ahora", kpis.reservadas], ["Con alerta", kpis.alertas]].map(([t, v]) => (
                    <Card key={t as string}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t}</p><p className={cn("text-2xl font-semibold", t === "Con alerta" && n(v) > 0 && "text-destructive")}>{fmt(n(v))}</p></CardContent></Card>
                  ))}
                </div>

                {lineasQ.isLoading ? <LoadingState /> : (
                  <Card>
                    <CardContent className="p-0 overflow-x-auto">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead className="w-8" /><TableHead>TO</TableHead><TableHead>Fecha</TableHead><TableHead>Destino</TableHead><TableHead>Creado por</TableHead><TableHead>Estado</TableHead>
                          <TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Despachadas</TableHead><TableHead className="text-right">Reservadas en Shopify</TableHead><TableHead>Alerta</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {!grupos.length && <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">Sin traslados en el período</TableCell></TableRow>}
                          {grupos.map((g) => (
                            <Fragment key={g.to_id}>
                              <TableRow className="cursor-pointer" onClick={() => toggle(g.to_id)}>
                                <TableCell>{abiertos.has(g.to_id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                                <TableCell className="font-medium">{g.tranid}</TableCell>
                                <TableCell className="whitespace-nowrap">{g.fecha?.slice(0, 10) ?? "—"}</TableCell>
                                <TableCell>{g.destino}</TableCell><TableCell>{g.creado_por}</TableCell><TableCell><Pill e={g.estado_to} /></TableCell>
                                <TableCell className="text-right">{fmt(g.unidades)}</TableCell><TableCell className="text-right">{fmt(g.despachadas)}</TableCell><TableCell className="text-right">{fmt(g.reservadas)}</TableCell>
                                <TableCell>{g.alertas > 0 ? <Badge variant="destructive">{g.alertas}</Badge> : "—"}</TableCell>
                              </TableRow>
                              {abiertos.has(g.to_id) && g.lineas.map((l, i) => (
                                <TableRow key={`${g.to_id}-${l.item_id}-${i}`} className="bg-muted/40 text-xs">
                                  <TableCell /><TableCell className="font-mono">{l.sku}</TableCell><TableCell colSpan={4}>{l.nombre}</TableCell>
                                  <TableCell className="text-right">{fmt(n(l.ordenado))}</TableCell><TableCell className="text-right">{fmt(n(l.despachado))}</TableCell><TableCell className="text-right">{fmt(n(l.reservado_shopify))}</TableCell>
                                  <TableCell className="text-destructive max-w-xs break-words">{l.ultimo_error ?? ""}</TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader><CardTitle className="text-sm">Unidades por destino</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {!porDestino.length && <p className="text-sm text-muted-foreground">Sin datos</p>}
                    {porDestino.map(([d, v]) => (
                      <div key={d} className="flex items-center gap-3 text-sm">
                        <span className="w-40 truncate">{d}</span>
                        <div className="flex-1 h-3 rounded bg-muted"><div className="h-3 rounded bg-primary" style={{ width: `${(v / maxDest) * 100}%` }} /></div>
                        <span className="w-16 text-right tabular-nums">{fmt(v)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="historial" className="mt-4">
                {logQ.error && <p className="text-sm text-destructive">Error: {errMsg(logQ.error)}</p>}
                {logQ.isLoading ? <LoadingState /> : (
                  <Card><CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>TO</TableHead><TableHead>SKU</TableHead><TableHead>Acción</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Resultado</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {!(logQ.data ?? []).length && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sin acciones en los últimos 7 días</TableCell></TableRow>}
                        {(logQ.data ?? []).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{fmtFecha(r.corrida_en)}</TableCell><TableCell>{r.tranid ?? "—"}</TableCell><TableCell className="font-mono text-xs">{r.sku ?? "—"}</TableCell>
                            <TableCell>{r.accion.replace(/_/g, " ")}</TableCell><TableCell className="text-right">{fmt(n(r.cantidad))}</TableCell>
                            <TableCell><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", r.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}>{r.ok ? "OK" : "Error"}</span></TableCell>
                            <TableCell className="text-destructive text-xs max-w-md break-words">{r.error ?? ""}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent></Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
