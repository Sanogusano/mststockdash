import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Plus, Search, UserCog, Users, Briefcase, Shield, Clock } from "lucide-react";
import { toast } from "sonner";

type StaffMember = {
  id: string;
  shopify_user_id: string;
  nombre: string;
  rol: string;
  tipo_contrato: string | null;
  location_id: string | null;
  zona: string | null;
  canal: string | null;
  email: string | null;
  is_active: boolean | null;
};

type LocationRow = { location_id: string; name: string; zona: string | null };

const ROLES = ["vendedor", "personal_shopper", "administrador", "gerente_zona", "lider_canal"] as const;
const CONTRATOS = ["fijo", "temporal"] as const;

const roleColor: Record<string, string> = {
  vendedor: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
  personal_shopper: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
  administrador: "bg-muted text-muted-foreground border-border",
  gerente_zona: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  lider_canal: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
};

const contratoColor: Record<string, string> = {
  fijo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  temporal: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
};

const ROLE_LABELS: Record<string, string> = {
  vendedor: "Vendedor",
  personal_shopper: "Personal Shopper",
  administrador: "Administrador",
  gerente_zona: "Gerente de Zona",
  lider_canal: "Líder de Canal",
};

const emptyForm = {
  id: "",
  shopify_user_id: "",
  nombre: "",
  rol: "vendedor",
  tipo_contrato: "fijo",
  location_id: "",
  zona: "",
  canal: "",
  email: "",
  is_active: true,
};

