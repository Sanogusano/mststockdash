import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { CANAL_CONFIG, CANAL_OPCIONES, canalDesdeSource, type FiltroCanal } from "@/lib/canal-pedido";

type SoCreada = {
  id: number; pedido: string | null; tranid: string | null; cliente_tipo: string | null; cliente_nombre: string | null;
  total: number | null; unidades: number | null; creado_por_email: string | null; creado_en: string;
};

const diaBog = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtCOP = (n: number | null | undefined) => `$ ${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const fmtFechaHora = (s: string) => new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));

export function SoCreadasSelliq() {
  const [desde, setDesde] = useState(diaBog(new Date(Date.now() - 6 * 864e5)));
  const [hasta, setHasta] = useState(diaBog(new Date()));
  const [tipo, setTipo] = useState("todos");
  const [canal, setCanal] = useState<FiltroCanal>("todos");
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["ns-so-creadas", desde, hasta],
    queryFn: async () => {
      const out: SoCreada[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("netsuite_so_creadas" as never)
          .select("id, pedido, tranid, cliente_tipo, cliente_nombre, total, unidades, creado_por_email, creado_en")
          .gte("creado_en", `${desde}T00:00:00-05:00`).lte("creado_en", `${hasta}T23:59:59.999-05:00`)
          .order("creado_en", { ascending: false }).order("id", { ascending: false }).range(from, from + 999);
        if (error) throw error;
        const rows = (data ?? []) as unknown as SoCreada[];
        out.push(...rows);
        if (rows.length < 1000) return out;
      }
    },
  });

  const pedidosKey = (q.data ?? []).map((r) => r.pedido ?? "").filter(Boolean).join(",");
  const canalesQ = useQuery({
    queryKey: ["ns-so-creadas-canales", pedidosKey],
    enabled: pedidosKey.length > 0,
    queryFn: async () => {
      const pedidos = pedidosKey.split(",");
      const m = new Map<string, string | null>();
      for (let i = 0; i < pedidos.length; i += 200) {
        const { data, error } = await supabase
          .from("orders")
          .select("order_number, source_name")
          .in("order_number", pedidos.slice(i, i + 200));
        if (error) throw error;
        for (const x of (data ?? []) as { order_number: string; source_name: string | null }[])
          m.set(x.order_number, x.source_name);
      }
      return m;
    },
  });
  const canalDe = (pedido: string | null) => canalDesdeSource(pedido ? canalesQ.data?.get(pedido) : undefined);

  const filas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data ?? []).filter((r) => (tipo === "todos" || r.cliente_tipo === tipo)
      && (canal === "todos" || canalDe(r.pedido) === canal)
      && (!t || (r.pedido ?? "").toLowerCase().includes(t) || (r.tranid ?? "").toLowerCase().includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, tipo, canal, busca, canalesQ.data]);
  const kpis = { total: filas.length, mostrador: filas.filter((r) => r.cliente_tipo === "mostrador").length, monto: filas.reduce((a, r) => a + Number(r.total ?? 0), 0) };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><p className="text-xs text-muted-foreground mb-1">Desde</p><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-40" /></div>
        <div><p className="text-xs text-muted-foreground mb-1">Hasta</p><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-40" /></div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="todos">Todos los clientes</SelectItem><SelectItem value="final">Cliente final</SelectItem><SelectItem value="mostrador">Mostrador</SelectItem></SelectContent>
        </Select>
        <Select value={canal} onValueChange={(v) => setCanal(v as FiltroCanal)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CANAL_OPCIONES.map((o) => (
              <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar pedido o SO" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([["SO creadas", kpis.total.toLocaleString("es-CO")], ["A mostrador", kpis.mostrador.toLocaleString("es-CO")], ["Monto total", fmtCOP(kpis.monto)]] as const).map(([t, v]) => (
          <Card key={t}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t}</p><p className="text-2xl font-semibold tabular-nums">{v}</p></CardContent></Card>
        ))}
      </div>

      {q.error && <p className="text-sm text-destructive">Error: {errMsg(q.error)}</p>}
      {q.isLoading ? <LoadingState /> : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha/hora</TableHead><TableHead>Pedido</TableHead><TableHead>SO</TableHead><TableHead>Canal</TableHead><TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead>Creada por</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {!filas.length && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">Sin SO creadas en el rango</TableCell></TableRow>}
              {filas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{fmtFechaHora(r.creado_en)}</TableCell>
                  <TableCell className="font-medium">{r.pedido ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.tranid ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${CANAL_CONFIG[canalDe(r.pedido)].className}`}>
                      {CANAL_CONFIG[canalDe(r.pedido)].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{r.cliente_nombre ?? "—"}</span>
                      {r.cliente_tipo === "mostrador" && <Badge variant="outline" className="bg-muted text-muted-foreground text-[10px]">Mostrador</Badge>}
                      {r.cliente_tipo === "final" && <Badge variant="outline" className="text-[10px]">Cliente final</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtCOP(r.total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.unidades ?? 0).toLocaleString("es-CO")}</TableCell>
                  <TableCell className="text-xs">{r.creado_por_email ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  );
}
