import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
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

export function SyncInventoryButton() {
  const [state, setState] = useState<SyncState | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchState = useCallback(async () => {
    const { data, error } = await supabase
      .from("inventory_sync_state")
      .select("status,current_page,total_inserted,cursor,last_started_at,last_completed_at")
      .eq("id", 1)
      .maybeSingle();
    if (!error && data) setState(data as SyncState);
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Poll while running or popover is open
  useEffect(() => {
    const isRunning = state?.status === "running";
    if (!isRunning && !open) return;
    const id = setInterval(fetchState, 3000);
    return () => clearInterval(id);
  }, [state?.status, open, fetchState]);

  const trigger = async () => {
    try {
      setTriggering(true);
      const { error } = await supabase.functions.invoke("cron-inventory-snapshot", {
        body: {},
      });
      if (error) throw error;
      toast.success("Sync de inventario iniciado");
      setOpen(true);
      setTimeout(fetchState, 1500);
    } catch (e: any) {
      toast.error(`Error iniciando sync: ${e?.message ?? e}`);
    } finally {
      setTriggering(false);
    }
  };

  const isRunning = state?.status === "running" || triggering;
  const isError = state?.status?.startsWith("error");
  const Icon = isRunning ? Loader2 : isError ? AlertCircle : state?.status === "completed" ? CheckCircle2 : RefreshCw;

  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Icon className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Sync Inventario</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold">Sincronización de Inventario</h4>
            <p className="text-xs text-muted-foreground">Snapshot diario desde Shopify</p>
          </div>

          <div className="space-y-1.5 text-xs">
            <Row label="Estado" value={state?.status ?? "idle"} highlight={isError ? "error" : isRunning ? "running" : "ok"} />
            <Row label="Página actual" value={String(state?.current_page ?? 0)} />
            <Row label="Registros insertados" value={(state?.total_inserted ?? 0).toLocaleString("es-CO")} />
            <Row label="Iniciado" value={fmt(state?.last_started_at ?? null)} />
            <Row label="Completado" value={fmt(state?.last_completed_at ?? null)} />
          </div>

          <Button onClick={trigger} disabled={isRunning} size="sm" className="w-full gap-2">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isRunning ? "Sincronizando..." : "Disparar sync ahora"}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            El proceso se ejecuta en cadena por páginas. Puede tardar varios minutos.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: "ok" | "running" | "error" }) {
  const color =
    highlight === "error"
      ? "text-destructive"
      : highlight === "running"
      ? "text-primary"
      : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium truncate ${color}`}>{value}</span>
    </div>
  );
}
