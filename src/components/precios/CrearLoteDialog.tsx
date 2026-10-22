import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productIds: string[];
  onCreated: (id: number) => void;
}

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export function CrearLoteDialog({ open, onOpenChange, productIds, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [accion, setAccion] = useState<"subir" | "fijar" | "quitar" | "sugerido">("subir");
  const [valor, setValor] = useState("10");
  const [piso, setPiso] = useState("40");
  const [poner, setPoner] = useState("");
  const [quitar, setQuitar] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setNombre(`Precios ${hoy()}`); setErr(null); } }, [open]);

  const necesitaValor = accion === "subir" || accion === "fijar";
  const v = Number(valor);
  const valido = nombre.trim() !== "" && (!necesitaValor || (v >= 1 && v <= 80)) && piso !== "" && productIds.length > 0;

  const crear = async () => {
    setSaving(true); setErr(null);
    const { data, error } = await (supabase.rpc as any)("precio_lote_crear", {
      p_nombre: nombre.trim(),
      p_product_ids: productIds,
      p_accion: accion,
      p_valor: necesitaValor ? v : null,
      p_piso_margen: Number(piso) / 100,
      p_etiqueta_poner: poner.trim() || null,
      p_etiqueta_quitar: quitar.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onOpenChange(false);
    onCreated(Number(data));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Crear lote · {productIds.length.toLocaleString("es-CO")} productos</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1"><Label>Nombre del lote</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
          <div className="space-y-2">
            <Label>Acción</Label>
            <RadioGroup value={accion} onValueChange={(x) => setAccion(x as typeof accion)} className="space-y-1">
              {([["subir", "Subir descuento"], ["fijar", "Fijar descuento"], ["quitar", "Quitar descuento"], ["sugerido", "Aplicar sugerido"]] as const).map(([k, l]) => (
                <div key={k} className="flex items-center gap-2">
                  <RadioGroupItem value={k} id={`acc-${k}`} /><Label htmlFor={`acc-${k}`} className="font-normal">{l}</Label>
                  {accion === k && necesitaValor && (
                    <div className="flex items-center gap-1 ml-2">
                      <Input type="number" min={1} max={80} value={valor} onChange={(e) => setValor(e.target.value)} className="h-7 w-20" />
                      <span className="text-xs text-muted-foreground">{k === "subir" ? "puntos" : "%"}</span>
                    </div>
                  )}
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-1"><Label>Piso de margen %</Label><Input type="number" value={piso} onChange={(e) => setPiso(e.target.value)} className="w-28" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Etiqueta a poner</Label><Input value={poner} onChange={(e) => setPoner(e.target.value)} /></div>
            <div className="space-y-1"><Label>Etiqueta a quitar</Label><Input value={quitar} onChange={(e) => setQuitar(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Si las dejas vacías, las etiquetas del producto no se tocan.</p>
          {err && <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={crear} disabled={!valido || saving}>{saving ? "Creando…" : "Crear lote"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
