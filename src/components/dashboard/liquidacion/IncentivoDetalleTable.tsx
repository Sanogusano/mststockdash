import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  incentivoId: string;
  vendedorId?: string | null;
  locationId?: string | null;
}

export interface DetalleLinea {
  fecha: string;
  pedido: string;
  vendedor: string;
  tienda: string;
  producto: string;
  sku: string;
  categoria: string;
  unidades: number;
  precio: number;
  descuento: number;
  venta_neta: number;
  tipo_venta: string;
  cuenta: boolean;
  monto: number;
}

const fmt = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const fmtFecha = (d: string) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" }) : "—";

export function motivoNoCuenta(l: DetalleLinea): string {
  if (l.cuenta) return "";
  if (l.tipo_venta === "PROMO") return "Descuento manual en el pedido";
  if (l.tipo_venta === "REBAJA") return "Rebaja de catálogo";
  return "Fuera del alcance del incentivo";
}

export async function fetchIncentivoDetalle(
  incentivoId: string,
  vendedorId?: string | null,
  locationId?: string | null
): Promise<DetalleLinea[]> {
  const { data, error } = await supabase.rpc("incentivo_detalle", {
    p_incentivo_id: incentivoId,
    ...(vendedorId ? { p_vendedor_id: vendedorId } : {}),
    ...(locationId ? { p_location_id: locationId } : {}),
  });
  if (error) throw error;
  return (data ?? []) as unknown as DetalleLinea[];
}

/** Convierte líneas del RPC en filas para la hoja "Pedidos" del export. */
export function detalleToSheetRows(lineas: DetalleLinea[]): Record<string, unknown>[] {
  return lineas.map((l) => ({
    Fecha: l.fecha,
    Pedido: l.pedido,
    Vendedor: l.vendedor,
    Tienda: l.tienda,
    Producto: l.producto,
    SKU: l.sku,
    Categoría: l.categoria,
    Unidades: Number(l.unidades) || 0,
    Precio: Number(l.precio) || 0,
    Descuento: Number(l.descuento) || 0,
    "Venta Neta": Number(l.venta_neta) || 0,
    "Tipo Venta": l.tipo_venta,
    "¿Cuenta?": l.cuenta ? "Sí" : "No",
    Motivo: l.cuenta ? "" : motivoNoCuenta(l),
    Monto: Number(l.monto) || 0,
  }));
}

/** Trae el detalle del incentivo para varios participantes y lo aplana. */
export async function fetchDetalleSheetRows(
  incentivoId: string,
  refs: { refId: string; isAsesor: boolean }[]
): Promise<Record<string, unknown>[]> {
  const results = await Promise.all(
    refs
      .filter((r) => r.refId)
      .map((r) =>
        fetchIncentivoDetalle(
          incentivoId,
          r.isAsesor ? r.refId : null,
          r.isAsesor ? null : r.refId
        ).catch(() => [] as DetalleLinea[])
      )
  );
  return detalleToSheetRows(results.flat());
}

const tipoBadge = (t: string) => {
  if (t === "FULL") return <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">FULL</Badge>;
  if (t === "PROMO") return <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]">PROMO</Badge>;
  return <Badge variant="secondary">REBAJA</Badge>;
};

export function IncentivoDetalleTable({ incentivoId, vendedorId, locationId }: Props) {
  const [lineas, setLineas] = useState<DetalleLinea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    fetchIncentivoDetalle(incentivoId, vendedorId, locationId)
      .then((d) => !cancel && setLineas(d))
      .catch((e) => !cancel && setError(e.message ?? String(e)))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [incentivoId, vendedorId, locationId]);

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error) return <p className="text-xs text-destructive py-2">Error: {error}</p>;
  if (lineas.length === 0)
    return <p className="text-xs text-muted-foreground py-3 text-center">Sin líneas en el periodo.</p>;

  const cuentan = lineas.filter((l) => l.cuenta);
  const totalUnidades = cuentan.reduce((s, l) => s + (Number(l.unidades) || 0), 0);
  const totalMonto = cuentan.reduce((s, l) => s + (Number(l.monto) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center text-xs">
        <Badge className="bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
          {cuentan.length} líneas cuentan · {totalUnidades} uds
        </Badge>
        <Badge variant="secondary">Monto: {fmt(totalMonto)}</Badge>
        <Badge variant="outline">{lineas.length - cuentan.length} no cuentan</Badge>
      </div>
      <div className="border rounded-md overflow-x-auto max-h-[420px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Pedido</TableHead>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs">Categoría</TableHead>
              <TableHead className="text-xs text-center">Uds</TableHead>
              <TableHead className="text-xs text-right">Venta neta</TableHead>
              <TableHead className="text-xs text-center">Tipo</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((l, i) => (
              <TableRow key={`${l.pedido}-${l.sku}-${i}`} className={l.cuenta ? "" : "opacity-50 bg-muted/30"}>
                <TableCell className="text-xs whitespace-nowrap">{fmtFecha(l.fecha)}</TableCell>
                <TableCell className="text-xs">{l.pedido}</TableCell>
                <TableCell className="text-xs max-w-[220px] truncate">{l.producto}</TableCell>
                <TableCell className="text-xs">{l.sku}</TableCell>
                <TableCell className="text-xs">{l.categoria}</TableCell>
                <TableCell className="text-xs text-center tabular-nums">{l.unidades}</TableCell>
                <TableCell className="text-xs text-right tabular-nums">{fmt(l.venta_neta)}</TableCell>
                <TableCell className="text-xs text-center">{tipoBadge(l.tipo_venta)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {l.cuenta ? "Cuenta" : `No cuenta — ${motivoNoCuenta(l)}`}
                </TableCell>
                <TableCell className="text-xs text-right tabular-nums font-medium">{fmt(l.monto)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
