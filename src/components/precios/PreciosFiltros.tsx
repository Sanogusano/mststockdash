import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";
import { SUGERENCIAS } from "./types";

export interface FiltrosState {
  coleccion: string[];
  tipo: string[];
  genero: string[];
  etiqueta: string;
  buscar: string;
  vidaMin: string;
  vidaMax: string;
  estado: "todos" | "con" | "sin";
  sugerencia: string; // "todas" | key | "etiquetas"
}

export const FILTROS_INICIALES: FiltrosState = {
  coleccion: [], tipo: [], genero: [], etiqueta: "", buscar: "", vidaMin: "", vidaMax: "", estado: "todos", sugerencia: "todas",
};

interface Props {
  value: FiltrosState;
  onChange: (v: FiltrosState) => void;
  opciones: { coleccion: string[]; tipo: string[]; genero: string[]; sugerencia: string[] };
}

export function PreciosFiltros({ value, onChange, opciones }: Props) {
  const set = <K extends keyof FiltrosState>(k: K, v: FiltrosState[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><Label className="text-xs">Colección</Label>
        <MultiSelectFilter label="Colección" options={opciones.coleccion} selected={value.coleccion} onChange={(v) => set("coleccion", v)} /></div>
      <div className="space-y-1"><Label className="text-xs">Tipo</Label>
        <MultiSelectFilter label="Tipo" options={opciones.tipo} selected={value.tipo} onChange={(v) => set("tipo", v)} /></div>
      <div className="space-y-1"><Label className="text-xs">Género</Label>
        <MultiSelectFilter label="Género" options={opciones.genero} selected={value.genero} onChange={(v) => set("genero", v)} /></div>
      <div className="space-y-1"><Label className="text-xs">Etiqueta</Label>
        <Input className="h-8 w-32 text-xs" value={value.etiqueta} onChange={(e) => set("etiqueta", e.target.value)} placeholder="HT26…" /></div>
      <div className="space-y-1"><Label className="text-xs">Buscar producto o SKU</Label>
        <Input className="h-8 w-48 text-xs" value={value.buscar} onChange={(e) => set("buscar", e.target.value)} placeholder="Nombre o SKU" /></div>
      <div className="space-y-1"><Label className="text-xs">Tiempo de vida (sem)</Label>
        <div className="flex gap-1">
          <Input type="number" min={0} className="h-8 w-16 text-xs" value={value.vidaMin} onChange={(e) => set("vidaMin", e.target.value)} placeholder="Mín" />
          <Input type="number" min={0} className="h-8 w-16 text-xs" value={value.vidaMax} onChange={(e) => set("vidaMax", e.target.value)} placeholder="Máx" />
        </div></div>
      <div className="space-y-1"><Label className="text-xs">Estado</Label>
        <Select value={value.estado} onValueChange={(v) => set("estado", v as FiltrosState["estado"])}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="con">Con descuento</SelectItem>
            <SelectItem value="sin">Sin descuento</SelectItem>
          </SelectContent>
        </Select></div>
      <div className="space-y-1"><Label className="text-xs">Sugerencia</Label>
        <Select value={value.sugerencia} onValueChange={(v) => set("sugerencia", v)}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {opciones.sugerencia.map((s) => <SelectItem key={s} value={s}>{SUGERENCIAS[s]?.label ?? s}</SelectItem>)}
            <SelectItem value="etiquetas">Etiquetas desalineadas</SelectItem>
          </SelectContent>
        </Select></div>
      <Button variant="outline" size="sm" className="h-8" onClick={() => onChange(FILTROS_INICIALES)}>Limpiar</Button>
    </div>
  );
}
