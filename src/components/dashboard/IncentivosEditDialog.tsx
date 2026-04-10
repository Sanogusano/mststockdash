import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
  const [nombre, setNombre] = useState(incentivo.nombre);
  const [fechaInicio, setFechaInicio] = useState(incentivo.fecha_inicio);
  const [fechaFin, setFechaFin] = useState(incentivo.fecha_fin);
  const [alcance, setAlcance] = useState(incentivo.alcance);
  const [estado, setEstado] = useState(incentivo.estado ?? "activo");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nombre || !fechaInicio || !fechaFin || !alcance) {
      toast.error("Completa todos los campos");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("incentivos")
      .update({
        nombre,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        alcance,
        estado,
      })
      .eq("id", incentivo.id);

    if (error) {
      toast.error("Error al actualizar: " + error.message);
    } else {
      toast.success("Incentivo actualizado");
      onSaved();
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Incentivo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
          <div>
            <Label>Alcance</Label>
            <Select value={alcance} onValueChange={setAlcance}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tienda">Tienda</SelectItem>
                <SelectItem value="asesor">Asesor</SelectItem>
              </SelectContent>
            </Select>
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
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
