import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkuSearchPicker } from "./SkuSearchPicker";

interface Props {
  tipoRegla: string;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

/** Rule types that calculate valor_objetivo automatically — hide the field */
export const RULES_WITHOUT_VALOR_OBJETIVO = ["presupuesto_semanal_dual", "tienda_cumplimiento"];

/** Canonical list of rule types shown in selects */
export const TIPO_REGLA_OPTIONS: { value: string; label: string; description?: string }[] = [
  { value: "presupuesto_semanal_dual", label: "Presupuesto Semanal", description: "Cumplimiento de presupuesto por semana con transacciones" },
  { value: "tienda_cumplimiento", label: "Cumplimiento de Tienda", description: "UPT, % Full Price y/o Ticket Promedio con operador AND/OR, por canal" },
  { value: "venta_categoria", label: "Venta por Categoría", description: "Unidades vendidas de una o varias categorías" },
  { value: "venta_sku", label: "Venta por SKU", description: "Unidades vendidas de SKUs específicos" },
  { value: "ticket_minimo", label: "Ticket Mínimo", description: "Transacciones con valor mínimo" },
  { value: "upt_minimo", label: "UPT Mínimo", description: "Transacciones con mínimo de unidades" },
  { value: "numero_pedidos", label: "Número de Pedidos", description: "Cantidad de pedidos con ticket promedio mínimo" },
];

/** Rules with a fixed (non-selectable) alcance */
export const FIXED_ALCANCE: Record<string, string> = {
  presupuesto_semanal_dual: "tienda",
  tienda_cumplimiento: "tienda",
  venta_categoria: "asesor",
  venta_sku: "asesor",
};

/** Tipo de pago options per rule type */
export function getTipoPagoOptions(tipoRegla: string): { value: string; label: string }[] {
  if (tipoRegla === "presupuesto_semanal_dual") {
    return [
      { value: "monto_fijo", label: "Monto Fijo" },
      { value: "bono_monto", label: "Bono en Dinero ($)" },
      { value: "bono_especie", label: "Bono en Especie" },
    ];
  }
  if (tipoRegla === "tienda_cumplimiento") {
    return [
      { value: "monto_fijo", label: "Monto Fijo" },
      { value: "bono_monto", label: "Bono en Dinero ($)" },
      { value: "bono_especie", label: "Bono en Especie (Almuerzo / Cine / Ropa)" },
    ];
  }
  return [
    { value: "monto_fijo", label: "Monto Fijo" },
    { value: "por_unidad", label: "Por Unidad" },
    { value: "porcentaje_venta", label: "Porcentaje sobre Venta" },
    { value: "bono_monto", label: "Bono en Dinero ($)" },
    { value: "bono_especie", label: "Bono en Especie" },
  ];
}

/** Options for in-kind bonuses */
export const TIPO_ESPECIE_OPTIONS = [
  { value: "almuerzo", label: "Bono Almuerzo" },
  { value: "cine", label: "Bono Cine" },
  { value: "ropa", label: "Bono Ropa" },
] as const;

type FieldDef = { label: string; key: string; type: "number" | "text"; placeholder: string };

const RULE_FIELDS: Record<string, FieldDef[]> = {
  presupuesto_semanal_dual: [
    { label: "Semanas del mes", key: "semanas_mes", type: "number", placeholder: "Ej: 3" },
    { label: "Ticket Meta", key: "ticket_meta", type: "number", placeholder: "Ej: 700000" },
  ],
  venta_categoria: [
    { label: "Categorías (separadas por coma)", key: "categorias", type: "text", placeholder: "Ej: SUNGLASSES, ACCESORIOS" },
  ],
  venta_sku: [
    { label: "SKUs (separados por coma)", key: "skus", type: "text", placeholder: "Ej: SKU001, SKU002" },
  ],
  ticket_minimo: [
    { label: "Valor ticket mínimo (COP)", key: "valor_ticket_minimo", type: "number", placeholder: "Ej: 700000" },
  ],
  upt_minimo: [
    { label: "Unidades mínimas por transacción", key: "unidades_minimas", type: "number", placeholder: "Ej: 3" },
  ],
  numero_pedidos: [
    { label: "Ticket promedio mínimo (COP)", key: "ticket_promedio_minimo", type: "number", placeholder: "Ej: 700000" },
  ],
};

/** Rules that include a tipo_venta selector in their parametros */
const RULES_WITH_TIPO_VENTA = ["venta_categoria", "venta_sku", "ticket_minimo", "upt_minimo", "numero_pedidos"];

export function IncentivosParametrosFields({ tipoRegla, params, onChange }: Props) {
  // Normalize alias: some places used "venta_skus" (plural) historically
  const normalizedTipo = tipoRegla === "venta_skus" ? "venta_sku" : tipoRegla;
  const fields = RULE_FIELDS[normalizedTipo];
  const showTipoVenta = RULES_WITH_TIPO_VENTA.includes(normalizedTipo);
  const isSkuRule = normalizedTipo === "venta_sku";

  if ((!fields || fields.length === 0) && !showTipoVenta && !isSkuRule) return null;

  const handleChange = (key: string, value: string, type: "number" | "text") => {
    const parsed: unknown = type === "number" ? (value === "" ? 0 : Number(value)) : value;
    onChange({ ...params, [key]: parsed });
  };

  const getDisplayValue = (key: string): string => {
    const val = params[key];
    if (val === undefined || val === null) return "";
    if (Array.isArray(val)) return val.join(", ");
    return String(val);
  };

  const tipoVentaValue = (params.tipo_venta as string) || "cualquiera";

  const skusSelected: string[] = Array.isArray(params.skus)
    ? (params.skus as unknown[]).map(String)
    : typeof params.skus === "string" && params.skus
      ? (params.skus as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const tipoTicketValue = (params.tipo_ticket as string) || "minimo_real";
  const isPresupuestoSemanal = normalizedTipo === "presupuesto_semanal_dual";

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Parámetros específicos</p>
      {isSkuRule && (
        <SkuSearchPicker
          label="SKUs incluidos"
          selected={skusSelected}
          onChange={(skus) => onChange({ ...params, skus })}
        />
      )}
      {!isSkuRule && fields?.map((field) => (
        <div key={field.key}>
          <Label>{field.label}</Label>
          <Input
            type={field.type === "number" ? "number" : "text"}
            placeholder={field.placeholder}
            value={getDisplayValue(field.key)}
            onChange={(e) => handleChange(field.key, e.target.value, field.type)}
          />
          {isPresupuestoSemanal && field.key === "ticket_meta" && (
            <div className="mt-2 space-y-1.5">
              <Label className="text-xs">Modo del Ticket</Label>
              <Select
                value={tipoTicketValue}
                onValueChange={(v) => onChange({ ...params, tipo_ticket: v })}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimo_real">
                    Ticket Mínimo Real (filtra pedidos &lt; ticket)
                  </SelectItem>
                  <SelectItem value="promedio_esperado">
                    Ticket Promedio Esperado (solo divisor para tx)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground leading-snug">
                {tipoTicketValue === "minimo_real"
                  ? "Solo se cuentan pedidos cuyo valor neto ≥ ticket. Pedidos pequeños no suman ni a venta ni a transacciones."
                  : "Se suman todos los pedidos. El ticket solo divide la meta para calcular cuántas transacciones se requieren."}
              </p>
            </div>
          )}
        </div>
      ))}
      {showTipoVenta && (
        <div>
          <Label>Tipo de Venta</Label>
          <Select value={tipoVentaValue} onValueChange={(v) => onChange({ ...params, tipo_venta: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="full_price">Full Price</SelectItem>
              <SelectItem value="cualquiera">Cualquiera</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

/** Convert raw JSON params (from DB) into the params object for the fields */
export function parseParamsFromJson(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object") return {};
  return json as Record<string, unknown>;
}
