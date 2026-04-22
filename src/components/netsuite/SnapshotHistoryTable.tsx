import { useState } from "react";
import { CheckCircle2, Loader2, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  activateSnapshot,
  deleteSnapshot,
  type SnapshotRow,
} from "@/lib/snapshot-api";

interface Props {
  rows: SnapshotRow[];
}

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-CO");

const formatDate = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
};

export function SnapshotHistoryTable({ rows }: Props) {
  const qc = useQueryClient();
  const [actingId, setActingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SnapshotRow | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["snapshot-history"] });
    qc.invalidateQueries({ queryKey: ["snapshot-active"] });
  };

  const handleActivate = async (row: SnapshotRow) => {
    setActingId(row.id);
    try {
      await activateSnapshot(row.id);
      toast.success(`Snapshot del ${formatDate(row.snapshot_date)} activado`);
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al activar");
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    const row = toDelete;
    setToDelete(null);
    setActingId(row.id);
    try {
      await deleteSnapshot(row.id);
      toast.success("Snapshot eliminado");
      refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Error al eliminar");
    } finally {
      setActingId(null);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Aún no hay snapshots cargados.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead className="text-right">SKUs</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
              <TableHead className="text-right">Ubicaciones</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Subido</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {formatDate(row.snapshot_date)}
                </TableCell>
                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                  {row.file_name}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(row.total_skus)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(row.total_units)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(row.total_locations)}
                </TableCell>
                <TableCell>
                  <StatusBadge row={row} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(row.uploaded_at).toLocaleString("es-CO", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    {!row.is_active && row.status === "processed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleActivate(row)}
                        disabled={actingId === row.id}
                      >
                        {actingId === row.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Power className="h-3 w-3" />
                        )}
                        <span className="ml-1">Activar</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setToDelete(row)}
                      disabled={actingId === row.id}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el snapshot del{" "}
              {toDelete && formatDate(toDelete.snapshot_date)} (
              {fmt(toDelete?.total_skus)} SKUs). Esta acción es irreversible y
              borrará todos los registros de inventario asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatusBadge({ row }: { row: SnapshotRow }) {
  if (row.status === "error") {
    return <Badge variant="destructive">Error</Badge>;
  }
  if (row.status !== "processed") {
    return <Badge variant="secondary">{row.status}</Badge>;
  }
  if (row.is_active) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Activo
      </Badge>
    );
  }
  return <Badge variant="outline">Inactivo</Badge>;
}
