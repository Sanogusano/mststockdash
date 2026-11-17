import { supabase } from "@/integrations/supabase/client";

/** Fetch a complete RPC result in stable order; progress counts successful rows. */
export async function fetchAllRpc<T>(
  fn: string,
  params: object,
  orderBy: string | string[],
  pageSize = 1000,
  onProgress?: (count: number) => void,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error("El tamaño de página debe estar entre 1 y 1000.");
  }
  const columns = typeof orderBy === "string" ? [orderBy] : orderBy;
  const rows: T[] = [];
  onProgress?.(0);
  for (let from = 0; ; from += pageSize) {
    let query = supabase.rpc(fn as never, params as never);
    for (const column of columns) query = query.order(column);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data ?? []) as unknown as T[];
    rows.push(...chunk);
    onProgress?.(rows.length);
    if (chunk.length < pageSize) return rows;
  }
}