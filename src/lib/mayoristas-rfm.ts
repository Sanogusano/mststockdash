import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type RfmRow = Database["public"]["Functions"]["reporte_mayoristas_rfm"]["Returns"][number];
export const SEGMENTOS = [
  { nombre: "Campeones", regla: "Compró hace ≤60 días y está en el 20 % que más compra", borde: "border-success", badge: "status-optimal" },
  { nombre: "Leales", regla: "Compró hace ≤60 días y tiene 6 o más facturas al año", borde: "border-success", badge: "status-optimal" },
  { nombre: "Nuevos", regla: "Primera compra hace ≤90 días", borde: "border-[hsl(var(--chart-5))]", badge: "text-[hsl(var(--chart-5))] bg-[hsl(var(--chart-5)/0.1)] border-[hsl(var(--chart-5)/0.3)]" },
  { nombre: "En desarrollo", regla: "Compró hace ≤90 días", borde: "border-[hsl(var(--chart-5))]", badge: "text-[hsl(var(--chart-5))] bg-[hsl(var(--chart-5)/0.1)] border-[hsl(var(--chart-5)/0.3)]" },
  { nombre: "En riesgo", regla: "Compró hace 91–180 días y compraba más que la mediana", borde: "border-warning", badge: "status-warning" },
  { nombre: "Dormidos", regla: "Compró hace 91–365 días", borde: "border-[hsl(var(--cartera-late))]", badge: "text-[hsl(var(--cartera-late))] bg-[hsl(var(--cartera-late)/0.1)] border-[hsl(var(--cartera-late)/0.3)]" },
  { nombre: "Perdidos", regla: "Compró hace más de 365 días", borde: "border-danger", badge: "status-danger" },
];

export function agruparRfm(rows: RfmRow[]) {
  return SEGMENTOS.map((segmento, index) => {
    const clientes = rows.filter(r => r.segmento === segmento.nombre);
    return { ...segmento, orden: clientes[0]?.segmento_orden ?? index + 1, clientes: clientes.length,
      compras: clientes.reduce((sum, r) => sum + (Number(r.compras_12m) || 0), 0),
      vencidos: clientes.filter(r => r.cartera_vencida === true).length };
  }).sort((a, b) => a.orden - b.orden);
}

export function filtrarRfm<T extends { cliente_id: string }>(rows: T[], rfm: RfmRow[], segmento: string | null, vencida: boolean) {
  const porCliente = new Map(rfm.map(r => [String(r.cliente_id), r]));
  return rows.filter(r => {
    const datos = porCliente.get(String(r.cliente_id));
    return (!segmento || datos?.segmento === segmento) && (!vencida || datos?.cartera_vencida === true);
  });
}

export function clientesRfmUrl(segmento: string, vendedor: string | null, desde: string | null, hasta: string | null) {
  const params = new URLSearchParams({ tab: "clientes", segmento });
  if (vendedor) params.set("vendedor", vendedor);
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  return `/mayoristas?${params}`;
}

export function useMayoristasRfm(vendedor: string | null) {
  return useQuery({
    queryKey: ["mayoristas-rfm", vendedor], retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_rfm", { p_vendedor: vendedor } as never);
      if (error) throw error;
      return data ?? [];
    },
  });
}