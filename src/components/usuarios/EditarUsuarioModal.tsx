import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import {
  actualizarPerfilUsuario,
  actualizarRolUsuario,
  type Role,
  type UsuarioGestion,
} from "@/lib/permissions-api";
import { ScopeUbicacionesSelector } from "./ScopeUbicacionesSelector";
import { OverridesPermissionsPanel } from "./OverridesPermissionsPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  usuario: UsuarioGestion | null;
  roles: Role[];
}

export function EditarUsuarioModal({ open, onOpenChange, usuario, roles }: Props) {
  const qc = useQueryClient();
  const { session, signOut } = useAuth();
  const myUserId = session?.user?.id;

  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [scope, setScope] = useState<string[] | null>(null);

  useEffect(() => {
    if (usuario) {
      setFullName(usuario.full_name ?? "");
      const role = roles.find((r) => r.key === usuario.role_key);
      setRoleId(role?.id ?? "");
      setIsActive(usuario.is_active);
      setScope(usuario.scope_location_ids);
    }
  }, [usuario, roles]);

  const isSelf = usuario?.user_id === myUserId;
  const originalRole = roles.find((r) => r.key === usuario?.role_key);
  const roleChanged = roleId && originalRole && roleId !== originalRole.id;

  // Roles que requieren scope obligatorio (mín 1 ubicación). El resto puede tener scope=null.
  const ROLES_CON_SCOPE_OBLIGATORIO = new Set(["tienda"]);
  const selectedRole = roles.find((r) => r.id === roleId);
  const scopeRequerido = selectedRole ? ROLES_CON_SCOPE_OBLIGATORIO.has(selectedRole.key) : false;
  const scopeInvalido = scopeRequerido && (!scope || scope.length === 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!usuario) throw new Error("Sin usuario");

      // Bloqueo: no puedes desactivarte a ti mismo
      if (isSelf && !isActive) {
        throw new Error("No puedes desactivarte a ti mismo");
      }

      // Validación de scope obligatorio para roles tipo "tienda"
      if (scopeInvalido) {
        throw new Error(
          `Los usuarios con rol ${selectedRole?.name} deben tener al menos 1 ubicación asignada`,
        );
      }

      // Update perfil (nombre, scope, activo)
      await actualizarPerfilUsuario(usuario.user_id, {
        full_name: fullName,
        is_active: isActive,
        scope_location_ids: scope,
      });

      // Si cambió el rol, llamar Edge Function
      if (roleChanged) {
        await actualizarRolUsuario({ userId: usuario.user_id, newRoleId: roleId });
      }

      return { roleChanged, isSelf };
    },
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });

      if (result.roleChanged) {
        if (result.isSelf) {
          toast.success("Tu rol cambió. Cerrando sesión para aplicar...");
          setTimeout(async () => {
            await signOut();
            window.location.href = "/login";
          }, 1500);
          return;
        }
        toast.success("Usuario actualizado. Debe re-loguearse para aplicar el nuevo rol.");
      } else {
        toast.success("Usuario actualizado");
      }
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  if (!usuario) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-2">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="info">Información</TabsTrigger>
            <TabsTrigger value="overrides">Permisos especiales</TabsTrigger>
            <TabsTrigger value="audit">Auditoría</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 pt-4">
            <div>
              <Label>Nombre completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>

            <div>
              <Label>Email</Label>
              <Input value={usuario.email ?? ""} disabled />
            </div>

            <div>
              <Label>Rol</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleChanged && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ {isSelf ? "Tu sesión se cerrará para aplicar el nuevo rol." : "El usuario debe re-loguearse para aplicar el nuevo rol."}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border border-border rounded-lg p-3">
              <div>
                <Label className="text-sm">Usuario activo</Label>
                <p className="text-xs text-muted-foreground">
                  Si se desactiva no podrá iniciar sesión.
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSelf}
              />
            </div>

            <div>
              <Label>Scope de ubicaciones</Label>
              <ScopeUbicacionesSelector value={scope} onChange={setScope} />
            </div>
          </TabsContent>

          <TabsContent value="overrides" className="pt-4">
            <OverridesPermissionsPanel userId={usuario.user_id} />
          </TabsContent>

          <TabsContent value="audit" className="pt-4 space-y-3 text-sm">
            <Row label="Último login" value={usuario.last_sign_in_at ?? usuario.last_login_at} isDate />
            <Row label="Invitado el" value={usuario.invited_at} isDate />
            <Row label="Creado el" value={usuario.created_at} isDate />
            <Row label="Overrides activos" value={String(usuario.overrides_count)} />
            <Row
              label="Estado"
              value={<Badge variant={usuario.is_active ? "default" : "secondary"}>{usuario.is_active ? "Activo" : "Inactivo"}</Badge>}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, isDate }: { label: string; value: any; isDate?: boolean }) {
  let display: any = value ?? "—";
  if (isDate && value) {
    try {
      display = new Date(value).toLocaleString("es-CO");
    } catch {
      display = value;
    }
  }
  return (
    <div className="flex justify-between border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{display}</span>
    </div>
  );
}
