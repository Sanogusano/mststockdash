import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  tipoRegla: string;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

const RULE_FIELDS: Record<string, { label: string; key: string; type: string; placeholder: string }[]> = {
  presupuesto: [],
  presupuesto_semanal_dual: [
    { label: "Meta Semana 1-2", key: "meta_semana_1_2", type: "number", placeholder: "Ej: 3000000" },
    { label: "Meta Semana 3-4", key: "meta_semana_3_4", type: "number", placeholder: "Ej: 5000000" },
  ],
  venta_categoria: [
    { label: "Categorías (separadas por coma)", key: "categorias", type: "text", placeholder: "Ej: Calzado, Bolsos, Accesorios" },
  ],
  venta_skus: [
    { label: "SKUs (separados por coma)", key: "skus", type: "text", placeholder: "Ej: SKU001, SKU002, SKU003" },
  ],
  ticket_minimo: [
    { label: "Valor Mínimo del Ticket", key: "ticket_minimo", type: "number", placeholder: "Ej: 150000" },
  ],
  metodo_pago: [
    { label: "Métodos de Pago (separados por coma)", key: "metodos", type: "text", placeholder: "Ej: Efectivo, Tarjeta Crédito" },
  ],
};

export function IncentivosParametrosFields({ tipoRegla, params, onChange }: Props) {
  const fields = RULE_FIELDS[tipoRegla];

  if (!fields || fields.length === 0) return null;

  const handleChange = (key: string, value: string, type: string) => {
    let parsed: unknown;
    if (type === "number") {
      parsed = value === "" ? 0 : Number(value);
    } else {
      // For comma-separated lists, store as array
      parsed = value.includes(",")
        ? value.split(",").map((s) => s.trim()).filter(Boolean)
        : value;
    }
    onChange({ ...params, [key]: parsed });
  };

  const getDisplayValue = (key: string, type: string): string => {
    const val = params[key];
    if (val === undefined || val === null) return "";
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Parámetros específicos</p>
      {fields.map((field) => (
        <div key={field.key}>
          <Label>{field.label}</Label>
          <Input
            type={field.type === "number" ? "number" : "text"}
            placeholder={field.placeholder}
            value={getDisplayValue(field.key, field.type)}
            onChange={(e) => handleChange(field.key, e.target.value, field.type)}
          />
        </div>
      ))}
    </div>
  );
}

/** Convert raw JSON params (from DB) into the params object for the fields */
export function parseParamsFromJson(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return {};
  return json as Record<string, unknown>;
}
