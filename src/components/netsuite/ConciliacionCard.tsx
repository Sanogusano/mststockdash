import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  GitCompareArrows,
  AlertTriangle,
  PackagePlus,
  CheckCircle2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import {
  previewConciliacion,
  aplicarConciliacion,
  fetchConciliacionLog,
  type ConciliacionPreviewRow,
  type ConciliacionLogRow,
} from "@/lib/snapshot-api";

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("es-CO");

export function ConciliacionCard({ snapshotId }: { snapshotId?: string | null }) {
  const [preview, setPreview] = useState<ConciliacionPreviewRow[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [log, setLog] = useState<ConciliacionLogRow[]>([]);
  const [resumen, setResumen] = useState<{
    actualizados: number;
    insertados: number;
    omitidos: number;
    discrepancias: number;
  } | null>(null);

  // Al cambiar el snapshot activo, el conteo previo queda obsoleto: se descarta
  // para forzar un recálculo contra el nuevo snapshot.
  useEffect(() => {
    setPreview(null);
    setApplied(false);
    setResumen(null);
    setLog([]);
  }, [snapshotId]);

  async function handlePreview() {
    setLoadingPreview(true);
    setApplied(false);
    try {
      const rows = await previewConciliacion();
      setPreview(rows);
    } catch (e: any) {
      toast.error(`Error al calcular el preview: ${e.message ?? e}`);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleApply() {
    setApplying(true);
    try {
      const res = await aplicarConciliacion();
      setResumen(res);
      setApplied(true);
      const logRows = await fetchConciliacionLog();
      setLog(logRows);
      toast.success(
        `Conciliación aplicada: ${fmt(res.actualizados)} actualizados, ${fmt(
          res.insertados
        )} agregados.`
      );
    } catch (e: any) {
      toast.error(`Error al aplicar la conciliación: ${e.message ?? e}`);
    } finally {
      setApplying(false);
    }
  }

  // Derivar cifras accionables del preview (excluye "coincide")
  const accionables = (preview ?? []).filter(
    (r) => !r.tipo.startsWith("a)")
  );
  const totalAccionable = accionables.reduce(
    (s, r) => s + Number(r.combinaciones),
    0
  );

  const tipoLabel: Record<string, string> = {
    "b) discrepancia": "Discrepancias de cantidad (gana NetSuite)",
    "c) ns_tiene_shopify_ausente": "NetSuite tiene, Shopify no lo ve (se agrega)",
    "d) omitido_por_ns": "Shopify tiene, NetSuite no lo lista (se revisa)",
  };

  const omitidos = log.filter((l) => l.tipo === "omitido");
  const discrepancias = log.filter((l) => l.tipo === "discrepancia");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4" />
          Paso 2 — Conciliar inventario con NetSuite
        </CardTitle>
        <CardDescription>
          Compara el snapshot activo de NetSuite contra el inventario actual de
          Shopify. Donde NetSuite tiene dato, se toma como fuente de verdad. Lo
          que NetSuite no lista se deja intacto y se muestra para tu revisión.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!preview && (
          <Button onClick={handlePreview} disabled={loadingPreview} className="gap-2">
            <GitCompareArrows className="h-4 w-4" />
            {loadingPreview ? "Calculando…" : "Ver qué cambiaría"}
          </Button>
        )}

        {loadingPreview && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}

        {preview && !applied && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr className="text-left">
                    <th className="px-3 py-2">Situación</th>
                    <th className="px-3 py-2 text-right">Combinaciones</th>
                    <th className="px-3 py-2 text-right">Uds. Shopify</th>
                    <th className="px-3 py-2 text-right">Uds. NetSuite</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => {
                    const esCoincide = r.tipo.startsWith("a)");
                    return (
                      <tr
                        key={r.tipo}
                        className={`border-t ${esCoincide ? "text-muted-foreground" : ""}`}
                      >
                        <td className="px-3 py-2">
                          {esCoincide
                            ? "Coinciden (no cambian)"
                            : tipoLabel[r.tipo] ?? r.tipo}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(Number(r.combinaciones))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(Number(r.uds_shopify))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(Number(r.uds_netsuite))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                Al aplicar, se escribirán los datos de NetSuite sobre el
                inventario de hoy en{" "}
                <span className="font-semibold">
                  {fmt(totalAccionable)} combinaciones
                </span>
                . Los productos que Shopify tiene y NetSuite no lista se dejan
                intactos y quedan listados para tu validación. Esta acción
                modifica el inventario que usan los reportes.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleApply}
                disabled={applying}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" />
                {applying ? "Aplicando…" : "Aplicar conciliación"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setPreview(null)}
                disabled={applying}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {applied && resumen && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800">
                Conciliación aplicada — {fmt(resumen.actualizados)} actualizados,{" "}
                {fmt(resumen.insertados)} agregados,{" "}
                {fmt(resumen.discrepancias)} discrepancias registradas,{" "}
                {fmt(resumen.omitidos)} omitidos para revisar.
              </p>
            </div>

            <Tabs defaultValue="omitidos">
              <TabsList>
                <TabsTrigger value="omitidos" className="gap-1.5">
                  <PackagePlus className="h-3.5 w-3.5" />
                  Omitidos ({fmt(omitidos.length)})
                </TabsTrigger>
                <TabsTrigger value="discrepancias" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Discrepancias ({fmt(discrepancias.length)})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="omitidos">
                <p className="text-xs text-muted-foreground mb-2">
                  Shopify reporta stock pero NetSuite no lista este
                  producto/ubicación. No se modificaron — valida si son
                  productos nuevos o si deberían estar en 0.
                </p>
                <LogTable rows={omitidos} mostrarNetsuite={false} nombreArchivo="conciliacion-omitidos" />
              </TabsContent>

              <TabsContent value="discrepancias">
                <p className="text-xs text-muted-foreground mb-2">
                  Cantidades que diferían entre los dos sistemas. Se aplicó el
                  valor de NetSuite.
                </p>
                <LogTable rows={discrepancias} mostrarNetsuite={true} nombreArchivo="conciliacion-discrepancias" />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogTable({
  rows,
  mostrarNetsuite,
  nombreArchivo,
}: {
  rows: ConciliacionLogRow[];
  mostrarNetsuite: boolean;
  nombreArchivo: string;
}) {
  function exportar() {
    try {
      const headers = mostrarNetsuite
        ? ["SKU", "Producto", "Color", "Talla", "Ubicacion", "Shopify", "NetSuite"]
        : ["SKU", "Producto", "Color", "Talla", "Ubicacion", "Shopify"];
      const escape = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(";")];
      for (const r of rows) {
        const cols = [
          r.sku ?? "",
          r.producto ?? "",
          r.color ?? "",
          r.talla ?? "",
          r.ubicacion,
          r.qty_shopify_antes ?? 0,
          ...(mostrarNetsuite ? [r.qty_netsuite ?? 0] : []),
        ];
        lines.push(cols.map(escape).join(";"));
      }
      // BOM para que Excel reconozca UTF-8 (acentos, ñ)
      const blob = new Blob(["\ufeff" + lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nombreArchivo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Error al exportar: ${e.message ?? e}`);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Sin registros en esta categoria.
      </p>
    );
  }

  const visibles = rows.slice(0, 300);
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportar} className="gap-1.5 h-8">
          <Download className="h-3.5 w-3.5" /> Exportar Excel ({rows.length.toLocaleString("es-CO")})
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Talla</th>
              <th className="px-3 py-2">Ubicacion</th>
              <th className="px-3 py-2 text-right">Shopify</th>
              {mostrarNetsuite && <th className="px-3 py-2 text-right">NetSuite</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <span className="text-xs">{r.producto ?? r.sku ?? "-"}</span>
                  {r.color && <span className="block text-[10px] text-muted-foreground">{r.color}</span>}
                </td>
                <td className="px-3 py-2 text-xs">{r.talla ?? "-"}</td>
                <td className="px-3 py-2 text-xs">{r.ubicacion}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(r.qty_shopify_antes ?? 0).toLocaleString("es-CO")}</td>
                {mostrarNetsuite && (
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-primary">
                    {(r.qty_netsuite ?? 0).toLocaleString("es-CO")}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 300 && (
          <p className="text-xs text-muted-foreground p-2 text-center border-t">
            Mostrando 300 de {rows.length.toLocaleString("es-CO")}. Usa "Exportar Excel" para la lista completa.
          </p>
        )}
      </div>
    </div>
  );
}
