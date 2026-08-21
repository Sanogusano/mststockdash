import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkuSearchPicker } from "./SkuSearchPicker";
import { CategoriaMultiSelect } from "./CategoriaMultiSelect";

interface Props {
  tipoRegla: string;
  params: Record<string, unknown>;
  onChange: (params: Record<string, unknown>) => void;
}

/** Rule types that calculate valor_objetivo automatically — hide the field */
export const RULES_WITHOUT_VALOR_OBJETIVO = ["tienda_cumplimiento"];

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
  venta_categoria: [],
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
  const isCategoriaRule = normalizedTipo === "venta_categoria";
  const isTiendaCumplimiento = normalizedTipo === "tienda_cumplimiento";

  if ((!fields || fields.length === 0) && !showTipoVenta && !isSkuRule && !isCategoriaRule && !isTiendaCumplimiento) return null;

  // ---- Cumplimiento de Tienda helpers ----
  const cond = (params.condiciones as Record<string, { activa?: boolean; min?: number }>) || {};
  const operador = ((params.operador as string) || "AND").toUpperCase();
  const setCond = (key: "cumplimiento_presupuesto_pct" | "upt" | "full_price_pct" | "ticket_promedio", patch: Partial<{ activa: boolean; min: number }>) => {
    const next = { ...cond, [key]: { ...(cond[key] || {}), ...patch } };
    onChange({ ...params, condiciones: next });
  };

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

  const categoriasSelected: string[] = Array.isArray(params.categorias)
    ? (params.categorias as unknown[]).map(String)
    : typeof params.categorias === "string" && params.categorias
      ? (params.categorias as string).split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  const tipoTicketValue = (params.tipo_ticket as string) || "minimo_real";
  const isPresupuestoSemanal = normalizedTipo === "presupuesto_semanal_dual";

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Parámetros específicos</p>
      {isTiendaCumplimiento && (
        <div className="space-y-3 rounded-md border p-3">
          <div>
            <Label className="text-xs">Operador entre condiciones</Label>
            <Select
              value={operador}
              onValueChange={(v) => onChange({ ...params, operador: v })}
            >
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="AND">AND · Excluyente (cumple TODAS las activas)</SelectItem>
                <SelectItem value="OR">OR · Incluyente (basta con UNA activa)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {([
            { key: "cumplimiento_presupuesto_pct", label: "% Cumplim. Presupuesto ≥", placeholder: "Ej: 100", step: "1", suffix: "%" },
            { key: "upt",             label: "UPT ≥",                placeholder: "Ej: 2.0",      step: "0.1" },
            { key: "full_price_pct",  label: "% Venta Full Price ≥", placeholder: "Ej: 60",       step: "1", suffix: "%" },
            { key: "ticket_promedio", label: "Ticket Promedio ≥ $",  placeholder: "Ej: 700000",   step: "1000" },
          ] as const).map((c) => {
            const activa = !!cond[c.key]?.activa;
            const min = cond[c.key]?.min ?? "";
            return (
              <div key={c.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={activa}
                  onChange={(e) => setCond(c.key, { activa: e.target.checked })}
                />
                <Label className="min-w-[210px] text-xs">{c.label}</Label>
                <Input
                  type="number"
                  step={c.step}
                  placeholder={c.placeholder}
                  disabled={!activa}
                  value={min === 0 ? "" : String(min)}
                  onChange={(e) => setCond(c.key, { min: e.target.value === "" ? 0 : Number(e.target.value) })}
                  className="h-9"
                />
                {"suffix" in c && c.suffix && <span className="text-xs text-muted-foreground">{c.suffix}</span>}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground leading-snug">
            Se evalúa por tienda dentro de todo el rango del incentivo, agrupado por canal
            (Tiendas / Outlets / Tienda Online / Personal Shopper). El % de cumplimiento
            de presupuesto solo aplica a tiendas físicas con presupuesto configurado. Se excluyen BOLSA e INSUMOS.
          </p>
        </div>
      )}
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
