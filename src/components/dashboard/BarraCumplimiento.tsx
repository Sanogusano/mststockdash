/**
 * Barra compacta de cumplimiento de presupuesto.
 * Para filas de tabla y cards pequeñas, donde el badge grande satura.
 *
 * La barra se escala contra 100, no contra el ancho disponible: un 82% debe
 * verse a 82% del recorrido, no casi lleno.
 */

interface Props {
  pct: number | null;
  venta?: number | null;
  presupuesto?: number | null;
  ancho?: number;
  /** true en cards; false (por defecto) en filas de tabla */
  mostrarMontos?: boolean;
}

const money = (v: number) => {
  const m = Math.abs(v);
  if (m >= 1_000_000_000) return `$${(v / 1_000_000_000).toLocaleString("es-CO", { maximumFractionDigits: 2 })}MM`;
  if (m >= 1_000_000)     return `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })}M`;
  return `$${v.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
};

function color(pct: number) {
  if (pct >= 100) return { barra: "bg-emerald-500", texto: "text-emerald-700" };
  if (pct >= 90)  return { barra: "bg-amber-500",   texto: "text-amber-700" };
  if (pct >= 80)  return { barra: "bg-orange-500",  texto: "text-orange-700" };
  return { barra: "bg-rose-500", texto: "text-rose-700" };
}

export function BarraCumplimiento({
  pct, venta, presupuesto, ancho = 62, mostrarMontos = false,
}: Props) {
  if (pct == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const c = color(pct);

  return (
    <div className="inline-flex items-center gap-2"
         title={venta != null && presupuesto != null
                ? `${money(venta)} de ${money(presupuesto)}`
                : undefined}>
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden shrink-0"
           style={{ width: ancho }}>
        <div className={`absolute inset-y-0 left-0 rounded-full ${c.barra}`}
             style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
        {/* marca del 100% cuando la barra se pasa */}
        {pct > 100 && (
          <div className="absolute inset-y-0 w-px bg-white/70" style={{ left: "100%" }} />
        )}
      </div>
      <span className={`text-xs font-medium tabular-nums ${c.texto}`}>
        {pct.toLocaleString("es-CO", { maximumFractionDigits: 0 })}%
      </span>
      {mostrarMontos && venta != null && presupuesto != null && (
        <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
          {money(venta)} / {money(presupuesto)}
        </span>
      )}
    </div>
  );
}

export default BarraCumplimiento;
