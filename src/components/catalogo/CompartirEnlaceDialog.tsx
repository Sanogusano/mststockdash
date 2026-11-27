import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageSquareText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchCatalogoCompleto } from "@/lib/catalogo-export";
import { catalogoPublicoUrl, mensajeCatalogoZenvia, type CatalogoProducto } from "@/lib/catalogo";

export const fechaHoraBogota = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", hour12: true, timeZone: "America/Bogota" })
    .format(new Date(iso)).replace(/\u00a0/g, " ");

export function CompartirEnlaceDialog({ open, onOpenChange, params, seleccionados, titulo }: {
  open: boolean; onOpenChange: (o: boolean) => void; params: Record<string, unknown>;
  seleccionados: CatalogoProducto[]; titulo: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [res, setRes] = useState<{ url: string; expira_en: string; productos: number } | null>(null);

  useEffect(() => {
    if (!open) { setRes(null); return; }
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const ps = seleccionados.length ? seleccionados : await fetchCatalogoCompleto({ ...params }, 300);
        if (!ps.length) throw new Error("No hay productos para compartir");
        const { data, error } = await supabase.rpc("catalogo_compartir", {
          p_titulo: seleccionados.length ? "Selección" : titulo,
          p_product_ids: ps.slice(0, 300).map((p) => String(p.product_id)),
        });
        if (error) throw error;
        const d = data as any;
        if (vivo) setRes({ url: catalogoPublicoUrl(String(d.slug)), expira_en: d.expira_en, productos: Number(d.productos ?? ps.length) });
      } catch (e: any) {
        toast.error(`No se pudo crear el enlace: ${e?.message ?? e}`);
        if (vivo) onOpenChange(false);
      } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copiar = async () => { await navigator.clipboard.writeText(res!.url); toast.success("Enlace copiado"); };
  const copiarMensaje = async () => {
    await navigator.clipboard.writeText(mensajeCatalogoZenvia(res!.url));
    toast.success("Mensaje copiado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Compartir enlace</DialogTitle></DialogHeader>
        {cargando || !res ? <p className="text-sm text-muted-foreground">Creando enlace…</p> : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{res.productos.toLocaleString("es-CO")} productos</p>
            <div className="flex gap-2">
              <Input readOnly value={res.url} onFocus={(e) => e.target.select()} />
              <Button variant="outline" onClick={copiar}><Copy className="h-4 w-4 mr-1" />Copiar enlace</Button>
            </div>
            <Button variant="outline" className="w-full" onClick={copiarMensaje}><MessageSquareText className="h-4 w-4 mr-1" />Copiar mensaje</Button>
            <p className="text-xs text-muted-foreground">Vence el {fechaHoraBogota(res.expira_en)} (48 h)</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
