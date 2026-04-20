import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import type { CampanaResumen } from "./types";

interface Props {
  campanas: CampanaResumen[];
  onSelect: (id: string) => void;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};

const tipoReglaLabel = (t: string) => {
  if (t === "presupuesto_semanal_dual") return "Semanal Dual";
  if (t === "venta_categoria") return "Venta Categoría";
  if (t === "venta_sku") return "Venta SKU";
  if (t === "ticket_minimo") return "Ticket Mínimo";
  if (t === "upt_minimo") return "UPT Mínimo";
  if (t === "numero_pedidos") return "Número de Pedidos";
  return t;
};

export function CampanasListView({ campanas, onSelect }: Props) {
  if (campanas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No hay liquidaciones registradas. Usa "Calcular Progreso" en una campaña activa.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaña</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Periodo</TableHead>
          <TableHead>Alcance</TableHead>
          <TableHead>Cumplimiento</TableHead>
          <TableHead className="text-right">Total Ganado</TableHead>
          <TableHead className="w-[120px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {campanas.map((c) => {
          const cumplimiento =
            c.tipo_regla === "presupuesto_semanal_dual"
              ? `${c.semanasCumplidas ?? 0}/${c.totalSemanas ?? 0} semanas`
              : `${c.cumplenMeta}/${c.totalParticipantes} ${c.alcance === "vendedor" ? "asesores" : "tiendas"}`;
          return (
            <TableRow key={c.incentivo_id}>
              <TableCell className="font-medium text-sm">{c.nombre}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-[10px]">{tipoReglaLabel(c.tipo_regla)}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground tabular-nums">
                {fmtDate(c.fecha_inicio)} – {fmtDate(c.fecha_fin)}
              </TableCell>
              <TableCell className="text-xs capitalize">{c.alcance}</TableCell>
              <TableCell className="text-xs tabular-nums">{cumplimiento}</TableCell>
              <TableCell className="text-right tabular-nums font-medium text-sm">{fmt(c.totalGanado)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="gap-1" onClick={() => onSelect(c.incentivo_id)}>
                  Ver detalle <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
