import { useMemo, useState } from "react";
import { MoreHorizontal, Search, Shield } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { UsuarioGestion } from "@/lib/permissions-api";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-900 text-white hover:bg-red-900/90",
  gerencia: "bg-purple-700 text-white hover:bg-purple-700/90",
  operaciones: "bg-blue-700 text-white hover:bg-blue-700/90",
  finanzas: "bg-emerald-700 text-white hover:bg-emerald-700/90",
  marketing_vendedor: "bg-amber-700 text-white hover:bg-amber-700/90",
  tienda: "bg-gray-600 text-white hover:bg-gray-600/90",
};

interface Props {
  usuarios: UsuarioGestion[];
  loading?: boolean;
  onEdit: (u: UsuarioGestion) => void;
}

export function UsuariosTable({ usuarios, loading, onEdit }: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("__all");
  const [statusFilter, setStatusFilter] = useState<string>("__all");

  const filtered = useMemo(() => {
    return usuarios.filter((u) => {
      if (roleFilter !== "__all" && u.role_key !== roleFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (search) {
        const s = search.toLowerCase();
        if (
          !u.full_name?.toLowerCase().includes(s) &&
          !u.email?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [usuarios, search, roleFilter, statusFilter]);

  const roleOptions = useMemo(() => {
    const set = new Map<string, string>();
    usuarios.forEach((u) => {
      if (u.role_key && u.role_name) set.set(u.role_key, u.role_name);
    });
    return Array.from(set.entries());
  }, [usuarios]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos los roles</SelectItem>
            {roleOptions.map(([key, name]) => (
              <SelectItem key={key} value={key}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="inactive">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Último login</TableHead>
              <TableHead>Overrides</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Sin usuarios que coincidan.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((u) => {
              const initials = (u.full_name ?? u.email ?? "?")
                .split(" ")
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();
              const roleClass = u.role_key ? ROLE_COLORS[u.role_key] ?? "bg-muted text-foreground" : "bg-muted text-foreground";
              const lastLogin = u.last_sign_in_at ?? u.last_login_at;
              return (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{u.full_name ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    {u.role_name ? (
                      <Badge className={roleClass}>{u.role_name}</Badge>
                    ) : (
                      <Badge variant="outline">Sin rol</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.scope_location_ids === null || u.scope_location_ids?.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Todas</span>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="cursor-help">
                            {u.scope_location_ids.length} ubicaciones
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{u.scope_descripcion ?? "—"}</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.is_active ? "default" : "secondary"}>
                      {u.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {lastLogin ? new Date(lastLogin).toLocaleDateString("es-CO") : "Nunca"}
                  </TableCell>
                  <TableCell>
                    {u.overrides_count > 0 ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="gap-1">
                            <Shield className="h-3 w-3" />
                            {u.overrides_count}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{u.overrides_count} permisos especiales</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(u)}>Editar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