export default function VendedoresPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterRol, setFilterRol] = useState<string>("all");
  const [filterContrato, setFilterContrato] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [{ data: s }, { data: l }] = await Promise.all([
      supabase.from("staff_members").select("*").order("nombre"),
      supabase.from("locations").select("location_id, name, zona").eq("is_active", true).order("name"),
    ]);
    if (s) setStaff(s as any);
    if (l) setLocations(l);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (showOnlyActive && !s.is_active) return false;
      if (filterRol !== "all" && s.rol !== filterRol) return false;
      if (filterContrato !== "all" && s.tipo_contrato !== filterContrato) return false;
      if (filterLocation !== "all" && s.location_id !== filterLocation) return false;
      if (search && !s.nombre.toLowerCase().includes(search.toLowerCase()) &&
          !s.shopify_user_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [staff, search, filterRol, filterContrato, filterLocation, showOnlyActive]);

  const kpis = useMemo(() => {
    const active = staff.filter((s) => s.is_active);
    return {
      total: active.length,
      vendedores: active.filter((s) => s.rol === "vendedor").length,
      personalShoppers: active.filter((s) => s.rol === "personal_shopper").length,
      administradores: active.filter((s) => s.rol === "administrador").length,
      temporales: active.filter((s) => s.tipo_contrato === "temporal").length,
    };
  }, [staff]);

  const locationName = (id: string | null) => {
    if (!id) return "—";
    return locations.find((l) => l.location_id === id)?.name || id;
  };

  const openCreate = () => {
    setIsCreating(true);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (s: StaffMember) => {
    setIsCreating(false);
    setForm({
      id: s.id,
      shopify_user_id: s.shopify_user_id,
      nombre: s.nombre,
      rol: s.rol,
      tipo_contrato: s.tipo_contrato || "fijo",
      location_id: s.location_id || "",
      zona: s.zona || "",
      canal: s.canal || "",
      email: s.email || "",
      is_active: s.is_active ?? true,
    });
    setDialogOpen(true);
  };

  const toggleActive = async (s: StaffMember) => {
    const { error } = await supabase
      .from("staff_members")
      .update({ is_active: !s.is_active, updated_at: new Date().toISOString() })
      .eq("id", s.id);
    if (error) { toast.error("Error: " + error.message); return; }
    toast.success(`${s.nombre} ${!s.is_active ? "activado" : "desactivado"}`);
    loadData();
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) { toast.error("El nombre es obligatorio"); return; }
    if (isCreating && !form.shopify_user_id.trim()) { toast.error("Shopify User ID es obligatorio"); return; }

    setSaving(true);
    try {
      // Auto-fill zona from location if not set
      const loc = locations.find((l) => l.location_id === form.location_id);
      const payload: any = {
        nombre: form.nombre.trim(),
        rol: form.rol,
        tipo_contrato: form.tipo_contrato,
        location_id: form.location_id || null,
        zona: form.zona || loc?.zona || null,
        canal: form.canal || null,
        email: form.email || null,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };

      if (isCreating) {
        payload.shopify_user_id = form.shopify_user_id.trim();
        const { error } = await supabase.from("staff_members").insert(payload);
        if (error) throw error;
        toast.success("Vendedor creado");
      } else {
        const { error } = await supabase.from("staff_members").update(payload).eq("id", form.id);
        if (error) throw error;
        toast.success("Vendedor actualizado");
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="border-b border-border bg-background sticky top-0 z-10">
            <div className="flex items-center gap-3 px-6 py-3">
              <SidebarTrigger />
              <div>
                <h1 className="text-base font-semibold text-foreground">Equipo Comercial</h1>
                <p className="text-xs text-muted-foreground">Gestión de vendedores y personal</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <KpiCard icon={Users} label="Total activos" value={kpis.total} />
              <KpiCard icon={Briefcase} label="Vendedores" value={kpis.vendedores} />
              <KpiCard icon={UserCog} label="Personal Shoppers" value={kpis.personalShoppers} />
              <KpiCard icon={Shield} label="Administradores" value={kpis.administradores} />
              <KpiCard icon={Clock} label="Temporales" value={kpis.temporales} />
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs text-muted-foreground">Buscar</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Nombre o Shopify ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  <div className="w-44">
                    <Label className="text-xs text-muted-foreground">Rol</Label>
                    <Select value={filterRol} onValueChange={setFilterRol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-36">
                    <Label className="text-xs text-muted-foreground">Contrato</Label>
                    <Select value={filterContrato} onValueChange={setFilterContrato}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {CONTRATOS.map((c) => <SelectItem key={c} value={c}>{c === "fijo" ? "Fijo" : "Temporal"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-56">
                    <Label className="text-xs text-muted-foreground">Tienda</Label>
                    <Select value={filterLocation} onValueChange={setFilterLocation}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pb-1.5">
                    <Switch checked={showOnlyActive} onCheckedChange={setShowOnlyActive} id="active-toggle" />
                    <Label htmlFor="active-toggle" className="text-xs text-muted-foreground cursor-pointer">Solo activos</Label>
                  </div>
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {filtered.length} de {staff.length} empleados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Cargando...</p>
                ) : (
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Shopify ID</TableHead>
                          <TableHead>Rol</TableHead>
                          <TableHead>Contrato</TableHead>
                          <TableHead>Tienda</TableHead>
                          <TableHead>Zona</TableHead>
                          <TableHead className="text-center">Activo</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.nombre}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">{s.shopify_user_id}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={roleColor[s.rol] || ""}>{ROLE_LABELS[s.rol] || s.rol}</Badge>
                            </TableCell>
                            <TableCell>
                              {s.tipo_contrato && (
                                <Badge variant="outline" className={contratoColor[s.tipo_contrato] || ""}>
                                  {s.tipo_contrato === "fijo" ? "Fijo" : "Temporal"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{locationName(s.location_id)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{s.zona || "—"}</TableCell>
                            <TableCell className="text-center">
                              <Switch checked={!!s.is_active} onCheckedChange={() => toggleActive(s)} />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost" onClick={() => openEdit(s)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {filtered.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                              No hay empleados que coincidan con los filtros
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Dialog edit/create */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isCreating ? "Agregar Vendedor" : "Editar Vendedor"}</DialogTitle>
            <DialogDescription>
              {isCreating ? "Completa los datos del nuevo empleado" : "Actualiza los datos del empleado"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {isCreating && (
              <div>
                <Label className="text-xs">Shopify User ID *</Label>
                <Input
                  value={form.shopify_user_id}
                  onChange={(e) => setForm({ ...form, shopify_user_id: e.target.value })}
                  placeholder="ej: 1234567890"
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Rol</Label>
                <Select value={form.rol} onValueChange={(v) => setForm({ ...form, rol: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Tipo Contrato</Label>
                <Select value={form.tipo_contrato} onValueChange={(v) => setForm({ ...form, tipo_contrato: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRATOS.map((c) => <SelectItem key={c} value={c}>{c === "fijo" ? "Fijo" : "Temporal"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tienda asignada</Label>
              <Select value={form.location_id || "none"} onValueChange={(v) => setForm({ ...form, location_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Zona</Label>
                <Input value={form.zona} onChange={(e) => setForm({ ...form, zona: e.target.value })} placeholder="Auto si vacío" />
              </div>
              <div>
                <Label className="text-xs">Canal</Label>
                <Input value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} id="form-active" />
              <Label htmlFor="form-active" className="text-sm cursor-pointer">Activo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : isCreating ? "Crear" : "Actualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground">{label}</span>
        </div>
        <p className="text-2xl font-semibold text-foreground whitespace-normal break-words tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
