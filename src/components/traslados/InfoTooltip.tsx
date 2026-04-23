// Componente reutilizable: ícono de información con tooltip explicativo.
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReactNode } from "react";

interface InfoTooltipProps {
  content: string | ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function InfoTooltip({ content, side = "top", className }: InfoTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center align-middle ml-1 text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.preventDefault()}
        >
          <Info className={`h-3.5 w-3.5 ${className ?? ""}`} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs whitespace-pre-line leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
