import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AccionLote, PrecioRow, cop, pct, dctoNuevo, precioConDcto, margenDe } from "./types";

export type ModoLote = "poner" | "quitar" | "sugerido";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: ModoLote;
  rows: PrecioRow[];
  onCreated: (id: number) => void;
}

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const TITULOS: Record<ModoLote, string> = { poner: "Poner o subir descuento", quitar: "Quitar descuento", sugerido: "Aplicar sugerido" };

export function CrearLoteDialog({ open, onOpenChange, modo, rows, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [tipoPoner, setTipoPoner] = useState<"subir" | "fijar">("subir");
  const [valor, setValor] = useState("10");
  const [piso, setPiso] = useState("40");
  const [poner, setPoner] = useState("");
  const [quitar, setQuitar] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setNombre(`Precios ${hoy()}`); setErr(null); } }, [open]);

  const accion: AccionLote = modo === "poner" ? tipoPoner : modo;
  const necesitaValor = modo === "poner";
  const v = Number(valor);
  const pisoN = Number(piso) / 100;
  const valido = nombre.trim() !== "" && (!necesitaValor || (v >= 1 && v <= 80)) && piso !== "" && Number(piso) >= 20 && rows.length > 0;

  const preview = useMemo(() => rows.slice(0, 10).map((r) => {
    const d = dctoNuevo(r, accion, v);
    const nuevo = d == null || r.precio_lista == null ? null : precioConDcto(Number(r.precio_lista), d);
    return { r, nuevo, margen: nuevo == null ? null : margenDe(r.costo == null ? null : Number(r.costo), nuevo) };
  }), [rows, accion, v]);

  const crear = async () => {
    setSaving(true); setErr(null);
    const { data, error } = await (supabase.rpc as any)("precio_lote_crear", {
      p_nombre: nombre.trim(),
      p_product_ids: rows.map((r) => r.product_id),
      p_accion: accion,
      p_valor: necesitaValor ? v : null,
      p_piso_margen: pisoN,
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{TITULOS[modo]} · {rows.length.toLocaleString("es-CO")} productos</DialogTitle>
          <DialogDescription>Se crea un lote en borrador; los precios no cambian hasta aprobarlo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          {modo === "poner" && (
            <RadioGroup value={tipoPoner} onValueChange={(x) => setTipoPoner(x as "subir" | "fijar")} className="space-y-2">
              {(["subir", "fijar"] as const).map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <RadioGroupItem value={k} id={`acc-${k}`} />
                  <Label htmlFor={`acc-${k}`} className="font-normal">{k === "subir" ? "Subir" : "Dejar en"}</Label>
                  {tipoPoner === k && <Input type="number" min={1} max={80} value={valor} onChange={(e) => setValor(e.target.value)} className="h-7 w-20" />}
                  <span className="text-xs text-muted-foreground">{k === "subir" ? "puntos" : "%"}</span>
                </div>
              ))}
            </RadioGroup>
          )}
          {modo === "quitar" && <p>Los productos seleccionados vuelven a su precio lista.</p>}
          {modo === "sugerido" && <p>Cada producto toma su descuento sugerido; los que no tienen sugerido no cambian.</p>}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Vista previa{rows.length > 10 ? " (primeros 10)" : ""}</Label>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table className="text-xs">
                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Precio actual → nuevo</TableHead><TableHead className="text-right">Margen nuevo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {preview.map(({ r, nuevo, margen }) => (
                    <TableRow key={r.product_id}>
                      <TableCell className="max-w-[260px] truncate" title={r.producto}>{r.producto}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{cop(r.precio_actual)} → {nuevo == null ? "sin cambio" : cop(nuevo)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", margen != null && margen < pisoN && "font-semibold text-red-600")}>{pct(margen)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Opciones</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Nombre del lote</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Piso de margen %</Label><Input type="number" min={20} value={piso} onChange={(e) => setPiso(e.target.value)} className="w-28" /><p className="text-[11px] text-muted-foreground">Mínimo 20%</p></div>
                <div className="space-y-1"><Label className="text-xs">Etiqueta a poner</Label><Input value={poner} onChange={(e) => setPoner(e.target.value)} /></div>
                <div className="space-y-1"><Label className="text-xs">Etiqueta a quitar</Label><Input value={quitar} onChange={(e) => setQuitar(e.target.value)} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Si las dejas vacías, las etiquetas del producto no se tocan.</p>
            </div>
          </details>
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
