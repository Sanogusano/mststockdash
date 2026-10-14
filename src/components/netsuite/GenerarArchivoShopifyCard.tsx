import { useCallback, useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { FileDown, Download, Info, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  generarArchivoShopify,
  iniciarLecturaShopify,
  estadoLecturaShopify,
  type ArchivoShopifyRow,
  type EstadoLecturaShopify,
} from "@/lib/snapshot-api";

const fmt = (n: number) => Number(n ?? 0).toLocaleString("es-CO");
const PAGINAS_ESTIMADAS = 141;
const UBICACION = "CEDI Guayabal";

const fmtBogota = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fechaBogota = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export function GenerarArchivoShopifyCard() {
  const [estado, setEstado] = useState<EstadoLecturaShopify | null>(null);
  const [iniciando, setIniciando] = useState(false);
  const [rows, setRows] = useState<ArchivoShopifyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const consultar = useCallback(async () => {
    try {
      const e = await estadoLecturaShopify();
      setEstado(e);
      return e;
    } catch (err: any) {
      toast.error(`Error al consultar estado: ${err.message ?? err}`);
      return null;
    }
  }, []);

  const corriendo = estado?.estado === "running";

  useEffect(() => {
    consultar();
  }, [consultar]);

  useEffect(() => {
    if (!corriendo) return;
    timer.current = setInterval(consultar, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [corriendo, consultar]);

  async function handleLeer() {
    setIniciando(true);
    try {
      const r = await iniciarLecturaShopify();
      if (r.enCurso) toast.info("Ya hay una lectura en curso.");
      setRows(null);
      await consultar();
      setEstado((e) => (e ? { ...e, estado: "running" } : { estado: "running", paginas: 0, filas: 0, iniciado: null, terminado: null, snapshot_netsuite: null, netsuite_aplicado: null }));
    } catch (e: any) {
      toast.error(`Error al iniciar la lectura: ${e.message ?? e}`);
    } finally {
      setIniciando(false);
    }
  }

  const esError = estado?.estado?.startsWith("error");
  const terminado = estado?.terminado ? new Date(estado.terminado).getTime() : null;
  const aplicado = estado?.netsuite_aplicado ? new Date(estado.netsuite_aplicado).getTime() : null;
  const puedeGenerar =
    estado?.estado === "idle" &&
    terminado != null &&
    (aplicado == null || terminado > aplicado) &&
    Date.now() - terminado < 60 * 60 * 1000;

  async function handleGenerar() {
    setLoading(true);
    try {
      const data = await generarArchivoShopify();
      setRows(data);
    } catch (e: any) {
      toast.error(`Error al generar: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }

  function descargar() {
    if (!rows || rows.length === 0) return;
    try {
      const ordenadas = [...rows].sort(
        (a, b) =>
          String(a.product_id).localeCompare(String(b.product_id)) ||
          String(a.sku ?? "").localeCompare(String(b.sku ?? ""))
      );
      const headers = ["ID", "Command", "Variant ID", "Variant SKU", "Title", `Inventory On Hand: ${UBICACION}`];
      const escape = (v: string | number) => {
        const s = String(v ?? "");
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const lines = [headers.join(",")];
      for (const r of ordenadas) {
        lines.push(
          [r.product_id, "UPDATE", r.variant_id, r.sku, r.producto ?? "", r.netsuite]
            .map(escape)
            .join(",")
        );
      }
      const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Products_conciliacion_CEDI_Guayabal_${fechaBogota()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(`Error al descargar: ${e.message ?? e}`);
    }
  }

  const aBajar = (rows ?? []).reduce((s, r) => s + (Number(r.diferencia) > 0 ? Number(r.diferencia) : 0), 0);
  const aSubir = (rows ?? []).reduce((s, r) => s + (Number(r.diferencia) < 0 ? Math.abs(Number(r.diferencia)) : 0), 0);
  const paginas = estado?.paginas ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileDown className="h-4 w-4" />
          Paso 3 — Generar archivo para actualizar Shopify
        </CardTitle>
        <CardDescription>
          Compara el inventario real de Shopify en CEDI Guayabal (la única ubicación que despacha
          online) contra el último inventario de NetSuite. El archivo actualiza On Hand: Shopify
          conserva lo comprometido y recalcula el disponible. Importa el archivo en Matrixify apenas
          lo descargues.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
          <p>
            <span className="text-muted-foreground">Inventario NetSuite:</span>{" "}
            <span className="font-medium">{estado?.snapshot_netsuite ?? "—"}</span>, aplicado{" "}
            <span className="font-medium">{fmtBogota(estado?.netsuite_aplicado)}</span>
          </p>
          <p>
            <span className="text-muted-foreground">Lectura Shopify:</span>{" "}
            <span className="font-medium">{fmtBogota(estado?.terminado)}</span>
          </p>
        </div>

        {/* Paso 1 */}
        <div className="space-y-2">
          <p className="text-sm font-medium">1. Leer inventario de Shopify</p>
          <Button onClick={handleLeer} disabled={iniciando || corriendo} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${corriendo ? "animate-spin" : ""}`} />
            {corriendo ? "Leyendo Shopify…" : "Leer inventario de Shopify"}
          </Button>
          {corriendo && (
            <div className="space-y-1 max-w-md">
              <Progress value={Math.min(100, (paginas / PAGINAS_ESTIMADAS) * 100)} />
              <p className="text-xs text-muted-foreground tabular-nums">
                Página {fmt(paginas)} de ~{PAGINAS_ESTIMADAS}
              </p>
            </div>
          )}
          {esError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> {estado?.estado}
            </p>
          )}
        </div>

        {/* Paso 2 */}
        <div className="space-y-2">
          <p className="text-sm font-medium">2. Generar archivo Matrixify</p>
          {!puedeGenerar && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Lee Shopify de nuevo justo antes de generar: el archivo debe cruzar el inventario
                NetSuite más reciente con una foto actual de Shopify.
              </p>
            </div>
          )}
          {!rows && (
            <Button onClick={handleGenerar} disabled={!puedeGenerar || loading} className="gap-2">
              <FileDown className="h-4 w-4" />
              {loading ? "Conciliando…" : "Generar archivo Matrixify"}
            </Button>
          )}
          {loading && (
            <div className="space-y-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          )}
        </div>

        {rows && rows.length > 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Variantes a corregir</p>
                <p className="text-xl font-semibold tabular-nums">{fmt(rows.length)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Unidades a bajar</p>
                <p className="text-xl font-semibold tabular-nums text-destructive">{fmt(aBajar)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Unidades a subir</p>
                <p className="text-xl font-semibold tabular-nums">{fmt(aSubir)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={descargar} className="gap-2">
                <Download className="h-4 w-4" />
                Descargar CSV Matrixify
              </Button>
              <Button variant="outline" onClick={() => setRows(null)}>
                Volver a calcular
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">NetSuite</th>
                    <th className="px-3 py-2 text-right">Shopify On Hand</th>
                    <th className="px-3 py-2 text-right">Comprometido</th>
                    <th className="px-3 py-2 text-right">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => {
                    const d = Number(r.diferencia);
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-xs font-mono">{r.sku}</td>
                        <td className="px-3 py-2 text-xs">{r.producto ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.netsuite)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(r.shopify_on_hand)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.shopify_comprometido)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${d > 0 ? "text-destructive" : ""}`}>
                          {d > 0 ? "+" : ""}{fmt(d)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="text-xs text-muted-foreground p-2 text-center border-t">
                  Mostrando 50 de {fmt(rows.length)}. El CSV trae todo.
                </p>
              )}
            </div>
          </div>
        )}

        {rows && rows.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800">Shopify y NetSuite están conciliados ✔</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
