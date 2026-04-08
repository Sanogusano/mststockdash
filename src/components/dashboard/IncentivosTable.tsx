import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

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

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data: rows } = await supabase
        .from("incentivos")
        .select("id, nombre, fecha_inicio, fecha_fin, alcance, estado")
        .order("created_at", { ascending: false });
      setData((rows as Incentivo[]) ?? []);
      setLoading(false);
    };
    fetch();
  }, [refreshKey]);

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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
