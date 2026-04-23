import { Lock, Users, Edit, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/lib/permissions-api";

interface Props {
  roles: Role[];
  permissionCounts: Record<string, number>;
  userCounts: Record<string, number>;
  onEdit: (role: Role) => void;
  onDuplicate?: (role: Role) => void;
}

export function RolesList({ roles, permissionCounts, userCounts, onEdit, onDuplicate }: Props) {
  return (
    <div className="space-y-2">
      {roles.map((role) => {
        const isSystem = role.is_system_role;
        const permCount = permissionCounts[role.id] ?? 0;
        const userCount = userCounts[role.id] ?? 0;
        return (
          <div
            key={role.id}
            className="border border-border rounded-lg p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors"
          >
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              {isSystem ? <Lock className="h-5 w-5" /> : <Users className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{role.name}</h3>
                {isSystem && (
                  <Badge variant="outline" className="text-[10px]">
                    sistema
                  </Badge>
                )}
              </div>
              {role.description && (
                <p className="text-sm text-muted-foreground truncate">
                  {role.description}
                </p>
              )}
              <div className="flex gap-2 mt-1">
                <Badge variant="secondary" className="text-[10px]">
                  {permCount} permisos
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {userCount} usuarios
                </Badge>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => onEdit(role)}>
                <Edit className="h-3.5 w-3.5 mr-1" />
                {isSystem ? "Ver" : "Editar"}
              </Button>
              {onDuplicate && !isSystem && (
                <Button size="sm" variant="ghost" onClick={() => onDuplicate(role)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
