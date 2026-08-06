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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

export function EditarUbicacionModal({ ubicacion, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  // locations
  const [nombre, setNombre] = useState("");
  const [tipoTienda, setTipoTienda] = useState("");
  const [zona, setZona] = useState("");
  const [dimensionM2, setDimensionM2] = useState("");
  const [isActive, setIsActive] = useState(true);

  // netsuite mapping
  const [netsuiteName, setNetsuiteName] = useState("");
  const [codigoOracle, setCodigoOracle] = useState("");
  const [mapeoTipo, setMapeoTipo] = useState("");
  const [mapeoNotas, setMapeoNotas] = useState("");

  // allocation
  const [tier, setTier] = useState("");
  const [esCedi, setEsCedi] = useState(false);
  const [esOutlet, setEsOutlet] = useState(false);
  const [puedeOrigen, setPuedeOrigen] = useState(false);
  const [puedeDestino, setPuedeDestino] = useState(false);
  const [modDefault, setModDefault] = useState("");
  const [wosObjetivo, setWosObjetivo] = useState("");
  const [colchonCedi, setColchonCedi] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [activa, setActiva] = useState(true);

  // categorías (RPC aparte)
  const [modCats, setModCats] = useState<CategoriaEntry[]>([]);
  const [wosCats, setWosCats] = useState<CategoriaEntry[]>([]);

  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    if (!ubicacion) return;
    setNombre(ubicacion.nombre ?? "");
    setTipoTienda(str(ubicacion.tipo_tienda));
    setZona(str(ubicacion.zona));
    setDimensionM2(str(ubicacion.dimension_m2));
    setIsActive(ubicacion.location_activa ?? true);
    setNetsuiteName(str(ubicacion.netsuite_location_name));
    setCodigoOracle(str(ubicacion.codigo_oracle));
    setMapeoTipo(str(ubicacion.mapeo_tipo));
    setMapeoNotas(str(ubicacion.mapeo_notas));
    setTier(str(ubicacion.tier));
    setEsCedi(!!ubicacion.es_cedi);
    setEsOutlet(!!ubicacion.es_outlet);
    setPuedeOrigen(!!ubicacion.puede_ser_origen);
    setPuedeDestino(!!ubicacion.puede_ser_destino);
    setModDefault(str(ubicacion.mod_default));
    setWosObjetivo(str(ubicacion.wos_objetivo_semanas));
    setColchonCedi(str(ubicacion.colchon_cedi_semanas));
    setCapacidad(str(ubicacion.capacidad_maxima_unidades));
    setActiva(ubicacion.allocation_activa ?? true);
    setModCats(objToEntries(ubicacion.mod_por_categoria));
    setWosCats(objToEntries(ubicacion.wos_objetivo_por_categoria));
  }, [ubicacion]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ubicacion) throw new Error("Sin ubicación");
      const u = ubicacion;
      const payload: Record<string, unknown> = { p_location_id: u.location_id };
      const put = (key: string, value: unknown, original: unknown) => {
        const a = value === "" ? null : value;
        const b = original === undefined ? null : original;
        if (a !== b) payload[key] = a;
      };

      put("p_nombre", nombre, u.nombre);
      put("p_tipo_tienda", tipoTienda, u.tipo_tienda);
      put("p_zona", zona, u.zona);
      put("p_dimension_m2", numOrNull(dimensionM2), u.dimension_m2);
      put("p_is_active", isActive, u.location_activa ?? true);

      put("p_netsuite_name", netsuiteName, u.netsuite_location_name);
      put("p_codigo_oracle", numOrNull(codigoOracle), u.codigo_oracle);
      put("p_mapeo_tipo", mapeoTipo, u.mapeo_tipo);
      put("p_mapeo_notas", mapeoNotas, u.mapeo_notas);

      put("p_tier", tier, u.tier);
      put("p_es_cedi", esCedi, !!u.es_cedi);
      put("p_es_outlet", esOutlet, !!u.es_outlet);
      put("p_puede_origen", puedeOrigen, !!u.puede_ser_origen);
      put("p_puede_destino", puedeDestino, !!u.puede_ser_destino);
      put("p_mod_default", numOrNull(modDefault), u.mod_default);
      put("p_wos_objetivo", numOrNull(wosObjetivo), u.wos_objetivo_semanas);
      put("p_colchon_cedi", numOrNull(colchonCedi), u.colchon_cedi_semanas);
      put("p_capacidad_max", numOrNull(capacidad), u.capacidad_maxima_unidades);
      put("p_allocation_activa", activa, u.allocation_activa ?? true);

      if (Object.keys(payload).length > 1) {
        const { error } = await supabase.rpc("actualizar_ubicacion", payload as any);
        if (error) throw error;
      }

      // Categorías: no existen en actualizar_ubicacion, se guardan con su RPC
      const modObj = entriesToObj(modCats);
      const wosObj = entriesToObj(wosCats);
      const catsChanged =
        JSON.stringify(modObj) !== JSON.stringify(u.mod_por_categoria ?? null) ||
        JSON.stringify(wosObj) !== JSON.stringify(u.wos_objetivo_por_categoria ?? null);

      if (catsChanged) {
        const { error } = await supabase.rpc("actualizar_params_ubicacion", {
          p_location_id: u.location_id,
          p_mod_default: numOrNull(modDefault),
          p_wos_objetivo: numOrNull(wosObjetivo),
          p_colchon_cedi: numOrNull(colchonCedi),
          p_capacidad: numOrNull(capacidad),
          p_activa: activa,
          p_mod_por_categoria: modObj as any,
          p_wos_por_categoria: wosObj as any,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Ubicación actualizada");
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Error al guardar"),
  });

  const handleSave = () => {
    if ((ubicacion?.allocation_activa && !activa) || (ubicacion?.location_activa && !isActive)) {
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
            <DialogTitle>Editar ubicación — {ubicacion.nombre}</DialogTitle>
            <DialogDescription>
              Datos generales, mapeo NetSuite y parámetros de allocation. Solo se envían los campos
              modificados.
            </DialogDescription>
          </DialogHeader>

          {/* Datos generales */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Datos generales</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de tienda</Label>
                <Input
                  id="tipo"
                  value={tipoTienda}
                  onChange={(e) => setTipoTienda(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zona">Zona</Label>
                <Input id="zona" value={zona} onChange={(e) => setZona(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="m2">Dimensión (m²)</Label>
                <Input
                  id="m2"
                  type="number"
                  step="0.01"
                  min={0}
                  value={dimensionM2}
                  onChange={(e) => setDimensionM2(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border border-border">
              <div>
                <Label className="text-sm font-medium">Ubicación activa</Label>
                <p className="text-xs text-muted-foreground">
                  Desactivarla la excluye de los reportes y del sistema.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          {/* NetSuite */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Mapeo NetSuite</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nsname">Nombre bodega NetSuite</Label>
                <Input
                  id="nsname"
                  value={netsuiteName}
                  onChange={(e) => setNetsuiteName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oracle">Código Oracle</Label>
                <Input
                  id="oracle"
                  type="number"
                  value={codigoOracle}
                  onChange={(e) => setCodigoOracle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de mapeo</Label>
                <Select value={mapeoTipo} onValueChange={setMapeoTipo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="origen_destino">Origen y destino</SelectItem>
                    <SelectItem value="solo_destino">Solo destino</SelectItem>
                    <SelectItem value="ignorar">Ignorar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notas">Notas</Label>
                <Input
                  id="notas"
                  value={mapeoNotas}
                  onChange={(e) => setMapeoNotas(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Allocation */}
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Allocation</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cedi">CEDI</SelectItem>
                    <SelectItem value="flagship">Flagship</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="pequena">Pequeña</SelectItem>
                    <SelectItem value="outlet">Outlet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <Label className="text-sm">Es CEDI</Label>
                <Switch checked={esCedi} onCheckedChange={setEsCedi} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <Label className="text-sm">Es Outlet</Label>
                <Switch checked={esOutlet} onCheckedChange={setEsOutlet} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <Label className="text-sm">Puede ser origen</Label>
                <Switch checked={puedeOrigen} onCheckedChange={setPuedeOrigen} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-md border border-border">
                <Label className="text-sm">Puede ser destino</Label>
                <Switch checked={puedeDestino} onCheckedChange={setPuedeDestino} />
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
            <AlertDialogTitle>¿Desactivar ubicación?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás por desactivar <strong>{ubicacion.nombre}</strong>. No participará en las curvas
              de allocation ni en los reportes hasta que la reactives.
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
