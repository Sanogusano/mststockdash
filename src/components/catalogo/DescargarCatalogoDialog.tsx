import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fechaBogotaISO } from "@/lib/catalogo-fecha";
import { entregarCatalogo, fetchCatalogoCompleto, generarCatalogo, MAX_EXPORT, type ExportResult } from "@/lib/catalogo-export";
import type { CatalogoProducto } from "@/lib/catalogo";

export function DescargarCatalogoDialog({ open, onOpenChange, params, total, seleccionados, titulo }: {
  open: boolean; onOpenChange: (o: boolean) => void; params: Record<string, unknown>; total: number;
  seleccionados: CatalogoProducto[]; titulo: string;
}) {
  const [alcance, setAlcance] = useState<"filtro" | "seleccion">("filtro");
  const [formato, setFormato] = useState<"pdf" | "imagenes">("pdf");
  const [progreso, setProgreso] = useState<{ txt: string; pct: number } | null>(null);
  const [resultado, setResultado] = useState<ExportResult | null>(null);

  useEffect(() => { if (open) { setAlcance(seleccionados.length ? "seleccion" : "filtro"); setResultado(null); setProgreso(null); } }, [open]); // eslint-disable-line
  useEffect(() => { setResultado(null); }, [alcance, formato]);

  const cantidad = alcance === "seleccion" ? seleccionados.length : total;
  const excede = cantidad > MAX_EXPORT;

  const generar = async () => {
    try {
      setProgreso({ txt: "Cargando productos…", pct: 0 });
      const productos = alcance === "seleccion" ? seleccionados : await fetchCatalogoCompleto({ ...params });
      if (!productos.length) { toast.error("No hay productos para descargar"); setProgreso(null); return; }
      const r = await generarCatalogo(productos, formato, alcance === "seleccion" ? "Selección" : titulo, fechaBogotaISO(),
        (a, t) => setProgreso({ txt: `Generando página ${a} de ${t}`, pct: Math.round((a / t) * 100) }));
      setResultado(r);
      setProgreso(null);
    } catch (e: any) {
      setProgreso(null);
      toast.error(`No se pudo generar el catálogo: ${e?.message ?? e}`);
    }
  };

  const entregar = async () => {
    if (!resultado) return;
    try { await entregarCatalogo(resultado); onOpenChange(false); } catch (e: any) { toast.error(`No se pudo descargar: ${e?.message ?? e}`); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !progreso && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Descargar catálogo</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Qué incluir</p>
            <RadioGroup value={alcance} onValueChange={(v) => setAlcance(v as any)} disabled={!!progreso}>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="filtro" />Todos los productos del filtro actual ({total.toLocaleString("es-CO")})</Label>
              <Label className="flex items-center gap-2 font-normal aria-disabled:opacity-50" aria-disabled={!seleccionados.length}>
                <RadioGroupItem value="seleccion" disabled={!seleccionados.length} />Solo los seleccionados ({seleccionados.length})
              </Label>
            </RadioGroup>
            {excede && <p className="text-xs text-destructive">Son {cantidad.toLocaleString("es-CO")} productos; el máximo es {MAX_EXPORT}. Aplica más filtros para continuar.</p>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Formato</p>
            <RadioGroup value={formato} onValueChange={(v) => setFormato(v as any)} disabled={!!progreso}>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="pdf" />PDF (A4, 6 productos por página)</Label>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="imagenes" />Imágenes para WhatsApp (4 productos por imagen)</Label>
            </RadioGroup>
          </div>
          {progreso && (
            <div className="space-y-1.5"><Progress value={progreso.pct} /><p className="text-xs text-muted-foreground">{progreso.txt}</p></div>
          )}
          {resultado && (
            <p className="text-sm text-muted-foreground">
              Listo: {resultado.tipo === "pdf" ? "el PDF está generado." : `${resultado.files.length} imágenes generadas.`}
            </p>
          )}
        </div>
        <DialogFooter>
          {resultado ? (
            <Button onClick={entregar}>{resultado.tipo === "pdf" ? "Descargar PDF" : "Compartir / descargar imágenes"}</Button>
          ) : (
            <Button onClick={generar} disabled={!!progreso || excede || cantidad === 0}>{progreso ? "Generando…" : "Generar"}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
