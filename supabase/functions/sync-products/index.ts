// Sync de catálogo de productos desde Shopify Admin GraphQL a product_catalog.
// Paginación orquestada por el frontend: se invoca con { cursor } y responde
// { hasNextPage, nextCursor, count } por lote.
//
// Seguridad: SHOPIFY_TOKEN se lee de Deno.env; el dominio por defecto es
// "monasterycouture.myshopify.com". Se permite override opcional por body
// (shopify_domain / shopify_token) para no romper scripts existentes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE_SIZE = 50;

const PRODUCTS_QUERY = `
query SyncProducts($cursor: String) {
  products(first: ${PAGE_SIZE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        productType
        createdAt
        publishedAt
        featuredImage { url }
        metafields(first: 25) {
          edges { node { namespace key value type } }
        }
        variants(first: 100) {
          edges {
            node {
              id
              sku
              title
              price
              compareAtPrice
              selectedOptions { name value }
            }
          }
        }
      }
    }
  }
}`;

function gidToId(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1];
}

function pickMetafield(
  metafields: Array<{ namespace: string; key: string; value: string }>,
  keys: string[],
): string | null {
  for (const mf of metafields) {
    const k = (mf.key || "").toLowerCase();
    if (keys.some((needle) => k.includes(needle))) {
      return mf.value ?? null;
    }
  }
  return null;
}

function optionValue(
  options: Array<{ name: string; value: string }>,
  needles: string[],
): string | null {
  for (const opt of options) {
    const n = (opt.name || "").toLowerCase();
    if (needles.some((x) => n.includes(x))) return opt.value ?? null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const cursor: string | null = body?.cursor ?? null;

    const shopify_domain: string =
      body?.shopify_domain ?? "monasterycouture.myshopify.com";
    const shopify_token: string | undefined =
      body?.shopify_token ?? Deno.env.get("SHOPIFY_TOKEN") ?? undefined;

    if (!shopify_token) {
      return new Response(
        JSON.stringify({ error: "SHOPIFY_TOKEN no configurado en el entorno" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const gqlRes = await fetch(
      `https://${shopify_domain}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopify_token,
        },
        body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { cursor } }),
      },
    );

    if (!gqlRes.ok) {
      const t = await gqlRes.text();
      throw new Error(`Shopify GraphQL ${gqlRes.status}: ${t.slice(0, 500)}`);
    }
    const gqlJson = await gqlRes.json();
    if (gqlJson.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(gqlJson.errors).slice(0, 500)}`);
    }

    const products = gqlJson.data?.products;
    const edges = products?.edges ?? [];
    const hasNextPage: boolean = !!products?.pageInfo?.hasNextPage;
    const nextCursor: string | null = products?.pageInfo?.endCursor ?? null;

    const rows: Record<string, unknown>[] = [];
    const now = new Date().toISOString().slice(0, 10);

    for (const pEdge of edges) {
      const p = pEdge.node;
      const productId = gidToId(p.id);
      const metafields = (p.metafields?.edges ?? []).map((e: any) => e.node);

      const collection_season = pickMetafield(metafields, ["collection", "season", "coleccion"]);
      const target_gender = pickMetafield(metafields, ["gender", "genero"]);

      const variants = p.variants?.edges ?? [];
      for (const vEdge of variants) {
        const v = vEdge.node;
        const opts = v.selectedOptions ?? [];
        const color = optionValue(opts, ["color"]);
        const size = optionValue(opts, ["size", "talla"]);

        rows.push({
          product_id: productId,
          variant_id: gidToId(v.id),
          sku: v.sku ?? null,
          title: p.title ?? null,
          category: p.productType ?? null,
          image_url: p.featuredImage?.url ?? null,
          price: v.price != null ? Number(v.price) : null,
          compare_at_price: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
          color,
          variant_name: size ?? v.title ?? null,
          collection_season,
          target_gender,
          fecha_creacion: p.createdAt ?? null,
          fecha_publicacion: p.publishedAt ?? null,
          fecha_cargue_inventario: now,
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.rpc("upsert_product_catalog_safe", {
        products_json: rows,
      });
      if (error) throw new Error(`RPC upsert_product_catalog_safe: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ hasNextPage, nextCursor, count: rows.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
