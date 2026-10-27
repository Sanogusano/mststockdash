import { useState } from "react";
import { AlertTriangle, ArrowRight, Link2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  updateMappingLocationName,
  type LocationMatchReport,
} from "@/lib/snapshot-api";

const fmt = (n: number) => n.toLocaleString("es-CO");

interface Props {
  report: LocationMatchReport;
  onClose: () => void;
}

export function LocationMatchSummary({ report, onClose }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Set<string>>(new Set());

  const ids = report.partial.map((p) => p.internalLocationId);
  const namesQ = useQuery({
    queryKey: ["locations-names", ids.slice().sort()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, string>();
      (data || []).forEach((l: any) => m.set(l.id, l.name ?? l.nombre ?? l.id));
      return m;
    },
  });

  if (report.partial.length === 0 && report.unmapped.length === 0) return null;

  const handleUpdate = async (oldName: string, newName: string) => {
    setUpdating(newName);
    try {
      await updateMappingLocationName(oldName, newName);
      setUpdated((s) => new Set(s).add(newName));
      toast.success(`Mapeo actualizado a "${newName}"`);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo actualizar el mapeo");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Resultado del cruce de ubicaciones</CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {report.partial.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Ubicaciones cruzadas por nombre parcial
            </p>
            <ul className="divide-y rounded-md border">
              {report.partial.map((p) => {
                const done = updated.has(p.fileName);
                return (
                  <li key={p.fileName} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <span className="font-mono text-xs">{p.fileName}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">
                      {namesQ.data?.get(p.internalLocationId) ?? p.mappingName}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {fmt(p.units)} und
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto"
                      disabled={done || updating === p.fileName}
                      onClick={() => handleUpdate(p.mappingName, p.fileName)}
                    >
                      {updating === p.fileName && (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      )}
                      {done ? "Nombre actualizado" : "Actualizar nombre en el mapeo"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {report.unmapped.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Ubicaciones sin mapear
            </p>
            <ul className="divide-y rounded-md border border-amber-300 bg-amber-50">
              {report.unmapped.map((u) => (
                <li
                  key={u.fileName}
                  className="flex items-center justify-between p-3 text-sm text-amber-900"
                >
                  <span className="font-mono text-xs">{u.fileName}</span>
                  <span className="tabular-nums">{fmt(u.units)} und</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
