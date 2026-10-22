import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpDown, ChevronDown, ChevronRight, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductImageThumb } from "@/components/dashboard/ProductImageThumb";
import { cn } from "@/lib/utils";
import { PrecioRow, SUGERENCIAS, cop, pct, num, cambioRdv } from "./types";

type SortKey = keyof PrecioRow | "cambio_rdv";
const PAGE = 50;
const ANCHO = "hidden min-[1366px]:table-cell"; // columnas que se ocultan bajo 1366px

const fechaCorta = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s.length <= 10 ? s + "T12:00:00" : s);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "America/Bogota" }).replace(".", "");
};
const dec1 = (n: number | null) => (n == null ? "—" : Number(n).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
const cambioOrden = (r: PrecioRow) => {
  const c = cambioRdv(r);
  return c.tipo === "pct" ? c.v : c.tipo === "nuevo" ? 999 : null;
};
const sinVenta = (r: PrecioRow) => r.wos == null || !r.rdv_semana || Number(r.rdv_semana) <= 0;

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
    const val = (r: PrecioRow): unknown => (sort.key === "cambio_rdv" ? cambioOrden(r) : r[sort.key]);
    const out = rows.slice();
    out.sort((a, b) => {
      const va = val(a), vb = val(b);
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

  const productIds = useMemo(() => visible.map((r) => r.product_id).filter(Boolean), [visible]);
  const { data: imagesMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["precios-ecom-images", productIds.join(",")],
    enabled: productIds.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (let i = 0; i < productIds.length; i += 200) {
        const { data, error } = await supabase.from("product_catalog").select("product_id,image_url").in("product_id", productIds.slice(i, i + 200));
        if (error) throw error;
        (data ?? []).forEach((r: any) => { if (r.product_id && r.image_url && !map[r.product_id]) map[r.product_id] = r.image_url; });
      }
      return map;
    },
  });

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    onSelectedChange(s);
  };
  const H = ({ k, children, right, className, tip }: { k: SortKey; children: React.ReactNode; right?: boolean; className?: string; tip?: string }) => (
    <TableHead className={cn("whitespace-nowrap", right && "text-right", className)}>
      <span className="inline-flex items-center gap-1">
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 })); setPage(0); }}>
          {children}<ArrowUpDown className={cn("h-3 w-3", sort.key === k ? "opacity-100" : "opacity-30")} />
        </button>
        {tip && (
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 opacity-60" /></TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </TableHead>
  );

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allSel} onCheckedChange={() => onSelectedChange(allSel ? new Set() : new Set(rows.map((r) => r.product_id)))} />
            Seleccionar todo lo filtrado ({rows.length.toLocaleString("es-CO")})
          </label>
          {selected.size > 0 && <span className="font-medium text-foreground">{selected.size.toLocaleString("es-CO")} seleccionados</span>}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="w-12" />
                <H k="producto">Producto</H>
                <H k="semanas_vida" right>Tiempo de vida</H>
                <H k="precio_lista" right className={ANCHO}>Precio lista</H>
                <H k="precio_actual" right>Precio actual</H>
                <H k="dcto_actual" right>Descuento</H>
                <H k="margen_actual" right>Margen</H>
                <H k="stock_guayabal" right className={ANCHO}>Stock Guayabal</H>
                <H k="rdv_semana" right>Venta semanal</H>
                <H k="cambio_rdv" right tip="Venta semanal desde el inicio del descuento (inicio_rebaja) vs. antes">Cambio RDV</H>
                <H k="wos" right tip="Stock Guayabal / venta semanal actual">Semanas para evacuar</H>
                <H k="sugerencia">Sugerencia</H>
                <TableHead className="text-center">Alertas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableRow><TableCell colSpan={13} className="p-6 text-center text-muted-foreground">Sin productos con estos filtros</TableCell></TableRow>}
              {visible.map((r) => {
                const isOpen = open.has(r.product_id);
                const sug = r.sugerencia ? SUGERENCIAS[r.sugerencia] : undefined;
                const alertas = r.alertas ?? [];
                const img = imagesMap[r.product_id];
                const c = cambioRdv(r);
                const wos = r.wos == null ? null : Number(r.wos);
                return (
                  <Fragment key={r.product_id}>
                    <TableRow className="align-top">
                      <TableCell className="p-2">
                        <div className="flex items-center gap-1">
                          <Checkbox checked={selected.has(r.product_id)} onCheckedChange={() => toggle(r.product_id)} />
                          <button aria-label="Expandir" onClick={() => { const s = new Set(open); isOpen ? s.delete(r.product_id) : s.add(r.product_id); setOpen(s); }}>
                            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        <div className="flex gap-2">
                          {img ? (
                            <ProductImageThumb src={img} alt={r.producto} productId={r.product_id} title={r.producto}
                              className="h-12 w-12 shrink-0 aspect-square rounded object-cover border border-border bg-muted" />
                          ) : (
                            <div className="h-12 w-12 shrink-0 aspect-square rounded border border-dashed border-border bg-muted" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-sm line-clamp-2" title={r.producto}>{r.producto}</div>
                            <div className="text-[10px] text-muted-foreground">{[r.coleccion, r.tipo, r.genero].filter(Boolean).join(" · ")}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{r.semanas_vida == null ? "—" : `${r.semanas_vida} sem`}</TableCell>
                      <TableCell className={cn("text-right tabular-nums whitespace-nowrap", ANCHO)}>{cop(r.precio_lista)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{cop(r.precio_actual)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{pct(r.dcto_actual)}</div>
                        {r.precio_uniforme === false && <Badge variant="outline" className="mt-1 border-red-300 bg-red-50 text-[10px] text-red-700">precios distintos por talla</Badge>}
                      </TableCell>
                      <TableCell className={cn("text-right tabular-nums", r.margen_actual != null && r.margen_actual < 0.4 && "font-semibold text-red-600")}>{pct(r.margen_actual)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", ANCHO)}>{num(r.stock_guayabal)}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">{r.rdv_semana == null ? "—" : `${dec1(r.rdv_semana)} u/sem`}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {c.tipo === "na" ? <span className="text-muted-foreground">—</span>
                          : c.tipo === "pronto" ? <span className="text-muted-foreground">Muy pronto</span>
                          : c.tipo === "nuevo" ? <span className="font-medium text-emerald-700">Nuevo ritmo</span>
                          : <span className={cn("font-medium", c.v > 0 ? "text-emerald-700" : c.v < 0 ? "text-red-600" : "text-muted-foreground")}>{c.v > 0 ? "+" : ""}{Math.round(c.v * 100)}%</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sinVenta(r) ? <span className="font-medium text-red-600">Sin venta</span>
                          : <span className={cn("font-medium", wos! <= 8 ? "text-emerald-700" : wos! <= 18 ? "text-amber-600" : "text-red-600")}>{dec1(wos)}</span>}
                      </TableCell>
                      <TableCell className="min-w-[150px]">
                        {r.sugerencia && <Badge variant="outline" className={cn("text-[10px]", sug?.badge ?? "bg-muted text-muted-foreground")}>{sug?.label ?? r.sugerencia}</Badge>}
                        {r.dcto_sugerido != null && (
                          <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">→ {pct(r.dcto_sugerido)} · {cop(r.precio_sugerido)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {alertas.length > 0 && (
                          <Tooltip>
                            <TooltipTrigger className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3.5 w-3.5" />{alertas.length}</TooltipTrigger>
                            <TooltipContent className="max-w-xs"><ul className="list-disc pl-4 text-xs">{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={12} className="py-3">
                          <div className="flex flex-wrap gap-6 text-xs">
                            <div><span className="text-muted-foreground">Ritmo de venta: </span>
                              {r.inicio_rebaja ? `${dec1(r.rdv_antes)} → ${dec1(r.rdv_desde)} u/sem desde ${fechaCorta(r.inicio_rebaja)}` : `${dec1(r.rdv_semana)} u/sem`}</div>
                            <div><span className="text-muted-foreground">Venta 28d / 7d: </span>{num(r.venta_28d)} / {num(r.venta_7d)}</div>
                            <div><span className="text-muted-foreground">Costo unitario: </span>{cop(r.costo)}</div>
                            {r.dcto_sugerido != null && <div><span className="text-muted-foreground">Margen sugerido: </span>{pct(r.margen_sugerido)}</div>}
                            {r.tallas && <div><span className="text-muted-foreground">Tallas: </span>{r.tallas}</div>}
                            <div className="flex flex-wrap items-center gap-1"><span className="text-muted-foreground">Etiquetas: </span>
                              {(r.etiquetas ?? []).length === 0 ? "—" : (r.etiquetas ?? []).map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Página {p + 1} de {pages} · {sorted.length.toLocaleString("es-CO")} productos</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7" disabled={p === 0} onClick={() => setPage(p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" className="h-7" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Siguiente</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
