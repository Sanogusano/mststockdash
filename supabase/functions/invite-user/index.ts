import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validar invitador
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return json({ error: "Unauthorized" }, 401);

    const inviterRole = authData.user.app_metadata?.role;
    if (inviterRole !== "admin") {
      return json({ error: "Solo admins pueden invitar usuarios" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Body inválido" }, 400);

    const { email, fullName, roleId, scopeLocationIds } = body as {
      email?: string;
      fullName?: string;
      roleId?: string;
      scopeLocationIds?: string[] | null;
    };

    if (!email || !fullName || !roleId) {
      return json({ error: "Campos requeridos: email, fullName, roleId" }, 400);
    }

    // Buscar el role.key para sincronizar app_metadata
    const { data: role, error: roleErr } = await supabaseAdmin
      .from("roles")
      .select("id, key")
      .eq("id", roleId)
      .maybeSingle();
    if (roleErr || !role) return json({ error: "Rol no encontrado" }, 400);

    // Crear invitación
    const appUrl = Deno.env.get("APP_URL") ?? new URL(req.url).origin;
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${appUrl}/reset-password`,
      });

    if (inviteError) return json({ error: inviteError.message }, 400);
    const newUserId = inviteData.user!.id;

    // Sincronizar app_metadata.role para que las RLS lo reconozcan
    const { error: metaErr } = await supabaseAdmin.auth.admin.updateUserById(
      newUserId,
      { app_metadata: { role: role.key } },
    );
    if (metaErr) console.error("updateUserById error:", metaErr);

    // Crear/actualizar perfil
    const { error: profileError } = await supabaseAdmin
      .from("user_profiles")
      .upsert(
        {
          user_id: newUserId,
          full_name: fullName,
          role_id: roleId,
          scope_location_ids: scopeLocationIds && scopeLocationIds.length > 0
            ? scopeLocationIds
            : null,
          invited_by: (claimsData.claims as any).sub,
          invited_at: new Date().toISOString(),
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (profileError) return json({ error: profileError.message }, 400);

    return json({ success: true, userId: newUserId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    console.error("invite-user error:", msg);
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
