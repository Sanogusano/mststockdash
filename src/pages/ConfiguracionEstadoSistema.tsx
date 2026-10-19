import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useChequeoIntegridad } from "@/hooks/useChequeoIntegridad";
import { cn } from "@/lib/utils";

const NOMBRES: Record<string, string> = {
  pedidos_sin_orden_venta: "Pedidos online sin orden de venta en NetSuite",
  sincronizacion_atrasada: "Sincronización atrasada",
  inventario_desactualizado: "Inventario desactualizado",
  facturado_vs_selliq: "Facturado NetSuite vs Selliq",
  tienda_nxt_sin_ventas: "Tienda Nxt Sale sin ventas",
  items_netsuite_faltantes: "Productos NetSuite faltantes",
  sku_sin_variante_shopify: "SKU sin variante en Shopify",
  shopify_vs_netsuite_online: "Inventario online Shopify vs NetSuite",
};
const ORDEN: Record<string, number> = { alta: 0, media: 1, info: 2 };
const BADGE: Record<string, string> = {
  alta: "bg-destructive/10 text-destructive border-destructive/30",
  media: "bg-amber-100 text-amber-800 border-amber-300",
  info: "bg-muted text-muted-foreground border-border",
};
const hora = (d: Date | string) => new Date(d).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
const fechaHora = (d: string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default function ConfiguracionEstadoSistema() {
  const chequeo = useChequeoIntegridad();
  const log = useQuery({
    queryKey: ["proceso_ejecucion_log"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("proceso_ejecucion_log")
        .select("proceso, ultima_ejecucion, duracion_ms")
        .order("ultima_ejecucion", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { proceso: string; ultima_ejecucion: string | null; duracion_ms: number | null }[];
    },
  });
  const [revision, setRevision] = useState<Date | null>(null);
  useEffect(() => { if (chequeo.dataUpdatedAt) setRevision(new Date(chequeo.dataUpdatedAt)); }, [chequeo.dataUpdatedAt]);

  const filas = useMemo(() => [...(chequeo.data ?? [])].sort((a, b) => (ORDEN[a.severidad] ?? 9) - (ORDEN[b.severidad] ?? 9)), [chequeo.data]);
  const cuenta = (s: string) => filas.filter((r) => r.severidad === s).length;
  const actualizar = () => { chequeo.refetch(); log.refetch(); };
  const cargando = chequeo.isFetching || log.isFetching;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 overflow-auto">
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border md:hidden">
            <SidebarTrigger />
            <h2 className="text-base font-semibold">Estado del Sistema</h2>
          </header>
          <div className="p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Estado del Sistema</h1>
                <p className="text-sm text-muted-foreground">Última revisión: {revision ? hora(revision) : "—"}</p>
              </div>
              <Button variant="outline" onClick={actualizar} disabled={cargando}>
                <RefreshCw className={cn("h-4 w-4 mr-2", cargando && "animate-spin")} /> Actualizar
              </Button>
            </div>

            {chequeo.error && <p className="text-sm text-destructive">{(chequeo.error as Error).message}</p>}

            <div className="grid grid-cols-3 gap-4">
              {[["alta", "Alta", "text-destructive border-destructive/40"], ["media", "Media", "text-amber-700 border-amber-400"], ["info", "Info", "text-muted-foreground"]].map(([k, t, cls]) => (
                <Card key={k} className={cls}><CardContent className="p-4">
                  <p className="text-xs font-medium">{t}</p>
                  <p className="text-3xl font-semibold tabular-nums">{chequeo.isLoading ? "…" : cuenta(k)}</p>
                </CardContent></Card>
              ))}
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Chequeos de integridad</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead className="w-28">Severidad</TableHead><TableHead className="w-80">Chequeo</TableHead><TableHead>Detalle</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filas.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium border capitalize", BADGE[r.severidad] ?? BADGE.info)}>{r.severidad}</span></TableCell>
                        <TableCell className="font-medium">{NOMBRES[r.chequeo] ?? r.chequeo}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{r.detalle ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {!chequeo.isLoading && !filas.length && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin hallazgos</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Últimas ejecuciones</CardTitle></CardHeader>
              <CardContent>
                {log.error && <p className="text-sm text-destructive mb-2">{(log.error as Error).message}</p>}
                <Table>
                  <TableHeader><TableRow><TableHead>Proceso</TableHead><TableHead>Última ejecución</TableHead><TableHead>Hace</TableHead><TableHead className="text-right">Duración</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(log.data ?? []).map((r) => {
                      const h = r.ultima_ejecucion ? (Date.now() - new Date(r.ultima_ejecucion).getTime()) / 3600000 : null;
                      return (
                        <TableRow key={r.proceso} className={cn(h != null && h > 26 && "bg-amber-50 hover:bg-amber-100")}>
                          <TableCell className="font-medium">{r.proceso}</TableCell>
                          <TableCell>{r.ultima_ejecucion ? fechaHora(r.ultima_ejecucion) : "—"}</TableCell>
                          <TableCell className="tabular-nums">{h == null ? "—" : `hace ${h < 1 ? "<1" : Math.floor(h)} h`}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.duracion_ms == null ? "—" : `${(r.duracion_ms / 1000).toFixed(1)} s`}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
