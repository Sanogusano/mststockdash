import { useMemo, useState } from "react";
import { Plus, Trash2, ShieldOff, ShieldCheck } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  crearOverride,
  eliminarOverride,
  listPermissionCatalog,
  listUserOverrides,
} from "@/lib/permissions-api";

interface Props {
  userId: string;
}

export function OverridesPermissionsPanel({ userId }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [moduleKey, setModuleKey] = useState<string>("");
  const [actionKey, setActionKey] = useState<string>("");
  const [granted, setGranted] = useState<"true" | "false">("true");
  const [reason, setReason] = useState("");

  const { data: overrides = [] } = useQuery({
    queryKey: ["user-overrides", userId],
    queryFn: () => listUserOverrides(userId),
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["permission-catalog"],
    queryFn: listPermissionCatalog,
  });

  const modules = useMemo(() => {
    const map = new Map<string, string>();
    catalog.forEach((p) => map.set(p.module_key, p.module_name));
    return Array.from(map.entries()).map(([key, name]) => ({ key, name }));
  }, [catalog]);

  const actionsForModule = useMemo(
    () => catalog.filter((p) => p.module_key === moduleKey),
    [catalog, moduleKey],
  );

  const handleSave = async () => {
    if (!moduleKey || !actionKey) {
      toast.error("Selecciona módulo y acción");
      return;
    }
    try {
      await crearOverride({
        user_id: userId,
        module_key: moduleKey,
        action_key: actionKey,
        granted: granted === "true",
        reason: reason || null,
      });
      toast.success("Override guardado");
      qc.invalidateQueries({ queryKey: ["user-overrides", userId] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setAdding(false);
      setModuleKey("");
      setActionKey("");
      setReason("");
      setGranted("true");
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await eliminarOverride(id);
      toast.success("Override eliminado");
      qc.invalidateQueries({ queryKey: ["user-overrides", userId] });
      qc.invalidateQueries({ queryKey: ["user-permissions"] });
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch (e: any) {
      toast.error(e.message ?? "Error al eliminar");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Permisos especiales</h4>
          <p className="text-xs text-muted-foreground">
            Excepciones individuales que sobreescriben los permisos del rol.
          </p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Agregar
          </Button>
        )}
      </div>

      {adding && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Módulo</Label>
              <Select value={moduleKey} onValueChange={(v) => { setModuleKey(v); setActionKey(""); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {modules.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Acción</Label>
              <Select value={actionKey} onValueChange={setActionKey} disabled={!moduleKey}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {actionsForModule.map((a) => (
                    <SelectItem key={a.action_key} value={a.action_key}>
                      {a.action_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Tipo</Label>
            <RadioGroup value={granted} onValueChange={(v: string) => setGranted(v as "true" | "false")} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="true" id="grant" />
                <Label htmlFor="grant" className="text-sm cursor-pointer">Conceder</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="false" id="deny" />
                <Label htmlFor="deny" className="text-sm cursor-pointer">Denegar</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label className="text-xs">Razón (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Autorizado por gerencia general"
              className="resize-none h-16"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave}>
              Guardar override
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {overrides.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Sin overrides. Este usuario solo tiene los permisos de su rol.
          </p>
        )}
        {overrides.map((o) => (
          <div
            key={o.id}
            className="flex items-center gap-3 border border-border rounded-lg p-2.5 text-sm"
          >
            {o.granted ? (
              <ShieldCheck className="h-4 w-4 text-primary" />
            ) : (
              <ShieldOff className="h-4 w-4 text-destructive" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{o.module_key}</span>
                <span className="text-muted-foreground">·</span>
                <span>{o.action_key}</span>
                <Badge variant={o.granted ? "default" : "destructive"} className="text-[10px]">
                  {o.granted ? "concedido" : "denegado"}
                </Badge>
              </div>
              {o.reason && (
                <p className="text-xs text-muted-foreground truncate">{o.reason}</p>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => handleDelete(o.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
