/**
 * API para gestionar snapshots de inventario NetSuite en Supabase.
 */
import { supabase } from "@/integrations/supabase/client";
import type { NetsuiteLine } from "./parse-netsuite-xls";

export interface UploadSnapshotParams {
  fileName: string;
  snapshotDate: string;
  totalSkus: number;
  totalUnits: number;
  totalLocations: number;
  lines: NetsuiteLine[];
}

const BATCH_SIZE = 500;

/**
 * Cruza nombres de ubicación NetSuite contra la tabla de mapeo
 * y devuelve las que no tienen mapeo (para warnings).
 */
export async function findUnmappedLocations(
  locationNames: string[]
): Promise<string[]> {
  if (locationNames.length === 0) return [];
  const { data, error } = await supabase
    .from("netsuite_location_mapping")
    .select("netsuite_location_name, internal_location_id")
    .in("netsuite_location_name", locationNames);

  if (error) throw error;

  const mapped = new Set(
    (data || [])
      .filter((m) => m.internal_location_id)
      .map((m) => m.netsuite_location_name)
  );
  return locationNames.filter((n) => !mapped.has(n));
}

/**
 * Sube un snapshot completo: desactiva otros del mismo día,
 * crea el registro maestro e inserta líneas en lotes.
 */
export async function uploadSnapshot(
  params: UploadSnapshotParams,
  onProgress?: (pct: number) => void
): Promise<string> {
  // 1. Desactivar TODOS los snapshots activos (solo uno debe quedar activo:
  //    el que se está subiendo). Antes solo desactivaba los del mismo día,
  //    lo que dejaba activos los de días anteriores y acumulaba varios activos.
  const { error: deactErr } = await supabase
    .from("netsuite_inventory_snapshots")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactErr) throw deactErr;

  // 2. Crear snapshot en estado 'parsing'
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: snapshot, error: insErr } = await supabase
    .from("netsuite_inventory_snapshots")
    .insert({
      file_name: params.fileName,
      snapshot_date: params.snapshotDate,
      status: "parsing",
      total_skus: params.totalSkus,
      total_units: params.totalUnits,
      total_locations: params.totalLocations,
      is_active: true,
      uploaded_by: user?.id ?? null,
    })
    .select()
    .single();

  if (insErr || !snapshot) throw insErr ?? new Error("No se creó el snapshot");

  try {
    // 3. Resolver mapeo de ubicaciones (una sola vez para todo el archivo)
    const allLocs = [...new Set(params.lines.map((l) => l.netsuiteLocationName))];
    const { data: mappings, error: mapErr } = await supabase
      .from("netsuite_location_mapping")
      .select("netsuite_location_name, internal_location_id")
      .in("netsuite_location_name", allLocs);
    if (mapErr) throw mapErr;

    const mappingDict: Record<string, string | null> = Object.fromEntries(
      (mappings || []).map((m) => [
        m.netsuite_location_name,
        m.internal_location_id,
      ])
    );

    // 4. Insertar líneas en lotes
    const total = params.lines.length;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = params.lines.slice(i, i + BATCH_SIZE);
      const rows = batch.map((line) => ({
        snapshot_id: snapshot.id,
        sku: line.sku,
        netsuite_location_name: line.netsuiteLocationName,
        internal_location_id: mappingDict[line.netsuiteLocationName] || null,
        quantity: line.quantity,
        sub_tipo: line.subTipo,
        coleccion: line.coleccion,
        coleccion_sku: line.coleccionSku,
        nombre: line.nombre,
        linea: line.linea,
        genero: line.genero,
        color: line.color,
        talla: line.talla,
      }));

      const { error } = await supabase
        .from("netsuite_inventory_lines")
        .insert(rows);
      if (error) throw error;

      if (onProgress) {
        onProgress(Math.min(100, Math.floor(((i + batch.length) / total) * 100)));
      }
    }

    // 5. Marcar como processed
    await supabase
      .from("netsuite_inventory_snapshots")
      .update({ status: "processed" })
      .eq("id", snapshot.id);

    return snapshot.id;
  } catch (err: any) {
    await supabase
      .from("netsuite_inventory_snapshots")
      .update({
        status: "error",
        error_message: err?.message ?? String(err),
        is_active: false,
      })
      .eq("id", snapshot.id);
    throw err;
  }
}

/**
 * Activa un snapshot histórico (desactiva todos los demás).
 */
