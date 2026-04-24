import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, RefreshCw, Search, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
  UbicacionesTable,
  type UbicacionGestion,
} from "@/components/configuracion/UbicacionesTable";
import { EditarUbicacionModal } from "@/components/configuracion/EditarUbicacionModal";
import { NuevaSucursalModal } from "@/components/configuracion/NuevaSucursalModal";
import { AsignarCodigoOracleModal } from "@/components/configuracion/AsignarCodigoOracleModal";

export default function ConfiguracionUbicacionesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [filtroTier, setFiltroTier] = useState<string>("all");
  const [filtroEstado, setFiltroEstado] = useState<string>("all");
  const [filtroZona, setFiltroZona] = useState<string>("all");
  const [busqueda, setBusqueda] = useState("");

  const [editarUbicacion, setEditarUbicacion] = useState<UbicacionGestion | null>(null);
  const [asignarUbicacion, setAsignarUbicacion] = useState<UbicacionGestion | null>(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);

  // Control de acceso
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Solo los administradores pueden acceder a esta sección");
      navigate("/", { replace: true });
    }
  }, [roleLoading, isAdmin, navigate]);

  const { data: ubicaciones = [], isLoading } = useQuery({
    queryKey: ["ubicaciones-gestion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ubicaciones_gestion")
        .select("*")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as UbicacionGestion[];
    },
    enabled: isAdmin,
  });

  const sincronizar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("sincronizar_params_desde_tipo_tienda");
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      toast.success(`${count ?? 0} ubicaciones sincronizadas`);
      queryClient.invalidateQueries({ queryKey: ["ubicaciones-gestion"] });
    },
    onError: (err: any) => toast.error(err.message ?? "Error al sincronizar"),
  });

  // KPIs
  const kpis = useMemo(() => {
    const total = ubicaciones.length;
    const ok = ubicaciones.filter((u) => u.estado_config === "ok").length;
    const pendientes = ubicaciones.filter(
      (u) => u.estado_config === "falta_codigo_oracle" || u.estado_config === "sin_parametros",
    ).length;
    return { total, ok, pendientes };
  }, [ubicaciones]);

  // Zonas únicas para filtro
  const zonasDisponibles = useMemo(() => {
    const set = new Set<string>();
    ubicaciones.forEach((u) => u.zona && set.add(u.zona));
    return Array.from(set).sort();
  }, [ubicaciones]);

  // Aplicar filtros
  const ubicacionesFiltradas = useMemo(() => {
    return ubicaciones.filter((u) => {
      if (filtroTier !== "all" && u.tier !== filtroTier) return false;

      if (filtroEstado === "ok" && u.estado_config !== "ok") return false;
      if (
        filtroEstado === "pendientes" &&
        !["falta_codigo_oracle", "sin_parametros"].includes(u.estado_config)
      )
        return false;
      if (
        filtroEstado === "inactivas" &&
        !["inactiva", "location_inactiva"].includes(u.estado_config)
      )
        return false;

      if (filtroZona !== "all" && u.zona !== filtroZona) return false;

      if (busqueda.trim()) {
        const q = busqueda.toLowerCase();
        if (!u.nombre.toLowerCase().includes(q) && !u.location_id.toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [ubicaciones, filtroTier, filtroEstado, filtroZona, busqueda]);

  if (roleLoading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Verificando acceso...</div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Configuración de Ubicaciones
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Tiendas, CEDIs y outlets del sistema de allocation
                </p>
              </div>
            </div>
            <Button onClick={() => setNuevaOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva sucursal
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total ubicaciones</p>
                  <p className="text-2xl font-semibold mt-1 whitespace-normal break-words tabular-nums">{kpis.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Configuradas
                  </p>
                  <p className="text-2xl font-semibold mt-1 text-emerald-700 whitespace-normal break-words tabular-nums">{kpis.ok}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    Pendientes
                  </p>
                  <p className="text-2xl font-semibold mt-1 text-amber-700">{kpis.pendientes}</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 flex flex-col justify-between h-full">
                  <p className="text-xs text-muted-foreground">Sincronizar parámetros</p>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => sincronizar.mutate()}
                    disabled={sincronizar.isPending}
                    className="mt-2 gap-2"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${sincronizar.isPending ? "animate-spin" : ""}`}
                    />
                    {sincronizar.isPending ? "Sincronizando..." : "Desde tipo_tienda"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Filtros */}
            <div className="flex flex-col lg:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre o ID..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filtroTier} onValueChange={setFiltroTier}>
                <SelectTrigger className="w-full lg:w-44">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tiers</SelectItem>
                  <SelectItem value="cedi">CEDI</SelectItem>
                  <SelectItem value="flagship">Flagship</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="pequena">Pequeña</SelectItem>
                  <SelectItem value="outlet">Outlet</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="w-full lg:w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="pendientes">Pendientes</SelectItem>
                  <SelectItem value="inactivas">Inactivas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroZona} onValueChange={setFiltroZona}>
                <SelectTrigger className="w-full lg:w-44">
                  <SelectValue placeholder="Zona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las zonas</SelectItem>
                  {zonasDisponibles.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tabla */}
            <UbicacionesTable
              data={ubicacionesFiltradas}
              loading={isLoading}
              onEditar={setEditarUbicacion}
              onAsignarCodigo={setAsignarUbicacion}
            />
          </div>
        </main>
      </div>

      {/* Modales */}
      <NuevaSucursalModal open={nuevaOpen} onOpenChange={setNuevaOpen} />
      <EditarUbicacionModal
        ubicacion={editarUbicacion}
        open={!!editarUbicacion}
        onOpenChange={(o) => !o && setEditarUbicacion(null)}
      />
      <AsignarCodigoOracleModal
        ubicacion={asignarUbicacion}
        open={!!asignarUbicacion}
        onOpenChange={(o) => !o && setAsignarUbicacion(null)}
      />
    </SidebarProvider>
  );
}
