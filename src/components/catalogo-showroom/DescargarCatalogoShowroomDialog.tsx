import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fechaBogotaISO } from "@/lib/catalogo-fecha";
import {
  compartirArchivosShowroom, descargarUnoPorUnoShowroom, downloadBlobShowroom, esTactilShowroom,
  fetchCatalogoShowroomCompleto, generarCatalogoShowroom, gruposParaCompartirShowroom,
  MAX_EXPORT_SHOWROOM, porPaginaShowroom, puedeCompartirShowroom,
  type ExportShowroomResult, type FormatoCatalogoShowroom,
} from "@/lib/catalogo-showroom-export";
import type { CatalogoShowroomProducto } from "@/lib/catalogo-showroom";

export function DescargarCatalogoShowroomDialog({ open, onOpenChange, params, total, seleccionados, titulo }: {
  open: boolean; onOpenChange: (o: boolean) => void; params: Record<string, unknown>; total: number;
  seleccionados: CatalogoShowroomProducto[]; titulo: string;
}) {
  const [alcance, setAlcance] = useState<"filtro" | "seleccion">("filtro");
  const [formato, setFormato] = useState<FormatoCatalogoShowroom>("img6");
  const [progreso, setProgreso] = useState<{ txt: string; pct: number } | null>(null);
  const [resultado, setResultado] = useState<ExportShowroomResult | null>(null);
  const [grupos, setGrupos] = useState<File[][]>([]);
  const [grupoIdx, setGrupoIdx] = useState(0);

  useEffect(() => { if (open) { setAlcance("filtro"); setResultado(null); setProgreso(null); } }, [open]);
  useEffect(() => { setResultado(null); }, [alcance, formato]);

  const cantidad = alcance === "seleccion" ? seleccionados.length : total;
  const excede = cantidad > MAX_EXPORT_SHOWROOM;
  const nArchivos = Math.ceil(Math.min(cantidad, MAX_EXPORT_SHOWROOM) / porPaginaShowroom(formato));
  const esImg = formato !== "pdf";
  const movil = typeof window !== "undefined" && esTactilShowroom();

  const generar = async () => {
    try {
      setProgreso({ txt: "Cargando productos…", pct: 0 });
      const productos = alcance === "seleccion" ? seleccionados : await fetchCatalogoShowroomCompleto({ ...params });
      if (!productos.length) { toast.error("No hay productos para descargar"); setProgreso(null); return; }
      const r = await generarCatalogoShowroom(productos, formato, alcance === "seleccion" ? "Selección Showroom" : titulo, fechaBogotaISO(),
        (a, t) => setProgreso({ txt: `Generando ${esImg ? "imagen" : "página"} ${a} de ${t}`, pct: Math.round((a / t) * 100) }));
      setResultado(r);
      if (r.tipo === "imagenes") { setGrupos(gruposParaCompartirShowroom(r.files)); setGrupoIdx(0); }
      setProgreso(null);
    } catch (e: any) {
      setProgreso(null);
      toast.error(`No se pudo generar el catálogo: ${e?.message ?? e}`);
    }
  };

  const entregar = async () => {
    if (!resultado) return;
    try {
      if (resultado.tipo === "pdf") { downloadBlobShowroom(resultado.blob, resultado.nombre); onOpenChange(false); return; }
      if (movil && puedeCompartirShowroom(grupos[grupoIdx] ?? [])) {
        const ok = await compartirArchivosShowroom(grupos[grupoIdx]);
        if (!ok) return;
        if (grupoIdx + 1 < grupos.length) { setGrupoIdx(grupoIdx + 1); return; }
        onOpenChange(false); return;
      }
      toast.info(`Se descargarán ${resultado.files.length} imágenes. Si el navegador pregunta, permite las descargas múltiples.`);
      await descargarUnoPorUnoShowroom(resultado.files);
      onOpenChange(false);
    } catch (e: any) { toast.error(`No se pudo entregar: ${e?.message ?? e}`); }
  };

  const textoBoton = () => {
    if (!resultado) return progreso ? "Generando…" : "Generar";
    if (resultado.tipo === "pdf") return "Descargar PDF";
    if (movil && puedeCompartirShowroom(grupos[grupoIdx] ?? [])) {
      return grupos.length > 1 ? `Compartir grupo ${grupoIdx + 1} de ${grupos.length}` : `Compartir ${resultado.files.length} imágenes`;
    }
    return `Descargar ${resultado.files.length} imágenes`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !progreso && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Descargar catálogo Showroom</DialogTitle></DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Qué incluir</p>
            <RadioGroup value={alcance} onValueChange={(v) => setAlcance(v as any)} disabled={!!progreso}>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="filtro" />Todos los productos del filtro actual ({total.toLocaleString("es-CO")})</Label>
              {seleccionados.length > 0 && (
                <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="seleccion" />Solo los seleccionados ({seleccionados.length})</Label>
              )}
            </RadioGroup>
            {excede
              ? <p className="text-xs text-destructive">Son {cantidad.toLocaleString("es-CO")} productos; el máximo es {MAX_EXPORT_SHOWROOM}. Aplica más filtros para continuar.</p>
              : cantidad > 0 && <p className="text-xs text-muted-foreground">{cantidad.toLocaleString("es-CO")} productos → {nArchivos} {esImg ? (nArchivos === 1 ? "imagen" : "imágenes") : (nArchivos === 1 ? "página" : "páginas")}</p>}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Formato</p>
            <RadioGroup value={formato} onValueChange={(v) => setFormato(v as FormatoCatalogoShowroom)} disabled={!!progreso}>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="img6" />Imágenes · 6 por imagen</Label>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="img8" />Imágenes · 8 por imagen</Label>
              <Label className="flex items-center gap-2 font-normal"><RadioGroupItem value="pdf" />PDF (A4, 6 productos por página)</Label>
            </RadioGroup>
          </div>
          {progreso && <div className="space-y-1.5"><Progress value={progreso.pct} /><p className="text-xs text-muted-foreground">{progreso.txt}</p></div>}
          {resultado && <p className="text-sm text-muted-foreground">{resultado.tipo === "pdf" ? "Listo: el PDF está generado." : `Listo: ${resultado.files.length} imágenes generadas.`}</p>}
        </div>
        <DialogFooter>
          <Button onClick={resultado ? entregar : generar} disabled={!resultado && (!!progreso || excede || cantidad === 0)}>{textoBoton()}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
