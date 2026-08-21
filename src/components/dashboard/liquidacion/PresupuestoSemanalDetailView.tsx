import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { exportToCSV } from "@/lib/csv-export";
import { exportToXLS } from "@/lib/xls-export";
import type { LiquidacionRow, CampanaResumen } from "./types";

type FilterCumple = "todos" | "cumple" | "no_cumple";

interface WeekRow {
  id: string;
  entidad: string;
  nombre: string;
  semana: number;
  semana_inicio: string;
  semana_fin: string;
  dias_semana: number;
  meta_semana: number;
  venta_lograda: number;
  cumplimiento_pct: number;
  cumple_meta: boolean | null;
  monto_ganado: number | null;
}

interface Props {
  campana: CampanaResumen;
  rows: LiquidacionRow[];
  locMap: Map<string, string>;
}

const ENTIDAD_LABEL: Record<string, string> = {
  tiendas: "Tiendas físicas",
  online: "Tienda Online",
  personal_shopper: "Personal Shopper",
};

const fmt = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtDate = (d: string) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—";

export function PresupuestoSemanalDetailView({ campana, rows, locMap }: Props) {
  const [filterCumple, setFilterCumple] = useState<FilterCumple>("todos");

  const weekRows: WeekRow[] = useMemo(
    () =>
      rows.map((r) => {
        const p = (r.progreso_actual ?? {}) as Record<string, any>;
        const meta = Number(p.meta_semana ?? 0);
        const lograda = Number(p.venta_lograda ?? 0);
        return {
          id: r.id,
          entidad: String(p.entidad ?? "tiendas"),
          nombre: String(p.nombre ?? locMap.get(r.location_id ?? "") ?? r.location_id ?? "—"),
          semana: Number(p.semana ?? 0),
          semana_inicio: String(p.semana_inicio ?? ""),
          semana_fin: String(p.semana_fin ?? ""),
          dias_semana: Number(p.dias_semana ?? 7),
          meta_semana: meta,
          venta_lograda: lograda,
          cumplimiento_pct: Number(p.cumplimiento_pct ?? (meta > 0 ? (lograda / meta) * 100 : 0)),
          cumple_meta: r.cumple_meta,
          monto_ganado: r.monto_ganado,
        };
      }),
    [rows, locMap]
  );

  const filtered = weekRows.filter((w) =>
    filterCumple === "todos" ? true : filterCumple === "cumple" ? !!w.cumple_meta : !w.cumple_meta
  );

  const groups = useMemo(() => {
    const map = new Map<string, WeekRow[]>();
    filtered.forEach((w) => {
      const key = `${w.entidad}||${w.nombre}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(w);
    });
    return [...map.entries()]
      .map(([key, weeks]) => {
        const [entidad, nombre] = key.split("||");
        return {
          key,
          entidad,
          nombre,
          weeks: weeks.sort((a, b) => a.semana - b.semana),
          semanasCumplidas: weeks.filter((w) => w.cumple_meta).length,
          totalMonto: weeks.reduce((s, w) => s + (w.monto_ganado ?? 0), 0),
        };
      })
      .sort((a, b) => a.entidad.localeCompare(b.entidad) || a.nombre.localeCompare(b.nombre));
  }, [filtered]);

  const exportRows = groups.flatMap((g) =>
    g.weeks.map((w) => ({
      Entidad: ENTIDAD_LABEL[g.entidad] ?? g.entidad,
      Nombre: g.nombre,
      Semana: w.semana,
      Desde: w.semana_inicio,
      Hasta: w.semana_fin,
      Días: w.dias_semana,
      "Meta Semana": Math.round(w.meta_semana),
      "Venta Lograda": Math.round(w.venta_lograda),
      "% Cumplimiento": Math.round(w.cumplimiento_pct),
      "¿Cumple?": w.cumple_meta ? "Sí" : "No",
      "Monto Ganado": w.monto_ganado ?? 0,
    }))
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <ToggleGroup
          type="single"
          value={filterCumple}
          onValueChange={(v) => v && setFilterCumple(v as FilterCumple)}
          size="sm"
        >
          <ToggleGroupItem value="todos" className="text-xs">Todos</ToggleGroupItem>
          <ToggleGroupItem value="cumple" className="text-xs">Cumplen</ToggleGroupItem>
          <ToggleGroupItem value="no_cumple" className="text-xs">No cumplen</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToCSV(exportRows, `liquidacion_${campana.nombre}`)}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToXLS(exportRows, `liquidacion_${campana.nombre}`, "Liquidación")}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No hay semanas para mostrar.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.key} className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {ENTIDAD_LABEL[g.entidad] ?? g.entidad}
                  </Badge>
                  <p className="font-semibold text-sm">{g.nombre}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">
                    Semanas: <strong className="text-foreground">{g.semanasCumplidas}/{g.weeks.length}</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Total: <strong className="text-foreground tabular-nums">{fmt(g.totalMonto)}</strong>
                  </span>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Semana</TableHead>
                    <TableHead className="w-[140px]">Periodo</TableHead>
                    <TableHead className="w-[70px]">Días</TableHead>
                    <TableHead className="min-w-[200px]">Avance vs Meta</TableHead>
                    <TableHead>¿Cumple?</TableHead>
                    <TableHead className="text-right">Ganado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.weeks.map((w) => {
                    const avance = Math.max(0, Math.min(w.cumplimiento_pct, 100));
                    return (
                      <TableRow key={w.id}>
                        <TableCell className="font-medium text-sm">Sem {w.semana}</TableCell>
                        <TableCell className="text-xs text-muted-foreground tabular-nums">
                          {fmtDate(w.semana_inicio)} – {fmtDate(w.semana_fin)}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">
                          {w.dias_semana}
                          {w.dias_semana < 7 && (
                            <Badge variant="secondary" className="ml-1 text-[10px]">parcial</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{fmt(w.venta_lograda)}</span>
                              <span>{fmt(w.meta_semana)}</span>
                            </div>
                            <Progress
                              value={avance}
                              className="h-2.5"
                              indicatorClassName={
                                w.cumplimiento_pct >= 100
                                  ? "bg-[hsl(var(--success))]"
                                  : w.cumplimiento_pct >= 70
                                  ? "bg-[hsl(var(--warning))]"
                                  : "bg-destructive"
                              }
                            />
                            <p className="text-[10px] text-muted-foreground text-right">
                              {w.cumplimiento_pct.toFixed(1)}%
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {w.cumple_meta ? (
                            <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">Sí</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-sm">
                          {fmt(w.monto_ganado ?? 0)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
