import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";

export interface FiltrosState {
  coleccion: string[];
  tipo: string[];
  genero: string[];
  etiqueta: string;
  buscar: string;
  vidaMin: string;
  vidaMax: string;
  estado: "todos" | "con" | "sin";
  sugerencia: string; // "todas" | key (lo controlan las tarjetas)
}

export const FILTROS_INICIALES: FiltrosState = {
  coleccion: [], tipo: [], genero: [], etiqueta: "", buscar: "", vidaMin: "", vidaMax: "", estado: "todos", sugerencia: "todas",
};

interface Props {
  value: FiltrosState;
  onChange: (v: FiltrosState) => void;
  opciones: { coleccion: string[]; tipo: string[]; genero: string[] };
}

export function PreciosFiltros({ value, onChange, opciones }: Props) {
  const set = <K extends keyof FiltrosState>(k: K, v: FiltrosState[K]) => onChange({ ...value, [k]: v });
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Colección</Label>
            <MultiSelectFilter label="Colección" options={opciones.coleccion} selected={value.coleccion} onChange={(v) => set("coleccion", v)} /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Tipo</Label>
            <MultiSelectFilter label="Tipo" options={opciones.tipo} selected={value.tipo} onChange={(v) => set("tipo", v)} /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Género</Label>
            <MultiSelectFilter label="Género" options={opciones.genero} selected={value.genero} onChange={(v) => set("genero", v)} /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Estado</Label>
            <Select value={value.estado} onValueChange={(v) => set("estado", v as FiltrosState["estado"])}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="con">Con descuento</SelectItem>
                <SelectItem value="sin">Sin descuento</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Tiempo de vida (semanas)</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} className="h-8 w-20 text-xs" value={value.vidaMin} onChange={(e) => set("vidaMin", e.target.value)} placeholder="desde" aria-label="Tiempo de vida desde" />
              <Input type="number" min={0} className="h-8 w-20 text-xs" value={value.vidaMax} onChange={(e) => set("vidaMax", e.target.value)} placeholder="hasta" aria-label="Tiempo de vida hasta" />
            </div></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Etiqueta</Label>
            <Input className="h-8 w-32 text-xs" value={value.etiqueta} onChange={(e) => set("etiqueta", e.target.value)} placeholder="HT26…" /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Buscar producto o SKU</Label>
            <Input className="h-8 w-48 text-xs" value={value.buscar} onChange={(e) => set("buscar", e.target.value)} placeholder="Nombre o SKU" /></div>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onChange(FILTROS_INICIALES)}>Limpiar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
