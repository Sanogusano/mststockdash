// Sincroniza el inventario completo de Shopify a inventory_snapshot.
// Se encadena a sí misma página por página (cursor GraphQL) hasta procesar TODO el catálogo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SHOPIFY_STORE = Deno.env.get("SHOPIFY_STORE") ?? "";
const SHOPIFY_TOKEN = Deno.env.get("SHOPIFY_TOKEN") ?? "";
const FUNCTION_NAME = "cron-inventory-snapshot";
const PAGE_SIZE = 200; // items por página GraphQL

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let payload: { cursor?: string | null; page?: number; total?: number } = {};
  try {
    payload = await req.json();
  } catch (_) { /* primer arranque sin body */ }

  const currentCursor = payload.cursor ?? null;
  const currentPage = payload.page ?? 0;
  const runningTotal = payload.total ?? 0;
  const isFirstPage = currentCursor === null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const today = new Date().toISOString().split("T")[0];

  try {
    // En la primera página: limpiar snapshot de hoy + marcar estado "running"
    if (isFirstPage) {
      await supabase.from("inventory_snapshot").delete().eq("snapshot_date", today);
      await supabase.from("inventory_sync_state").upsert({
        id: 1,
        status: "running",
        cursor: null,
        current_page: 0,
        total_inserted: 0,
        last_started_at: new Date().toISOString(),
        last_completed_at: null,
      });
    }

    // Query GraphQL a Shopify
    const query = `
      query getInventory($cursor: String) {
        inventoryItems(first: ${PAGE_SIZE}, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              variant { id }
              inventoryLevels(first: 50) {
                edges {
                  node {
                    location { id }
                    quantities(names: ["available"]) { quantity }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const shopifyRes = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        },
        body: JSON.stringify({ query, variables: { cursor: currentCursor } }),
      },
    );

    if (!shopifyRes.ok) {
      throw new Error(`Shopify HTTP ${shopifyRes.status}: ${await shopifyRes.text()}`);
    }

    const json = await shopifyRes.json();
    if (json.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const items = json.data?.inventoryItems?.edges || [];
    const records: Array<{ snapshot_date: string; variant_id: string; location_id: string; available: number }> = [];

    for (const item of items) {
      const variantIdRaw = item.node.variant?.id;
      if (!variantIdRaw) continue;
      const variantId = String(variantIdRaw).replace("gid://shopify/ProductVariant/", "");
      const levels = item.node.inventoryLevels?.edges || [];
      for (const lvl of levels) {
        const locationId = String(lvl.node.location?.id ?? "").replace("gid://shopify/Location/", "");
        if (!locationId) continue;
        const available = lvl.node.quantities?.[0]?.quantity ?? 0;
        records.push({ snapshot_date: today, variant_id: variantId, location_id: locationId, available });
      }
    }

    // Insertar en chunks de 1000 para evitar payloads gigantes
    if (records.length > 0) {
      for (let i = 0; i < records.length; i += 1000) {
        const chunk = records.slice(i, i + 1000);
        const { error: insertErr } = await supabase.from("inventory_snapshot").insert(chunk);
        if (insertErr) throw new Error(`Insert error: ${insertErr.message}`);
      }
    }

    const hasNextPage = !!json.data?.inventoryItems?.pageInfo?.hasNextPage;
    const nextCursor = json.data?.inventoryItems?.pageInfo?.endCursor ?? null;
    const newTotal = runningTotal + records.length;
    const newPage = currentPage + 1;

    // Actualizar estado
    await supabase.from("inventory_sync_state").upsert({
      id: 1,
      status: hasNextPage ? "running" : "idle",
      cursor: hasNextPage ? nextCursor : null,
      current_page: newPage,
      total_inserted: newTotal,
      last_completed_at: hasNextPage ? null : new Date().toISOString(),
    });

    // Encadenar siguiente página (fire-and-forget) si quedan más
    if (hasNextPage && nextCursor) {
      const authHeader = req.headers.get("authorization") ?? `Bearer ${SERVICE_ROLE_KEY}`;
      // No await: dejamos que la siguiente invocación corra en background.
      fetch(`${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ cursor: nextCursor, page: newPage, total: newTotal }),
      }).catch((e) => console.error("chain invoke failed", e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        page: newPage,
        inserted_this_page: records.length,
        total_inserted: newTotal,
        hasNextPage,
        nextCursor: hasNextPage ? nextCursor : null,
        estado: hasNextPage ? "Lote guardado, encadenando siguiente página…" : "¡Foto completa!",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    // Marcar error en estado para visibilidad
    try {
      await supabase.from("inventory_sync_state").upsert({
        id: 1,
        status: `error: ${String(error?.message ?? error).slice(0, 200)}`,
      });
    } catch (_) { /* ignore */ }

    return new Response(JSON.stringify({ error: error.message ?? String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
