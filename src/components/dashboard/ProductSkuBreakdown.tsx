import { useQuery } from "@tanstack/react-query";
import { fetchProductSkuDetails } from "@/lib/product-sku-details";

export function ProductSkuBreakdown({ product, days, canal, location, from, to }: {
  product: string; days: number; canal?: string | null; location?: string | null; from?: Date; to?: Date;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ranking-skus", product, days, canal, location, from?.toISOString(), to?.toISOString()],
    queryFn: () => fetchProductSkuDetails(product, days, canal, location, from, to),
  });
  if (isLoading) return <p className="p-4 text-muted-foreground">Cargando tallas…</p>;
  if (error) return <p role="alert" className="p-4 text-destructive">{error.message}</p>;
  if (!data?.length) return <p className="p-4 text-muted-foreground">Sin SKUs para estos filtros.</p>;
  return <table className="w-full text-xs"><thead><tr>{["SKU", "Talla", "Vendidas", "Stock"].map(label => <th key={label} className="p-3 text-left">{label}</th>)}</tr></thead><tbody>{data.map((row, i) => <tr key={`${row.sku}-${i}`} className="border-t border-border"><td className="p-3">{row.sku}</td><td className="p-3">{row.talla}</td><td className="p-3">{Number(row.unidades_vendidas).toLocaleString("es-CO")}</td><td className="p-3">{Number(row.stock_disponible).toLocaleString("es-CO")}</td></tr>)}</tbody></table>;
}
