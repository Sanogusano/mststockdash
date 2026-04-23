import { useEffect, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listLocationsParaScope } from "@/lib/permissions-api";
import { useQuery } from "@tanstack/react-query";

interface Props {
  value: string[] | null; // null = todas
  onChange: (next: string[] | null) => void;
}

export function ScopeUbicacionesSelector({ value, onChange }: Props) {
  const [mode, setMode] = useState<"all" | "specific">(value === null ? "all" : "specific");
  const [search, setSearch] = useState("");

  const { data: locations = [] } = useQuery({
    queryKey: ["locations-scope"],
    queryFn: listLocationsParaScope,
  });

  useEffect(() => {
    setMode(value === null ? "all" : "specific");
  }, [value]);

  const filtered = locations.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = new Set(value ?? []);

  return (
    <div className="space-y-3">
      <RadioGroup
        value={mode}
        onValueChange={(v: string) => {
          setMode(v as "all" | "specific");
          onChange(v === "all" ? null : []);
        }}
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="all" id="scope-all" />
          <Label htmlFor="scope-all" className="cursor-pointer">
            Todas las ubicaciones
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="specific" id="scope-specific" />
          <Label htmlFor="scope-specific" className="cursor-pointer">
            Ubicaciones específicas
          </Label>
        </div>
      </RadioGroup>

      {mode === "specific" && (
        <div className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar ubicación..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{selected.size} seleccionadas</span>
            <button
              type="button"
              className="hover:text-foreground"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
          <ScrollArea className="h-56 pr-2">
            <div className="space-y-1">
              {filtered.map((loc) => {
                const checked = selected.has(loc.location_id);
                return (
                  <label
                    key={loc.location_id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const next = new Set(selected);
                        if (c) next.add(loc.location_id);
                        else next.delete(loc.location_id);
                        onChange(Array.from(next));
                      }}
                    />
                    <span className="text-sm flex-1 truncate">{loc.name}</span>
                    {loc.zona && (
                      <Badge variant="outline" className="text-[10px]">
                        {loc.zona}
                      </Badge>
                    )}
                    {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin resultados
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
