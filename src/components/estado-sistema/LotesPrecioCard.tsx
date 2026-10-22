import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ESTADO_LOTE } from "@/components/precios/lotes";
import { cn } from "@/lib/utils";

export const LOTES_PRECIO_KEY = "estado-lotes-precio";

interface LoteLog {
  id: number;
  estado_inicial?: string;
  estado_final?: string;
  netsuite?: string;
  shopify_productos_aplicados?: number;
  shopify_productos_fallidos?: number;
  shopify_pendientes?: number;
  continua_en_proxima_corrida?: boolean;
  error?: string | null;
}

const fechaHora = (d: string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const EstadoB = ({ e }: { e?: string }) => e ? <Badge variant="outline" className={cn("text-[10px]", ESTADO_LOTE[e]?.cls)}>{ESTADO_LOTE[e]?.label ?? e}</Badge> : <span className="text-muted-foreground">—</span>;

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
  const det = q.data?.detalle ?? null;
  const lotes: LoteLog[] = Array.isArray(det?.lotes) ? det.lotes : [];
  const errores: unknown[] = Array.isArray(det?.errores) ? det.errores : [];
  const sinLotes = q.data && (det?.sin_lotes === true || lotes.length === 0);

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
        {sinLotes && <p className="text-sm">Sin lotes en proceso</p>}
        {lotes.length > 0 && (
          <Table className="text-xs">
            <TableHeader><TableRow>
              <TableHead>Lote</TableHead><TableHead>Estado</TableHead><TableHead>NetSuite</TableHead>
              <TableHead className="text-right">Shopify aplicados</TableHead><TableHead className="text-right">Fallidos</TableHead>
              <TableHead className="text-right">Pendientes</TableHead><TableHead>Nota</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {lotes.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">#{l.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1"><EstadoB e={l.estado_inicial} />{l.estado_final && l.estado_final !== l.estado_inicial && <>→ <EstadoB e={l.estado_final} /></>}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{l.netsuite ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.shopify_productos_aplicados ?? "—"}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (l.shopify_productos_fallidos ?? 0) > 0 && "font-semibold text-red-600")}>{l.shopify_productos_fallidos ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.shopify_pendientes ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {l.continua_en_proxima_corrida && <div className="text-muted-foreground">Continúa en la próxima corrida</div>}
                    {l.error && <div className="text-destructive">{l.error}</div>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
