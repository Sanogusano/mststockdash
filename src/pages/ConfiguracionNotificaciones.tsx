import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MessageCircle, Plus, Pencil, Trash2, Send, Clock, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

type TipoReporte = "horas" | "zona";
type TipoEnvio = "horas" | "cierre_anterior" | "cierre_dia";

interface Destinatario {
  id: string;
  nombre: string;
  numero: string;
  activo: boolean;
  tipo_reporte: TipoReporte | null;
  created_at: string;
}

interface FormState {
  nombre: string;
  numero: string;
  activo: boolean;
  tipo_reporte: TipoReporte;
}

const emptyForm: FormState = {
  nombre: "",
  numero: "",
  activo: true,
  tipo_reporte: "horas",
};

const TIPO_LABEL: Record<TipoReporte, string> = {
  horas: "Reporte completo",
  zona: "Por zona",
};

const HORARIOS: { hora: string; tipo: string }[] = [
  { hora: "8:00 AM", tipo: "Cierre día anterior" },
  { hora: "11:00 AM", tipo: "Reporte horas" },
  { hora: "2:00 PM", tipo: "Reporte horas" },
  { hora: "5:00 PM", tipo: "Reporte horas" },
  { hora: "8:00 PM", tipo: "Reporte horas" },
  { hora: "11:00 PM", tipo: "Reporte horas" },
  { hora: "11:59 PM", tipo: "Cierre día" },
];

