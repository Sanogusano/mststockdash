// Clasificación de canal de un pedido según orders.source_name.
export type CanalPedido = "falabella" | "addi_marketplace" | "pedido_manual" | "web";

export function canalDesdeSource(source: string | null | undefined): CanalPedido {
  if (source === "3441759") return "falabella";
  if (source === "271832285185") return "addi_marketplace";
  if (source === "shopify_draft_order") return "pedido_manual";
  return "web";
}

export const CANAL_CONFIG: Record<CanalPedido, { label: string; className: string }> = {
  falabella: {
    label: "Falabella",
    className: "border-amber-300 bg-amber-50 text-amber-800",
  },
  addi_marketplace: {
    label: "Addi Marketplace",
    className: "border-violet-300 bg-violet-50 text-violet-700",
  },
  pedido_manual: {
    label: "Pedido manual",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
  web: {
    label: "Web",
    className: "border-slate-200 bg-slate-50 text-slate-500",
  },
};

export type FiltroCanal = CanalPedido | "todos";

export const CANAL_OPCIONES: { key: FiltroCanal; label: string }[] = [
  { key: "todos", label: "Todos los canales" },
  { key: "falabella", label: "Falabella" },
  { key: "addi_marketplace", label: "Addi Marketplace" },
  { key: "pedido_manual", label: "Pedido manual" },
  { key: "web", label: "Web" },
];
