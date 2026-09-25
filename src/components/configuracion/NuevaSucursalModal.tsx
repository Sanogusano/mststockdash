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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toastErrorUbicacion } from "@/lib/supabase-error";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

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
  const [fuente, setFuente] = useState<"shopify" | "netsuite">("netsuite");
  const [locationId, setLocationId] = useState("");
  const [locationIdEdited, setLocationIdEdited] = useState(false);
  const [netsuiteName, setNetsuiteName] = useState("");
  const [codigoOracle, setCodigoOracle] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [esPuntoVenta, setEsPuntoVenta] = useState(true);

  const esShopify = fuente === "shopify";

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
    if (!esShopify && !locationIdEdited) {
      setLocationId(slugify(nombre));
    }
  }, [nombre, locationIdEdited, esShopify]);

  // Al cambiar la fuente, el ID se reinicia según el modo elegido
  useEffect(() => {
    if (esShopify) {
      setLocationId("");
      setLocationIdEdited(false);
    } else {
      setLocationIdEdited(false);
      setLocationId(slugify(nombre));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuente]);

  useEffect(() => {
    if (!open) {
      setNombre("");
      setTipoTienda("");
      setZona("");
      setFuente("netsuite");
      setLocationId("");
      setLocationIdEdited(false);
      setNetsuiteName("");
      setCodigoOracle("");
      setCapacidad("");
      setEsPuntoVenta(true);
    }
  }, [open]);

  const idNumericoInvalido = esShopify && locationId.trim() !== "" && !/^\d+$/.test(locationId.trim());

  const mutation = useMutation({
    mutationFn: async () => {
      if (esShopify && !/^\d+$/.test(locationId.trim())) {
        throw new Error("Con Shopify POS el Location ID debe ser el ID numérico de Shopify");
      }

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
        p_es_punto_venta: esPuntoVenta,
      } as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`Ubicación "${nombre}" creada correctamente`);
      if (!esShopify && esPuntoVenta) {
        toast.info("Falta definir su fuente de ventas", {
          description:
            "Activa Nxt Sale y fija la fecha de corte en Configuración → Fuente de Ventas.",
          duration: 10000,
          action: {
            label: "Abrir",
            onClick: () => {
              window.location.href = "/configuracion/fuente-ventas";
            },
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
      onOpenChange(false);
    },
    onError: (err: any) => toastErrorUbicacion(err),
  });

  const canSubmit =
    nombre.trim() && tipoTienda && locationId.trim() && !idNumericoInvalido;
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

          {/* Punto de venta */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-md border border-border">
            <div>
              <Label className="text-sm font-medium">Punto de venta</Label>
              <p className="text-xs text-muted-foreground">
                Vende al público. Desmárcalo para bodegas y CEDIs: su inventario cuenta como
                stand-by, no como piso de venta.
              </p>
            </div>
            <Switch checked={esPuntoVenta} onCheckedChange={setEsPuntoVenta} />
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
            <Label htmlFor="fuente">Fuente de ventas</Label>
            <Select value={fuente} onValueChange={(v) => setFuente(v as "shopify" | "netsuite")}>
              <SelectTrigger id="fuente">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shopify">Shopify POS</SelectItem>
                <SelectItem value="netsuite">Nxt Sale (NetSuite)</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
              placeholder={esShopify ? "ID numérico de Shopify" : "tienda_nueva_cali"}
              className="font-mono text-sm"
              inputMode={esShopify ? "numeric" : "text"}
            />
            {esShopify ? (
              <p
                className={`text-[11px] ${idNumericoInvalido ? "text-red-600" : "text-muted-foreground"}`}
              >
                {idNumericoInvalido
                  ? "Solo dígitos: es la llave con la que llegan los webhooks de Shopify."
                  : "Cópialo del panel de Shopify: Configuración → Ubicaciones."}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Auto-generado desde el nombre. Editable. Solo minúsculas, números y guiones bajos.
              </p>
            )}
          </div>

          {!esShopify && esPuntoVenta && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-900">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                Tras crearla, activa Nxt Sale y fija la fecha de corte en{" "}
                <Link to="/configuracion/fuente-ventas" className="underline font-medium">
                  Configuración → Fuente de Ventas
                </Link>
                .
              </p>
            </div>
          )}

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
