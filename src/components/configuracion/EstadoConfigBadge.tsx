import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Circle, Ban } from "lucide-react";

export type EstadoConfig =
  | "ok"
  | "falta_codigo_oracle"
  | "sin_parametros"
  | "inactiva"
  | "location_inactiva";

interface Props {
  estado: EstadoConfig | string | null;
}

const config: Record<
  EstadoConfig,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  ok: {
    label: "Configurado",
    className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/20",
    Icon: CheckCircle2,
  },
  falta_codigo_oracle: {
    label: "Falta código Oracle",
    className: "bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/20",
    Icon: AlertTriangle,
  },
  sin_parametros: {
    label: "Sin parámetros",
    className: "bg-red-500/15 text-red-700 border-red-500/30 hover:bg-red-500/20",
    Icon: XCircle,
  },
  inactiva: {
    label: "Inactiva",
    className: "bg-muted text-muted-foreground border-border",
    Icon: Circle,
  },
  location_inactiva: {
    label: "Location inactiva",
    className: "bg-muted/60 text-muted-foreground border-border",
    Icon: Ban,
  },
};

export function EstadoConfigBadge({ estado }: Props) {
  const key = (estado ?? "sin_parametros") as EstadoConfig;
  const c = config[key] ?? config.sin_parametros;
  const Icon = c.Icon;
  return (
    <Badge variant="outline" className={`gap-1 font-medium ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </Badge>
  );
}
