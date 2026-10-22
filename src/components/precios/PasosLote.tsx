import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const PASOS = [
  "Selecciona productos",
  "Elige la acción",
  "Aprueba el lote",
  "Sube el archivo a NetSuite",
  "Selliq aplica en Shopify automáticamente",
];

/** Paso en el que está un lote: 3 borrador, 4 esperando NetSuite, 5 aplicando Shopify, "ok" aplicado */
export const pasoLote = (estado: string): number | "ok" | null =>
  estado === "borrador" ? 3 : estado === "esperando_netsuite" ? 4 : estado === "aplicando_shopify" ? 5 : estado === "aplicado" ? "ok" : null;

export function PasosLote() {
  return (
    <Card>
      <CardContent className="py-3">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {PASOS.map((p, i) => (
            <li key={p} className="flex items-center gap-2">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold text-foreground">{i + 1}</span>
              <span className="text-foreground">{p}</span>
              {i < PASOS.length - 1 && <span aria-hidden>→</span>}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

export function PasoBadge({ estado }: { estado: string }) {
  const p = pasoLote(estado);
  if (p == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      title={p === "ok" ? "Aplicado" : PASOS[p - 1]}
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[10px] font-semibold",
        p === "ok" ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-border bg-muted text-foreground",
      )}
    >
      {p === "ok" ? "✓" : `Paso ${p}`}
    </span>
  );
}
