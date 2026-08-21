import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, X } from "lucide-react";

interface CategoriaOption {
  categoria: string;
  categoria_padre: string | null;
  productos: number;
  tiene_venta: boolean;
  uds_periodo: number;
}

interface Props {
  label?: string;
  selected: string[];
  onChange: (categorias: string[]) => void;
  dias?: number;
}

const nf = new Intl.NumberFormat("es-CO");

export function CategoriaMultiSelect({ label = "Categorías incluidas", selected, onChange, dias = 90 }: Props) {
  const [options, setOptions] = useState<CategoriaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("categorias_disponibles", { p_dias: dias });
      if (!active) return;
      if (error) setError(error.message);
      else {
        setError(null);
        setOptions(((data as CategoriaOption[]) ?? []).slice().sort((a, b) => Number(b.uds_periodo ?? 0) - Number(a.uds_periodo ?? 0)));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [dias]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.categoria?.toLowerCase().includes(q) || (o.categoria_padre ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (cat: string) => {
    if (selected.includes(cat)) onChange(selected.filter((c) => c !== cat));
    else onChange([...selected, cat]);
  };

  const sinVentaSeleccionadas = selected.filter(
    (c) => options.find((o) => o.categoria === c)?.tiene_venta === false,
  );

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1">
              {c}
              <button type="button" onClick={() => toggle(c)} aria-label={`Quitar ${c}`}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        placeholder="Buscar categoría..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-9"
      />

      <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
        {loading && (
          <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando categorías...
          </div>
        )}
        {error && <div className="p-3 text-xs text-destructive">{error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Sin resultados</div>
        )}
        {!loading &&
          !error &&
          filtered.map((o) => {
            const checked = selected.includes(o.categoria);
            return (
              <label
                key={o.categoria}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs hover:bg-muted"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(o.categoria)} className="h-3.5 w-3.5" />
                <span className={`flex-1 truncate ${o.tiene_venta ? "text-foreground" : "text-muted-foreground"}`}>
                  {o.categoria}
                  {o.categoria_padre && (
                    <span className="ml-1 text-muted-foreground">· {o.categoria_padre}</span>
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">{nf.format(Number(o.uds_periodo ?? 0))} uds</span>
                {!o.tiene_venta && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                    Sin venta
                  </Badge>
                )}
              </label>
            );
          })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Unidades vendidas en los últimos {dias} días. Las marcadas “Sin venta” no registran movimiento reciente.
      </p>

      {sinVentaSeleccionadas.length > 0 && (
        <p className="text-[11px] text-amber-700">
          Seleccionaste {sinVentaSeleccionadas.length} categoría(s) sin venta reciente: {sinVentaSeleccionadas.join(", ")}.
        </p>
      )}
    </div>
  );
}
