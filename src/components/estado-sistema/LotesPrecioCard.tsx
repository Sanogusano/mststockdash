import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const LOTES_PRECIO_KEY = "estado-lotes-precio";

interface LoteLog { id: number; netsuite?: unknown; ns_ok?: number; ns_total?: number; shopify_productos_aplicados?: number; shopify_pendientes?: number; error?: string | null }

const fechaHora = (d: string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const ns = (l: LoteLog) => {
  const v = l.netsuite as any;
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return `${v.ok ?? v.x ?? "?"}/${v.total ?? v.y ?? "?"}`;
  if (l.ns_ok != null) return `${l.ns_ok}/${l.ns_total ?? "?"}`;
  return "—";
};

export function LotesPrecioCard() {
  const q = useQuery({
    queryKey: [LOTES_PRECIO_KEY],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("proceso_ejecucion_log").select("ultima_ejecucion, duracion_ms, detalle").eq("proceso", "precios_lote").maybeSingle();
      if (error) throw error;
      return data as { ultima_ejecucion: string; duracion_ms: number | null; detalle: any } | null;
    },
  });
  const lotes: LoteLog[] = Array.isArray(q.data?.detalle?.lotes) ? q.data!.detalle.lotes : [];
  const errores: unknown[] = Array.isArray(q.data?.detalle?.errores) ? q.data!.detalle.errores : [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Lotes de precio</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
        <p className="text-sm text-muted-foreground">
          {q.isLoading ? "…" : q.data ? `Última ejecución ${fechaHora(q.data.ultima_ejecucion)} · ${q.data.duracion_ms == null ? "—" : `${(q.data.duracion_ms / 1000).toFixed(1)} s`}` : "Sin ejecuciones registradas"}
        </p>
        {errores.length > 0 && (
          <ul className="rounded-md border border-destructive/40 bg-destructive/5 p-2 pl-6 text-xs text-destructive list-disc">
            {errores.map((e, i) => <li key={i}>{typeof e === "string" ? e : JSON.stringify(e)}</li>)}
          </ul>
        )}
        {lotes.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>NetSuite</TableHead><TableHead className="text-right">Shopify aplicados</TableHead><TableHead className="text-right">Shopify pendientes</TableHead><TableHead>Error</TableHead></TableRow></TableHeader>
            <TableBody>
              {lotes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">#{l.id}</TableCell>
                  <TableCell className="tabular-nums">{ns(l)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.shopify_productos_aplicados ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.shopify_pendientes ?? "—"}</TableCell>
                  <TableCell className="text-xs text-destructive">{l.error ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
