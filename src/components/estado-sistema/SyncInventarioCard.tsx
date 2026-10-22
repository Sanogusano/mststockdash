import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const SYNC_INV_KEY = "sync_inv";
const REFRESH = 60 * 1000;
const fmt = (n: number) => n.toLocaleString("es-CO");
const signo = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const hora = (d: string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const inicioHoyBogota = () => {
  const d = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return new Date(`${d}T00:00:00-05:00`).toISOString();
};

const MOTIVOS: Record<string, { label: string; cls: string }> = {
  traslado: { label: "Traslado", cls: "bg-blue-100 text-blue-800 border-blue-300" },
  recepcion: { label: "Recepción", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  venta_otro_canal: { label: "Venta otro canal", cls: "bg-violet-100 text-violet-800 border-violet-300" },
  devolucion: { label: "Devolución", cls: "bg-muted text-muted-foreground border-border" },
  ajuste_sin_documento: { label: "Ajuste sin documento", cls: "bg-destructive/10 text-destructive border-destructive/30" },
};
const MODO: Record<string, { label: string; cls: string }> = {
  simulacion: { label: "Simulación", cls: "bg-amber-100 text-amber-800 border-amber-300" },
  real: { label: "Real", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  apagado: { label: "Apagado", cls: "bg-muted text-muted-foreground border-border" },
};
const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const pill = "inline-flex px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap";

interface LogRow {
  id: number; corrida_en: string; sku: string | null; nombre: string | null;
  shopify_antes: number | null; shopify_objetivo: number | null; delta: number | null;
  motivo_tipo: string | null; motivo_texto: string | null; documentos: any;
  referencia_shopify: string | null; aplicado: boolean | null; error: string | null;
}

function Documentos({ r }: { r: LogRow }) {
  const d = r.documentos ?? {};
  const lista: any[] = Array.isArray(d) ? d : Array.isArray(d.documentos) ? d.documentos : [];
  const deltaNs = d.delta_netsuite ?? d.delta_ns;
  return (
    <div className="text-xs space-y-2 py-1">
      <div className="flex flex-wrap gap-4 text-muted-foreground">
        {deltaNs != null && <span>Delta NetSuite: <b className="text-foreground tabular-nums">{signo(Number(deltaNs))}</b></span>}
        {d.ya_en_shopify != null && <span>Ya en Shopify: <b className="text-foreground tabular-nums">{String(d.ya_en_shopify)}</b></span>}
        <span>Referencia Shopify: <b className="text-foreground">{r.referencia_shopify ?? "—"}</b></span>
      </div>
      {lista.length ? (
        <ul className="space-y-0.5">
          {lista.map((x, i) => (
            <li key={i} className="tabular-nums">
              <span className="font-medium">{x.tipo ?? "Documento"}</span> {x.numero ?? x.documento ?? ""}
              {x.cantidad != null && <> · {signo(Number(x.cantidad))} uds</>}
              {x.pedido && <> · pedido {x.pedido}</>}
              {x.destino && <> · destino {x.destino}</>}
            </li>
          ))}
        </ul>
      ) : <p className="text-muted-foreground">Sin documentos asociados</p>}
    </div>
  );
}

export function SyncInventarioCard() {
  const [busqueda, setBusqueda] = useState("");
  const [motivo, setMotivo] = useState("todos");
  const [limite, setLimite] = useState(100);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());

  const config = useQuery({
    queryKey: [SYNC_INV_KEY, "config"], refetchInterval: REFRESH,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("sync_inventario_shopify_config").select("modo").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as { modo: string | null } | null;
    },
  });
  const corrida = useQuery({
    queryKey: [SYNC_INV_KEY, "corrida"], refetchInterval: REFRESH,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("proceso_ejecucion_log").select("ultima_ejecucion, detalle").eq("proceso", "sync_inventario_shopify").maybeSingle();
      if (error) throw error;
      return data as { ultima_ejecucion: string | null; detalle: any } | null;
    },
  });
  const hoy = useQuery({
    queryKey: [SYNC_INV_KEY, "hoy"], refetchInterval: REFRESH,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("sync_inventario_shopify_log")
        .select("id, corrida_en, sku, nombre, shopify_antes, shopify_objetivo, delta, motivo_tipo, motivo_texto, documentos, referencia_shopify, aplicado, error")
        .gte("corrida_en", inicioHoyBogota()).order("corrida_en", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const det = corrida.data?.detalle ?? {};
  const errores: any[] = Array.isArray(det.errores) ? det.errores : [];
  const minutos = corrida.data?.ultima_ejecucion ? Math.floor((Date.now() - new Date(corrida.data.ultima_ejecucion).getTime()) / 60000) : null;
  const modo = MODO[norm(config.data?.modo)] ?? (config.data?.modo ? { label: config.data.modo, cls: MODO.apagado.cls } : null);

  const filasHoy = hoy.data ?? [];
  const stats = useMemo(() => {
    let sube = 0, baja = 0; const porMotivo: Record<string, number> = {};
    for (const r of filasHoy) {
      const d = r.delta ?? 0; if (d > 0) sube += d; else baja += -d;
      const k = r.motivo_tipo ?? "sin_motivo"; porMotivo[k] = (porMotivo[k] ?? 0) + 1;
    }
    return { sube, baja, porMotivo };
  }, [filasHoy]);

  const filtradas = useMemo(() => {
    const q = norm(busqueda.trim());
    return filasHoy.filter((r) => (motivo === "todos" || r.motivo_tipo === motivo) && (!q || norm(r.sku).includes(q) || norm(r.nombre).includes(q)));
  }, [filasHoy, busqueda, motivo]);
  const visibles = filtradas.slice(0, limite);
  const toggle = (id: number) => setAbiertos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const err = (config.error || corrida.error || hoy.error) as Error | null;
  const un = Number(det.unidades_netas ?? 0);

  const Kpi = ({ t, v, cls }: { t: string; v: string; cls?: string }) => (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{t}</p>
      <p className={cn("text-xl font-semibold tabular-nums", cls)}>{v}</p>
    </div>
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <CardTitle className="text-base">Sincronización de inventario Shopify</CardTitle>
              {modo && <span className={cn(pill, modo.cls)}>{modo.label}</span>}
            </div>
            <span className="text-sm text-muted-foreground">
              {corrida.data?.ultima_ejecucion ? `Última corrida hace ${minutos! < 1 ? "<1" : minutos} min · ${hora(corrida.data.ultima_ejecucion)}` : "Sin corridas registradas"}
            </span>
          </div>
          {minutos != null && minutos > 30 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4" /> La última corrida fue hace más de 30 minutos.
            </div>
          )}
          {errores.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Errores en la última corrida</p>
              <ul className="list-disc pl-6 mt-1 text-xs">{errores.map((e, i) => <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>)}</ul>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {err && <p className="text-sm text-destructive">{err.message}</p>}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Última corrida</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Kpi t="Artículos en Guayabal" v={fmt(Number(det.articulos_guayabal ?? 0))} />
              <Kpi t="Con cambio" v={fmt(Number(det.articulos_con_cambio ?? 0))} />
              <Kpi t="Ajustes" v={fmt(Number(det.ajustes ?? 0))} />
              <Kpi t="Unidades netas" v={signo(un)} cls={un > 0 ? "text-emerald-700" : un < 0 ? "text-destructive" : undefined} />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Hoy</p>
            <div className="grid grid-cols-3 gap-3">
              <Kpi t="Total ajustes" v={fmt(filasHoy.length)} />
              <Kpi t="Unidades subidas" v={`+${fmt(stats.sube)}`} cls="text-emerald-700" />
              <Kpi t="Unidades bajadas" v={`-${fmt(stats.baja)}`} cls="text-destructive" />
            </div>
            {Object.keys(stats.porMotivo).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(stats.porMotivo).map(([k, n]) => (
                  <span key={k} className={cn(pill, MOTIVOS[k]?.cls ?? MOTIVOS.devolucion.cls)}>{MOTIVOS[k]?.label ?? k}: {fmt(n)}</span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Ajustes de hoy</p>
              <div className="flex gap-2">
                <Input placeholder="Buscar SKU o nombre" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setLimite(100); }} className="h-9 w-56" />
                <Select value={motivo} onValueChange={(v) => { setMotivo(v); setLimite(100); }}>
                  <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los motivos</SelectItem>
                    {Object.entries(MOTIVOS).map(([k, m]) => <SelectItem key={k} value={k}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8" /><TableHead>Hora</TableHead><TableHead>SKU / Producto</TableHead><TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Shopify antes → objetivo</TableHead><TableHead className="text-right">Delta</TableHead><TableHead>Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {visibles.map((r) => {
                    const m = MOTIVOS[r.motivo_tipo ?? ""]; const d = r.delta ?? 0; const open = abiertos.has(r.id);
                    return (
                      <Fragment key={r.id}>
                        <TableRow className="cursor-pointer" onClick={() => toggle(r.id)}>
                          <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                          <TableCell className="tabular-nums">{hora(r.corrida_en)}</TableCell>
                          <TableCell><p className="font-mono text-xs">{r.sku ?? "—"}</p><p className="text-xs text-muted-foreground line-clamp-1">{r.nombre ?? ""}</p></TableCell>
                          <TableCell>
                            <span className={cn(pill, m?.cls ?? MOTIVOS.devolucion.cls)}>{m?.label ?? r.motivo_tipo ?? "—"}</span>
                            {r.motivo_texto && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.motivo_texto}</p>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.shopify_antes ?? "—"} → {r.shopify_objetivo ?? "—"}</TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", d > 0 ? "text-emerald-700" : d < 0 ? "text-destructive" : "")}>{signo(d)}</TableCell>
                          <TableCell>
                            {r.error ? (
                              <Tooltip><TooltipTrigger asChild><span className={cn(pill, MOTIVOS.ajuste_sin_documento.cls)}>Error</span></TooltipTrigger><TooltipContent className="max-w-xs">{r.error}</TooltipContent></Tooltip>
                            ) : r.aplicado ? <span className={cn(pill, MOTIVOS.recepcion.cls)}>Aplicado</span> : <span className={cn(pill, MOTIVOS.devolucion.cls)}>Simulado</span>}
                          </TableCell>
                        </TableRow>
                        {open && <TableRow className="bg-muted/30 hover:bg-muted/30"><TableCell /><TableCell colSpan={6}><Documentos r={r} /></TableCell></TableRow>}
                      </Fragment>
                    );
                  })}
                  {!hoy.isLoading && !filtradas.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin movimientos en Guayabal hoy</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            {filtradas.length > limite && (
              <div className="flex justify-center"><Button variant="outline" size="sm" onClick={() => setLimite((l) => l + 100)}>Ver más ({fmt(filtradas.length - limite)} restantes)</Button></div>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
