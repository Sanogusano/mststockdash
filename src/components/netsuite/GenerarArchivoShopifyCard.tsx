import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, Download, Info } from "lucide-react";
import { toast } from "sonner";
import { generarArchivoShopify, type ArchivoShopifyRow } from "@/lib/snapshot-api";

const fmt = (n: number) => n.toLocaleString("es-CO");

export function GenerarArchivoShopifyCard() {
  const [rows, setRows] = useState<ArchivoShopifyRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerar() {
    setLoading(true);
    try {
      const data = await generarArchivoShopify();
      setRows(data);
      if (data.length === 0) {
        toast.info("No hay diferencias que actualizar en Shopify.");
      }
    } catch (e: any) {
      toast.error(`Error al generar: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  function descargarMatrixify() {
    if (!rows || rows.length === 0) return;
    try {
      // Pivotar: una fila por variante (Variant SKU) con una columna por ubicación.
      const ubicaciones = Array.from(
        new Set(rows.map((r) => r.ubicacion_shopify))
      ).sort();

      // Agrupar por SKU
      const porSku = new Map<
        string,
        { producto: string; celdas: Record<string, number> }
      >();
      for (const r of rows) {
        let entry = porSku.get(r.sku);
        if (!entry) {
          entry = { producto: r.producto ?? "", celdas: {} };
          porSku.set(r.sku, entry);
        }
        entry.celdas[r.ubicacion_shopify] = r.disponible_netsuite;
      }

      // Cabecera formato Matrixify: Variant SKU + "Inventory Available: <ubicación>"
      const headers = [
        "Variant SKU",
        "Title",
        ...ubicaciones.map((u) => `Inventory Available: ${u}`),
      ];

      const escape = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const lines = [headers.join(",")];
      for (const [sku, data] of porSku) {
        const cols = [
          sku,
          data.producto,
          ...ubicaciones.map((u) =>
            u in data.celdas ? String(data.celdas[u]) : ""
          ),
        ];
        lines.push(cols.map(escape).join(","));
      }

      const blob = new Blob(["\ufeff" + lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const fecha = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `shopify-inventario-matrixify-${fecha}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Error al descargar: ${e.message ?? e}`);
    }
  }

  const variantes = rows
    ? new Set(rows.map((r) => r.sku)).size
    : 0;
  const ubicacionesCount = rows
    ? new Set(rows.map((r) => r.ubicacion_shopify)).size
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" />
          Paso 3 — Generar archivo para actualizar Shopify
        </CardTitle>
        <CardDescription>
          Crea el archivo de inventario en formato Matrixify con las cantidades
          de NetSuite, solo para lo que difiere del inventario actual de
          Shopify. Actualiza el campo "Disponible" respetando tránsito y
          preparación de pedidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!rows && (
          <Button onClick={handleGenerar} disabled={loading} className="gap-2">
            <FileDown className="h-4 w-4" />
            {loading ? "Calculando diferencias…" : "Generar archivo"}
          </Button>
        )}

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Actualizaciones</p>
                <p className="text-xl font-semibold tabular-nums">
                  {fmt(rows.length)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Productos</p>
                <p className="text-xl font-semibold tabular-nums">
                  {fmt(variantes)}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ubicaciones</p>
                <p className="text-xl font-semibold tabular-nums">
                  {fmt(ubicacionesCount)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/20 p-3">
              <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                El archivo trae solo los productos y ubicaciones cuyo Disponible
                cambia según NetSuite. Los que NetSuite no reporta no se incluyen
                (Shopify los deja intactos). Súbelo en Matrixify como
                actualización de inventario.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={descargarMatrixify} className="gap-2">
                <Download className="h-4 w-4" />
                Descargar CSV Matrixify
              </Button>
              <Button
                variant="outline"
                onClick={() => setRows(null)}
              >
                Volver a calcular
              </Button>
            </div>

            {/* Vista previa */}
            <div className="overflow-x-auto rounded-lg border max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Ubicación</th>
                    <th className="px-3 py-2 text-right">Shopify</th>
                    <th className="px-3 py-2 text-right">NetSuite</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-xs">
                        {r.producto ?? r.sku}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.ubicacion_shopify}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {fmt(r.disponible_shopify_antes)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
                        {fmt(r.disponible_netsuite)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && (
                <p className="text-xs text-muted-foreground p-2 text-center border-t">
                  Mostrando 200 de {fmt(rows.length)}. El CSV trae todo.
                </p>
              )}
            </div>
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <Info className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800">
              No hay diferencias que actualizar — Shopify ya coincide con
              NetSuite. (Recuerda: primero concilia en el Paso 2, luego genera
              este archivo.)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
