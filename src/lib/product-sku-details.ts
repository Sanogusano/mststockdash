import { supabase } from "@/integrations/supabase/client";
import { buildRpcDateParams } from "@/components/dashboard/TimeFilter";

export interface ProductSkuDetail {
  sku: string; talla: string; unidades_vendidas: number; stock_disponible: number;
  precio_prom_venta: number | null; sell_through_pct: number; wos: number; clasificacion: string;
}

// Rankings are grouped by exact catalog title, not by SKU or product_id.
export async function fetchProductSkuDetails(product: string, days: number, canal?: string | null, location?: string | null, from?: Date, to?: Date): Promise<ProductSkuDetail[]> {
  const ids = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("product_catalog").select("product_id").eq("title", product).range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.product_id) ids.add(row.product_id);
    if ((data?.length ?? 0) < 1000) break;
  }
  const dates = buildRpcDateParams(days, from, to);
  const channel = canal === "digital" || canal === "DIGITAL" ? "DIGITAL" : canal && canal !== "all" ? "POS" : null;
  const results = await Promise.all([...ids].map(async (id) => {
    const { data, error } = await supabase.rpc("reporte_detalle_skus_producto" as any, {
      ...dates, p_product_id: id, canal_filtro: channel, location_filtro: location || null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as ProductSkuDetail[];
  }));
  return results.flat();
}
