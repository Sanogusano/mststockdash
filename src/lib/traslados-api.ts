// API y utilidades para el módulo de Logística & Traslados
// Maneja la comunicación con Supabase y agrupaciones de sugerencias.
import { supabase } from "@/integrations/supabase/client";

// ===== Tipos =====

export interface ParametrosMotor {
  p_snapshot_id?: string | null;
  p_linea_filter?: string[] | null;
  p_destino_filter?: string[] | null;
  p_ventana_semanas?: number;
  p_consolidacion_wos_trigger?: number;
  p_minimo_unidades_por_linea?: number;
  p_minimo_ventas_sobrestock?: number;
  p_ventana_productos_activos_dias?: number;
}

export type OrigenTipo =
  | "cedi_principal"
  | "cedi_guayabal"
  | "cedi_otro"
  | "consolidacion_lateral";

export interface SugerenciaTraslado {
  r_sku: string;
  r_linea: string;
  r_color: string;
  r_talla: string;
  r_nombre: string;
  r_destino_location_id: string;
  r_destino_nombre: string;
  r_destino_tier: string;
  r_origen_location_id: string;
  r_origen_nombre: string;
  r_origen_tipo: OrigenTipo;
  r_stock_destino: number;
  r_stock_origen: number;
  r_ritmo_semanal_destino: number;
  r_ritmo_ajustado_destino: number;
  r_dias_con_stock_destino: number;
  r_wos_actual_destino: number;
  r_wos_objetivo_destino: number;
  r_unidades_sugeridas: number;
  r_lead_time_dias: number;
  r_prioridad: number;
  r_justificacion: string;
}

export interface AgrupacionDestino {
  destino_location_id: string;
  destino_nombre: string;
  destino_tier: string;
  totalLineas: number;
  totalUnidades: number;
  prioridadPromedio: number;
  prioridadMaxima: number;
  origenes: { tipo: OrigenTipo; nombre: string; lineas: number }[];
  lineas: SugerenciaTraslado[];
}

export interface AgrupacionExport {
  origen_location_id: string;
  origen_nombre: string;
  origen_tipo: OrigenTipo;
  destino_location_id: string;
  destino_nombre: string;
  lineas: SugerenciaTraslado[];
  totalUnidades: number;
}

export interface SnapshotActivo {
  id: string;
  snapshot_date: string;
  total_skus: number | null;
  total_units: number | null;
  uploaded_at: string;
}

// ===== ID único de línea (para selección) =====
export function lineaId(s: SugerenciaTraslado): string {
  return `${s.r_sku}__${s.r_origen_location_id}__${s.r_destino_location_id}`;
}

