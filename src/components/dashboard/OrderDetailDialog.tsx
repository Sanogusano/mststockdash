import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, FileText } from "lucide-react";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { resolveDays } from "@/components/dashboard/TimeFilter";
import { LoadingState } from "./LoadingState";

interface OrderRow {
  numero_pedido: string;
  fecha: string;
  sucursal: string;
  producto: string;
  sku: string;
  cantidad: number;
  precio: number;
  descuento_otorgado: number;
  tipo_venta: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: "full_price" | "descuento";
  days: number;
  canal: string;
  locationId: string | null;
}

export function OrderDetailDialog({ open, onOpenChange, tipo, days, canal, locationId }: Props) {
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const effectiveDays = resolveDays(days);
    supabase.rpc("reporte_pedidos_por_tipo_venta", {
      dias_atras: effectiveDays,
      p_canal: canal,
      p_location_id: locationId,
      p_tipo: tipo,
    }).then(({ data: rows }) => {
      if (rows) setData(rows as unknown as OrderRow[]);
      setLoading(false);
    });
  }, [open, tipo, days, canal, locationId]);

  const title = tipo === "full_price" ? "Pedidos Full Price" : "Pedidos con Descuento";
  const exportData = data.map(r => ({
    Pedido: r.numero_pedido,
    Fecha: new Date(r.fecha).toLocaleDateString("es-CO"),
    Sucursal: r.sucursal,
    Producto: r.producto,
    SKU: r.sku,
    Cantidad: r.cantidad,
    Precio: r.precio,
    Descuento: r.descuento_otorgado,
    Tipo: r.tipo_venta,
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{title}</span>
            {data.length > 0 && (
              <div className="flex items-center gap-1">
                <button onClick={() => exportToCSV(exportData as any, `pedidos_${tipo}_${days}d`)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button onClick={() => exportToPDF(exportData as any, `pedidos_${tipo}_${days}d`, title)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  <FileText className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <LoadingState rows={5} />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin pedidos para mostrar.</p>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 sticky top-0">
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Pedido</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sucursal</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Producto</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Cant</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Precio</th>
                  {tipo === "descuento" && (
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Descuento</th>
                  )}
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">{row.numero_pedido}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{new Date(row.fecha).toLocaleDateString("es-CO")}</td>
                    <td className="px-3 py-2">{row.sucursal}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{row.producto}</td>
                    <td className="px-3 py-2 text-right">{row.cantidad}</td>
                    <td className="px-3 py-2 text-right">{new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(row.precio)}</td>
                    {tipo === "descuento" && (
                      <td className="px-3 py-2 text-right text-orange-500 font-medium">
                        {new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(row.descuento_otorgado)}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.tipo_venta === "Full Precio" ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-500"
                      }`}>
                        {row.tipo_venta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
