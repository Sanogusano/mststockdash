import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtCOP, fmtInt, fmtFecha } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";

type Row = {
  canal: string | null; pedido: string | null; sucursal: string | null; fecha_pedido: string | null;
  estado_pago: string | null; colaborador: string | null; numero_factura: string | null;
  fecha_factura: string | null; numero_pos: string | null; cufe: string | null; emitida_dian: boolean | null;
  nota_credito: string | null; fecha_nota: string | null; tiene_nota: boolean | null;
  venta_bruta: number | null; descuento: number | null; venta_neta: number | null; impuesto: number | null;
  venta_total: number | null; articulos: number | null; estado_facturacion: string | null; dias_sin_facturar: number | null;
};

type CardKey = "pendiente" | "sin_dian" | "anulado" | "facturado";
const CARD_ESTADO: Record<CardKey, (e: string) => boolean> = {
  pendiente: (e) => e === "PENDIENTE POR FACTURAR",
  sin_dian: (e) => e === "Facturado sin emitir a DIAN",
  anulado: (e) => e === "Anulado por nota credito",
  facturado: (e) => e === "Facturado",
};

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const PAGE = 100;

function badgeClass(e: string) {
  if (e === "PENDIENTE POR FACTURAR") return "bg-destructive/10 text-destructive border-destructive/30";
  if (e === "Facturado sin emitir a DIAN") return "bg-amber-100 text-amber-800 border-amber-300";
  if (e === "Anulado por nota credito") return "bg-muted text-muted-foreground border-border";
  if (e === "Facturado") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  return "bg-secondary text-secondary-foreground border-border";
}

