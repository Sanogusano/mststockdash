import { supabase } from "@/integrations/supabase/client";

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
};

export type RolePermission = {
  role_id: string;
  module_key: string;
  action_key: string;
  granted: boolean;
};

export type PermissionCatalogItem = {
  module_key: string;
  module_name: string;
  module_group: string | null;
  module_order: number;
  action_key: string;
  action_name: string;
  action_order: number;
  description: string | null;
};

export type UsuarioGestion = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role_key: string | null;
  role_name: string | null;
  is_active: boolean;
  scope_location_ids: string[] | null;
  scope_descripcion: string | null;
  last_login_at: string | null;
  last_sign_in_at: string | null;
  invited_at: string | null;
  overrides_count: number;
  created_at: string | null;
};

export type UserOverride = {
  id: string;
  user_id: string;
  module_key: string;
  action_key: string;
  granted: boolean;
  reason: string | null;
  created_at: string;
};

// ----- Catálogos -----

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("is_system_role", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as Role[];
}

export async function listPermissionCatalog(): Promise<PermissionCatalogItem[]> {
  const { data, error } = await supabase
    .from("permission_catalog")
    .select("*")
    .order("module_order")
    .order("action_order");
  if (error) throw error;
  return (data ?? []) as PermissionCatalogItem[];
}

export async function listRolePermissions(roleId: string): Promise<RolePermission[]> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("*")
    .eq("role_id", roleId);
  if (error) throw error;
  return (data ?? []) as RolePermission[];
}

export async function countUsersByRole(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("role_id");
  if (error) throw error;
  const map: Record<string, number> = {};
  (data ?? []).forEach((r: any) => {
    if (r.role_id) map[r.role_id] = (map[r.role_id] ?? 0) + 1;
  });
  return map;
}

// ----- Usuarios -----

export async function listUsuarios(): Promise<UsuarioGestion[]> {
  const { data, error } = await supabase
    .from("v_usuarios_gestion")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UsuarioGestion[];
}

export async function actualizarPerfilUsuario(
  userId: string,
  payload: {
    full_name?: string;
    is_active?: boolean;
    scope_location_ids?: string[] | null;
  }
) {
  const { error } = await supabase
    .from("user_profiles")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw error;
}

// ----- Overrides -----

export async function listUserOverrides(userId: string): Promise<UserOverride[]> {
  const { data, error } = await supabase
    .from("user_permission_overrides")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserOverride[];
}

export async function crearOverride(payload: {
  user_id: string;
  module_key: string;
  action_key: string;
  granted: boolean;
  reason?: string | null;
}) {
  const { error } = await supabase.from("user_permission_overrides").insert(payload);
  if (error) throw error;
}

export async function eliminarOverride(id: string) {
  const { error } = await supabase
    .from("user_permission_overrides")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ----- Roles (matriz) -----

export async function guardarRol(payload: {
  id?: string;
  key: string;
  name: string;
  description?: string | null;
}) {
  if (payload.id) {
    const { error } = await supabase
      .from("roles")
      .update({
        name: payload.name,
        description: payload.description ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.id);
    if (error) throw error;
    return payload.id;
  }
  const { data, error } = await supabase
    .from("roles")
    .insert({
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      is_system_role: false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/**
 * Reemplaza la matriz completa de permisos de un rol.
 * `permisos` = set de claves "module_key:action_key" otorgadas.
 */
export async function reemplazarPermisosRol(
  roleId: string,
  permisos: Set<string>
) {
  const { error: delErr } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);
  if (delErr) throw delErr;

  if (permisos.size === 0) return;

  const rows = Array.from(permisos).map((k) => {
    const [module_key, action_key] = k.split(":");
    return { role_id: roleId, module_key, action_key, granted: true };
  });

  const { error: insErr } = await supabase.from("role_permissions").insert(rows);
  if (insErr) throw insErr;
}

// ----- Edge Functions -----

export async function invitarUsuario(payload: {
  email: string;
  fullName: string;
  roleId: string;
  scopeLocationIds?: string[] | null;
}) {
  const { data, error } = await supabase.functions.invoke("invite-user", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function actualizarRolUsuario(payload: {
  userId: string;
  newRoleId: string;
}) {
  const { data, error } = await supabase.functions.invoke("update-user-role", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { success: boolean; requiresReauth: boolean };
}

// ----- Locations (para selector de scope) -----

export async function listLocationsParaScope() {
  const { data, error } = await supabase
    .from("locations")
    .select("location_id, name, zona")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
