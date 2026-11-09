import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { ConsultaError } from "@/components/mayoristas/MayoristasPanel";
import { TablaCard, TablaTh } from "@/components/mayoristas/MayoristasOrdenes";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtFecha } from "@/lib/mayoristas-format";
import { tramosCartera, type CarteraRow } from "@/lib/mayoristas-cartera";

function TramoBadge({ tramo, dias }: { tramo: string; dias: number }) {
  const t = tramosCartera[dias <= 0 ? 0 : dias <= 30 ? 1 : dias <= 60 ? 2 : dias <= 90 ? 3 : 4];
  return <Badge variant="outline" className={t.badge}>{tramo || t.label}</Badge>;
}

export function MayoristasCarteraDetalle({ cliente, onClose }: { cliente: CarteraRow | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["mayoristas-cartera-detalle", cliente?.cliente_id], retry: false, enabled: !!cliente,
    queryFn: async () => {
      if (!cliente) return [];
      const { data, error } = await supabase.rpc("reporte_mayoristas_cartera_detalle", { p_cliente: cliente.cliente_id });
      if (error) throw error;
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  return <Sheet open={!!cliente} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
      <SheetHeader><SheetTitle>{cliente?.cliente}</SheetTitle><SheetDescription>Facturas con saldo · {fmtMonto(cliente?.saldo)}</SheetDescription></SheetHeader>
      <div className="mt-5 min-w-0">
        {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : !rows.length ? <EmptyState message="Sin facturas con saldo para este cliente." /> :
          <TablaCard title="Detalle de cartera" minW={1100}>
            <TablaTh cols={["Factura", "Punto de entrega", "Fecha", "Vencimiento", "Términos", "Total", "Saldo", "Días vencido", "Tramo"]} />
            <tbody>{rows.map((r, i) => <tr key={`${r.tranid}-${i}`} className="border-b border-border last:border-0">
              <td className="px-3 py-2.5 font-medium">{r.tranid}</td><td className="px-3 py-2.5">{r.punto_entrega || "—"}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td><td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.vencimiento)}</td>
              <td className="px-3 py-2.5">{r.terminos || "—"}</td><td className="px-3 py-2.5 tabular-nums">{fmtMonto(r.total)}</td>
              <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.saldo)}</td><td className="px-3 py-2.5 tabular-nums">{fmtNum(r.dias_vencido)}</td>
              <td className="px-3 py-2.5"><TramoBadge tramo={r.tramo} dias={Number(r.dias_vencido)} /></td>
            </tr>)}</tbody>
          </TablaCard>}
      </div>
    </SheetContent>
  </Sheet>;
}