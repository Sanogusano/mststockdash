import { useEffect, useState, useCallback } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type SyncState = {
  status: string | null;
  current_page: number | null;
  total_inserted: number | null;
  cursor: string | null;
  last_started_at: string | null;
  last_completed_at: string | null;
};

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

export default function ConfiguracionSyncInventarioPage() {
  const [state, setState] = useState<SyncState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [todayRows, setTodayRows] = useState<number | null>(null);

  const fetchState = useCallback(async () => {
    const [{ data: s }, { count }] = await Promise.all([
      supabase
        .from("inventory_sync_state")
        .select("status,current_page,total_inserted,cursor,last_started_at,last_completed_at")
        .eq("id", 1)
        .maybeSingle(),
      supabase
        .from("inventory_snapshot")
        .select("id", { count: "exact", head: true })
        .eq("snapshot_date", new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })),
    ]);
    if (s) setState(s as SyncState);
    setTodayRows(count ?? 0);
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const running = state?.status === "running" || triggering;
    const id = setInterval(fetchState, running ? 2500 : 10000);
    return () => clearInterval(id);
  }, [state?.status, triggering, fetchState]);

  const trigger = async () => {
    try {
      setTriggering(true);
      const { error } = await supabase.functions.invoke("cron-inventory-snapshot", { body: {} });
      if (error) throw error;
      toast.success("Sync de inventario iniciado");
      setTimeout(fetchState, 1500);
    } catch (e: any) {
      toast.error(`Error iniciando sync: ${e?.message ?? e}`);
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = state?.status === "running" || triggering;
  const isError = state?.status?.startsWith("error");
  const isCompleted = state?.status === "completed";

  const StatusBadge = () => {
    if (isRunning)
      return (
        <Badge className="gap-1.5 bg-primary/10 text-primary hover:bg-primary/15 border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin" /> En progreso
        </Badge>
      );
    if (isError)
      return (
        <Badge variant="destructive" className="gap-1.5">
          <AlertCircle className="h-3 w-3" /> Error
        </Badge>
      );
    if (isCompleted)
      return (
        <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3" /> Completado
        </Badge>
      );
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Clock className="h-3 w-3" /> Inactivo
      </Badge>
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Sync de Inventario</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Snapshot diario desde Shopify a inventory_snapshot
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-6 max-w-3xl w-full">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>Estado de la sincronización</CardTitle>
                    <CardDescription>
                      Ejecución encadenada por páginas. El cron se dispara automáticamente a las 03:00 UTC.
                    </CardDescription>
                  </div>
                  <StatusBadge />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Metric label="Página actual" value={String(state?.current_page ?? 0)} />
                  <Metric
                    label="Registros insertados"
                    value={(state?.total_inserted ?? 0).toLocaleString("es-CO")}
                  />
                  <Metric label="Filas hoy (DB)" value={(todayRows ?? 0).toLocaleString("es-CO")} />
                  <Metric label="Estado raw" value={state?.status ?? "idle"} mono />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <InfoRow label="Iniciado" value={fmtDate(state?.last_started_at ?? null)} />
                  <InfoRow label="Completado" value={fmtDate(state?.last_completed_at ?? null)} />
                </div>

                {isError && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                    {state?.status}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button onClick={trigger} disabled={isRunning} className="gap-2">
                    {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {isRunning ? "Sincronizando..." : "Disparar sync ahora"}
                  </Button>
                  <Button variant="outline" onClick={fetchState} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Refrescar estado
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  El proceso continúa en cadena hasta procesar todas las páginas (~340k registros). Puede tardar varios
                  minutos. El estado se actualiza automáticamente cada {isRunning ? "2.5" : "10"} segundos.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold text-foreground truncate ${mono ? "font-mono text-sm" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
