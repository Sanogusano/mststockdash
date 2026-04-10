import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { IncentivosParametrosFields, RULES_WITHOUT_VALOR_OBJETIVO } from "./IncentivosParametrosFields";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const STEPS = ["Campaña", "Condiciones", "Pago"];

export function IncentivosWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [incentivoId, setIncentivoId] = useState<string | null>(null);

  // Step 1
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [alcance, setAlcance] = useState("");

  // Step 2
  const [tipoRegla, setTipoRegla] = useState("");
  const [valorObjetivo, setValorObjetivo] = useState("");
  const [parametros, setParametros] = useState<Record<string, unknown>>({});

  // Step 3
  const [tipoPago, setTipoPago] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [topeMinimo, setTopeMinimo] = useState("");

  const reset = () => {
    setStep(0);
    setIncentivoId(null);
    setNombre("");
    setFechaInicio("");
    setFechaFin("");
    setAlcance("");
    setTipoRegla("");
    setValorObjetivo("");
    setParametros({});
    setTipoPago("");
    setValorPago("");
    setTopeMinimo("");
  };

  const handleStep1 = async () => {
    if (!nombre || !fechaInicio || !fechaFin || !alcance) {
      toast.error("Completa todos los campos de la campaña");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("incentivos")
      .insert({ nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, alcance })
      .select("id")
      .single();

    if (error || !data) {
      toast.error("Error al crear la campaña");
      setSaving(false);
      return;
    }
    setIncentivoId(data.id);
    setStep(1);
    setSaving(false);
  };

  const handleStep2 = async () => {
    if (!tipoRegla || !valorObjetivo || !incentivoId) {
      toast.error("Completa los campos de condiciones");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("incentivo_reglas").insert({
      incentivo_id: incentivoId,
      tipo_regla: tipoRegla,
      valor_objetivo: Number(valorObjetivo),
      parametros: Object.keys(parametros).length > 0 ? parametros : {},
    } as any);
    if (error) {
      toast.error("Error al guardar la regla");
      setSaving(false);
      return;
    }
    setStep(2);
    setSaving(false);
  };

  const handleStep3 = async () => {
    if (!tipoPago || !valorPago || !incentivoId) {
      toast.error("Completa los campos de pago");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("incentivo_recompensas").insert({
      incentivo_id: incentivoId,
      tipo_pago: tipoPago,
      valor: Number(valorPago),
      tope_minimo: topeMinimo ? Number(topeMinimo) : 0,
    } as any);
    if (error) {
      toast.error("Error al guardar la recompensa");
      setSaving(false);
      return;
    }
    toast.success("Incentivo creado exitosamente");
    setSaving(false);
    onCreated();
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Crear Incentivo</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors ${
                i < step
                  ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground,0_0%_100%))]"
                  : i === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
              </div>
              <span className={`text-xs font-medium ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Step 1: Campaña */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <Label>Nombre</Label>
              <Input placeholder="Ej: Bonificación Mayo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </div>
              <div>
                <Label>Fecha Fin</Label>
                <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Alcance</Label>
              <Select value={alcance} onValueChange={setAlcance}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tienda">Tienda</SelectItem>
                  <SelectItem value="asesor">Asesor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleStep1} disabled={saving}>
              {saving ? "Guardando..." : "Siguiente"}
            </Button>
          </div>
        )}

        {/* Step 2: Condiciones */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label>Tipo de Regla</Label>
              <Select value={tipoRegla} onValueChange={setTipoRegla}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
              <SelectItem value="presupuesto">Presupuesto</SelectItem>
                  <SelectItem value="presupuesto_semanal_dual">Presupuesto Semanal Dual</SelectItem>
                  <SelectItem value="venta_categoria">Venta por Categoría</SelectItem>
                  <SelectItem value="venta_skus">Venta por SKUs</SelectItem>
                  <SelectItem value="ticket_minimo">Ticket Mínimo</SelectItem>
                  <SelectItem value="metodo_pago">Método de Pago</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!RULES_WITHOUT_VALOR_OBJETIVO.includes(tipoRegla) && (
            <div>
              <Label>Valor Objetivo</Label>
              <Input type="number" placeholder="Ej: 5000000" value={valorObjetivo} onChange={(e) => setValorObjetivo(e.target.value)} />
            </div>
            )}
            <IncentivosParametrosFields
              tipoRegla={tipoRegla}
              params={parametros}
              onChange={setParametros}
            />
            <Button className="w-full" onClick={handleStep2} disabled={saving}>
              {saving ? "Guardando..." : "Siguiente"}
            </Button>
          </div>
        )}

        {/* Step 3: Pago */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label>Tipo de Pago</Label>
              <Select value={tipoPago} onValueChange={setTipoPago}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monto_fijo">Monto Fijo</SelectItem>
                  <SelectItem value="por_unidad">Por Unidad</SelectItem>
                  <SelectItem value="porcentaje">Porcentaje</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor</Label>
              <Input type="number" placeholder="Ej: 50000" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
            </div>
            <div>
              <Label>Tope Mínimo</Label>
              <Input type="number" placeholder="Ej: 0" value={topeMinimo} onChange={(e) => setTopeMinimo(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleStep3} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Incentivo"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
