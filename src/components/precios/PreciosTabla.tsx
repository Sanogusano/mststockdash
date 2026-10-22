import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpDown, Info } from "lucide-react";
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
  selectable?: boolean;
}

export function PreciosTabla({ rows, selected, onSelectedChange, selectable = true }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "stock_guayabal", dir: -1 });
  const [page, setPage] = useState(0);

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
        {selectable && <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={allSel} onCheckedChange={() => onSelectedChange(allSel ? new Set() : new Set(rows.map((r) => r.product_id)))} />
            Seleccionar todo lo filtrado ({rows.length.toLocaleString("es-CO")})
          </label>
          {selected.size > 0 && <span className="font-medium text-foreground">{selected.size.toLocaleString("es-CO")} seleccionados</span>}
        </div>}
        <div className="rounded-md border">
          <Table className="text-xs table-fixed w-full">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                {selectable && <TableHead className="w-10" />}
                <H k="producto" className="w-[34%]">Producto</H>
                <H k="precio_actual" right>Precio</H>
                <H k="stock_guayabal" right>Stock</H>
                <H k="rdv_semana" right tip="Unidades por semana a precio lleno → con descuento">Venta semanal</H>
                <H k="wos" right tip="Stock Guayabal / venta semanal actual">Semanas para evacuar</H>
                <H k="sugerencia">Sugerencia</H>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 && <TableRow><TableCell colSpan={selectable ? 7 : 6} className="p-6 text-center text-muted-foreground">Sin productos con estos filtros</TableCell></TableRow>}
              {visible.map((r) => {
                const sug = r.sugerencia ? SUGERENCIAS[r.sugerencia] : undefined;
                const img = imagesMap[r.product_id];
                const wos = r.wos == null ? null : Number(r.wos);
                const conDcto = r.dcto_actual != null && Number(r.dcto_actual) > 0;
                return (
                  <TableRow key={r.product_id}>
                    {selectable && <TableCell className="py-2 px-2"><Checkbox checked={selected.has(r.product_id)} onCheckedChange={() => toggle(r.product_id)} /></TableCell>}
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {img ? (
                          <ProductImageThumb src={img} alt={r.producto} productId={r.product_id} title={r.producto}
                            className="h-8 w-8 shrink-0 aspect-square rounded object-cover border border-border bg-muted" />
                        ) : <div className="h-8 w-8 shrink-0 rounded border border-dashed border-border bg-muted" />}
                        <div className="min-w-0">
                          <div className="font-medium truncate" title={r.producto}>{r.producto}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{[r.coleccion, r.tipo].filter(Boolean).join(" · ")}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
                      <div className="font-semibold">{cop(r.precio_actual)}</div>
                      {conDcto && <div className="text-[10px] text-muted-foreground"><span className="line-through">{cop(r.precio_lista)}</span> −{Math.round(Number(r.dcto_actual) * 100)}%</div>}
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">{num(r.stock_guayabal)}</TableCell>
                    <TableCell className="py-2 text-right tabular-nums whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild><span>{conDcto ? `${dec1(r.rdv_antes)} → ${dec1(r.rdv_desde)}` : dec1(r.rdv_antes ?? r.rdv_semana)}</span></TooltipTrigger>
                        <TooltipContent className="text-xs">Unidades por semana a precio lleno → con descuento</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums">
                      {sinVenta(r) ? <span className="font-medium text-red-600">Sin venta</span>
                        : <span className={cn("font-medium", wos! <= 8 ? "text-emerald-700" : wos! <= 18 ? "text-amber-600" : "text-red-600")}>{dec1(wos)}</span>}
                    </TableCell>
                    <TableCell className="py-2">
                      {r.sugerencia && <Badge variant="outline" className={cn("text-[10px]", sug?.badge ?? "bg-muted text-muted-foreground")}>{sug?.label ?? r.sugerencia}</Badge>}
                      {r.dcto_sugerido != null && <div className="mt-1 text-[10px] text-muted-foreground">→ {pct(r.dcto_sugerido)}</div>}
                    </TableCell>
                  </TableRow>
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
