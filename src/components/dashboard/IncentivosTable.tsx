import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Pencil, Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { IncentivosEditDialog } from "./IncentivosEditDialog";

interface Incentivo {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  alcance: string;
  estado: string | null;
}

interface Props {
  refreshKey: number;
}

export function IncentivosTable({ refreshKey }: Props) {
  const [data, setData] = useState<Incentivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Incentivo | null>(null);
  const [calculatingId, setCalculatingId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("incentivos")
      .select("id, nombre, fecha_inicio, fecha_fin, alcance, estado")
      .order("created_at", { ascending: false });
    setData((rows as Incentivo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  const handleCalcular = async (id: string) => {
    setCalculatingId(id);
    try {
      const { error } = await supabase.rpc("actualizar_progreso_incentivo", {
        p_incentivo_id: id,
      });
      if (error) throw error;
      toast.success("Progreso calculado exitosamente");
    } catch (err: any) {
      toast.error("Error al calcular progreso: " + (err.message || "desconocido"));
    } finally {
      setCalculatingId(null);
    }
  };

  const estadoBadge = (estado: string | null) => {
    switch (estado) {
      case "activo":
        return <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 hover:bg-[hsl(var(--success))]/20">Activo</Badge>;
      case "finalizado":
        return <Badge variant="secondary">Finalizado</Badge>;
      case "pausado":
        return <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 hover:bg-[hsl(var(--warning))]/20">Pausado</Badge>;
      default:
        return <Badge variant="outline">{estado ?? "—"}</Badge>;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Campañas de Incentivos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No hay incentivos configurados aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead>Fin</TableHead>
                    <TableHead>Alcance</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.nombre}</TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {new Date(row.fecha_inicio + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {new Date(row.fecha_fin + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] capitalize">{row.alcance}</Badge>
                      </TableCell>
                      <TableCell>{estadoBadge(row.estado)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditItem(row)}
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1"
                            disabled={calculatingId === row.id}
                            onClick={() => handleCalcular(row.id)}
                          >
                            {calculatingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Calculator className="h-3.5 w-3.5" />
                            )}
                            Calcular Progreso
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editItem && (
        <IncentivosEditDialog
          incentivo={editItem}
          open={!!editItem}
          onOpenChange={(v) => { if (!v) setEditItem(null); }}
          onSaved={() => { setEditItem(null); fetchData(); }}
        />
      )}
    </>
  );
}
