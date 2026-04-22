import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  uploadSnapshot,
  existsActiveSnapshotForDate,
} from "@/lib/snapshot-api";
import type { NetsuiteSnapshotData } from "@/lib/parse-netsuite-xls";

interface Props {
  data: NetsuiteSnapshotData;
  onSuccess: () => void;
  onCancel: () => void;
}

const fmt = (n: number) => n.toLocaleString("es-CO");

export function SnapshotPreview({ data, onSuccess, onCancel }: Props) {
  const [snapshotDate, setSnapshotDate] = useState(data.snapshotDate);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmReplace, setConfirmReplace] = useState<{ date: string } | null>(
    null
  );

  const doUpload = async () => {
    setUploading(true);
    setProgress(0);
    try {
      await uploadSnapshot(
        {
          fileName: data.fileName,
          snapshotDate,
          totalSkus: data.totalSkus,
          totalUnits: data.totalUnits,
          totalLocations: data.totalLocations,
          lines: data.lines,
        },
        (pct) => setProgress(pct)
      );
      toast.success(`Snapshot guardado: ${fmt(data.totalSkus)} SKUs`);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al guardar el snapshot");
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    const existing = await existsActiveSnapshotForDate(snapshotDate);
    if (existing) {
      setConfirmReplace({ date: snapshotDate });
      return;
    }
    doUpload();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Vista previa del snapshot</span>
            <span className="text-xs font-normal text-muted-foreground">
              {data.fileName}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Fecha */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fecha del snapshot</Label>
              <Input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                disabled={uploading}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox label="SKUs únicos" value={fmt(data.totalSkus)} />
            <StatBox label="Unidades totales" value={fmt(data.totalUnits)} />
            <StatBox
              label="Ubicaciones con stock"
              value={fmt(data.totalLocations)}
            />
            <StatBox label="Líneas a guardar" value={fmt(data.lines.length)} />
          </div>

          {/* Warnings */}
          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
              <div className="flex gap-2 items-start">
                <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-yellow-900 dark:text-yellow-200">
                    Advertencias
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    {data.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  {(data as any).unmappedLocations?.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-yellow-700 dark:text-yellow-300">
                        Ver ubicaciones sin mapeo
                      </summary>
                      <ul className="mt-2 text-xs space-y-0.5 ml-4">
                        {(data as any).unmappedLocations.map((n: string) => (
                          <li key={n} className="text-muted-foreground">
                            • {n}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Top 10 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopList title="Top ubicaciones" items={data.topLocations} />
            <TopList title="Top líneas" items={data.topLineas} />
          </div>

          {/* Progress */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Subiendo líneas...
                </span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 justify-end pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={uploading}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar y guardar
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!confirmReplace}
        onOpenChange={(open) => !open && setConfirmReplace(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar snapshot existente?</AlertDialogTitle>
            <AlertDialogDescription>
              Ya existe un snapshot activo del {confirmReplace?.date}. Si
              continúas, el actual quedará marcado como inactivo y este nuevo
              snapshot lo reemplazará. El historial se mantendrá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmReplace(null);
                doUpload();
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: { name: string; units: number }[];
}) {
  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b bg-muted/30">
        <p className="text-xs font-semibold">{title}</p>
      </div>
      <ul className="divide-y">
        {items.map((it) => (
          <li
            key={it.name}
            className="flex justify-between items-center px-3 py-1.5 text-xs"
          >
            <span className="truncate pr-2">{it.name}</span>
            <span className="font-medium tabular-nums">{fmt(it.units)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
