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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invitarUsuario, type Role } from "@/lib/permissions-api";
import { ScopeUbicacionesSelector } from "./ScopeUbicacionesSelector";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
}

export function InvitarUsuarioModal({ open, onOpenChange, roles }: Props) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [roleId, setRoleId] = useState<string>("");
  const [scope, setScope] = useState<string[] | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setFullName("");
      setRoleId("");
      setScope(null);
    }
  }, [open]);

  const mutation = useMutation({
    mutationFn: invitarUsuario,
    onSuccess: () => {
      toast.success(`Invitación enviada a ${email}`);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      onOpenChange(false);
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Error al invitar");
    },
  });

  // Roles que requieren al menos 1 ubicación en su scope.
  const ROLES_CON_SCOPE_OBLIGATORIO = new Set(["tienda"]);
  const selectedRole = roles.find((r) => r.id === roleId);
  const scopeRequerido = selectedRole ? ROLES_CON_SCOPE_OBLIGATORIO.has(selectedRole.key) : false;
  const scopeInvalido = scopeRequerido && (!scope || scope.length === 0);

  const handleSubmit = () => {
    if (!email || !email.includes("@")) {
      toast.error("Email inválido");
      return;
    }
    if (!fullName.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    if (!roleId) {
      toast.error("Selecciona un rol");
      return;
    }
    if (scopeInvalido) {
      toast.error(
        `Los usuarios con rol ${selectedRole?.name} deben tener al menos 1 ubicación asignada`,
      );
      return;
    }
    mutation.mutate({ email, fullName, roleId, scopeLocationIds: scope });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invitar usuario</DialogTitle>
          <DialogDescription>
            Se enviará un email de invitación con un link para configurar la contraseña.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@monastery.com.co"
            />
          </div>

          <div>
            <Label htmlFor="name">Nombre completo *</Label>
            <Input
              id="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Pérez"
            />
          </div>

          <div>
            <Label>Rol *</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un rol..." />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRole?.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedRole.description}
              </p>
            )}
          </div>

          <div>
            <Label>Scope de ubicaciones</Label>
            <ScopeUbicacionesSelector value={scope} onChange={setScope} />
            {scopeRequerido && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Los usuarios con rol {selectedRole?.name} deben tener al menos 1 ubicación asignada.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending || scopeInvalido}>
            {mutation.isPending ? "Enviando..." : "Enviar invitación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
