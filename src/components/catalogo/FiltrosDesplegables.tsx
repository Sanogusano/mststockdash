import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { compararTallas, etiquetaFiltro, formatCOP } from "@/lib/catalogo";

export type Opcion = { valor: string; productos?: number; hex?: string };
export type FiltrosData = { categorias: Opcion[]; colecciones: Opcion[]; generos: Opcion[]; colores: Opcion[]; tallas: Opcion[]; precio_min: number; precio_max: number };

const DEFS = [
  { key: "cat", data: "categorias", label: "Categoría", buscar: true },
  { key: "col", data: "colecciones", label: "Colección", buscar: true },
  { key: "talla", data: "tallas", label: "Talla", buscar: false },
  { key: "color", data: "colores", label: "Color", buscar: true },
  { key: "gen", data: "generos", label: "Género", buscar: false },
] as const;

function triggerCls(activo: boolean, stacked: boolean) {
  return cn("h-9 justify-between gap-1.5 font-normal", stacked ? "w-full" : "max-w-[220px]",
    activo && "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary");
}

export function MultiSelect({ label, opciones, seleccion, onApply, buscar, color, stacked }: {
  label: string; opciones: Opcion[]; seleccion: string[]; onApply: (v: string[]) => void; buscar: boolean; color?: boolean; stacked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(seleccion);
  useEffect(() => { if (open) setDraft(seleccion); }, [open]); // eslint-disable-line
  const ordenadas = useMemo(() => {
    const sel = new Set(open ? seleccion : draft);
    return [...opciones].sort((a, b) => Number(sel.has(b.valor)) - Number(sel.has(a.valor)));
  }, [opciones, open]); // eslint-disable-line
  const aplicar = (v: string[]) => { if (v.join("|") !== seleccion.join("|")) onApply(v); };
  const onOpenChange = (o: boolean) => {
    if (!o && !stacked) aplicar(draft); // desktop: aplica al cerrar
    setOpen(o);
  };
  const toggle = (v: string) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={triggerCls(seleccion.length > 0, stacked)}>
          <span className="truncate">{etiquetaFiltro(label, seleccion)}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          {buscar && <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} />}
          <CommandList className="max-h-64">
            <CommandEmpty>Sin resultados</CommandEmpty>
            <CommandGroup>
              {ordenadas.map((o) => {
                const on = draft.includes(o.valor);
                return (
                  <CommandItem key={o.valor} value={o.valor} onSelect={() => toggle(o.valor)} className="gap-2">
                    <Checkbox checked={on} className="pointer-events-none" />
                    {color && o.hex && <span className="h-3 w-3 shrink-0 rounded-full border border-border" style={{ background: o.hex }} />}
                    <span className="flex-1 truncate">{o.valor}</span>
                    {o.productos != null && <span className="text-xs tabular-nums text-muted-foreground">{o.productos}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="flex items-center justify-between border-t border-border p-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft([])}>Limpiar</Button>
          <Button size="sm" onClick={() => { aplicar(draft); setOpen(false); }}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PrecioSelect({ min, max, pmin, pmax, onApply, stacked }: {
  min: number; max: number; pmin: number | null; pmax: number | null; onApply: (a: number, b: number) => void; stacked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<[number, number]>([pmin ?? min, pmax ?? max]);
  useEffect(() => { if (open) setV([pmin ?? min, pmax ?? max]); }, [open]); // eslint-disable-line
  const activo = pmin !== null || pmax !== null;
  const aplicar = () => { const a = Math.max(min, Math.min(v[0], v[1])), b = Math.min(max, Math.max(v[0], v[1])); if (a !== (pmin ?? min) || b !== (pmax ?? max)) onApply(a, b); };
  return (
    <Popover open={open} onOpenChange={(o) => { if (!o && !stacked) aplicar(); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={triggerCls(activo, stacked)}>
          <span className="truncate">{activo ? `Precio: ${formatCOP(pmin ?? min)} – ${formatCOP(pmax ?? max)}` : "Precio"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-4">
        <Slider min={min} max={max} step={1000} value={v} onValueChange={(x) => setV([x[0], x[1]])} />
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">Mínimo
            <Input type="number" inputMode="numeric" value={v[0]} onChange={(e) => setV([Number(e.target.value) || 0, v[1]])} className="h-8" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Máximo
            <Input type="number" inputMode="numeric" value={v[1]} onChange={(e) => setV([v[0], Number(e.target.value) || 0])} className="h-8" />
          </label>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setV([min, max])}>Limpiar</Button>
          <Button size="sm" onClick={() => { aplicar(); setOpen(false); }}>Aplicar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FiltrosDesplegables({ filtros: f, loading, error, getList, setList, soloRebajados, incluirAgotados, setParam, pmin, pmax, setPrecio, stacked = false }: {
  filtros?: FiltrosData; loading: boolean; error: Error | null;
  getList: (k: string) => string[]; setList: (k: string, v: string[]) => void;
  soloRebajados: boolean; incluirAgotados: boolean; setParam: (k: string, v: string | null) => void;
  pmin: number | null; pmax: number | null; setPrecio: (a: number, b: number) => void; stacked?: boolean;
}) {
  if (loading) return <div className={cn("flex gap-2", stacked && "flex-col")}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={cn("h-9", stacked ? "w-full" : "w-28")} />)}</div>;
  if (error) return <p className="text-sm text-destructive">Error al cargar filtros: {error.message}</p>;
  if (!f) return null;
  return (
    <div className={cn("flex gap-2", stacked ? "flex-col" : "flex-wrap items-center")}>
      {DEFS.map((d) => {
        let ops = (f as any)[d.data] as Opcion[];
        if (!ops?.length) return null;
        if (d.key === "talla") ops = [...ops].sort((a, b) => compararTallas(a.valor, b.valor));
        return <MultiSelect key={d.key} label={d.label} opciones={ops} seleccion={getList(d.key)} onApply={(v) => setList(d.key, v)}
          buscar={d.buscar} color={d.key === "color"} stacked={stacked} />;
      })}
      {f.precio_max > f.precio_min && <PrecioSelect min={f.precio_min} max={f.precio_max} pmin={pmin} pmax={pmax} onApply={setPrecio} stacked={stacked} />}
      <label className={cn("flex items-center gap-2 text-sm whitespace-nowrap", stacked ? "justify-between pt-2" : "ml-1")}>
        <span className={stacked ? "" : "order-2"}>Solo rebajados</span>
        <Switch checked={soloRebajados} onCheckedChange={(c) => setParam("rebajados", c ? "1" : null)} />
      </label>
      <label className={cn("flex items-center gap-2 text-sm whitespace-nowrap", stacked && "justify-between")}>
        <span className={stacked ? "" : "order-2"}>Mostrar agotados</span>
        <Switch checked={incluirAgotados} onCheckedChange={(c) => setParam("agotados", c ? "1" : null)} />
      </label>
    </div>
  );
}
