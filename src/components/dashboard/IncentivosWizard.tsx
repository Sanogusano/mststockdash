import { useState } from "react";
import type { Json } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { IncentivosParametrosFields, RULES_WITHOUT_VALOR_OBJETIVO, TIPO_REGLA_OPTIONS, FIXED_ALCANCE, getTipoPagoOptions, TIPO_ESPECIE_OPTIONS } from "./IncentivosParametrosFields";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const STEPS = ["Campaña", "Condiciones", "Pago"];

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const esLunes = (fecha: string) => {
  if (!fecha) return true;
  return new Date(fecha + "T12:00:00").getDay() === 1;
};

const toStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

export function IncentivosWizard({ open, onOpenChange, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

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
  const [tipoEspecie, setTipoEspecie] = useState("almuerzo");
  const [descripcionEspecie, setDescripcionEspecie] = useState("");

  const requiresValorObjetivo = !RULES_WITHOUT_VALOR_OBJETIVO.includes(tipoRegla);

  const reset = () => {
    setStep(0);
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
    setTipoEspecie("almuerzo");
    setDescripcionEspecie("");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const buildParametrosPayload = (): Json => {
    switch (tipoRegla) {
      case "presupuesto_semanal":
        return { entidades: toStringArray(parametros.entidades) };
      case "presupuesto_semanal_dual":
        return {
          semanas_mes: toNumber(parametros.semanas_mes),
          ticket_meta: toNumber(parametros.ticket_meta),
        };
      case "tienda_cumplimiento": {
        const cond = (parametros.condiciones as Record<string, { activa?: boolean; min?: number }>) || {};
        return {
          operador: (parametros.operador as string) || "AND",
          condiciones: {
            cumplimiento_presupuesto_pct: { activa: !!cond.cumplimiento_presupuesto_pct?.activa, min: toNumber(cond.cumplimiento_presupuesto_pct?.min) },
            upt:             { activa: !!cond.upt?.activa,             min: toNumber(cond.upt?.min) },
            full_price_pct:  { activa: !!cond.full_price_pct?.activa,  min: toNumber(cond.full_price_pct?.min) },
            ticket_promedio: { activa: !!cond.ticket_promedio?.activa, min: toNumber(cond.ticket_promedio?.min) },
          },
        };
      }
      case "venta_categoria":
        return { categorias: toStringArray(parametros.categorias) };
      case "venta_sku":
        return { skus: toStringArray(parametros.skus) };
      case "ticket_minimo":
        return { ticket_minimo: toNumber(parametros.ticket_minimo) };
      case "metodo_pago":
        return { metodos: toStringArray(parametros.metodos) };
      default:
        return {};
    }
  };

  const validateStep1 = () => {
    if (!nombre || !fechaInicio || !fechaFin || !alcance) {
      toast.error("Completa todos los campos de la campaña");
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!tipoRegla) {
      toast.error("Selecciona el tipo de regla");
      return false;
    }

    if (requiresValorObjetivo && !valorObjetivo) {
      toast.error("Completa el valor objetivo");
      return false;
    }

    if (tipoRegla === "presupuesto_semanal" && toStringArray(parametros.entidades).length === 0) {
      toast.error("Selecciona al menos una entidad");
      return false;
    }

    if (tipoRegla === "presupuesto_semanal_dual") {
      if (toNumber(parametros.semanas_mes) <= 0 || toNumber(parametros.ticket_meta) <= 0) {
        toast.error("Completa Semanas del mes y Ticket Meta");
        return false;
      }
    }

    if (tipoRegla === "venta_categoria" && toStringArray(parametros.categorias).length === 0) {
      toast.error("Ingresa al menos una categoría");
      return false;
    }

    if (tipoRegla === "venta_sku" && toStringArray(parametros.skus).length === 0) {
      toast.error("Selecciona al menos un SKU");
      return false;
    }

    if (tipoRegla === "ticket_minimo" && toNumber(parametros.ticket_minimo) <= 0) {
      toast.error("Ingresa el ticket mínimo");
      return false;
    }

    if (tipoRegla === "metodo_pago" && toStringArray(parametros.metodos).length === 0) {
      toast.error("Ingresa al menos un método de pago");
      return false;
    }

    if (tipoRegla === "tienda_cumplimiento") {
      const cond = (parametros.condiciones as Record<string, { activa?: boolean; min?: number }>) || {};
      const active = ["cumplimiento_presupuesto_pct", "upt", "full_price_pct", "ticket_promedio"].filter(
        (k) => cond[k]?.activa && toNumber(cond[k]?.min) > 0
      );
      if (active.length === 0) {
        toast.error("Activa al menos una condición (% Presupuesto, UPT, %FP o Ticket) con un valor > 0");
        return false;
      }
    }

    return true;
  };

  const validateStep3 = () => {
    if (!tipoPago) {
      toast.error("Selecciona el tipo de pago");
      return false;
    }
    if (tipoPago === "bono_especie") {
      if (!tipoEspecie) {
        toast.error("Selecciona el tipo de bono en especie");
        return false;
      }
      return true;
    }
    if (!valorPago) {
      toast.error("Completa el valor del pago");
      return false;
    }
    return true;
  };

  const handleStep1 = () => {
    if (!validateStep1()) return;
    setStep(1);
  };

  const handleStep2 = () => {
    if (!validateStep2()) return;
    setStep(2);
  };

  const handleSave = async () => {
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;

    setSaving(true);

    let createdIncentivoId: string | null = null;

    try {
      const { data: incentivo, error: incentivoError } = await supabase
        .from("incentivos")
        .insert({
          nombre,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          alcance,
        })
        .select("id")
        .single();

      if (incentivoError || !incentivo) {
        throw new Error(incentivoError?.message || "Error al crear la campaña");
      }

      createdIncentivoId = incentivo.id;

      const { error: reglaError } = await supabase.from("incentivo_reglas").insert({
        incentivo_id: createdIncentivoId,
        tipo_regla: tipoRegla,
        valor_objetivo: requiresValorObjetivo ? Number(valorObjetivo) : 0,
        parametros: buildParametrosPayload(),
      });

      if (reglaError) {
        throw new Error(reglaError.message || "Error al guardar la regla");
      }

      const parametrosPago: Record<string, unknown> =
        tipoPago === "bono_especie"
          ? { tipo_especie: tipoEspecie, descripcion: descripcionEspecie }
          : {};

      const { error: recompensaError } = await supabase.from("incentivo_recompensas").insert({
        incentivo_id: createdIncentivoId,
        tipo_pago: tipoPago,
        valor: tipoPago === "bono_especie" ? 0 : Number(valorPago),
        tope_minimo: topeMinimo ? Number(topeMinimo) : 0,
        parametros_pago: parametrosPago as unknown as Json,
      });

      if (recompensaError) {
        throw new Error(recompensaError.message || "Error al guardar la recompensa");
      }

      toast.success("Incentivo creado exitosamente");
      reset();
      onCreated();
      onOpenChange(false);
    } catch (error) {
      if (createdIncentivoId) {
        await Promise.allSettled([
          supabase.from("incentivo_recompensas").delete().eq("incentivo_id", createdIncentivoId),
          supabase.from("incentivo_reglas").delete().eq("incentivo_id", createdIncentivoId),
        ]);
        await supabase.from("incentivos").delete().eq("id", createdIncentivoId);
      }

      toast.error(error instanceof Error ? error.message : "Error al guardar el incentivo");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
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
              {FIXED_ALCANCE[tipoRegla] ? (
                <div className="h-10 flex items-center">
                  <Badge variant="secondary" className="capitalize">{FIXED_ALCANCE[tipoRegla]}</Badge>
                </div>
              ) : (
                <Select value={alcance} onValueChange={setAlcance}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tienda">Tienda</SelectItem>
                    <SelectItem value="asesor">Asesor</SelectItem>
                  </SelectContent>
                </Select>
              )}
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
              <Select
                value={tipoRegla}
                onValueChange={(v) => {
                  setTipoRegla(v);
                  const fixed = FIXED_ALCANCE[v];
                  if (fixed) setAlcance(fixed);
                  if (v === "presupuesto_semanal") setTipoPago("monto_fijo");
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {TIPO_REGLA_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {requiresValorObjetivo && (
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
            {tipoRegla === "presupuesto_semanal" && !esLunes(fechaInicio) && (
              <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-3 text-xs text-foreground">
                La fecha de inicio no cae en lunes: la primera semana será parcial y su meta se ajustará
                proporcionalmente a los días incluidos.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(0)} disabled={saving}>
                Atrás
              </Button>
              <Button className="flex-1" onClick={handleStep2} disabled={saving}>
                {saving ? "Guardando..." : "Siguiente"}
              </Button>
            </div>
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
                  {getTipoPagoOptions(tipoRegla).map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {tipoPago === "bono_especie" ? (
              <>
                <div>
                  <Label>Tipo de Bono</Label>
                  <Select value={tipoEspecie} onValueChange={setTipoEspecie}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPO_ESPECIE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Descripción (opcional)</Label>
                  <Input placeholder="Ej: Bono Cine para 2 personas" value={descripcionEspecie} onChange={(e) => setDescripcionEspecie(e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Valor</Label>
                  <Input type="number" placeholder="Ej: 50000" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                </div>
                <div>
                  <Label>Tope Mínimo</Label>
                  <Input type="number" placeholder="Ej: 0" value={topeMinimo} onChange={(e) => setTopeMinimo(e.target.value)} />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={saving}>
                Atrás
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar Incentivo"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
