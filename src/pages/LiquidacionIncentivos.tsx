import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { exportToXLS } from "@/lib/xls-export";

interface LiquidacionRow {
  id: string;
  tienda: string;
  campana: string;
  progreso_actual: Record<string, unknown> | null;
  cumple_meta: boolean | null;
  monto_ganado: number | null;
}

export default function LiquidacionIncentivosPage() {
  const [data, setData] = useState<LiquidacionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch liquidaciones
      const { data: liq } = await supabase
        .from("incentivo_liquidaciones")
        .select("id, incentivo_id, location_id, progreso_actual, cumple_meta, monto_ganado");

      if (!liq || liq.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      // Get unique ids for joins
      const incentivoIds = [...new Set(liq.map((r) => r.incentivo_id))];
      const locationIds = [...new Set(liq.map((r) => r.location_id).filter(Boolean))];

      const [incRes, locRes] = await Promise.all([
        supabase.from("incentivos").select("id, nombre").in("id", incentivoIds),
        locationIds.length > 0
          ? supabase.from("locations").select("location_id, name").in("location_id", locationIds)
          : Promise.resolve({ data: [] }),
      ]);

      const incMap = new Map((incRes.data ?? []).map((i) => [i.id, i.nombre]));
      const locMap = new Map((locRes.data ?? []).map((l) => [l.location_id, l.name]));

      const rows: LiquidacionRow[] = liq.map((r) => ({
        id: r.id,
        tienda: locMap.get(r.location_id ?? "") ?? r.location_id ?? "—",
        campana: incMap.get(r.incentivo_id) ?? r.incentivo_id,
        progreso_actual: r.progreso_actual as Record<string, unknown> | null,
        cumple_meta: r.cumple_meta,
        monto_ganado: r.monto_ganado,
      }));

      setData(rows);
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatProgreso = (p: Record<string, unknown> | null) => {
    if (!p || Object.keys(p).length === 0) return "—";
    return Object.entries(p)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  };

  const exportRows = data.map((r) => ({
    Tienda: r.tienda,
    Campaña: r.campana,
    "Progreso Actual": formatProgreso(r.progreso_actual),
    "¿Cumple Meta?": r.cumple_meta ? "Sí" : "No",
    "Monto Ganado": r.monto_ganado ?? 0,
  }));

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Liquidación de Incentivos</h1>
                <p className="text-sm text-muted-foreground">Resultados de campañas por tienda</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToCSV(exportRows, "liquidacion_incentivos")}>
                  <Download className="h-3.5 w-3.5" /> CSV
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToXLS(exportRows, "liquidacion_incentivos", "Liquidación")}>
                  <Download className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Detalle de Liquidaciones</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : data.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay liquidaciones registradas.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tienda</TableHead>
                          <TableHead>Campaña</TableHead>
                          <TableHead>Progreso Actual</TableHead>
                          <TableHead>¿Cumple Meta?</TableHead>
                          <TableHead className="text-right">Monto Ganado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.tienda}</TableCell>
                            <TableCell>{row.campana}</TableCell>
                            <TableCell className="text-sm max-w-[240px] truncate">{formatProgreso(row.progreso_actual)}</TableCell>
                            <TableCell>
                              {row.cumple_meta ? (
                                <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                              ) : (
                                <Badge variant="secondary">No</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              ${(row.monto_ganado ?? 0).toLocaleString("es-CO")}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