export async function activateSnapshot(snapshotId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from("netsuite_inventory_snapshots")
    .update({ is_active: false })
    .eq("is_active", true);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("netsuite_inventory_snapshots")
    .update({ is_active: true })
    .eq("id", snapshotId);
  if (e2) throw e2;
}

/**
 * Elimina un snapshot. Las lines deben ir en cascade desde el FK.
 * Si no hay cascade, primero borramos las lines.
 */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  // Borrar líneas explícitamente por seguridad
  const { error: linesErr } = await supabase
    .from("netsuite_inventory_lines")
    .delete()
    .eq("snapshot_id", snapshotId);
  if (linesErr) throw linesErr;

  const { error } = await supabase
    .from("netsuite_inventory_snapshots")
    .delete()
    .eq("id", snapshotId);
  if (error) throw error;
}

export interface SnapshotRow {
  id: string;
  file_name: string;
  snapshot_date: string;
  status: string;
  total_skus: number | null;
  total_units: number | null;
  total_locations: number | null;
  is_active: boolean;
  uploaded_at: string;
  uploaded_by: string | null;
  error_message: string | null;
}

export async function fetchSnapshotHistory(
  limit = 20
): Promise<SnapshotRow[]> {
  const { data, error } = await supabase
    .from("netsuite_inventory_snapshots")
    .select(
      "id, file_name, snapshot_date, status, total_skus, total_units, total_locations, is_active, uploaded_at, uploaded_by, error_message"
    )
    .order("uploaded_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as SnapshotRow[];
}

export async function fetchActiveSnapshot(): Promise<SnapshotRow | null> {
  const { data, error } = await supabase
    .from("netsuite_inventory_snapshots")
    .select(
      "id, file_name, snapshot_date, status, total_skus, total_units, total_locations, is_active, uploaded_at, uploaded_by, error_message"
    )
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SnapshotRow) || null;
}

/**
 * ¿Existe ya un snapshot activo del mismo día? Para confirmar reemplazo.
 */
export async function existsActiveSnapshotForDate(
  snapshotDate: string
): Promise<SnapshotRow | null> {
  const { data, error } = await supabase
    .from("netsuite_inventory_snapshots")
    .select(
      "id, file_name, snapshot_date, status, total_skus, total_units, total_locations, is_active, uploaded_at, uploaded_by, error_message"
    )
    .eq("snapshot_date", snapshotDate)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SnapshotRow) || null;
}

// ── Conciliación NetSuite ↔ Shopify ──────────────────────────────────────────

export interface ConciliacionPreviewRow {
  tipo: string;
  combinaciones: number;
  uds_shopify: number;
  uds_netsuite: number;
}

export interface ConciliacionLogRow {
  id: number;
  tipo: string;
  sku: string | null;
  producto: string | null;
  color: string | null;
  talla: string | null;
  ubicacion: string;
  location_id: string;
  qty_shopify_antes: number | null;
  qty_netsuite: number | null;
}

/** Preview (solo lectura): qué cambiaría la conciliación, sin escribir. */
export async function previewConciliacion(): Promise<ConciliacionPreviewRow[]> {
  const { data, error } = await supabase.rpc(
    "preview_conciliacion_netsuite" as any
  );
  if (error) throw error;
  return (data ?? []) as ConciliacionPreviewRow[];
}

/** Aplica la conciliación (escribe NetSuite sobre el inventario de hoy). */
export async function aplicarConciliacion(): Promise<{
  actualizados: number;
  insertados: number;
  omitidos: number;
  discrepancias: number;
}> {
  const { data, error } = await supabase.rpc(
    "aplicar_conciliacion_netsuite" as any
  );
  if (error) throw error;
  const r = (data ?? [])[0] ?? {};
  return {
    actualizados: Number(r.actualizados ?? 0),
    insertados: Number(r.insertados ?? 0),
    omitidos: Number(r.omitidos ?? 0),
    discrepancias: Number(r.discrepancias ?? 0),
  };
}

/** Trae el log de la última conciliación con nombres legibles (producto + ubicación). */
export async function fetchConciliacionLog(): Promise<ConciliacionLogRow[]> {
  const { data, error } = await supabase.rpc("reporte_conciliacion_log" as any, {
    p_tipo: null,
  });
  if (error) throw error;
  return (data ?? []) as ConciliacionLogRow[];
}
