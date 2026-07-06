# Incentivo "Cumplimiento de Tienda" (multi-condición por canal)

## 1. Nuevo `tipo_regla`: `tienda_cumplimiento`

Alcance fijo: **tienda**. Periodo: **todo el rango** (`fecha_inicio → fecha_fin`).

**Parámetros JSON** (`incentivo_reglas.parametros`):

```json
{
  "operador": "AND",              // AND | OR entre condiciones activas
  "condiciones": {
    "upt":            { "activa": true,  "min": 2.0 },
    "full_price_pct": { "activa": true,  "min": 60 },   // %
    "ticket_promedio":{ "activa": false, "min": 700000 } // COP netos
  }
}
```

Reglas de cálculo (por tienda, sobre pedidos pagados/parcial-pagados, excluyendo `BOLSA` e `INSUMOS`, IVA 1.19, TZ Bogotá):

- **UPT** = `Σ unidades / COUNT(DISTINCT pedidos)`
- **% Full Price** = `venta_neta_full / venta_neta_total * 100` (fallback markdown a `product_catalog.compare_at_price`)
- **Ticket promedio** = `venta_neta_total / COUNT(DISTINCT pedidos)`

Se calcula una fila `incentivo_liquidaciones` por tienda con:

```json
progreso_actual: {
  "canal": "Tiendas" | "Outlets" | "Online" | "Personal Shopper",
  "upt": 2.31, "full_price_pct": 63.4, "ticket_promedio": 812345,
  "unidades": 154, "pedidos": 67, "venta_neta": 54.3M,
  "condiciones_activas": ["upt","full_price_pct"],
  "resultados": {"upt": true, "full_price_pct": false},
  "operador": "AND"
}
cumple_meta: bool según operador
```

**Canal Online**: para pedidos en Bodega Ecommerce se emiten **dos filas** por tienda:
- `Tienda Online` → `source_name <> 'shopify_draft_order'`
- `Personal Shopper` → `source_name = 'shopify_draft_order'`

## 2. Nuevas opciones de recompensa

Se añaden a `incentivo_recompensas.tipo_pago`:

- `bono_monto` — bono en dinero (usa `valor` como monto COP).
- `bono_especie` — bono en especie; nueva columna JSON `metadatos` o campo `parametros_pago` con `{ "tipo_especie": "almuerzo" | "cine" | "ropa", "descripcion": "..." }`.

Se mantiene `monto_fijo` para compatibilidad hacia atrás.

## 3. UI — Wizard de creación (`IncentivosWizard` + `IncentivosParametrosFields`)

**Paso 2 (Condiciones)** cuando `tipo_regla = tienda_cumplimiento`:

- Selector Operador: `AND` (excluyente – cumple todas) / `OR` (incluyente – cumple al menos una).
- 3 filas con checkbox + input numérico:
  - `[ ] UPT ≥ __`
  - `[ ] % Venta Full Price ≥ __ %`
  - `[ ] Ticket Promedio ≥ $ __`
- Se oculta el campo genérico "Valor Objetivo".

**Paso 3 (Pago)**: agregar `Bono Monto ($)` y `Bono en Especie` (con sub-select Almuerzo / Cine / Ropa cuando aplica).

## 4. UI — Vista de liquidación

Nueva vista `TiendaCumplimientoDetailView`:

- **Agrupada por Canal** (Tiendas, Outlets, Online, Personal Shopper).
- Tabla por canal con columnas: Tienda · UPT · %FP · Ticket Prom · Pedidos · Venta Neta · Condiciones cumplidas · ✅ Cumple · Monto/Especie ganado.
- Chips de resumen: `N tiendas cumplen / Total`, `Total pagar $`.

`LiquidacionPanel` enruta `tipo_regla === "tienda_cumplimiento"` a esta vista.

## 5. Cambios técnicos

### Migración SQL (approval)
1. Extender `actualizar_progreso_incentivo` con bloque para `tienda_cumplimiento` que:
   - Construye CTE `pedidos` (excluye BOLSA/INSUMOS, IVA 1.19, paid/partially_paid, TZ Bogotá).
   - Marca `es_full_price` por ítem (order-level classification memoria + fallback `compare_at_price`).
   - Deriva `canal` desde `locations.tipo_tienda` y desdobla Bodega Ecommerce en `Tienda Online` / `Personal Shopper` vía `source_name`.
   - Agrega por (`location_id`, `canal`) UPT/%FP/Ticket/pedidos/venta.
   - Evalúa condiciones activas con operador AND/OR y calcula `monto_ganado` (`bono_monto` = `valor`; `bono_especie` = 0 monto, `progreso.especie` guarda el bono).
2. (Opcional) columna `incentivo_recompensas.parametros_pago jsonb` para guardar `tipo_especie/descripcion`.

### Frontend
- `IncentivosParametrosFields.tsx`: agregar rama `tienda_cumplimiento` + opción en `TIPO_REGLA_OPTIONS` y `FIXED_ALCANCE`.
- `IncentivosWizard.tsx`: builder de parámetros, validaciones, ocultar valor_objetivo, nuevos tipos de pago.
- `IncentivosEditDialog.tsx`: soporte edición.
- `liquidacion/TiendaCumplimientoDetailView.tsx` nuevo + registro en `LiquidacionPanel`.
- `liquidacion/CampanasListView.tsx`: mostrar chips "Cumplen X/Y por canal" para este tipo.

## 6. Fuera de alcance
- Persistir catálogo editable de bonos en especie (por ahora enum fijo Almuerzo/Cine/Ropa).
- Notificaciones automáticas al ganador.
- Cambiar cálculo global de UPT/%FP fuera de este incentivo.
