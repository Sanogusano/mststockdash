import { useCallback, useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, Clock, PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

export default function ConfiguracionSyncInventarioPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Sync de Catálogo</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Sincronización de productos desde Shopify
                </p>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-6 max-w-3xl w-full">
            <ProductsSyncCard />
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

function ProductsSyncCard() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [running, setRunning] = useState(false);
  const [batches, setBatches] = useState(0);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [nullBefore, setNullBefore] = useState<number | null>(null);
  const [nullAfter, setNullAfter] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchNullCount = useCallback(async () => {
    const { count, error } = await supabase
      .from("product_catalog")
      .select("variant_id", { count: "exact", head: true })
      .is("collection_season", null);
    if (error) return null;
    return count ?? 0;
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchNullCount().then((c) => c !== null && setNullBefore(c));
  }, [isAdmin, fetchNullCount]);

  const runSync = async () => {
    setRunning(true);
    setLastError(null);
    setBatches(0);
    setTotalProcessed(0);
    setNullAfter(null);

    const before = await fetchNullCount();
    if (before !== null) setNullBefore(before);

    let cursor: string | null = null;
    let hasNext = true;
    let totals = 0;
    let n = 0;

    try {
      while (hasNext) {
        const { data, error } = await supabase.functions.invoke("sync-products", {
          body: { cursor },
        });
        if (error) throw new Error(error.message);
        if (data?.error) throw new Error(data.error);

        n += 1;
        totals += Number(data?.count ?? 0);
        setBatches(n);
        setTotalProcessed(totals);

        hasNext = !!data?.hasNextPage;
        cursor = data?.nextCursor ?? null;
        if (hasNext && !cursor) break;
      }

      const after = await fetchNullCount();
      if (after !== null) setNullAfter(after);
      toast.success(`Sincronización completa — ${totals} productos en ${n} lotes`);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastError(msg);
      toast.error(`Error en sync-products: ${msg}`);
      const after = await fetchNullCount();
      if (after !== null) setNullAfter(after);
    } finally {
      setRunning(false);
    }
  };

  if (roleLoading || !isAdmin) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackageSearch className="h-4 w-4" /> Sincronizar Catálogo de Productos
            </CardTitle>
            <CardDescription>
              Repuebla product_catalog (incluye collection_season) leyendo metafields desde Shopify.
            </CardDescription>
          </div>
          {running ? (
            <Badge className="gap-1.5 bg-primary/10 text-primary hover:bg-primary/15 border-primary/20">
              <Loader2 className="h-3 w-3 animate-spin" /> En progreso
            </Badge>
          ) : lastError ? (
            <Badge variant="destructive" className="gap-1.5">
              <AlertCircle className="h-3 w-3" /> Error
            </Badge>
          ) : batches > 0 ? (
            <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 border-emerald-500/20">
              <CheckCircle2 className="h-3 w-3" /> Completado
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <Clock className="h-3 w-3" /> Inactivo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric label="Lotes procesados" value={batches.toLocaleString("es-CO")} />
          <Metric label="Productos procesados" value={totalProcessed.toLocaleString("es-CO")} />
          <Metric
            label="Sin colección (antes)"
            value={nullBefore === null ? "—" : nullBefore.toLocaleString("es-CO")}
          />
          <Metric
            label="Sin colección (ahora)"
            value={nullAfter === null ? (nullBefore === null ? "—" : nullBefore.toLocaleString("es-CO")) : nullAfter.toLocaleString("es-CO")}
          />
        </div>

        {running && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Procesando lote {batches + 1}… ({totalProcessed.toLocaleString("es-CO")} productos acumulados)
          </div>
        )}

        {lastError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {lastError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button onClick={runSync} disabled={running} className="gap-2">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {running ? "Sincronizando catálogo..." : "Sincronizar catálogo ahora"}
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const c = await fetchNullCount();
              if (c !== null) {
                setNullBefore(c);
                setNullAfter(null);
              }
            }}
            disabled={running}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Refrescar conteo
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          El frontend orquesta la paginación por cursor invocando sync-products lote por lote. El token de Shopify se lee
          del entorno de la Edge Function; no viaja desde el navegador.
        </p>
      </CardContent>
    </Card>
  );
}
