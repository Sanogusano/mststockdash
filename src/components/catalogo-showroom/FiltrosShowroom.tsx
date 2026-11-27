import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { compararTallas, formatCOP } from "@/lib/catalogo";
import { MultiSelect, type Opcion } from "@/components/catalogo/FiltrosDesplegables";

export type FiltrosShowroomData = {
  categorias: Opcion[];
  colecciones: Opcion[];
  generos: Opcion[];
  colores: Opcion[];
  tallas: Opcion[];
  precio_min: number;
  precio_max: number;
};

const DEFS = [
  { key: "cat", data: "categorias", label: "Categoría", buscar: true },
  { key: "col", data: "colecciones", label: "Colección", buscar: true },
  { key: "talla", data: "tallas", label: "Talla", buscar: false },
  { key: "color", data: "colores", label: "Color", buscar: true },
  { key: "gen", data: "generos", label: "Género", buscar: false },
] as const;

function PrecioSelect({ min, max, pmin, pmax, onApply, stacked }: {
  min: number; max: number; pmin: number | null; pmax: number | null;
  onApply: (a: number, b: number) => void; stacked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<[number, number]>([pmin ?? min, pmax ?? max]);
  useEffect(() => { if (open) setV([pmin ?? min, pmax ?? max]); }, [open]); // eslint-disable-line
  const activo = pmin !== null || pmax !== null;
  const aplicar = () => {
    const a = Math.max(min, Math.min(v[0], v[1]));
    const b = Math.min(max, Math.max(v[0], v[1]));
    if (a !== (pmin ?? min) || b !== (pmax ?? max)) onApply(a, b);
  };
  return (
    <Popover open={open} onOpenChange={(o) => { if (!o && !stacked) aplicar(); setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-9 justify-between gap-1.5 font-normal", stacked ? "w-full" : "max-w-[260px]", activo && "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}>
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

export function FiltrosShowroom({ filtros: f, loading, error, getList, setList, soloRebajados, setParam, pmin, pmax, setPrecio, stacked = false }: {
  filtros?: FiltrosShowroomData; loading: boolean; error: Error | null;
  getList: (k: string) => string[]; setList: (k: string, v: string[]) => void;
  soloRebajados: boolean; setParam: (k: string, v: string | null) => void;
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
    </div>
  );
}
