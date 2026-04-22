import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { UbicacionGestion } from "./UbicacionesTable";

interface Props {
  ubicacion: UbicacionGestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AsignarCodigoOracleModal({ ubicacion, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState("");

  useEffect(() => {
    if (open) setCodigo(ubicacion?.codigo_oracle?.toString() ?? "");
  }, [open, ubicacion]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ubicacion) throw new Error("Sin ubicación");
      if (!codigo) throw new Error("Ingresa un código Oracle válido");
      const { error } = await supabase.rpc("asignar_codigo_netsuite", {
        p_location_id: ubicacion.location_id,
        p_netsuite_code: Number(codigo),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Código Oracle asignado correctamente");
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Error al asignar código"),
  });

  if (!ubicacion) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar código Oracle</DialogTitle>
          <DialogDescription>
            Vincula esta ubicación con su código interno de NetSuite/Oracle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 p-3 rounded-md bg-muted/30 border border-border text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Ubicación:</span>
            <p className="font-medium">{ubicacion.nombre}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">NetSuite:</span>
            <p className="font-medium">{ubicacion.netsuite_location_name ?? "—"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="codigo">Código Oracle</Label>
          <Input
            id="codigo"
            type="number"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ej: 60"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !codigo}>
            {mutation.isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
