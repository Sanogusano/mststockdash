import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { AlertTriangle, Database, Search, ShoppingBag, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useHasPermission } from "@/hooks/useHasPermission";
import { useUserRole } from "@/hooks/useUserRole";

type Fuente = "shopify" | "netsuite";

type FuenteRow = {
  location_id: string;
  fuente: string;
  fecha_corte: string | null;
  nota: string | null;
  updated_at: string | null;
};

type LocationRow = { location_id: string; name: string };

const hoyISO = () => {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }),
  );
  return now.toISOString().slice(0, 10);
};

const fmtFecha = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
};

const fmtFechaHora = (v?: string | null) => {
  if (!v) return "—";
  return new Date(v).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ConfiguracionFuenteVentasPage() {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const puedeEditar = useHasPermission({ module: "config.fuente_ventas", action: "edit" }) || isAdmin;

  const [busqueda, setBusqueda] = useState("");
  const [confirmar, setConfirmar] = useState<{
    location_id: string;
    nombre: string;
    fecha: string;
  } | null>(null);

  const { data: locations = [], isLoading: loadingLoc } = useQuery({
    queryKey: ["fv-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("location_id, name")
        .eq("is_active", true)
        .eq("es_punto_venta", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const { data: fuentes = [], isLoading: loadingFuentes } = useQuery({
    queryKey: ["fuente-venta-ubicacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fuente_venta_ubicacion")
        .select("location_id, fuente, fecha_corte, nota, updated_at");
      if (error) throw error;
      return (data ?? []) as FuenteRow[];
    },
  });

  const { data: ultimaCorrida } = useQuery({
    queryKey: ["sync-netsuite-ventas-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proceso_ejecucion_log")
        .select("ultima_ejecucion")
        .eq("proceso", "sync_netsuite_ventas")
        .maybeSingle();
      if (error) throw error;
      return data?.ultima_ejecucion as string | undefined;
    },
    staleTime: 60_000,
  });

  const mapa = useMemo(() => {
    const m = new Map<string, FuenteRow>();
    fuentes.forEach((f) => m.set(f.location_id, f));
    return m;
  }, [fuentes]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return locations
      .map((l) => ({ ...l, cfg: mapa.get(l.location_id) }))
      .filter((l) => !q || l.name.toLowerCase().includes(q));
  }, [locations, mapa, busqueda]);

  const totalNetsuite = locations.filter(
    (l) => mapa.get(l.location_id)?.fuente === "netsuite",
  ).length;
  const totalShopify = locations.length - totalNetsuite;

  const guardar = useMutation({
    mutationFn: async (payload: {
      location_id: string;
      fuente: Fuente;
      fecha_corte: string | null;
      nota: string | null;
    }) => {
      const { error } = await supabase.from("fuente_venta_ubicacion").upsert(
        { ...payload, updated_at: new Date().toISOString() },
        { onConflict: "location_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuente-venta-ubicacion"] });
      toast.success("Configuración guardada");
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo guardar"),
  });

  const cambiarFuente = (
    loc: LocationRow,
    cfg: FuenteRow | undefined,
    aNetsuite: boolean,
  ) => {
    if (!puedeEditar) return;
    if (aNetsuite) {
      setConfirmar({
        location_id: loc.location_id,
        nombre: loc.name,
        fecha: cfg?.fecha_corte ?? hoyISO(),
      });
    } else {
      guardar.mutate({
        location_id: loc.location_id,
        fuente: "shopify",
        fecha_corte: null,
        nota: cfg?.nota ?? null,
      });
    }
  };

  const cargando = loadingLoc || loadingFuentes;

  return (
    <MainLayout>
      <header className="h-16 flex items-center border-b border-border bg-card px-6 gap-3">
        <SidebarTrigger />
        <div>
          <h1 className="text-lg font-semibold">Fuente de Ventas</h1>
          <p className="text-xs text-muted-foreground">
            Define de qué sistema se toman las ventas de cada tienda
          </p>
        </div>
      </header>

      <div className="p-6 space-y-5">
        {/* Resumen */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-semibold">{totalShopify}</div>
                <div className="text-xs text-muted-foreground">Tiendas en Shopify POS</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-2xl font-semibold">{totalNetsuite}</div>
                <div className="text-xs text-muted-foreground">Tiendas en Nxt Sale (NetSuite)</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{fmtFechaHora(ultimaCorrida)}</div>
                <div className="text-xs text-muted-foreground">Última sincronización NetSuite</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {totalNetsuite > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Verifica que las ventas estén llegando antes de desconectar el sistema anterior.</span>
          </div>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar tienda..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {cargando ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-3">Tienda</th>
                      <th className="text-left px-4 py-3">Fuente</th>
                      <th className="text-left px-4 py-3">Fecha de corte</th>
                      <th className="text-left px-4 py-3">Nota</th>
                      <th className="text-left px-4 py-3">Última modificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((l) => {
                      const cfg = l.cfg;
                      const esNS = cfg?.fuente === "netsuite";
                      return (
                        <tr key={l.location_id} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{l.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={esNS ? "text-muted-foreground" : "font-medium"}>
                                Shopify POS
                              </span>
                              <Switch
                                checked={esNS}
                                disabled={!puedeEditar || guardar.isPending}
                                onCheckedChange={(v) => cambiarFuente(l, cfg, v)}
                              />
                              <span className={esNS ? "font-medium" : "text-muted-foreground"}>
                                Nxt Sale (NetSuite)
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {esNS ? (
                              <Input
                                type="date"
                                className="h-8 w-40"
                                disabled={!puedeEditar}
                                value={cfg?.fecha_corte?.slice(0, 10) ?? ""}
                                onChange={(e) =>
                                  guardar.mutate({
                                    location_id: l.location_id,
                                    fuente: "netsuite",
                                    fecha_corte: e.target.value || hoyISO(),
                                    nota: cfg?.nota ?? null,
                                  })
                                }
                              />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Input
                              className="h-8"
                              placeholder="Nota opcional"
                              disabled={!puedeEditar}
                              defaultValue={cfg?.nota ?? ""}
                              onBlur={(e) => {
                                const nota = e.target.value.trim() || null;
                                if (nota === (cfg?.nota ?? null)) return;
                                guardar.mutate({
                                  location_id: l.location_id,
                                  fuente: (cfg?.fuente as Fuente) ?? "shopify",
                                  fecha_corte: cfg?.fecha_corte ?? null,
                                  nota,
                                });
                              }}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {cfg?.updated_at ? fmtFechaHora(cfg.updated_at) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {filas.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No hay tiendas que coincidan con la búsqueda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!puedeEditar && (
          <Badge variant="secondary">Solo lectura — no tienes permiso de edición</Badge>
        )}
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cambiar a Nxt Sale (NetSuite)</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  A partir del {fmtFecha(confirmar?.fecha)}, las ventas de{" "}
                  {confirmar?.nombre} se tomarán de NetSuite. Los pedidos que lleguen por Shopify
                  de esta tienda serán ignorados. Es reversible.
                </p>
                <div>
                  <label className="text-xs uppercase text-muted-foreground">Fecha de corte</label>
                  <Input
                    type="date"
                    className="h-9 mt-1"
                    value={confirmar?.fecha ?? ""}
                    onChange={(e) =>
                      setConfirmar((c) => (c ? { ...c, fecha: e.target.value } : c))
                    }
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmar) return;
                guardar.mutate({
                  location_id: confirmar.location_id,
                  fuente: "netsuite",
                  fecha_corte: confirmar.fecha || hoyISO(),
                  nota: mapa.get(confirmar.location_id)?.nota ?? null,
                });
                setConfirmar(null);
              }}
            >
              Confirmar cambio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
