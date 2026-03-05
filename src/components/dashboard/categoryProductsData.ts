import { supabase } from "@/integrations/supabase/client";

export interface ProductRow {
  foto: string;
  producto: string;
  product_id: string;
  stock_total: number;
  venta_prom_semanal: number;
  wos: number;
  estado_salud: string;
  und_full_price: number;
  und_rebajas: number;
  und_promo: number;
  und_total: number;
  clasificacion: string;
  coleccion: string;
}

interface FetchCategoryProductsParams {
  categoria: string;
  effectiveDays: number;
  locationId?: string | null;
  canal?: string | null;
}

export async function fetchCategoryProducts({ categoria, effectiveDays, locationId, canal }: FetchCategoryProductsParams): Promise<ProductRow[]> {
  const { data: rpcData, error } = await supabase.rpc("reporte_productos_por_categoria" as any, {
    dias_atras: effectiveDays,
    p_categoria: categoria,
    p_location_id: locationId || null,
    p_canal: canal || null,
  });
  if (error) throw new Error(error.message);

  const rpcRows = (rpcData ?? []) as unknown as ProductRow[];

  // Fallback/merge inventory snapshot by category so the drawer reflects real stock even with low/no sales.
  const { data: catalogRows, error: catalogError } = await supabase
    .from("product_catalog")
    .select("product_id, title, image_url, collection_season, variant_id")
    .eq("category", categoria)
    .not("product_id", "is", null)
    .not("variant_id", "is", null);

  if (catalogError || !catalogRows?.length) return rpcRows;

  const variantToProduct = new Map<string, string>();
  const productMeta = new Map<string, { producto: string; foto: string; coleccion: string }>();
  const variantIds: string[] = [];

  for (const row of catalogRows) {
    if (!row.variant_id || !row.product_id) continue;
    variantToProduct.set(row.variant_id, row.product_id);
    variantIds.push(row.variant_id);

    if (!productMeta.has(row.product_id)) {
      productMeta.set(row.product_id, {
        producto: row.title ?? row.product_id,
        foto: row.image_url ?? "",
        coleccion: row.collection_season ?? "Otros",
      });
    }
  }

  if (!variantIds.length) return rpcRows;

  let latestSnapshotQuery = supabase
    .from("inventory_snapshot")
    .select("snapshot_date")
    .order("snapshot_date", { ascending: false })
    .limit(1);

  if (locationId) latestSnapshotQuery = latestSnapshotQuery.eq("location_id", locationId);

  const { data: latestSnapshotRows } = await latestSnapshotQuery;
  const latestSnapshotDate = latestSnapshotRows?.[0]?.snapshot_date;
  if (!latestSnapshotDate) return rpcRows;

  let inventoryQuery = supabase
    .from("inventory_snapshot")
    .select("variant_id, available")
    .eq("snapshot_date", latestSnapshotDate)
    .in("variant_id", [...new Set(variantIds)]);

  if (locationId) inventoryQuery = inventoryQuery.eq("location_id", locationId);

  const { data: inventoryRows, error: inventoryError } = await inventoryQuery;
  if (inventoryError || !inventoryRows) return rpcRows;

  const stockByProduct = new Map<string, number>();
  for (const inv of inventoryRows) {
    if (!inv.variant_id) continue;
    const productId = variantToProduct.get(inv.variant_id);
    if (!productId) continue;
    const available = Number(inv.available ?? 0);
    if (available <= 0) continue;
    stockByProduct.set(productId, (stockByProduct.get(productId) ?? 0) + available);
  }

  const rpcByProduct = new Map(rpcRows.map((r) => [r.product_id, r]));
  const mergedProductIds = new Set<string>([
    ...rpcRows.map((r) => r.product_id).filter(Boolean),
    ...Array.from(stockByProduct.keys()),
  ]);

  const mergedRows: ProductRow[] = Array.from(mergedProductIds).map((productId) => {
    const existing = rpcByProduct.get(productId);
    const stockFromSnapshot = stockByProduct.get(productId) ?? 0;
    const meta = productMeta.get(productId);

    if (existing) {
      return {
        ...existing,
        stock_total: Math.max(existing.stock_total ?? 0, stockFromSnapshot),
        foto: existing.foto || meta?.foto || "",
        coleccion: existing.coleccion || meta?.coleccion || "Otros",
      };
    }

    return {
      foto: meta?.foto ?? "",
      producto: meta?.producto ?? productId,
      product_id: productId,
      stock_total: stockFromSnapshot,
      venta_prom_semanal: 0,
      wos: stockFromSnapshot > 0 ? 999 : 0,
      estado_salud: stockFromSnapshot > 0 ? "ESTANCADO" : "SIN DATOS",
      und_full_price: 0,
      und_rebajas: 0,
      und_promo: 0,
      und_total: 0,
      clasificacion: "Sin clasificación",
      coleccion: meta?.coleccion ?? "Otros",
    };
  });

  return mergedRows.sort((a, b) => (b.und_total ?? 0) - (a.und_total ?? 0) || (b.stock_total ?? 0) - (a.stock_total ?? 0));
}
