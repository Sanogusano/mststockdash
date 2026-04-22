import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Database, FileSpreadsheet, History } from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { UploadDropzone } from "@/components/netsuite/UploadDropzone";
import { SnapshotPreview } from "@/components/netsuite/SnapshotPreview";
import { SnapshotHistoryTable } from "@/components/netsuite/SnapshotHistoryTable";
import {
  fetchActiveSnapshot,
  fetchSnapshotHistory,
} from "@/lib/snapshot-api";
import type { NetsuiteSnapshotData } from "@/lib/parse-netsuite-xls";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-CO");

const formatDate = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export default function NetsuiteUpload() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [parsed, setParsed] = useState<NetsuiteSnapshotData | null>(null);

  // Guard de admin
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Acceso restringido a administradores");
      navigate("/", { replace: true });
    }
  }, [isAdmin, roleLoading, navigate]);

  const activeQ = useQuery({
    queryKey: ["snapshot-active"],
    queryFn: fetchActiveSnapshot,
    enabled: isAdmin,
  });

  const historyQ = useQuery({
    queryKey: ["snapshot-history"],
    queryFn: () => fetchSnapshotHistory(20),
    enabled: isAdmin,
  });

  const handleSuccess = () => {
    setParsed(null);
    qc.invalidateQueries({ queryKey: ["snapshot-active"] });
    qc.invalidateQueries({ queryKey: ["snapshot-history"] });
  };

  if (roleLoading || !isAdmin) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
        Verificando permisos...
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="border-b bg-background sticky top-0 z-10">
            <div className="flex items-center gap-3 px-6 py-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-lg font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  Inventario NetSuite
                </h1>
                <p className="text-xs text-muted-foreground">
                  Sube y gestiona snapshots de inventario para el motor de
                  allocation
                </p>
              </div>
            </div>
          </header>

          <div className="px-6 py-6 space-y-6 max-w-7xl mx-auto">
            {/* Snapshot activo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Snapshot activo
                </CardTitle>
                <CardDescription>
                  El allocation usará este snapshot como referencia de
                  inventario.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activeQ.isLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : activeQ.data ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Stat
                        label="Fecha"
                        value={formatDate(activeQ.data.snapshot_date)}
                      />
                      <Stat label="SKUs" value={fmt(activeQ.data.total_skus)} />
                      <Stat
                        label="Unidades"
                        value={fmt(activeQ.data.total_units)}
                      />
                      <Stat
                        label="Ubicaciones"
                        value={fmt(activeQ.data.total_locations)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      {activeQ.data.file_name} —{" "}
                      {new Date(activeQ.data.uploaded_at).toLocaleString(
                        "es-CO",
                        {
                          dateStyle: "short",
                          timeStyle: "short",
                        }
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    No hay snapshot activo. Sube uno para empezar.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upload o Preview */}
            {!parsed ? (
              <UploadDropzone onParsed={setParsed} />
            ) : (
              <SnapshotPreview
                data={parsed}
                onSuccess={handleSuccess}
                onCancel={() => setParsed(null)}
              />
            )}

            {/* Historial */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Historial de snapshots
                </CardTitle>
                <CardDescription>
                  Últimos 20 snapshots cargados. Solo uno puede estar activo a
                  la vez.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {historyQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10" />
                    ))}
                  </div>
                ) : (
                  <SnapshotHistoryTable rows={historyQ.data || []} />
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{value}</p>
    </div>
  );
}
