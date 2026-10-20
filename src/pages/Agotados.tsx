import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, Truck } from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

type EstadoAg = "detectado" | "etiquetado" | "en_traslado" | "resuelto" | "contactar_cliente";
type Disp = { loc?: number | string; bodega?: string; disponible?: number };
type Linea = {
  shopify_order_id: string;
  pedido: string | null;
  so_tranid: string | null;
  sku: string;
  item_id: number | null;
  nombre: string | null;
  cantidad_faltante: number | null;
  origen_ns: number | null;
  origen_nombre: string | null;
  disponibilidad: Disp[] | null;
  motivo: string | null;
  detalle_motivo: string | null;
  estado: EstadoAg;
  traslado_ext: string | null;
  traslado_tranid: string | null;
  primera_deteccion: string | null;
  ultima_deteccion: string | null;
  etiquetado_en: string | null;
  resuelto_en: string | null;
};
type SoCancelada = {
  so_tranid: string;
  pedido: string | null;
  fecha_so: string | null;
  estado_ns: string | null;
  monto_con_iva: number | null;
  cancelado_en: string | null;
  cerrada_en: string | null;
};

const ESTADO_LABEL: Record<EstadoAg, string> = {
  detectado: "Detectado",
  etiquetado: "Etiquetado",
  en_traslado: "En traslado",
  contactar_cliente: "Contactar cliente",
  resuelto: "Resuelto",
};
const ESTADO_CLS: Record<EstadoAg, string> = {
  detectado: "bg-blue-100 text-blue-800 border-blue-200",
  etiquetado: "bg-purple-100 text-purple-800 border-purple-200",
  en_traslado: "bg-amber-100 text-amber-800 border-amber-200",
  contactar_cliente: "bg-red-100 text-red-800 border-red-200",
  resuelto: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
const ROLES_TRASLADO = ["admin", "logistica"];
const DIA = 86400000;

const fmtFecha = (s: string | null, hora = true) =>
  s
    ? new Date(s).toLocaleString("es-CO", {
        timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
        ...(hora ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
const fmtCOP = (n: number | null | undefined) => `$ ${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const num = (n: number) => n.toLocaleString("es-CO");
const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export default function AgotadosPage({ mostrarSoCanceladas = true }: { mostrarSoCanceladas?: boolean } = {}) {
  const qc = useQueryClient();
  const { role, isAdmin } = useUserRole();
  const puedeTrasladar = isAdmin || (!!role && ROLES_TRASLADO.includes(role));

  const [verResueltos, setVerResueltos] = useState(false);
  const [fEstado, setFEstado] = useState("todos");
  const [fOrigen, setFOrigen] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [confirmGen, setConfirmGen] = useState<{ origen_ns: number; nombre: string } | null>(null);
  const [confirmAnular, setConfirmAnular] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const lineasQ = useQuery({
    queryKey: ["agotados-lineas"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 7 * DIA).toISOString();
      return fetchAll<Linea>((a, b) =>
        supabase
          .from("pedido_agotado_linea" as never)
          .select("*")
          .or(`estado.neq.resuelto,resuelto_en.gte.${desde}`)
          .order("primera_deteccion", { ascending: true })
          .range(a, b) as never,
      );
    },
  });

  const soQ = useQuery({
    queryKey: ["agotados-so-canceladas"],
    enabled: mostrarSoCanceladas,
    queryFn: async () =>
      fetchAll<SoCancelada>((a, b) =>
        supabase
          .from("so_pedido_cancelado" as never)
          .select("*")
          .is("cerrada_en", null)
          .order("fecha_so", { ascending: true })
          .range(a, b) as never,
      ),
  });

  const logQ = useQuery({
    queryKey: ["agotados-ultima-revision"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proceso_ejecucion_log" as never)
        .select("*")
        .eq("proceso", "agotados_detectar")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as { ultima_ejecucion?: string } | null)?.ultima_ejecucion ?? null;
    },
  });

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["agotados-lineas"] });
    qc.invalidateQueries({ queryKey: ["agotados-so-canceladas"] });
    qc.invalidateQueries({ queryKey: ["agotados-ultima-revision"] });
  };

  const lineas = lineasQ.data ?? [];
  const hace7 = Date.now() - 7 * DIA;
  const esResuelto7 = (l: Linea) => l.estado === "resuelto" && !!l.resuelto_en && new Date(l.resuelto_en).getTime() >= hace7;

  const kpis = useMemo(() => {
    const grupo = (f: (l: Linea) => boolean) => {
      const ls = lineas.filter(f);
      return { prendas: ls.length, pedidos: new Set(ls.map((l) => l.shopify_order_id)).size };
    };
    return {
      conOrigen: grupo((l) => l.estado === "detectado" || l.estado === "etiquetado"),
      contactar: grupo((l) => l.estado === "contactar_cliente"),
      traslado: grupo((l) => l.estado === "en_traslado"),
      resueltos: grupo(esResuelto7),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas]);

  const origenes = useMemo(
    () => [...new Set(lineas.map((l) => l.origen_nombre).filter(Boolean) as string[])].sort(),
    [lineas],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const ls = lineas.filter((l) => {
      if (l.estado === "resuelto" && !(verResueltos && esResuelto7(l))) return false;
      if (fEstado !== "todos" && l.estado !== fEstado) return false;
      if (fOrigen === "sin" ? !!l.origen_nombre : fOrigen !== "todos" && l.origen_nombre !== fOrigen) return false;
      if (q && !(l.pedido ?? "").toLowerCase().includes(q) && !l.sku.toLowerCase().includes(q)) return false;
      return true;
    });
    // Agrupa visualmente por pedido manteniendo el orden de primera aparición
    const orden = new Map<string, number>();
    ls.forEach((l, i) => { if (!orden.has(l.shopify_order_id)) orden.set(l.shopify_order_id, i); });
    return ls.sort((a, b) => orden.get(a.shopify_order_id)! - orden.get(b.shopify_order_id)!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineas, verResueltos, fEstado, fOrigen, busqueda]);

  const porBodega = useMemo(() => {
    const m = new Map<number, { origen_ns: number; nombre: string; prendas: number; unidades: number; pedidos: Set<string> }>();
    for (const l of lineas) {
      if ((l.estado !== "detectado" && l.estado !== "etiquetado") || l.origen_ns == null) continue;
      if (!m.has(l.origen_ns)) m.set(l.origen_ns, { origen_ns: l.origen_ns, nombre: l.origen_nombre ?? String(l.origen_ns), prendas: 0, unidades: 0, pedidos: new Set() });
      const g = m.get(l.origen_ns)!;
      g.prendas += 1;
      g.unidades += Number(l.cantidad_faltante ?? 0);
      g.pedidos.add(l.shopify_order_id);
    }
    return [...m.values()].sort((a, b) => b.unidades - a.unidades);
  }, [lineas]);

  const generados = useMemo(() => {
    const m = new Map<string, { ext: string; bodega: string; prendas: number; unidades: number; tranid: string | null }>();
    for (const l of lineas) {
      if (l.estado !== "en_traslado" || !l.traslado_ext) continue;
      if (!m.has(l.traslado_ext)) m.set(l.traslado_ext, { ext: l.traslado_ext, bodega: l.origen_nombre ?? "—", prendas: 0, unidades: 0, tranid: null });
      const g = m.get(l.traslado_ext)!;
      g.prendas += 1;
      g.unidades += Number(l.cantidad_faltante ?? 0);
      if (l.traslado_tranid) g.tranid = l.traslado_tranid;
    }
    return [...m.values()].sort((a, b) => b.ext.localeCompare(a.ext));
  }, [lineas]);

  const soRows = soQ.data ?? [];
  const soTotal = soRows.reduce((s, r) => s + Number(r.monto_con_iva ?? 0), 0);

  const exportarAgotados = () => {
    if (!filtradas.length) return toast.info("No hay filas para exportar");
    const data = filtradas.map((l) => ({
      Pedido: l.pedido ?? "",
      "Orden de venta": l.so_tranid ?? "Sin SO",
      Prenda: l.nombre ?? "",
      SKU: l.sku,
      Cantidad: Number(l.cantidad_faltante ?? 0),
      "Origen sugerido": l.origen_nombre ?? "",
      "Otras bodegas": (l.disponibilidad ?? []).map((d) => `${d.bodega ?? d.loc}: ${d.disponible ?? 0}`).join(", "),
      Estado: ESTADO_LABEL[l.estado] ?? l.estado,
      Días: l.primera_deteccion ? Math.floor((Date.now() - new Date(l.primera_deteccion).getTime()) / DIA) : "",
      "Traslado ext": l.traslado_ext ?? "",
      "Traslado NetSuite": l.traslado_tranid ?? "",
      Motivo: l.motivo ?? "",
      "Detalle motivo": l.detalle_motivo ?? "",
      "Primera detección": fmtFecha(l.primera_deteccion),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Agotados");
    XLSX.writeFile(wb, `agotados_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.xlsx`);
  };

  const exportarSo = () => {
    if (!soRows.length) return toast.info("No hay filas para exportar");
    const ws = XLSX.utils.json_to_sheet(
      soRows.map((r) => ({
        "Orden de venta": r.so_tranid,
        Pedido: r.pedido ?? "",
        "Fecha SO": fmtFecha(r.fecha_so, false),
        "Cancelado en Shopify": fmtFecha(r.cancelado_en),
        Valor: Number(r.monto_con_iva ?? 0),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SO abiertas");
    XLSX.writeFile(wb, `so_pedidos_cancelados_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.xlsx`);
  };

  const generarTraslado = async () => {
    if (!confirmGen) return;
    setTrabajando(true);
    try {
      const { data, error } = await supabase.rpc("agotados_generar_traslado" as never, { p_origen: confirmGen.origen_ns } as never);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      if (!rows.length) {
        toast.info("No hay líneas pendientes para esta bodega");
        return;
      }
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Traslado");
      ws.addRow(["ID EXTERNO", "SUBSIDIARIA", "FECHA", "UBICACIÓN ORIGEN", "UBICACIÓN DESTINO", "ARTÍCULO", "ID INTERNO ART", "EMPLEADO", "CANTIDAD"]);
      ws.getRow(1).font = { bold: true };
      const int = (v: unknown) => Math.trunc(Number(v ?? 0));
      for (const r of rows) {
        ws.addRow([
          String(r.id_externo ?? ""),
          int(r.subsidiaria),
          String(r.fecha ?? ""),
          int(r.ubicacion_origen),
          int(r.ubicacion_destino),
          String(r.articulo ?? ""),
          int(r.id_interno_art),
          String(r.empleado ?? ""),
          int(r.cantidad),
        ]);
      }
      ws.getColumn(6).numFmt = "@";
      ws.columns.forEach((c, i) => { c.width = i === 0 || i === 7 ? 22 : 16; });
      const buf = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${rows[0].id_externo}.xlsx`);
      toast.success(`Traslado ${rows[0].id_externo} generado`);
    } catch (e) {
      toast.error(`No se pudo generar el traslado: ${errMsg(e)}`);
    } finally {
      setTrabajando(false);
      setConfirmGen(null);
      refrescar();
    }
  };

  const anularTraslado = async () => {
    if (!confirmAnular) return;
    setTrabajando(true);
    try {
      const { data, error } = await supabase.rpc("agotados_anular_traslado" as never, { p_ext: confirmAnular } as never);
      if (error) throw error;
      toast.success(`${Number(data ?? 0)} líneas devueltas a pendiente`);
    } catch (e) {
      toast.error(`No se pudo anular: ${errMsg(e)}`);
    } finally {
      setTrabajando(false);
      setConfirmAnular(null);
      refrescar();
    }
  };

  const Kpi = ({ titulo, v, cls }: { titulo: string; v: { prendas: number; pedidos: number }; cls?: string }) => (
    <Card className={cn(cls)}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{titulo}</p>
        <p className="text-2xl font-semibold tabular-nums mt-1">{num(v.prendas)}</p>
        <p className="text-xs text-muted-foreground">{num(v.prendas)} prendas · {num(v.pedidos)} pedidos</p>
      </CardContent>
    </Card>
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Agotados</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Prendas faltantes en pedidos y traslados a CEDI</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Última revisión: {fmtFecha(logQ.data ?? null)}</p>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            {lineasQ.error && <p className="text-sm text-destructive">Error: {errMsg(lineasQ.error)}</p>}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi titulo="Con origen" v={kpis.conOrigen} />
              <Kpi titulo="Contactar cliente" v={kpis.contactar} cls="border-red-300 bg-red-50" />
              <Kpi titulo="En traslado" v={kpis.traslado} />
              <Kpi titulo="Resueltos 7 días" v={kpis.resueltos} cls="border-emerald-300 bg-emerald-50" />
            </div>

            {puedeTrasladar && porBodega.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Traslados por bodega</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {porBodega.map((b) => (
                    <Card key={b.origen_ns}>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{b.nombre}</p>
                          <p className="text-xs text-muted-foreground">{num(b.prendas)} prendas · {num(b.unidades)} unidades · {num(b.pedidos.size)} pedidos</p>
                        </div>
                        <Button size="sm" disabled={trabajando} onClick={() => setConfirmGen({ origen_ns: b.origen_ns, nombre: b.nombre })}>
                          <Truck className="h-4 w-4 mr-1" /> Generar traslado
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Estado</Label>
                    <Select value={fEstado} onValueChange={setFEstado}>
                      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {(Object.keys(ESTADO_LABEL) as EstadoAg[]).map((k) => (
                          <SelectItem key={k} value={k}>{ESTADO_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Origen</Label>
                    <Select value={fOrigen} onValueChange={setFOrigen}>
                      <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="sin">Sin origen</SelectItem>
                        {origenes.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Buscar</Label>
                    <div className="relative">
                      <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                      <Input className="pl-8 h-9 w-56" placeholder="Pedido o SKU" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 h-9">
                    <Switch id="ver-res" checked={verResueltos} onCheckedChange={setVerResueltos} />
                    <Label htmlFor="ver-res" className="text-xs">Ver resueltos 7 días</Label>
                  </div>
                  <Button variant="outline" size="sm" className="ml-auto" onClick={exportarAgotados}>
                    <Download className="h-4 w-4 mr-1" /> Exportar Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {lineasQ.isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[1200px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Pedido</TableHead>
                          <TableHead>Orden de venta</TableHead>
                          <TableHead>Prenda</TableHead>
                          <TableHead className="text-right">Cant.</TableHead>
                          <TableHead>Origen sugerido</TableHead>
                          <TableHead>Otras bodegas</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead className="text-right">Días</TableHead>
                          <TableHead>Traslado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtradas.length === 0 && (
                          <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Sin agotados</TableCell></TableRow>
                        )}
                        {filtradas.map((l, i) => {
                          const primero = i === 0 || filtradas[i - 1].shopify_order_id !== l.shopify_order_id;
                          const dias = l.primera_deteccion ? Math.floor((Date.now() - new Date(l.primera_deteccion).getTime()) / DIA) : null;
                          return (
                            <Fragment key={`${l.shopify_order_id}-${l.sku}`}>
                              <TableRow className={cn(primero && i > 0 && "border-t-2 border-border")}>
                                <TableCell className="font-medium">{primero ? l.pedido ?? "—" : ""}</TableCell>
                                <TableCell>
                                  {primero && (l.so_tranid ?? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs border bg-muted text-muted-foreground">Sin SO</span>
                                  ))}
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">{l.nombre ?? "—"}</div>
                                  <div className="text-[11px] text-muted-foreground">{l.sku}</div>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{num(Number(l.cantidad_faltante ?? 0))}</TableCell>
                                <TableCell>{l.origen_nombre ?? "—"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {(l.disponibilidad ?? []).map((d, j) => (
                                      <span key={j} className="text-[11px] px-1.5 py-0.5 rounded border bg-muted/50">{d.bodega ?? d.loc}: {num(Number(d.disponible ?? 0))}</span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium border", ESTADO_CLS[l.estado])}>{ESTADO_LABEL[l.estado] ?? l.estado}</span>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{dias ?? "—"}</TableCell>
                                <TableCell className="text-xs">
                                  {l.traslado_ext ?? "—"}
                                  {l.traslado_tranid && <div className="font-bold">{l.traslado_tranid}</div>}
                                </TableCell>
                              </TableRow>
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Traslados generados</h3>
              {generados.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay traslados en curso.</p>
              ) : (
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>ID externo</TableHead>
                          <TableHead>Bodega</TableHead>
                          <TableHead className="text-right">Prendas</TableHead>
                          <TableHead className="text-right">Unidades</TableHead>
                          <TableHead>NetSuite</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {generados.map((g) => (
                          <TableRow key={g.ext}>
                            <TableCell className="font-medium">{g.ext}</TableCell>
                            <TableCell>{g.bodega}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(g.prendas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{num(g.unidades)}</TableCell>
                            <TableCell className="text-sm">
                              {g.tranid ? <>TO en NetSuite: <b>{g.tranid}</b></> : <span className="text-amber-700">Pendiente de subir a NetSuite</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {!g.tranid && puedeTrasladar && (
                                <Button size="sm" variant="outline" disabled={trabajando} onClick={() => setConfirmAnular(g.ext)}>Anular</Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </section>

            {mostrarSoCanceladas && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-sm">SO abiertas de pedidos cancelados · {num(soRows.length)} · {fmtCOP(soTotal)}</CardTitle>
                  <p className="text-xs text-muted-foreground">Cerrar estas órdenes en NetSuite</p>
                </div>
                <Button variant="outline" size="sm" onClick={exportarSo}><Download className="h-4 w-4 mr-1" /> Exportar Excel</Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {soQ.isLoading ? <LoadingState /> : soQ.error ? (
                  <p className="text-sm text-destructive p-4">Error: {errMsg(soQ.error)}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Orden de venta</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Fecha SO</TableHead>
                        <TableHead>Cancelado en Shopify</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {soRows.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sin órdenes abiertas</TableCell></TableRow>
                      )}
                      {soRows.map((r) => (
                        <TableRow key={r.so_tranid}>
                          <TableCell className="font-medium">{r.so_tranid}</TableCell>
                          <TableCell>{r.pedido ?? "—"}</TableCell>
                          <TableCell>{fmtFecha(r.fecha_so, false)}</TableCell>
                          <TableCell>{fmtFecha(r.cancelado_en)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCOP(r.monto_con_iva)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            )}
          </div>
        </main>
      </div>

      <AlertDialog open={!!confirmGen} onOpenChange={(o) => !o && !trabajando && setConfirmGen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generar traslado</AlertDialogTitle>
            <AlertDialogDescription>
              Se generará el archivo de traslado de {confirmGen?.nombre} a CEDI Guayabal y estas líneas quedarán En traslado. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trabajando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={trabajando} onClick={(e) => { e.preventDefault(); generarTraslado(); }}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmAnular} onOpenChange={(o) => !o && !trabajando && setConfirmAnular(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular traslado</AlertDialogTitle>
            <AlertDialogDescription>
              Se anulará el traslado {confirmAnular} y sus líneas volverán a pendiente. ¿Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trabajando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={trabajando} onClick={(e) => { e.preventDefault(); anularTraslado(); }}>Anular</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
