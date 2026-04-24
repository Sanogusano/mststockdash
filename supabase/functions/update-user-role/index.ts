import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);
    if (authData.user.app_metadata?.role !== "admin") {
      return json({ error: "Solo admins pueden cambiar roles" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Body inválido" }, 400);

    const { userId, newRoleId } = body as { userId?: string; newRoleId?: string };
    if (!userId || !newRoleId) return json({ error: "Campos requeridos: userId, newRoleId" }, 400);

    // Buscar rol por uuid, key o name
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let roleQuery = supabaseAdmin.from("roles").select("id, key, name");
    roleQuery = uuidRegex.test(newRoleId)
      ? roleQuery.eq("id", newRoleId)
      : roleQuery.or(`key.eq.${newRoleId},name.eq.${newRoleId}`);

    const { data: rolesData, error: roleErr } = await roleQuery.limit(1);
    const role = rolesData?.[0];
    if (roleErr || !role) {
      return json({ error: `Rol no existe: ${newRoleId}${roleErr ? ` (${roleErr.message})` : ""}` }, 400);
    }

    // Proteger último admin
    if (role.key !== "admin") {
      const { data: targetProfile } = await supabaseAdmin
        .from("user_profiles")
        .select("role_id, roles:role_id(key)")
        .eq("user_id", userId)
        .maybeSingle();

      const currentKey = (targetProfile as any)?.roles?.key;

      if (currentKey === "admin") {
        const { data: adminRole } = await supabaseAdmin.from("roles").select("id").eq("key", "admin").single();

        const { count } = await supabaseAdmin
          .from("user_profiles")
          .select("*", { count: "exact", head: true })
          .eq("role_id", adminRole!.id)
          .eq("is_active", true);

        if ((count ?? 0) <= 1) {
          return json({ error: "No puedes quitar el último admin activo del sistema" }, 400);
        }
      }
    }

    // Actualizar user_profiles
    const { error: upErr } = await supabaseAdmin
      .from("user_profiles")
      .upsert({ user_id: userId, role_id: role.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (upErr) return json({ error: upErr.message }, 400);

    // Sincronizar app_metadata
    const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      app_metadata: { role: role.key },
    });
    if (metaErr) return json({ error: metaErr.message }, 400);

    return json({ success: true, requiresReauth: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("update-user-role error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
