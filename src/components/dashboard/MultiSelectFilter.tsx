import { useState, useRef, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}

export function MultiSelectFilter({ label, options, selected, onChange, className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const allSelected = selected.length === 0;
  const displayText = allSelected
    ? `Todos`
    : selected.length === 1
    ? selected[0].substring(0, 18)
    : `${selected.length} seleccionados`;

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter((s) => s !== val));
    else onChange([...selected, val]);
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs gap-1 justify-between min-w-[140px]"
        onClick={() => setOpen(!open)}
      >
        <span className="truncate">{label}: {displayText}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-md border bg-popover p-2 shadow-lg max-h-64 overflow-y-auto">
          <div className="flex gap-1">
            <button
              className="flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-primary font-medium"
              onClick={() => onChange([...options])}
            >
              Marcar todos
            </button>
            <button
              className="flex-1 text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground font-medium"
              onClick={() => onChange([])}
            >
              Limpiar
            </button>
          </div>
          <div className="border-t border-border my-1" />
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-xs"
            >
              <Checkbox
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
                className="h-3.5 w-3.5"
              />
              <span className="truncate text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
