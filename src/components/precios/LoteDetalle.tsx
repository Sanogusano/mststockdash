import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight, Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { cop, pct } from "./types";
import { ESTADO_LOTE, Lote, LoteItem, csvNetsuite, fechaHoraLote } from "./lotes";

const PISO_DEFAULT = 0.4;

interface Props { loteId: number; puedeGestionar: boolean; onBack: () => void; onOpen?: (id: number) => void }

export function LoteDetalle({ loteId, puedeGestionar, onBack, onOpen }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "aprobar" | "cancelar" | "revertir">(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["precio-lote", loteId],
    queryFn: async () => {
      const { data: lote, error } = await (supabase.from as any)("precio_lote").select("*").eq("id", loteId).maybeSingle();
      if (error) throw error;
      const items: LoteItem[] = [];
      let from = 0;
      while (true) {
        const { data, error: e2 } = await (supabase.from as any)("precio_lote_item").select("*").eq("lote_id", loteId).order("product_id").order("sku").range(from, from + 999);
        if (e2) throw e2;
        items.push(...((data ?? []) as LoteItem[]));
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      let reversion: number | null = null;
      if (lote?.estado === "revertido") {
        const { data: rv } = await (supabase.from as any)("precio_lote").select("id").eq("lote_revertido_id", loteId).order("id", { ascending: false }).limit(1);
        reversion = rv?.[0]?.id ?? null;
      }
      return { lote: lote as Lote | null, items, reversion };
    },
    refetchInterval: (query) => {
      const e = (query.state.data as { lote: Lote | null } | undefined)?.lote?.estado;
      return e === "esperando_netsuite" || e === "aplicando_shopify" ? 30_000 : false;
    },
  });

  const items = q.data?.items ?? [];
  const validos = items.filter((i) => i.error == null);
  const excluidos = items.filter((i) => i.error != null);
  const nsOk = validos.filter((i) => i.ns_ok).length;
  const shOk = validos.filter((i) => i.shopify_ok).length;

  const grupos = useMemo(() => {
    const m = new Map<string, { titulo: string; items: LoteItem[] }>();
    validos.forEach((i) => {
      const g = m.get(i.product_id) ?? { titulo: i.titulo ?? i.product_id, items: [] };
      g.items.push(i); m.set(i.product_id, g);
    });
    return Array.from(m.entries());
  }, [validos]);
  const productosValidos = grupos.length;

  const refrescar = () => { qc.invalidateQueries({ queryKey: ["precio-lote", loteId] }); qc.invalidateQueries({ queryKey: ["precio-lotes"] }); };
  const err = (m: string) => toast({ title: "Error", description: m, variant: "destructive" });

  const aprobar = async () => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("precio_lote_aprobar", { p_lote: loteId });
    setBusy(false); setConfirm(null);
    if (error) return err(error.message);
    const r = Array.isArray(data) ? data[0] : data;
    toast({ title: "Lote aprobado", description: r ? `${r.productos} productos · ${r.variantes} variantes · ${r.excluidas} excluidas` : undefined });
    refrescar();
  };
  const cancelar = async () => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("precio_lote_cancelar", { p_lote: loteId });
    setBusy(false); setConfirm(null);
    if (error) return err(error.message);
    toast({ title: "Lote cancelado" });
    refrescar();
  };
  const revertir = async () => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("precio_lote_revertir", { p_lote: loteId });
    setBusy(false); setConfirm(null);
    if (error) return err(error.message);
    const r = Array.isArray(data) ? data[0] : data;
    const nuevo = typeof r === "number" ? r : Number(r?.id ?? r?.lote_id ?? r?.precio_lote_revertir ?? r);
    toast({ title: "Lote de reversión creado" });
    refrescar();
    if (Number.isFinite(nuevo) && nuevo > 0) onOpen?.(nuevo);
  };
  const descargar = async () => {
    setBusy(true);
    const { data, error } = await (supabase.rpc as any)("precio_lote_archivo_netsuite", { p_lote: loteId });
    setBusy(false);
    if (error) return err(error.message);
    const blob = new Blob([csvNetsuite(data ?? [])], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Precios_Lote_${loteId}_${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const revisar = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("precios-lote-proceso", { body: { lote_id: loteId } });
    setBusy(false);
    if (error) return err(error.message);
    if (data && data.ok === false) err(String(data.error ?? "La revisión falló"));
    refrescar();
  };

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{(q.error as Error).message}</div>;
  const lote = q.data?.lote;
  if (!lote) return <div className="text-sm text-muted-foreground">Lote no encontrado. <Button variant="link" onClick={onBack}>Volver</Button></div>;
  const e = ESTADO_LOTE[lote.estado];
  const total = validos.length;
  const erroresShopify = items.filter((i) => i.error?.startsWith("Shopify:"));

  const Barra = ({ label, x }: { label: string; x: number }) => (
    <div className="space-y-1 min-w-[220px] flex-1">
      <div className="flex justify-between text-xs"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{x} / {total} variantes</span></div>
      <Progress value={total ? (x / total) * 100 : 0} className="h-2" />
    </div>
  );

  const Fila = ({ i, error }: { i: LoteItem; error?: boolean }) => {
    const dcto = i.precio_lista ? 1 - i.precio_nuevo / i.precio_lista : null;
    return (
      <tr className={cn("border-t", error && "bg-red-50 text-red-800")}>
        <td className="px-2 py-1.5 pl-8 font-mono text-[11px]">{i.sku}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cop(i.precio_lista)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cop(i.precio_antes)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums font-medium">{cop(i.precio_nuevo)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{pct(dcto)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cop(i.compare_nuevo)}</td>
        <td className="px-2 py-1.5">{i.etiqueta_antes ? <span className="line-through text-muted-foreground">{i.etiqueta_antes}</span> : "—"}</td>
        <td className="px-2 py-1.5">{i.etiqueta_nueva ?? "—"}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cop(i.costo)}</td>
        <td className={cn("px-2 py-1.5 text-right tabular-nums", i.margen_nuevo != null && i.margen_nuevo < PISO_DEFAULT && "font-semibold text-red-600")}>{pct(i.margen_nuevo)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{cop(i.ns_precio)}</td>
        <td className="px-2 py-1.5 text-center">{i.ns_ok ? "✓" : "⏳"}</td>
        <td className="px-2 py-1.5 text-center">{i.shopify_ok ? "✓" : "⏳"}</td>
        <td className="px-2 py-1.5 max-w-[240px]">{i.error ?? ""}</td>
      </tr>
    );
  };
  const Head = () => (
    <thead className="bg-muted/50 text-muted-foreground">
      <tr className="text-left">
        <th className="px-2 py-2">Producto / SKU</th><th className="px-2 py-2 text-right">Precio lista</th><th className="px-2 py-2 text-right">Precio antes</th>
        <th className="px-2 py-2 text-right">Precio nuevo</th><th className="px-2 py-2 text-right">Dcto nuevo</th><th className="px-2 py-2 text-right">Compare nuevo</th>
        <th className="px-2 py-2">Se quita</th><th className="px-2 py-2">Se pone</th><th className="px-2 py-2 text-right">Costo</th>
        <th className="px-2 py-2 text-right">Margen nuevo</th><th className="px-2 py-2 text-right">Precio NS</th><th className="px-2 py-2 text-center">NS</th>
        <th className="px-2 py-2 text-center">Shopify</th><th className="px-2 py-2">Error</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Lotes</Button>
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{lote.nombre}</h2><Badge variant="outline" className={cn("text-[10px]", e?.cls)}>{e?.label ?? lote.estado}</Badge></div>
            <p className="text-xs text-muted-foreground">Lote #{lote.id} · creado {fechaHoraLote(lote.creado_en)}{lote.aprobado_en && ` · aprobado ${fechaHoraLote(lote.aprobado_en)}`}</p>
            {lote.lote_revertido_id != null && <p className="text-xs">Reversión del lote <button className="text-primary underline" onClick={() => onOpen?.(lote.lote_revertido_id!)}>#{lote.lote_revertido_id}</button></p>}
            {lote.estado === "revertido" && q.data?.reversion != null && <p className="text-xs">Revertido por el lote <button className="text-primary underline" onClick={() => onOpen?.(q.data!.reversion!)}>#{q.data.reversion}</button></p>}
            {lote.notas && <p className="mt-1 text-sm">{lote.notas}</p>}
          </div>
          {puedeGestionar && (
            <div className="flex flex-wrap gap-2">
              {lote.estado === "borrador" && <Button size="sm" onClick={() => setConfirm("aprobar")} disabled={busy}>Aprobar</Button>}
              {lote.estado === "esperando_netsuite" && <Button size="sm" onClick={descargar} disabled={busy}><Download className="h-4 w-4 mr-1" /> Descargar archivo NetSuite</Button>}
              {(lote.estado === "esperando_netsuite" || lote.estado === "aplicando_shopify") && <Button size="sm" variant="outline" onClick={revisar} disabled={busy}><RefreshCw className={cn("h-4 w-4 mr-1", busy && "animate-spin")} /> Revisar ahora</Button>}
              {lote.estado === "aplicado" && <Button size="sm" variant="outline" onClick={() => setConfirm("revertir")} disabled={busy}>Revertir lote</Button>}
              {(lote.estado === "borrador" || lote.estado === "esperando_netsuite") && <Button size="sm" variant="outline" onClick={() => setConfirm("cancelar")} disabled={busy}>Cancelar</Button>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-6"><Barra label="NetSuite" x={nsOk} /><Barra label="Shopify" x={shOk} /></div>
        {lote.estado === "esperando_netsuite" && <p className="text-xs text-muted-foreground">Sube este archivo en NetSuite. Selliq revisa cada 5 minutos y, cuando el 100% esté actualizado, aplica los precios en Shopify automáticamente.</p>}
        {(lote.estado === "aplicado" || lote.estado === "error") && (
          <p className="text-xs">{productosValidos} productos · {total} variantes · NetSuite {nsOk}/{total} · Shopify {shOk}/{total}{lote.shopify_fin_en && ` · terminado ${fechaHoraLote(lote.shopify_fin_en)}`}</p>
        )}
        {lote.estado === "error" && erroresShopify.length > 0 && (
          <ul className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 list-disc pl-6">
            {erroresShopify.map((i) => <li key={i.variant_id}><span className="font-mono">{i.sku}</span>: {i.error}</li>)}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1400px] text-xs">
          <Head />
          <tbody>
            {grupos.length === 0 && <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">Sin variantes válidas</td></tr>}
            {grupos.map(([pid, g]) => {
              const isOpen = open.has(pid);
              return (
                <Fragment key={pid}>
                  <tr className="border-t bg-muted/20 cursor-pointer hover:bg-muted/40" onClick={() => { const s = new Set(open); isOpen ? s.delete(pid) : s.add(pid); setOpen(s); }}>
                    <td colSpan={14} className="px-2 py-2 font-medium">
                      <span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{g.titulo}</span>
                      <span className="ml-2 text-muted-foreground font-normal">{g.items.length} variantes · {cop(g.items[0].precio_antes)} → {cop(g.items[0].precio_nuevo)} · NS {g.items.filter((i) => i.ns_ok).length}/{g.items.length} · Shopify {g.items.filter((i) => i.shopify_ok).length}/{g.items.length}</span>
                    </td>
                  </tr>
                  {isOpen && g.items.map((i) => <Fila key={i.variant_id} i={i} />)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {excluidos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-red-700">Excluidas ({excluidos.length})</h3>
          <div className="overflow-x-auto rounded-md border border-red-200">
            <table className="w-full min-w-[1400px] text-xs"><Head /><tbody>{excluidos.map((i) => <Fila key={i.variant_id} i={i} error />)}</tbody></table>
          </div>
        </div>
      )}

      <AlertDialog open={confirm != null} onOpenChange={(v) => !v && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "aprobar" ? "Aprobar lote" : confirm === "revertir" ? "Revertir lote" : "Cancelar lote"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "aprobar"
                ? `Se aprobarán ${productosValidos.toLocaleString("es-CO")} productos. Los productos con alguna talla en error quedan excluidos completos.`
                : confirm === "revertir"
                ? "Se creará un lote en borrador que devuelve cada talla al precio, precio tachado y etiqueta que tenía antes de este lote. Seguirá el flujo normal: aprobar, archivo NetSuite y Shopify."
                : "El lote quedará cancelado y no se aplicará ningún precio."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(ev) => { ev.preventDefault(); confirm === "aprobar" ? aprobar() : confirm === "revertir" ? revertir() : cancelar(); }}>{confirm === "aprobar" ? "Aprobar" : confirm === "revertir" ? "Revertir lote" : "Cancelar lote"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