// ===== Snapshot activo =====
export async function obtenerSnapshotActivo(): Promise<SnapshotActivo | null> {
  const { data, error } = await supabase
    .from("netsuite_inventory_snapshots")
    .select("id, snapshot_date, total_skus, total_units, uploaded_at")
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ===== Correr motor de allocation =====
export async function correrMotorAllocation(
  params: ParametrosMotor,
): Promise<SugerenciaTraslado[]> {
  const { data, error } = await supabase.rpc(
    "reporte_curva_traslados_v2",
    params as never,
  );
  if (error) throw error;
  return (data ?? []) as SugerenciaTraslado[];
}

// ===== Agrupaciones =====
export function agruparPorDestino(
  sugerencias: SugerenciaTraslado[],
): AgrupacionDestino[] {
  const map = new Map<string, AgrupacionDestino>();

  for (const s of sugerencias) {
    const key = s.r_destino_location_id;
    if (!map.has(key)) {
      map.set(key, {
        destino_location_id: s.r_destino_location_id,
        destino_nombre: s.r_destino_nombre,
        destino_tier: s.r_destino_tier,
        totalLineas: 0,
        totalUnidades: 0,
        prioridadPromedio: 0,
        prioridadMaxima: 0,
        origenes: [],
        lineas: [],
      });
    }
    const grp = map.get(key)!;
    grp.lineas.push(s);
    grp.totalLineas += 1;
    grp.totalUnidades += s.r_unidades_sugeridas || 0;
    grp.prioridadMaxima = Math.max(grp.prioridadMaxima, s.r_prioridad || 0);
  }

  // Calcular promedio y orígenes top
  for (const grp of map.values()) {
    const sumPrio = grp.lineas.reduce((a, l) => a + (l.r_prioridad || 0), 0);
    grp.prioridadPromedio = grp.lineas.length
      ? Math.round(sumPrio / grp.lineas.length)
      : 0;

    const origMap = new Map<string, { tipo: OrigenTipo; nombre: string; lineas: number }>();
    for (const l of grp.lineas) {
      const k = l.r_origen_location_id;
      if (!origMap.has(k)) {
        origMap.set(k, { tipo: l.r_origen_tipo, nombre: l.r_origen_nombre, lineas: 0 });
      }
      origMap.get(k)!.lineas += 1;
    }
    grp.origenes = [...origMap.values()].sort((a, b) => b.lineas - a.lineas);
  }

  return [...map.values()].sort((a, b) => b.prioridadPromedio - a.prioridadPromedio);
}

export function agruparParaExportacion(
  lineas: SugerenciaTraslado[],
): AgrupacionExport[] {
  const map = new Map<string, AgrupacionExport>();
  for (const l of lineas) {
    const key = `${l.r_origen_location_id}__${l.r_destino_location_id}`;
    if (!map.has(key)) {
      map.set(key, {
        origen_location_id: l.r_origen_location_id,
        origen_nombre: l.r_origen_nombre,
        origen_tipo: l.r_origen_tipo,
        destino_location_id: l.r_destino_location_id,
        destino_nombre: l.r_destino_nombre,
        lineas: [],
        totalUnidades: 0,
      });
    }
    const grp = map.get(key)!;
    grp.lineas.push(l);
    grp.totalUnidades += l.r_unidades_sugeridas || 0;
  }
  return [...map.values()];
}

// ===== Registro de exportación =====
export interface RegistroExport {
  snapshot_id: string | null;
  id_externo: string;
  fecha_traslado: string;
  empleado: string;
  origen_location_id: string;
  destino_location_id: string;
  origen_netsuite_id?: number | null;
  destino_netsuite_id?: number | null;
  lineas_json: unknown;
  total_unidades: number;
  total_lineas: number;
  subsidiaria?: number;
}

export async function registrarExportacion(reg: RegistroExport): Promise<void> {
  const { error } = await supabase.from("allocation_runs").insert({
    snapshot_id: reg.snapshot_id,
    id_externo: reg.id_externo,
    fecha_traslado: reg.fecha_traslado,
    empleado: reg.empleado,
    origen_location_id: reg.origen_location_id,
    destino_location_id: reg.destino_location_id,
    origen_netsuite_id: reg.origen_netsuite_id ?? null,
    destino_netsuite_id: reg.destino_netsuite_id ?? null,
    lineas_json: reg.lineas_json as never,
    total_unidades: reg.total_unidades,
    total_lineas: reg.total_lineas,
    subsidiaria: reg.subsidiaria ?? 2,
    status: "generated",
  });
  if (error) throw error;
}

// ===== Mapeo SKU → id_interno NetSuite =====
export async function obtenerMapeoSkus(
  skus: string[],
): Promise<Record<string, number>> {
  if (skus.length === 0) return {};
  const unique = [...new Set(skus)];
  const result: Record<string, number> = {};
  // Chunk en lotes de 200 para evitar URL muy larga
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from("netsuite_sku_mapping")
      .select("sku, netsuite_internal_id")
      .in("sku", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      result[row.sku] = Number(row.netsuite_internal_id);
    }
  }
  return result;
}

// ===== Códigos Oracle de ubicaciones (desde la vista de gestión) =====
export async function obtenerCodigosOracleUbicaciones(
  locationIds: string[],
): Promise<Record<string, number | null>> {
  if (locationIds.length === 0) return {};
  const unique = [...new Set(locationIds)];
  const { data, error } = await supabase
    .from("v_ubicaciones_gestion")
    .select("location_id, codigo_oracle")
    .in("location_id", unique);
  if (error) throw error;
  const result: Record<string, number | null> = {};
  for (const row of data ?? []) {
    if (row.location_id) result[row.location_id] = row.codigo_oracle ?? null;
  }
  return result;
}
