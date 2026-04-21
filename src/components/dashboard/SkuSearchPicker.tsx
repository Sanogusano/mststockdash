import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Search, Loader2 } from "lucide-react";

interface SkuSearchPickerProps {
  selected: string[];
  onChange: (skus: string[]) => void;
  label?: string;
}

interface CatalogResult {
  sku: string;
  title: string | null;
  image_url: string | null;
  category: string | null;
}

export function SkuSearchPicker({ selected, onChange, label = "Buscar SKUs" }: SkuSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("product_catalog")
        .select("sku, title, image_url, category")
        .or(`sku.ilike.%${term}%,title.ilike.%${term}%`)
        .not("sku", "is", null)
        .limit(25);
      if (!error && data) {
        // Deduplicate by SKU
        const seen = new Set<string>();
        const unique: CatalogResult[] = [];
        for (const row of data as CatalogResult[]) {
          if (!row.sku || seen.has(row.sku)) continue;
          seen.add(row.sku);
          unique.push(row);
        }
        setResults(unique);
      }
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleSku = (sku: string) => {
    if (selectedSet.has(sku)) {
      onChange(selected.filter((s) => s !== sku));
    } else {
      onChange([...selected, sku]);
    }
  };

  const removeSku = (sku: string) => onChange(selected.filter((s) => s !== sku));

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label}</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por SKU o nombre del producto..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        {open && (query.trim().length >= 2) && (
          <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-md max-h-72 overflow-auto">
            {loading && (
              <div className="flex items-center justify-center p-3 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
              </div>
            )}
            {!loading && results.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Sin resultados</div>
            )}
            {!loading && results.map((r) => {
              const isSelected = selectedSet.has(r.sku);
              return (
                <button
                  type="button"
                  key={r.sku}
                  onClick={() => toggleSku(r.sku)}
                  className={`flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-accent text-sm ${
                    isSelected ? "bg-accent/60" : ""
                  }`}
                >
                  {r.image_url ? (
                    <img src={r.image_url} alt="" className="h-8 w-8 object-cover rounded" />
                  ) : (
                    <div className="h-8 w-8 rounded bg-muted" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">{r.sku}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.title || "Sin nombre"}{r.category ? ` · ${r.category}` : ""}
                    </div>
                  </div>
                  {isSelected && <Badge variant="secondary" className="text-[10px]">Añadido</Badge>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((sku) => (
            <Badge key={sku} variant="secondary" className="gap-1 font-mono text-[11px]">
              {sku}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-3.5 w-3.5 p-0 hover:bg-transparent"
                onClick={() => removeSku(sku)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
          <span className="text-[11px] text-muted-foreground self-center ml-1">
            {selected.length} SKU{selected.length === 1 ? "" : "s"} seleccionado{selected.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}
