import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDown, ArrowUp, Edit, KeyRound } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { EstadoConfigBadge, type EstadoConfig } from "./EstadoConfigBadge";

export interface UbicacionGestion {
  location_id: string;
  nombre: string;
  tipo_tienda: string | null;
  zona: string | null;
  dimension_m2: number | null;
  location_activa: boolean;
  netsuite_location_name: string | null;
  codigo_oracle: number | null;
  mapeo_tipo: "origen_destino" | "solo_destino" | "ignorar" | null;
  mapeo_notas: string | null;
  tier: "flagship" | "regular" | "pequena" | "outlet" | "cedi" | null;
  es_cedi: boolean | null;
  es_outlet: boolean | null;
  puede_ser_origen: boolean | null;
  puede_ser_destino: boolean | null;
  mod_default: number | null;
  mod_por_categoria: Record<string, number> | null;
  wos_objetivo_semanas: number | null;
  wos_objetivo_por_categoria: Record<string, number> | null;
  colchon_cedi_semanas: number | null;
  capacidad_maxima_unidades: number | null;
  allocation_activa: boolean | null;
  params_updated_at: string | null;
  estado_config: EstadoConfig;
}

const tierStyles: Record<string, string> = {
  cedi: "bg-blue-900/15 text-blue-900 border-blue-900/30",
  flagship: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  regular: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  pequena: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  outlet: "bg-orange-500/15 text-orange-700 border-orange-500/30",
};

const tierLabels: Record<string, string> = {
  cedi: "CEDI",
  flagship: "Flagship",
  regular: "Regular",
  pequena: "Pequeña",
  outlet: "Outlet",
};

interface Props {
  data: UbicacionGestion[];
  loading: boolean;
  onEditar: (u: UbicacionGestion) => void;
  onAsignarCodigo: (u: UbicacionGestion) => void;
}

export function UbicacionesTable({ data, loading, onEditar, onAsignarCodigo }: Props) {
  const queryClient = useQueryClient();
  const toggleActiva = useMutation({
    mutationFn: async ({ id, activa }: { id: string; activa: boolean }) => {
      const { error } = await supabase.rpc("actualizar_ubicacion", {
        p_location_id: id,
        p_is_active: activa,
      } as any);
      if (error) throw error;
      return activa;
    },
    onSuccess: (activa) => {
      toast.success(activa ? "Ubicación activada" : "Ubicación desactivada");
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Error al actualizar"),
  });

  if (loading) {
    return (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Oracle</TableHead>
              <TableHead>MOD</TableHead>
              <TableHead>WOS</TableHead>
              <TableHead>Capacidad</TableHead>
              <TableHead>Orig/Dest</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Activa</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 11 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-12 text-center">
        <p className="text-sm text-muted-foreground">
          No se encontraron ubicaciones con los filtros aplicados.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-semibold">Nombre</TableHead>
            <TableHead className="font-semibold">Tier</TableHead>
            <TableHead className="font-semibold">Tipo</TableHead>
            <TableHead className="font-semibold">Oracle</TableHead>
            <TableHead className="font-semibold text-right">MOD</TableHead>
            <TableHead className="font-semibold text-right">WOS</TableHead>
            <TableHead className="font-semibold text-right">Capacidad</TableHead>
            <TableHead className="font-semibold text-center">Orig/Dest</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((u) => {
            const tier = u.tier ?? "regular";
            return (
              <TableRow key={u.location_id} className="hover:bg-muted/20">
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{u.nombre}</span>
                    <span className="text-[10px] text-muted-foreground/70">
                      {u.location_id}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`font-medium ${tierStyles[tier] ?? ""}`}>
                    {tierLabels[tier] ?? tier}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {u.tipo_tienda ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {u.codigo_oracle ? (
                    <span className="font-mono text-sm">{u.codigo_oracle}</span>
                  ) : (
                    <span className="text-xs font-medium text-red-600">Pendiente</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {u.mod_default ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {u.wos_objetivo_semanas ?? "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {u.capacidad_maxima_unidades?.toLocaleString("es-CO") ?? (
                    <span className="text-muted-foreground/60">Sin límite</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1.5">
                    <ArrowUp
                      className={`h-3.5 w-3.5 ${
                        u.puede_ser_origen ? "text-emerald-600" : "text-muted-foreground/30"
                      }`}
                    />
                    <ArrowDown
                      className={`h-3.5 w-3.5 ${
                        u.puede_ser_destino ? "text-sky-600" : "text-muted-foreground/30"
                      }`}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <EstadoConfigBadge estado={u.estado_config} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {u.estado_config === "falta_codigo_oracle" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onAsignarCodigo(u)}
                        className="h-8 gap-1 text-amber-700 border-amber-500/30 hover:bg-amber-500/10"
                      >
                        <KeyRound className="h-3 w-3" />
                        Asignar
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditar(u)}
                      className="h-8 gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Editar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
