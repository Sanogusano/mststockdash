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
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { UbicacionGestion } from "./UbicacionesTable";

interface Props {
  ubicacion: UbicacionGestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CategoriaEntry = { categoria: string; valor: string };

function objToEntries(obj: Record<string, number> | null | undefined): CategoriaEntry[] {
  if (!obj || typeof obj !== "object") return [];
  return Object.entries(obj).map(([categoria, valor]) => ({
    categoria,
    valor: String(valor),
  }));
}

function entriesToObj(entries: CategoriaEntry[]): Record<string, number> | null {
  const filtered = entries.filter((e) => e.categoria.trim() && e.valor.trim());
  if (!filtered.length) return null;
  return filtered.reduce<Record<string, number>>((acc, e) => {
    const num = Number(e.valor);
    if (!isNaN(num)) acc[e.categoria.trim().toUpperCase()] = num;
    return acc;
  }, {});
}

export function EditarUbicacionModal({ ubicacion, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [modDefault, setModDefault] = useState("");
  const [wosObjetivo, setWosObjetivo] = useState("");
  const [colchonCedi, setColchonCedi] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [activa, setActiva] = useState(true);
  const [modCats, setModCats] = useState<CategoriaEntry[]>([]);
  const [wosCats, setWosCats] = useState<CategoriaEntry[]>([]);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!ubicacion) return;
    setModDefault(ubicacion.mod_default?.toString() ?? "");
    setWosObjetivo(ubicacion.wos_objetivo_semanas?.toString() ?? "");
    setColchonCedi(ubicacion.colchon_cedi_semanas?.toString() ?? "");
    setCapacidad(ubicacion.capacidad_maxima_unidades?.toString() ?? "");
    setActiva(ubicacion.allocation_activa ?? true);
    setModCats(objToEntries(ubicacion.mod_por_categoria));
    setWosCats(objToEntries(ubicacion.wos_objetivo_por_categoria));
  }, [ubicacion]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ubicacion) throw new Error("Sin ubicación");
      const { error } = await supabase.rpc("actualizar_params_ubicacion", {
        p_location_id: ubicacion.location_id,
        p_mod_default: modDefault === "" ? null : Number(modDefault),
        p_wos_objetivo: wosObjetivo === "" ? null : Number(wosObjetivo),
        p_colchon_cedi: colchonCedi === "" ? null : Number(colchonCedi),
        p_capacidad: capacidad === "" ? null : Number(capacidad),
        p_activa: activa,
        p_mod_por_categoria: entriesToObj(modCats) as any,
        p_wos_por_categoria: entriesToObj(wosCats) as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Parámetros actualizados");
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Error al guardar"),
  });

  const handleSave = () => {
    if (ubicacion?.allocation_activa && !activa) {
      setConfirmDeactivate(true);
      return;
    }
    mutation.mutate();
  };

  if (!ubicacion) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar parámetros — {ubicacion.nombre}</DialogTitle>
            <DialogDescription>
              Override manual de parámetros de allocation para esta ubicación.
            </DialogDescription>
          </DialogHeader>

          {/* Info read-only */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted/30 border border-border text-xs">
            <div>
              <span className="text-muted-foreground">Tier:</span>{" "}
              <span className="font-medium">{ubicacion.tier ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo tienda:</span>{" "}
              <span className="font-medium">{ubicacion.tipo_tienda ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Código Oracle:</span>{" "}
              <span className="font-mono font-medium">
                {ubicacion.codigo_oracle ?? "Pendiente"}
              </span>
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">NetSuite:</span>{" "}
              <span className="font-medium">{ubicacion.netsuite_location_name ?? "—"}</span>
            </div>
          </div>

          {/* Campos principales */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mod">MOD default</Label>
              <Input
                id="mod"
                type="number"
                min={0}
                value={modDefault}
                onChange={(e) => setModDefault(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wos">WOS objetivo (semanas)</Label>
              <Input
                id="wos"
                type="number"
                step="0.5"
                min={0}
                value={wosObjetivo}
                onChange={(e) => setWosObjetivo(e.target.value)}
              />
            </div>
            {ubicacion.es_cedi && (
              <div className="space-y-2">
                <Label htmlFor="colchon">Colchón CEDI (semanas)</Label>
                <Input
                  id="colchon"
                  type="number"
                  min={0}
                  value={colchonCedi}
                  onChange={(e) => setColchonCedi(e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="cap">Capacidad máxima</Label>
              <Input
                id="cap"
                type="number"
                min={0}
                placeholder="Sin límite"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border border-border">
            <div>
              <Label className="text-sm font-medium">Allocation activa</Label>
              <p className="text-xs text-muted-foreground">
                Si está desactivada, esta ubicación no participará en las curvas de allocation.
              </p>
            </div>
            <Switch checked={activa} onCheckedChange={setActiva} />
          </div>

          {/* Avanzado */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="text-sm font-medium">Configuración avanzada por categoría</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <CategoriaEditor
                titulo="MOD por categoría"
                entries={modCats}
                onChange={setModCats}
              />
              <CategoriaEditor
                titulo="WOS por categoría"
                entries={wosCats}
                onChange={setWosCats}
                step="0.5"
              />
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={mutation.isPending}>
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar allocation?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por desactivar la ubicación <strong>{ubicacion.nombre}</strong>. No participará
              en las curvas de allocation hasta que la reactives.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmDeactivate(false);
                mutation.mutate();
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function CategoriaEditor({
  titulo,
  entries,
  onChange,
  step,
}: {
  titulo: string;
  entries: CategoriaEntry[];
  onChange: (e: CategoriaEntry[]) => void;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{titulo}</Label>
      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div key={idx} className="flex gap-2">
            <Input
              placeholder="Categoría (ej: T-SHIRT)"
              value={entry.categoria}
              onChange={(e) => {
                const next = [...entries];
                next[idx] = { ...entry, categoria: e.target.value };
                onChange(next);
              }}
              className="flex-1"
            />
            <Input
              type="number"
              step={step ?? "1"}
              min={0}
              placeholder="Valor"
              value={entry.valor}
              onChange={(e) => {
                const next = [...entries];
                next[idx] = { ...entry, valor: e.target.value };
                onChange(next);
              }}
              className="w-28"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onChange(entries.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...entries, { categoria: "", valor: "" }])}
          className="gap-1"
        >
          <Plus className="h-3 w-3" />
          Agregar categoría
        </Button>
      </div>
    </div>
  );
}