function formatNumero(n: string) {
  // 573001234567 -> +57 300 123 4567
  if (!n) return "";
  if (n.length === 12 && n.startsWith("57")) {
    return `+57 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
  }
  return `+${n}`;
}

export default function ConfiguracionNotificacionesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, role, loading: roleLoading } = useUserRole();
  const allowed = isAdmin || role === "super_admin";

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Destinatario | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sendingTipo, setSendingTipo] = useState<TipoEnvio | null>(null);

  useEffect(() => {
    if (!roleLoading && !allowed) {
      toast.error("Solo los administradores pueden acceder a esta sección");
      navigate("/", { replace: true });
    }
  }, [roleLoading, allowed, navigate]);

  const { data: destinatarios = [], isLoading } = useQuery({
    queryKey: ["whatsapp-destinatarios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_destinatarios" as any)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Destinatario[];
    },
    enabled: allowed,
  });

  const upsertMut = useMutation({
    mutationFn: async (payload: FormState & { id?: string }) => {
      const row = {
        nombre: payload.nombre,
        numero: payload.numero,
        activo: payload.activo,
        tipo_reporte: payload.tipo_reporte,
      };
      if (payload.id) {
        const { error } = await supabase
          .from("whatsapp_destinatarios" as any)
          .update(row)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("whatsapp_destinatarios" as any)
          .insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Destinatario actualizado" : "Destinatario agregado");
      qc.invalidateQueries({ queryKey: ["whatsapp-destinatarios"] });
      closeModal();
    },
    onError: (e: any) => toast.error(e.message ?? "Error al guardar"),
  });

  const toggleMut = useMutation({
    mutationFn: async (d: Destinatario) => {
      const { error } = await supabase
        .from("whatsapp_destinatarios" as any)
        .update({ activo: !d.activo })
        .eq("id", d.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-destinatarios"] }),
    onError: (e: any) => toast.error(e.message ?? "Error"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whatsapp_destinatarios" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinatario eliminado");
      qc.invalidateQueries({ queryKey: ["whatsapp-destinatarios"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al eliminar"),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (d: Destinatario) => {
    setEditing(d);
    setForm({
      nombre: d.nombre,
      numero: d.numero,
      activo: d.activo,
      tipo_reporte: (d.tipo_reporte ?? "horas") as TipoReporte,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = () => {
    if (!form.nombre.trim()) return toast.error("Ingresa un nombre");
    if (!/^\d{10,15}$/.test(form.numero.trim())) {
      return toast.error("Número inválido. Formato: 573001234567");
    }
    upsertMut.mutate({ ...form, id: editing?.id });
  };

  const enviarReporte = async (tipo: TipoEnvio) => {
    setSendingTipo(tipo);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-reporte", {
        body: { tipo },
      });
      if (error) throw error;
      const count =
        data && typeof data === "object" && Array.isArray((data as any).resultados)
          ? (data as any).resultados.length
          : destinatarios.filter((d) => d.activo).length;
      toast.success(`✅ Reporte enviado a ${count} destinatarios`);
    } catch (e: any) {
      toast.error("❌ Error al enviar", { description: e.message ?? "Error desconocido" });
    } finally {
      setSendingTipo(null);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b px-4 gap-3">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">Configuración</h1>
          </header>

          <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Alertas WhatsApp</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Gestiona los destinatarios que reciben reportes automáticos por WhatsApp.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={!!sendingTipo}>
                        <Send className="h-4 w-4" />
                        {sendingTipo ? "Enviando..." : "📱 Enviar reporte ahora"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => enviarReporte("horas")}>
                        Reporte horas
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => enviarReporte("cierre_anterior")}>
                        Cierre día anterior
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => enviarReporte("cierre_dia")}>
                        Cierre día
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={openNew}>
                    <Plus className="h-4 w-4" />
                    Agregar destinatario
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Número WhatsApp</TableHead>
                        <TableHead>Tipo de reporte</TableHead>
                        <TableHead className="w-[120px]">Estado</TableHead>
                        <TableHead className="w-[120px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Cargando...
                          </TableCell>
                        </TableRow>
                      ) : destinatarios.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No hay destinatarios. Agrega uno para empezar.
                          </TableCell>
                        </TableRow>
                      ) : (
                        destinatarios.map((d) => {
                          const tipo = (d.tipo_reporte ?? "horas") as TipoReporte;
                          return (
                            <TableRow key={d.id}>
                              <TableCell className="font-medium">{d.nombre}</TableCell>
                              <TableCell className="font-mono text-sm">
                                {formatNumero(d.numero)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    tipo === "horas"
                                      ? "bg-blue-100 text-blue-800 hover:bg-blue-100"
                                      : "bg-purple-100 text-purple-800 hover:bg-purple-100"
                                  }
                                  variant="secondary"
                                >
                                  {TIPO_LABEL[tipo]}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={d.activo}
                                    onCheckedChange={() => toggleMut.mutate(d)}
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {d.activo ? "Activo" : "Inactivo"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(d)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setDeleteId(d.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Horarios configurados</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Envíos automáticos programados (hora Colombia).
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Hora Colombia</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="w-[120px]">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {HORARIOS.map((h) => (
                        <TableRow key={h.hora}>
                          <TableCell className="font-mono text-sm">{h.hora}</TableCell>
                          <TableCell>{h.tipo}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="secondary">
                              🟢 Activo
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Modal agregar/editar */}
      <Dialog open={modalOpen} onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar destinatario" : "Agregar destinatario"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Juan Pérez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="numero">Número WhatsApp</Label>
              <Input
                id="numero"
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value.replace(/\D/g, "") })}
                placeholder="573001234567"
              />
              <p className="text-xs text-muted-foreground">
                Formato internacional sin signos, incluye código país (57 para Colombia).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Tipo de reporte</Label>
              <Select
                value={form.tipo_reporte}
                onValueChange={(v) => setForm({ ...form, tipo_reporte: v as TipoReporte })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horas">Reporte completo (todas las tiendas)</SelectItem>
                  <SelectItem value="zona">Reporte por zona (Zona 1 y Zona 2 separados)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label>Estado</Label>
                <p className="text-xs text-muted-foreground">
                  {form.activo ? "Recibirá los reportes" : "No recibirá reportes"}
                </p>
              </div>
              <Switch
                checked={form.activo}
                onCheckedChange={(v) => setForm({ ...form, activo: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminar */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar destinatario?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El destinatario dejará de recibir reportes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMut.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
