// Filtros secundarios para la tabla de sugerencias.
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
import type { SugerenciaTraslado, OrigenTipo } from "@/lib/traslados-api";

export interface FiltrosState {
  linea: string; // "todas" o nombre de línea
  origenTipo: string; // "todos" | OrigenTipo
  prioridadMin: number;
  busqueda: string;
}

export const FILTROS_INICIALES: FiltrosState = {
  linea: "todas",
  origenTipo: "todos",
  prioridadMin: 0,
  busqueda: "",
};

interface Props {
  sugerencias: SugerenciaTraslado[];
  filtros: FiltrosState;
  onChange: (next: FiltrosState) => void;
}

export function FiltrosTraslados({ sugerencias, filtros, onChange }: Props) {
  const lineas = useMemo(() => {
    const s = new Set<string>();
    sugerencias.forEach((x) => x.r_linea && s.add(x.r_linea));
    return [...s].sort();
  }, [sugerencias]);

  const origenes: { tipo: OrigenTipo; label: string }[] = [
    { tipo: "cedi_principal", label: "CEDI Principal" },
    { tipo: "cedi_guayabal", label: "CEDI Guayabal" },
    { tipo: "cedi_otro", label: "CEDI Otro" },
    { tipo: "consolidacion_lateral", label: "Consolidación" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-md border bg-muted/20">
      <div>
        <label className="text-[10px] uppercase text-muted-foreground">Línea</label>
        <Select value={filtros.linea} onValueChange={(v) => onChange({ ...filtros, linea: v })}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {lineas.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[10px] uppercase text-muted-foreground">Origen</label>
        <Select
          value={filtros.origenTipo}
          onValueChange={(v) => onChange({ ...filtros, origenTipo: v })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {origenes.map((o) => (
              <SelectItem key={o.tipo} value={o.tipo}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="text-[10px] uppercase text-muted-foreground">
          Prioridad mín: {filtros.prioridadMin}
        </label>
        <div className="pt-3">
          <Slider
            min={0}
            max={100}
            step={5}
            value={[filtros.prioridadMin]}
            onValueChange={(v) => onChange({ ...filtros, prioridadMin: v[0] ?? 0 })}
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] uppercase text-muted-foreground">Buscar SKU/nombre</label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={filtros.busqueda}
            onChange={(e) => onChange({ ...filtros, busqueda: e.target.value })}
            placeholder="Ej: 1060041…"
            className="pl-8 h-9"
          />
        </div>
      </div>
    </div>
  );
}
