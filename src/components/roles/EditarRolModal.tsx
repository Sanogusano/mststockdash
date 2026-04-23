import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  guardarRol,
  listPermissionCatalog,
  listRolePermissions,
  reemplazarPermisosRol,
  type Role,
} from "@/lib/permissions-api";
import { MatrizPermisos } from "./MatrizPermisos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role | null;
}

export function EditarRolModal({ open, onOpenChange, role }: Props) {
  const qc = useQueryClient();
  const isSystem = role?.is_system_role ?? false;
  const isNew = !role;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [key, setKey] = useState("");
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

  const { data: catalog = [] } = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: listPermissionCatalog,
    enabled: open,
  });

  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions", role?.id],
    queryFn: () => listRolePermissions(role!.id),
    enabled: open && !!role?.id,
  });

  useEffect(() => {
    if (open) {
      setName(role?.name ?? "");
      setDescription(role?.description ?? "");
      setKey(role?.key ?? "");
      setSeleccionados(
        new Set(rolePerms.filter((p) => p.granted).map((p) => `${p.module_key}:${p.action_key}`)),
      );
    }
  }, [open, role, rolePerms]);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    catalog.forEach((p) => m.set(`${p.module_key}:${p.action_key}`, p.module_group ?? "Otros"));
    return m;
  }, [catalog]);

  const handleToggle = (moduleKey: string, actionKey: string) => {
    if (isSystem) return;
    setSeleccionados((prev) => {
      const next = new Set(prev);
      const k = `${moduleKey}:${actionKey}`;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const handleBulk = (groupName: string, granted: boolean) => {
    if (isSystem) return;
    setSeleccionados((prev) => {
      const next = new Set(prev);
      catalog.forEach((p) => {
        if ((p.module_group ?? "Otros") === groupName) {
          const k = `${p.module_key}:${p.action_key}`;
          if (granted) next.add(k);
          else next.delete(k);
        }
      });
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isSystem) throw new Error("El rol del sistema no se puede editar");
      if (!name.trim()) throw new Error("Nombre requerido");
      const finalKey = isNew ? key.trim().toLowerCase().replace(/\s+/g, "_") : role!.key;
      if (isNew && !finalKey) throw new Error("Key requerido");

      const roleId = await guardarRol({
        id: role?.id,
        key: finalKey,
        name,
        description,
      });
      await reemplazarPermisosRol(roleId, seleccionados);
      return roleId;
    },
    onSuccess: () => {
      toast.success(isNew ? "Rol creado" : "Rol actualizado");
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSystem && <Lock className="h-4 w-4" />}
            {isNew ? "Nuevo rol" : isSystem ? `Ver rol: ${role!.name}` : `Editar rol: ${role!.name}`}
          </DialogTitle>
          <DialogDescription>
            {isSystem
              ? "Este rol pertenece al sistema y no puede modificarse."
              : "Define la matriz de permisos. Los cambios afectan a todos los usuarios con este rol."}
          </DialogDescription>
        </DialogHeader>

        {isSystem && (
          <Alert>
            <AlertDescription className="text-xs">
              Los roles marcados como "sistema" están protegidos para evitar bloqueos accidentales del acceso.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 gap-4 mt-2">
          <div>
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isSystem} />
          </div>
          <div>
            <Label>Key (interno)</Label>
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={isSystem || !isNew}
              placeholder="ej. supervisor_zona"
            />
          </div>
        </div>

        <div>
          <Label>Descripción</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSystem}
            className="resize-none h-16"
          />
        </div>

        <div className="mt-2">
          <h4 className="text-sm font-semibold mb-2">
            Matriz de permisos · {seleccionados.size} otorgados
          </h4>
          <MatrizPermisos
            permisos={catalog}
            seleccionados={seleccionados}
            onToggle={handleToggle}
            onBulk={handleBulk}
            readonly={isSystem}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {isSystem ? "Cerrar" : "Cancelar"}
          </Button>
          {!isSystem && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
