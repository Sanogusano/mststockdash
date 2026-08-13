/** Diagnóstico de cierre del producto (columna `diagnostico` de producto_360). */
export const DIAGNOSTICOS = [
  "GANADOR", "EVACUO LIQUIDANDO", "SE PRODUJO DE MAS", "MAL PRODUCTO", "EN CURSO",
] as const;

export const DIAGNOSTICO_CLS: Record<string, string> = {
  GANADOR: "bg-emerald-100 text-emerald-700 border-emerald-200",
  "EVACUO LIQUIDANDO": "bg-amber-100 text-amber-700 border-amber-200",
  "SE PRODUJO DE MAS": "bg-orange-100 text-orange-700 border-orange-200",
  "MAL PRODUCTO": "bg-rose-100 text-rose-700 border-rose-200",
  "EN CURSO": "bg-sky-100 text-sky-700 border-sky-200",
};

export function DiagnosticoBadge({ valor }: { valor: string | null | undefined }) {
  if (!valor) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
      DIAGNOSTICO_CLS[valor] ?? "bg-muted text-muted-foreground"}`}>
      {valor}
    </span>
  );
}
