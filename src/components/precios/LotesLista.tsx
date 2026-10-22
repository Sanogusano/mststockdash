import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { cn } from "@/lib/utils";
import { ESTADO_LOTE, Lote, fechaHoraLote } from "./lotes";

export function LotesLista({ onOpen }: { onOpen: (id: number) => void }) {
  const [verCancelados, setVerCancelados] = useState(false);
  const q = useQuery({
    queryKey: ["precio-lotes"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("precio_lote").select("*").order("id", { ascending: false });
      if (error) throw error;
      const lotes = (data ?? []) as Lote[];
      const ids = lotes.map((l) => l.id);
      const prog = new Map<number, { total: number; ns: number; sh: number }>();
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        let from = 0;
        while (true) {
          const { data: it, error: e2 } = await (supabase.from as any)("precio_lote_item")
            .select("lote_id, ns_ok, shopify_ok").in("lote_id", chunk).is("error", null).range(from, from + 999);
          if (e2) throw e2;
          (it ?? []).forEach((r: { lote_id: number; ns_ok: boolean; shopify_ok: boolean }) => {
            const p = prog.get(r.lote_id) ?? { total: 0, ns: 0, sh: 0 };
            p.total++; if (r.ns_ok) p.ns++; if (r.shopify_ok) p.sh++;
            prog.set(r.lote_id, p);
          });
          if (!it || it.length < 1000) break;
          from += 1000;
        }
      }
      return lotes.map((l) => ({ ...l, prog: prog.get(l.id) ?? { total: 0, ns: 0, sh: 0 } }));
    },
  });

  if (q.isLoading) return <LoadingState />;
  if (q.error) return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{(q.error as Error).message}</div>;
  const rows = (q.data ?? []).filter((l) => verCancelados || l.estado !== "cancelado");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
        <Switch id="ver-canc" checked={verCancelados} onCheckedChange={setVerCancelados} />
        <Label htmlFor="ver-canc" className="text-xs">Ver cancelados</Label>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1100px] text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-2 py-2">#</th><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">Estado</th>
              <th className="px-2 py-2">Notas</th><th className="px-2 py-2">Creado</th><th className="px-2 py-2">Aprobado</th>
              <th className="px-2 py-2">NetSuite completo</th><th className="px-2 py-2">Shopify fin</th>
              <th className="px-2 py-2 text-right">NetSuite</th><th className="px-2 py-2 text-right">Shopify</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Sin lotes</td></tr>}
            {rows.map((l) => {
              const e = ESTADO_LOTE[l.estado];
              return (
                <tr key={l.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => onOpen(l.id)}>
                  <td className="px-2 py-2 tabular-nums text-muted-foreground">{l.id}</td>
                  <td className="px-2 py-2 font-medium">{l.nombre}</td>
                  <td className="px-2 py-2"><Badge variant="outline" className={cn("text-[10px]", e?.cls)}>{e?.label ?? l.estado}</Badge></td>
                  <td className="px-2 py-2 max-w-[260px] truncate" title={l.notas ?? ""}>{l.notas ?? "—"}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fechaHoraLote(l.creado_en)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fechaHoraLote(l.aprobado_en)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fechaHoraLote(l.netsuite_completo_en)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">{fechaHoraLote(l.shopify_fin_en)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.prog.ns} / {l.prog.total}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.prog.sh} / {l.prog.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
