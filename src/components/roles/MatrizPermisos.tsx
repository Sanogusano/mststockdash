import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { PermissionCatalogItem } from "@/lib/permissions-api";

interface Props {
  permisos: PermissionCatalogItem[];
  seleccionados: Set<string>; // claves "module:action"
  onToggle: (moduleKey: string, actionKey: string) => void;
  onBulk?: (moduleGroup: string, granted: boolean) => void;
  readonly?: boolean;
}

/**
 * Matriz de permisos: agrupa por module_group, luego por module.
 * Acciones presentes en ese grupo se vuelven columnas.
 */
export function MatrizPermisos({
  permisos,
  seleccionados,
  onToggle,
  onBulk,
  readonly,
}: Props) {
  const groups = useMemo(() => {
    const byGroup = new Map<string, PermissionCatalogItem[]>();
    permisos.forEach((p) => {
      const g = p.module_group ?? "Otros";
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(p);
    });
    return Array.from(byGroup.entries()).map(([groupName, items]) => {
      const modules = new Map<string, { name: string; order: number; perms: PermissionCatalogItem[] }>();
      items.forEach((p) => {
        if (!modules.has(p.module_key)) {
          modules.set(p.module_key, { name: p.module_name, order: p.module_order, perms: [] });
        }
        modules.get(p.module_key)!.perms.push(p);
      });
      const actionSet = new Map<string, { name: string; order: number }>();
      items.forEach((p) => {
        if (!actionSet.has(p.action_key)) {
          actionSet.set(p.action_key, { name: p.action_name, order: p.action_order });
        }
      });
      const actions = Array.from(actionSet.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.order - b.order);
      const moduleArr = Array.from(modules.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => a.order - b.order);
      return { groupName, actions, modules: moduleArr };
    });
  }, [permisos]);

  return (
    <div className="space-y-6">
      {groups.map(({ groupName, actions, modules }) => (
        <div key={groupName} className="border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground/80">
              {groupName}
            </h4>
            {!readonly && onBulk && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onBulk(groupName, true)}>
                  Marcar todo
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onBulk(groupName, false)}>
                  Desmarcar
                </Button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background border-b border-border">
                <tr>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2 w-[40%]">
                    Módulo
                  </th>
                  {actions.map((a) => (
                    <th key={a.key} className="text-center font-medium text-muted-foreground px-3 py-2 text-xs">
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const availableActions = new Set(m.perms.map((p) => p.action_key));
                  return (
                    <tr key={m.key} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      {actions.map((a) => {
                        const available = availableActions.has(a.key);
                        const key = `${m.key}:${a.key}`;
                        const checked = seleccionados.has(key);
                        return (
                          <td key={a.key} className="text-center px-3 py-2">
                            {available ? (
                              <Checkbox
                                checked={checked}
                                disabled={readonly}
                                onCheckedChange={() => onToggle(m.key, a.key)}
                              />
                            ) : (
                              <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
