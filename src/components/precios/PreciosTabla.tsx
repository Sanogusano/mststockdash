import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { PrecioRow, SUGERENCIAS, cop, pct, num } from "./types";

type SortKey = keyof PrecioRow;
const PAGE = 50;

const EFECTO: Record<string, string> = {
  "funcionó": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "sin efecto": "bg-amber-100 text-amber-800 border-amber-300",
  "muy pronto": "bg-muted text-muted-foreground",
  "sin datos": "bg-muted text-muted-foreground",
};

const fechaCorta = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" }).replace(".", "").replace(" ", "-");
};
const dec1 = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 }));

interface Props {
  rows: PrecioRow[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
}

export function PreciosTabla({ rows, selected, onSelectedChange }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "stock_guayabal", dir: -1 });
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const out = rows.slice();
    out.sort((a, b) => {
      const va = a[sort.key] as unknown, vb = b[sort.key] as unknown;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb), "es") * sort.dir;
    });
    return out;
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const p = Math.min(page, pages - 1);
  const visible = sorted.slice(p * PAGE, p * PAGE + PAGE);
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.product_id));

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    onSelectedChange(s);
  };
  const H = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={cn("px-2 py-2 font-medium whitespace-nowrap", right ? "text-right" : "text-left")}>
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 })); setPage(0); }}>
        {children}<ArrowUpDown className={cn("h-3 w-3", sort.key === k ? "opacity-100" : "opacity-30")} />
      </button>
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={allSel} onCheckedChange={() => onSelectedChange(allSel ? new Set() : new Set(rows.map((r) => r.product_id)))} />
          Seleccionar todo lo filtrado ({rows.length.toLocaleString("es-CO")})
        </label>
        {selected.size > 0 && <span className="font-medium text-foreground">{selected.size.toLocaleString("es-CO")} seleccionados</span>}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[1500px] text-xs">
          <thead className="bg-muted/50 text-muted-foreground sticky top-0">
            <tr>
              <th className="w-8 px-2" />
              <H k="producto">Producto</H>
              <H k="semanas_vida" right>Vida</H>
              <H k="precio_lista" right>Precio lista</H>
              <H k="precio_actual" right>Precio actual</H>
              <H k="dcto_actual" right>Dcto actual</H>
              <H k="etiqueta_ht">Etiqueta HT</H>
              <H k="stock_guayabal" right>Stock Guayabal</H>
              <H k="venta_28d" right>Venta 28d / 7d</H>
              <H k="wos" right>WOS</H>
              <H k="margen_actual" right>Margen actual</H>
              <H k="efecto">Efecto</H>
              <H k="sugerencia">Sugerencia</H>
              <th className="px-2 py-2 text-center font-medium">Alertas</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && <tr><td colSpan={14} className="p-6 text-center text-muted-foreground">Sin productos con estos filtros</td></tr>}
            {visible.map((r) => {
              const isOpen = open.has(r.product_id);
              const sug = r.sugerencia ? SUGERENCIAS[r.sugerencia] : undefined;
              const alertas = r.alertas ?? [];
              return (
                <Fragment key={r.product_id}>
                  <tr className="border-t hover:bg-muted/30">
                    <td className="px-2 py-2 align-top">
                      <div className="flex items-center gap-1">
                        <Checkbox checked={selected.has(r.product_id)} onCheckedChange={() => toggle(r.product_id)} />
                        <button aria-label="Expandir" onClick={() => { const s = new Set(open); isOpen ? s.delete(r.product_id) : s.add(r.product_id); setOpen(s); }}>
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 align-top max-w-[260px]">
                      <div className="font-medium text-foreground truncate" title={r.producto}>{r.producto}</div>
                      <div className="text-[10px] text-muted-foreground">{[r.coleccion, r.tipo, r.genero].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">{r.semanas_vida ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">{cop(r.precio_lista)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">{cop(r.precio_actual)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">
                      <div>{pct(r.dcto_actual)}</div>
                      {r.precio_uniforme === false && <Badge variant="outline" className="mt-1 border-red-300 bg-red-50 text-[10px] text-red-700">precios distintos por talla</Badge>}
                    </td>
                    <td className="px-2 py-2 align-top">{r.etiqueta_ht ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">{num(r.stock_guayabal)}</td>
                    <td className="px-2 py-2 text-right tabular-nums align-top">{num(r.venta_28d)} / {num(r.venta_7d)}</td>
                    <td className={cn("px-2 py-2 text-right tabular-nums align-top", r.wos != null && r.wos > 18 && "font-semibold text-red-600")}>{dec1(r.wos)}</td>
                    <td className={cn("px-2 py-2 text-right tabular-nums align-top", r.margen_actual != null && r.margen_actual < 0.4 && "font-semibold text-red-600")}>{pct(r.margen_actual)}</td>
                    <td className="px-2 py-2 align-top">
                      {r.efecto && r.efecto !== "sin descuento" && <Badge variant="outline" className={cn("text-[10px]", EFECTO[r.efecto] ?? "bg-muted text-muted-foreground")}>{r.efecto}</Badge>}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {r.sugerencia && <Badge variant="outline" className={cn("text-[10px]", sug?.badge ?? "bg-muted text-muted-foreground")}>{sug?.label ?? r.sugerencia}</Badge>}
                      {r.dcto_sugerido != null && (
                        <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">→ {pct(r.dcto_sugerido)} · {cop(r.precio_sugerido)} · margen {pct(r.margen_sugerido)}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center align-top">
                      {alertas.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />{alertas.length}</TooltipTrigger>
                          <TooltipContent className="max-w-xs"><ul className="list-disc pl-4 text-xs">{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></TooltipContent>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-muted/20">
                      <td />
                      <td colSpan={13} className="px-2 py-3">
                        <div className="flex flex-wrap gap-6 text-xs">
                          <div><span className="text-muted-foreground">Ritmo de venta: </span>
                            {r.inicio_rebaja ? `${dec1(r.rdv_antes)} → ${dec1(r.rdv_desde)} uds/semana desde ${fechaCorta(r.inicio_rebaja)}` : `${dec1(r.rdv_semana)} uds/semana`}</div>
                          <div><span className="text-muted-foreground">Costo unitario: </span>{cop(r.costo)}</div>
                          {r.tallas && <div><span className="text-muted-foreground">Tallas: </span>{r.tallas}</div>}
                          <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Etiquetas: </span>
                            {(r.etiquetas ?? []).length === 0 ? "—" : (r.etiquetas ?? []).map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}</div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Página {p + 1} de {pages} · {sorted.length.toLocaleString("es-CO")} productos</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-7" disabled={p === 0} onClick={() => setPage(p - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" className="h-7" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Siguiente</Button>
        </div>
      </div>
    </div>
  );
}
