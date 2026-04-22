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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TIPOS_TIENDA = ["A", "B", "C", "OUTLET", "Online", "Distribucion"] as const;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function NuevaSucursalModal({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [tipoTienda, setTipoTienda] = useState<string>("");
  const [zona, setZona] = useState<string>("");
  const [locationId, setLocationId] = useState("");
  const [locationIdEdited, setLocationIdEdited] = useState(false);
  const [netsuiteName, setNetsuiteName] = useState("");
  const [codigoOracle, setCodigoOracle] = useState("");
  const [capacidad, setCapacidad] = useState("");

  // Zonas existentes
  const { data: zonas = [] } = useQuery({
    queryKey: ["zonas-existentes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("locations")
        .select("zona")
        .not("zona", "is", null);
      const set = new Set<string>();
      data?.forEach((d) => d.zona && set.add(d.zona));
      return Array.from(set).sort();
    },
  });

  useEffect(() => {
    if (!locationIdEdited) {
      setLocationId(slugify(nombre));
    }
  }, [nombre, locationIdEdited]);

  useEffect(() => {
    if (!open) {
      setNombre("");
      setTipoTienda("");
      setZona("");
      setLocationId("");
      setLocationIdEdited(false);
      setNetsuiteName("");
      setCodigoOracle("");
      setCapacidad("");
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () => {
      // Validar unicidad de location_id
      const { data: existing } = await supabase
        .from("locations")
        .select("location_id")
        .eq("location_id", locationId)
        .maybeSingle();
      if (existing) throw new Error(`El Location ID "${locationId}" ya existe`);

      // Validar unicidad de nombre
      const { data: existingNombre } = await supabase
        .from("locations")
        .select("location_id")
        .eq("name", nombre)
        .maybeSingle();
      if (existingNombre) throw new Error(`Ya existe una ubicación llamada "${nombre}"`);

      const { data, error } = await supabase.rpc("crear_ubicacion_completa", {
        p_location_id: locationId,
        p_nombre: nombre,
        p_tipo_tienda: tipoTienda,
        p_zona: zona || null,
        p_netsuite_name: netsuiteName || null,
        p_netsuite_code: codigoOracle ? Number(codigoOracle) : null,
        p_capacidad: capacidad ? Number(capacidad) : null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Ubicación "${nombre}" creada correctamente`);
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Error al crear ubicación"),
  });

  const canSubmit = nombre.trim() && tipoTienda && locationId.trim();
  const isOutlet = tipoTienda === "OUTLET";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva sucursal</DialogTitle>
          <DialogDescription>
            Crea una nueva ubicación con sus parámetros base de allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">
              Nombre <span className="text-red-600">*</span>
            </Label>
            <Input
              id="nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tienda X"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tipo">
                Tipo tienda <span className="text-red-600">*</span>
              </Label>
              <Select value={tipoTienda} onValueChange={setTipoTienda}>
                <SelectTrigger id="tipo">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_TIENDA.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zona">Zona</Label>
              <Select value={zona} onValueChange={setZona}>
                <SelectTrigger id="zona">
                  <SelectValue placeholder="Sin zona" />
                </SelectTrigger>
                <SelectContent>
                  {zonas.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isOutlet && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                Las tiendas <strong>OUTLET</strong> no pueden ser <strong>origen</strong> de
                traslados, solo destino.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="locid">
              Location ID <span className="text-red-600">*</span>
            </Label>
            <Input
              id="locid"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setLocationIdEdited(true);
              }}
              placeholder="tienda_nueva_cali"
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Auto-generado desde el nombre. Editable. Solo minúsculas, números y guiones bajos.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nsname">Nombre NetSuite</Label>
            <Input
              id="nsname"
              value={netsuiteName}
              onChange={(e) => setNetsuiteName(e.target.value)}
              placeholder="TIENDAS FISICAS : MST NUEVA TIENDA"
            />
            <p className="text-[11px] text-muted-foreground">
              Opcional. Se puede asignar después.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="oracle">Código Oracle</Label>
              <Input
                id="oracle"
                type="number"
                value={codigoOracle}
                onChange={(e) => setCodigoOracle(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="capnueva">Capacidad máxima</Label>
              <Input
                id="capnueva"
                type="number"
                min={0}
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
                placeholder="Sin límite"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Creando..." : "Crear ubicación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
