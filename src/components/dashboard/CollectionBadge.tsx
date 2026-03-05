import { cn } from "@/lib/utils";

interface Props {
  coleccion: string | null | undefined;
  className?: string;
}

export function CollectionBadge({ coleccion, className }: Props) {
  const label = coleccion && coleccion.trim() && coleccion !== "Otros" ? coleccion : "Otros";
  const isOtros = label === "Otros";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
        isOtros
          ? "bg-muted/50 text-muted-foreground border-border"
          : "bg-primary/10 text-primary border-primary/20",
        className
      )}
    >
      🏷️ {label}
    </span>
  );
}
