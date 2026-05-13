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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
import { MessageCircle, Plus, Pencil, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

type ReporteKey = "cumplimiento_diario" | "alertas_bajo_cumplimiento" | "cierre_colecciones";

const REPORTES: { key: ReporteKey; label: string; short: string }[] = [
  { key: "cumplimiento_diario", label: "Reporte diario de cumplimiento (6:00 AM)", short: "Cumplimiento diario" },
  { key: "alertas_bajo_cumplimiento", label: "Alertas de bajo cumplimiento", short: "Alertas bajo cumpl." },
  { key: "cierre_colecciones", label: "Cierre de colecciones", short: "Cierre colecciones" },
];

interface Destinatario {
  id: string;
  nombre: string;
  numero: string;
  activo: boolean;
  reportes: ReporteKey[] | null;
  created_at: string;
}

interface FormState {
  nombre: string;
  numero: string;
  activo: boolean;
  reportes: ReporteKey[];
}

const emptyForm: FormState = {
  nombre: "",
  numero: "",
  activo: true,
  reportes: ["cumplimiento_diario"],
};

export default function ConfiguracionNotificacionesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Destinatario | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      toast.error("Solo los administradores pueden acceder a esta sección");
      navigate("/", { replace: true });
    }
  }, [roleLoading, isAdmin, navigate]);

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
    enabled: isAdmin,
  });

  const upsertMut = useMutation({
    mutationFn: async (payload: FormState & { id?: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("whatsapp_destinatarios" as any)
          .update({
            nombre: payload.nombre,
            numero: payload.numero,
            activo: payload.activo,
            reportes: payload.reportes,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("whatsapp_destinatarios" as any).insert({
          nombre: payload.nombre,
          numero: payload.numero,
          activo: payload.activo,
          reportes: payload.reportes,
        });
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
      reportes: (d.reportes ?? []) as ReporteKey[],
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

  const toggleReporte = (key: ReporteKey) => {
    setForm((f) => ({
      ...f,
      reportes: f.reportes.includes(key)
        ? f.reportes.filter((r) => r !== key)
        : [...f.reportes, key],
    }));
  };

  const enviarPrueba = async () => {
    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-reporte", { body: {} });
      if (error) throw error;
      toast.success("✅ Reporte de prueba enviado", {
        description: typeof data === "object" ? JSON.stringify(data).slice(0, 200) : undefined,
      });
    } catch (e: any) {
      toast.error("❌ Error al enviar", { description: e.message ?? "Error desconocido" });
    } finally {
      setSendingTest(false);
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
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Alertas y Notificaciones WhatsApp</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Gestiona los destinatarios que reciben reportes automáticos por WhatsApp.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={enviarPrueba} disabled={sendingTest}>
                    <Send className="h-4 w-4" />
                    {sendingTest ? "Enviando..." : "Enviar reporte de prueba ahora"}
                  </Button>
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
                        <TableHead>Reportes activos</TableHead>
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
                        destinatarios.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">{d.nombre}</TableCell>
                            <TableCell className="font-mono text-sm">+{d.numero}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {(d.reportes ?? []).length === 0 ? (
                                  <span className="text-xs text-muted-foreground">—</span>
                                ) : (
                                  (d.reportes ?? []).map((r) => {
                                    const meta = REPORTES.find((x) => x.key === r);
                                    return (
                                      <Badge key={r} variant="secondary" className="text-xs">
                                        {meta?.short ?? r}
                                      </Badge>
                                    );
                                  })
                                )}
                              </div>
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
                        ))
                      )}
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
              <Label>Reportes a recibir</Label>
              <div className="space-y-2 border rounded-md p-3">
                {REPORTES.map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={form.reportes.includes(r.key)}
                      onCheckedChange={() => toggleReporte(r.key)}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                ))}
              </div>
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
