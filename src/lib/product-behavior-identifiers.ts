export interface ProductIdentifiers {
  product_id: string | null;
  sku_padre: string | null;
  referencia_ns: string | null;
  skus_hijos: string | null;
}

export async function loadProductIdentifiers(
  fetchPage: (from: number, to: number) => Promise<ProductIdentifiers[]>,
) {
  const map = new Map<string, ProductIdentifiers>();
  for (let from = 0; ; from += 1000) {
    const chunk = await fetchPage(from, from + 999);
    for (const row of chunk) {
      if (row.product_id) map.set(row.product_id, row);
    }
    if (chunk.length < 1000) break;
  }
  return map;
}

export function joinProductIdentifiers<T extends { product_id: string }>(
  rows: T[], map: Map<string, ProductIdentifiers>,
) {
  return rows.map((row) => {
    const identifiers = map.get(row.product_id);
    return {
      ...row,
      sku_padre: identifiers?.sku_padre ?? "",
      referencia_ns: identifiers?.referencia_ns ?? "",
      skus_hijos: identifiers?.skus_hijos ?? "",
    };
  });
}

export function matchesProductSearch(
  row: { producto: string; sku_padre?: string; referencia_ns?: string; skus_hijos?: string },
  search: string,
) {
  const term = search.trim().toLocaleLowerCase("es");
  return [row.producto, row.sku_padre, row.referencia_ns, row.skus_hijos]
    .some((value) => (value ?? "").toLocaleLowerCase("es").includes(term));
}

export function productExportIdentity(row: {
  producto: string; sku_padre?: string; referencia_ns?: string; skus_hijos?: string;
}) {
  return {
    "SKU padre": String(row.sku_padre ?? ""),
    "Referencia NS": row.referencia_ns ?? "",
    Producto: displayProductName(row.producto, row.referencia_ns),
    "SKUs hijos": String(row.skus_hijos ?? ""),
  };
}
/** Productos sin título llegan como "10000411251401 : 1000…"; se muestra la referencia NS. */
export function displayProductName(producto: string, referencia?: string | null) {
  return /^\d+ : /.test(producto ?? "") && referencia ? referencia : producto;
}
