import { useQuery } from "@tanstack/react-query";
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
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  PackageSearch,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DespachadoRow {
  pedido: string;
  creado: string;
  so: string | null;
  estado_ns: string;
  dias: number;
  unidades: number;
  skus: string;
}

const fmt = (n: number) => Number(n ?? 0).toLocaleString("es-CO");

const fmtCreado = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

async function fetchDespachados(): Promise<DespachadoRow[]> {
  const { data, error } = await supabase
    .from("v_despachado_sin_factura_ns" as any)
    .select("*")
    .order("dias", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DespachadoRow[];
}

export function DespachadoSinFacturaCard() {
  const q = useQuery({
    queryKey: ["despachado-sin-factura-ns"],
    queryFn: fetchDespachados,
    refetchInterval: 5 * 60 * 1000,
  });

  const rows = q.data ?? [];
  const totalUnidades = rows.reduce((s, r) => s + Number(r.unidades ?? 0), 0);
  const hayCriticos = rows.some((r) => Number(r.dias) > 2);

  async function copiarLista() {
    try {
      const texto = rows
        .map(
          (r) =>
            `Pedido ${r.pedido} – ${r.so ?? "Sin SO"} – ${r.estado_ns} – ${r.dias} días – ${r.unidades} uds`
        )
        .join("\n");
      await navigator.clipboard.writeText(texto);
      toast.success("Lista copiada al portapapeles");
    } catch (e: any) {
      toast.error(`No se pudo copiar: ${e.message ?? e}`);
    }
  }

  return (
    <Card
      className={
        rows.length > 0
          ? hayCriticos
            ? "border-red-300"
            : "border-amber-300"
          : undefined
      }
    >
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {rows.length > 0 ? (
            <AlertTriangle
              className={`h-4 w-4 ${hayCriticos ? "text-destructive" : "text-amber-600"}`}
            />
          ) : (
            <PackageSearch className="h-4 w-4" />
          )}
          Despachados en Shopify sin factura en NetSuite
        </CardTitle>
        <CardDescription>
          Pedidos que el WMS despachó pero cuya factura no llegó a NetSuite. La
          conciliación ya resta estas unidades del inventario; falta facturarlos
          en NetSuite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {rows.length > 0 && (
            <>
              <Badge variant={hayCriticos ? "destructive" : "secondary"}>
                {fmt(rows.length)} pedidos
              </Badge>
              <Badge variant="outline">{fmt(totalUnidades)} unidades</Badge>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 ml-auto"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`}
            />
            Actualizar
          </Button>
        </div>

        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : q.isError ? (
          <p className="text-xs text-destructive flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            {(q.error as any)?.message ?? "Error al consultar"}
          </p>
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <p className="text-xs text-emerald-800">Sin pendientes ✓</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2">Pedido</th>
                    <th className="px-3 py-2">SO</th>
                    <th className="px-3 py-2">Estado NetSuite</th>
                    <th className="px-3 py-2">Creado</th>
                    <th className="px-3 py-2 text-right">Días</th>
                    <th className="px-3 py-2 text-right">Unidades</th>
                    <th className="px-3 py-2">SKUs</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-xs font-mono">{r.pedido}</td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {r.so ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.estado_ns}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {fmtCreado(r.creado)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          Number(r.dias) > 2 ? "text-destructive" : ""
                        }`}
                      >
                        {fmt(r.dias)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {fmt(r.unidades)}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.skus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" className="gap-2" onClick={copiarLista}>
              <ClipboardCopy className="h-4 w-4" />
              Copiar lista
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
