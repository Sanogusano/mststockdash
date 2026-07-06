import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { IncentivosParametrosFields, parseParamsFromJson, RULES_WITHOUT_VALOR_OBJETIVO, TIPO_REGLA_OPTIONS, FIXED_ALCANCE, getTipoPagoOptions, TIPO_ESPECIE_OPTIONS } from "./IncentivosParametrosFields";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Incentivo {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  alcance: string;
  estado: string | null;
}

interface Props {
  incentivo: Incentivo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function IncentivosEditDialog({ incentivo, open, onOpenChange, onSaved }: Props) {
  // Campaign fields
  const [nombre, setNombre] = useState(incentivo.nombre);
  const [fechaInicio, setFechaInicio] = useState(incentivo.fecha_inicio);
  const [fechaFin, setFechaFin] = useState(incentivo.fecha_fin);
  const [alcance, setAlcance] = useState(incentivo.alcance);
  const [estado, setEstado] = useState(incentivo.estado ?? "activo");

  // Rule fields
  const [reglaId, setReglaId] = useState<string | null>(null);
  const [tipoRegla, setTipoRegla] = useState("");
  const [valorObjetivo, setValorObjetivo] = useState("");
  const [parametros, setParametros] = useState<Record<string, unknown>>({});

  // Reward fields
  const [recompensaId, setRecompensaId] = useState<string | null>(null);
  const [tipoPago, setTipoPago] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [topeMinimo, setTopeMinimo] = useState("");

  const [saving, setSaving] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingDetails(true);
      const [reglas, recompensas] = await Promise.all([
        supabase.from("incentivo_reglas").select("*").eq("incentivo_id", incentivo.id).limit(1),
        supabase.from("incentivo_recompensas").select("*").eq("incentivo_id", incentivo.id).limit(1),
      ]);

      const r = reglas.data?.[0];
      if (r) {
        setReglaId(r.id);
        setTipoRegla(r.tipo_regla);
        setValorObjetivo(String(r.valor_objetivo));
        setParametros(parseParamsFromJson(r.parametros));
      }

      const rc = recompensas.data?.[0];
      if (rc) {
        setRecompensaId(rc.id);
        setTipoPago(rc.tipo_pago);
        setValorPago(String(rc.valor));
        setTopeMinimo(rc.tope_minimo ? String(rc.tope_minimo) : "");
      }
      setLoadingDetails(false);
    };
    if (open) load();
  }, [open, incentivo.id]);

  const handleSave = async () => {
    if (!nombre || !fechaInicio || !fechaFin || !alcance) {
      toast.error("Completa todos los campos de campaña");
      return;
    }

    const parsedParams = Object.keys(parametros).length > 0 ? parametros : {};

    setSaving(true);
    try {
      // Update campaign
      const { error: e1 } = await supabase
        .from("incentivos")
        .update({ nombre, fecha_inicio: fechaInicio, fecha_fin: fechaFin, alcance, estado })
        .eq("id", incentivo.id);
      if (e1) throw e1;

      // Update or insert rule
      if (tipoRegla) {
        const reglaPayload = {
          tipo_regla: tipoRegla,
          valor_objetivo: Number(valorObjetivo) || 0,
          parametros: parsedParams,
        };
        if (reglaId) {
          const { error: e2 } = await supabase
            .from("incentivo_reglas")
            .update(reglaPayload as any)
            .eq("id", reglaId);
          if (e2) throw e2;
        } else {
          const { error: e2 } = await supabase
            .from("incentivo_reglas")
            .insert({ ...reglaPayload, incentivo_id: incentivo.id } as any);
          if (e2) throw e2;
        }
      }

      // Update or insert reward
      if (tipoPago) {
        const recompensaPayload = {
          tipo_pago: tipoPago,
          valor: Number(valorPago) || 0,
          tope_minimo: topeMinimo ? Number(topeMinimo) : 0,
        };
        if (recompensaId) {
          const { error: e3 } = await supabase
            .from("incentivo_recompensas")
            .update(recompensaPayload as any)
            .eq("id", recompensaId);
          if (e3) throw e3;
        } else {
          const { error: e3 } = await supabase
            .from("incentivo_recompensas")
            .insert({ ...recompensaPayload, incentivo_id: incentivo.id } as any);
          if (e3) throw e3;
        }
      }

      toast.success("Incentivo actualizado completamente");
      onSaved();
    } catch (err: any) {
      toast.error("Error al actualizar: " + (err.message || "desconocido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Incentivo</DialogTitle>
        </DialogHeader>

        {loadingDetails ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Section 1: Campaign */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaña</p>
              <div>
                <Label>Nombre</Label>
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Alcance</Label>
                  {FIXED_ALCANCE[tipoRegla] ? (
                    <div className="h-10 flex items-center">
                      <Badge variant="secondary" className="capitalize">{FIXED_ALCANCE[tipoRegla]}</Badge>
                    </div>
                  ) : (
                    <Select value={alcance} onValueChange={setAlcance}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tienda">Tienda</SelectItem>
                        <SelectItem value="asesor">Asesor</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label>Estado</Label>
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="pausado">Pausado</SelectItem>
                      <SelectItem value="finalizado">Finalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Conditions */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Condiciones</p>
              <div>
                <Label>Tipo de Regla</Label>
                <Select
                  value={tipoRegla}
                  onValueChange={(v) => {
                    setTipoRegla(v);
                    const fixed = FIXED_ALCANCE[v];
                    if (fixed) setAlcance(fixed);
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
              {!RULES_WITHOUT_VALOR_OBJETIVO.includes(tipoRegla) && (
              <div>
                <Label>
                  {tipoRegla === "venta_categoria" || tipoRegla === "venta_sku" ? "Meta de unidades"
                    : tipoRegla === "ticket_minimo" || tipoRegla === "upt_minimo" ? "Número de transacciones requeridas"
                    : tipoRegla === "numero_pedidos" ? "Número de pedidos requeridos"
                    : "Valor Objetivo"}
                </Label>
                <Input type="number" placeholder="Ej: 30" value={valorObjetivo} onChange={(e) => setValorObjetivo(e.target.value)} />
              </div>
              )}
              <IncentivosParametrosFields
                tipoRegla={tipoRegla}
                params={parametros}
                onChange={setParametros}
              />
            </div>

            <Separator />

            {/* Section 3: Reward */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recompensa</p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor</Label>
                  <Input type="number" placeholder="Ej: 50000" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                </div>
                <div>
                  <Label>Tope Mínimo</Label>
                  <Input type="number" placeholder="0" value={topeMinimo} onChange={(e) => setTopeMinimo(e.target.value)} />
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