export default function ReporteFacturacionPage() {
  const hoy = hoyBogota();
  const [desde, setDesde] = useState(hoy.slice(0, 8) + "01");
  const [hasta, setHasta] = useState(hoy);
  const [canal, setCanal] = useState("todos");
  const [soloPend, setSoloPend] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [cardFiltro, setCardFiltro] = useState<CardKey | null>(null);
  const [page, setPage] = useState(1);

  const { isAdmin } = useUserRole();
  const canExport = useHasPermission({ module: "financiero.reporte_facturacion", action: "export" }) || isAdmin;

  const [exportando, setExportando] = useState<number | null>(null);
  const [canalesVistos, setCanalesVistos] = useState<string[]>([]);
  const pCanal = canal === "todos" ? null : canal;
  const s = busqueda.trim();
  const TOPE = 500;

  const resumenQ = useQuery({
    queryKey: ["reporte-facturacion-resumen", desde, hasta, pCanal],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("resumen_pendientes_facturacion", {
        p_desde: desde, p_hasta: hasta, p_canal: pCanal,
      });
      if (error) throw error;
      return (data ?? []) as { estado_facturacion: string; pedidos: number; venta_neta: number; articulos: number; dias_max: number }[];
    },
  });

  const buildQuery = () => {
    let qb = (supabase.rpc as any)("reporte_pendientes_facturacion", {
      p_desde: desde, p_hasta: hasta, p_solo_pendientes: soloPend, p_canal: pCanal,
    });
    const estados: Record<CardKey, string> = {
      pendiente: "PENDIENTE POR FACTURAR", sin_dian: "Facturado sin emitir a DIAN",
      anulado: "Anulado por nota credito", facturado: "Facturado",
    };
    if (cardFiltro) qb = qb.eq("estado_facturacion", estados[cardFiltro]);
    if (s) {
      const t = s.replace(/[,()*]/g, "");
      qb = qb.or(`pedido.ilike.*${t}*,numero_factura.ilike.*${t}*`);
    }
    return qb.order("fecha_pedido", { ascending: false, nullsFirst: false }).order("pedido", { ascending: true });
  };

  const q = useQuery({
    queryKey: ["reporte-facturacion", desde, hasta, soloPend, pCanal, cardFiltro, s, page],
    queryFn: async () => {
      const qb = buildQuery();
      const { data, error } = s ? await qb.range(0, TOPE - 1) : await qb.range((page - 1) * PAGE, (page - 1) * PAGE + PAGE - 1);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const ultimaCarga = useQuery({
    queryKey: ["netsuite-facturas-ultima"],
    queryFn: async () => {
      const { data, error } = await supabase.from("netsuite_facturas").select("created_at").order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      return data?.[0]?.created_at ?? null;
    },
  });

  useEffect(() => {
    const nuevos = (q.data ?? []).map((r) => r.canal).filter(Boolean) as string[];
    if (nuevos.some((c) => !canalesVistos.includes(c)))
      setCanalesVistos((prev) => Array.from(new Set([...prev, ...nuevos])).sort());
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const canales = canalesVistos;

  const resumen = useMemo(() => {
    const out = {} as Record<CardKey, { n: number; v: number }>;
    (Object.keys(CARD_ESTADO) as CardKey[]).forEach((k) => {
      const rows = (resumenQ.data ?? []).filter((r) => CARD_ESTADO[k](r.estado_facturacion ?? ""));
      out[k] = { n: rows.reduce((a, r) => a + Number(r.pedidos ?? 0), 0), v: rows.reduce((a, r) => a + Number(r.venta_neta ?? 0), 0) };
    });
    return out;
  }, [resumenQ.data]);

  const totalPedidos = useMemo(() => {
    if (cardFiltro) return resumen[cardFiltro].n;
    if (soloPend) return resumen.pendiente.n;
    return (resumenQ.data ?? []).reduce((a, r) => a + Number(r.pedidos ?? 0), 0);
  }, [resumen, resumenQ.data, cardFiltro, soloPend]);

  const filtrados = q.data ?? [];
  const topeAlcanzado = !!s && filtrados.length >= TOPE;

  useEffect(() => setPage(1), [desde, hasta, soloPend, canal, busqueda, cardFiltro]);
  const totalPages = Math.max(1, Math.ceil(totalPedidos / PAGE));
  const pageRows = filtrados;

  const exportar = async () => {
    setExportando(0);
    try {
      const all: Row[] = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await buildQuery().range(off, off + 999);
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        setExportando(all.length);
        if (!data || data.length < 1000) break;
      }
      exportToXLS(
        all.map((r) => ({
          Estado: r.estado_facturacion ?? "", Canal: r.canal ?? "", Pedido: r.pedido ?? "", Sucursal: r.sucursal ?? "",
          "Fecha pedido": r.fecha_pedido ?? "", Colaborador: r.colaborador ?? "", Factura: r.numero_factura ?? "",
          "Fecha factura": r.fecha_factura ?? "", "N° POS": r.numero_pos ?? "",
          DIAN: r.emitida_dian ? "Emitida" : r.numero_factura ? "Sin CUFE" : "", "Nota crédito": r.nota_credito ?? "",
          "Venta neta": Number(r.venta_neta ?? 0), Impuesto: Number(r.impuesto ?? 0), Descuento: Number(r.descuento ?? 0),
          Artículos: Number(r.articulos ?? 0), "Días sin facturar": r.dias_sin_facturar ?? "",
        })),
        `Reporte de facturacion ${hoyBogota()}`,
        "Facturación",
      );
    } catch (e: any) {
      alert(`Error al exportar: ${e?.message ?? e}`);
    } finally {
      setExportando(null);
    }
  };

  const cards: { key: CardKey; title: string; cls: string }[] = [
    { key: "pendiente", title: "Pendientes por facturar", cls: "border-destructive/40 text-destructive" },
    { key: "sin_dian", title: "Facturado sin emitir a DIAN", cls: "border-amber-400 text-amber-700" },
    { key: "anulado", title: "Anulados por nota crédito", cls: "text-foreground" },
    { key: "facturado", title: "Total facturado", cls: "text-foreground" },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <FinanzasLayout title="Reporte de Facturación">
        <p className="text-xs text-muted-foreground -mt-4 mb-6">
          Las facturas se actualizan al cargar el archivo de NetSuite desde Facturas Oracle. Última carga:{" "}
          {ultimaCarga.data ? new Date(ultimaCarga.data).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—"}.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 items-end">
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Canal</Label>
            <Select value={canal} onValueChange={setCanal}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {canales.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
              <Input className="pl-8" placeholder="Pedido o factura" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3 justify-between">
            <label className="flex items-center gap-2 text-sm"><Switch checked={soloPend} onCheckedChange={setSoloPend} />Solo pendientes</label>
            {canExport && <Button variant="outline" size="sm" onClick={exportar} disabled={!filtrados.length || exportando !== null}><Download className="h-4 w-4 mr-1" />{exportando !== null ? `Preparando… ${fmtInt(exportando)} filas` : "Excel"}</Button>}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
          {cards.map((c) => (
            <Card key={c.key} onClick={() => setCardFiltro(cardFiltro === c.key ? null : c.key)}
              className={cn("cursor-pointer transition-shadow hover:shadow-md", c.cls, cardFiltro === c.key && "ring-2 ring-primary")}>
              <CardContent className="p-4">
                <p className="text-xs font-medium">{c.title}</p>
                <p className="text-2xl font-semibold tabular-nums">{fmtInt(resumen[c.key].n)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{fmtCOP(resumen[c.key].v)} venta neta</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {cardFiltro && <button className="text-xs text-primary underline mb-4" onClick={() => setCardFiltro(null)}>Quitar filtro de estado</button>}

        {resumenQ.error && <p className="text-sm text-destructive my-4">Error resumen: {(resumenQ.error as any).message}</p>}
        {topeAlcanzado && <p className="text-sm text-amber-700 my-2">La búsqueda alcanzó el tope de {TOPE} filas; refina el texto para ver todos los resultados.</p>}
        {q.error && <p className="text-sm text-destructive my-4">Error: {(q.error as any).message}</p>}
        {q.isLoading ? <Skeleton className="h-96 w-full mt-4" /> : (
          <div className="overflow-x-auto rounded-md border border-border mt-4">
            <Table className="min-w-[1700px]">
              <TableHeader>
                <TableRow>
                  {["Estado","Canal","Pedido","Sucursal","Fecha pedido","Colaborador","Factura","Fecha factura","N° POS","DIAN","Nota crédito"].map((h) => <TableHead key={h}>{h}</TableHead>)}
                  {["Venta neta","Impuesto","Descuento","Artículos","Días sin facturar"].map((h) => <TableHead key={h} className="text-right">{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 && <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-8">Sin pedidos para los filtros seleccionados</TableCell></TableRow>}
                {pageRows.map((r, i) => {
                  const e = r.estado_facturacion ?? "";
                  return (
                    <TableRow key={(r.pedido ?? "") + i}>
                      <TableCell><span className={cn("inline-block text-xs px-2 py-0.5 rounded border whitespace-nowrap", badgeClass(e))}>{e}</span></TableCell>
                      <TableCell>{r.canal}</TableCell>
                      <TableCell className="font-medium">{r.pedido}</TableCell>
                      <TableCell>{r.sucursal}</TableCell>
                      <TableCell className="whitespace-nowrap">{fmtFecha(r.fecha_pedido)}</TableCell>
                      <TableCell>{r.colaborador}</TableCell>
                      <TableCell>{r.numero_factura ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.fecha_factura ? fmtFecha(r.fecha_factura) : "—"}</TableCell>
                      <TableCell>{r.numero_pos ?? "—"}</TableCell>
                      <TableCell>
                        {r.emitida_dian ? (
                          <Tooltip><TooltipTrigger><CheckCircle2 className="h-4 w-4 text-emerald-600" /></TooltipTrigger>
                            <TooltipContent className="max-w-xs break-all">{r.cufe ? `CUFE: ${r.cufe}` : "Emitida a DIAN"}</TooltipContent></Tooltip>
                        ) : r.numero_factura ? (
                          <Tooltip><TooltipTrigger><AlertTriangle className="h-4 w-4 text-amber-600" /></TooltipTrigger>
                            <TooltipContent>Factura sin CUFE</TooltipContent></Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{r.nota_credito ? `${r.nota_credito}${r.fecha_nota ? " · " + fmtFecha(r.fecha_nota) : ""}` : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCOP(r.venta_neta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCOP(r.impuesto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCOP(r.descuento)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(r.articulos)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", (r.dias_sin_facturar ?? 0) > 30 && "text-destructive font-semibold")}>{r.dias_sin_facturar ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!s && totalPedidos > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-muted-foreground">Página {page} · {fmtInt(totalPedidos)} pedidos en total</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </FinanzasLayout>
    </TooltipProvider>
  );
}
