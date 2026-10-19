import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Search, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { ALERTA_LABEL, Alerta, calcularAlerta, ordenarPorAlerta } from "@/lib/factura-electronica";

type Estado = "pendiente" | "cliente_creado" | "facturado";
type Row = {
  shopify_order_id: string;
  pedido: string | null;
  razon_social: string | null;
  documento: string | null;
  documento_direccion: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  departamento: string | null;
  ciudad: string | null;
  estado: Estado;
  registrado: boolean | null;
  capturado_en: string | null;
};
type RowA = Row & { alerta: Alerta };

const ESTADOS: { key: Estado; label: string }[] = [
  { key: "pendiente", label: "Pendientes" },
  { key: "cliente_creado", label: "Cliente creado" },
  { key: "facturado", label: "Facturados" },
];
const ESTADO_LABEL: Record<Estado, string> = { pendiente: "Pendiente", cliente_creado: "Cliente creado", facturado: "Facturado" };
const ROLES_VER = ["admin", "finanzas", "gerencia"];
const ROLES_EDITAR = ["admin", "finanzas"];

const fmtFecha = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function FacturaElectronicaPage() {
  const { role, isAdmin } = useUserRole();
  const puedeVer = isAdmin || (!!role && ROLES_VER.includes(role));
  const puedeEditar = isAdmin || (!!role && ROLES_EDITAR.includes(role));
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [q, setQ] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [etiquetar, setEtiquetar] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedido-factura-electronica"],
    enabled: puedeVer,
    queryFn: async (): Promise<RowA[]> => {
      const out: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await (supabase as any)
          .from("pedido_factura_electronica")
          .select("shopify_order_id,pedido,razon_social,documento,documento_direccion,email,telefono,direccion,departamento,ciudad,estado,registrado,capturado_en")
          .range(from, from + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out.map((r) => ({ ...r, alerta: calcularAlerta(r.documento, r.documento_direccion) }));
    },
  });

  const conteos = useMemo(() => {
    const c: Record<Estado, number> = { pendiente: 0, cliente_creado: 0, facturado: 0 };
    (data ?? []).forEach((r) => { if (c[r.estado] !== undefined) c[r.estado]++; });
    return c;
  }, [data]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    const td = t.replace(/\D/g, "");
    const f = (data ?? []).filter((r) => {
      if (r.estado !== estado) return false;
      if (!t) return true;
      return (
        (r.pedido ?? "").toLowerCase().includes(t) ||
        (r.razon_social ?? "").toLowerCase().includes(t) ||
        (td && ((r.documento ?? "").replace(/\D/g, "").includes(td) || (r.documento_direccion ?? "").replace(/\D/g, "").includes(td)))
      );
    });
    return ordenarPorAlerta(f);
  }, [data, estado, q]);

  const marcar = async (id: string, nuevo: Estado) => {
    if (nuevo === "cliente_creado" && etiquetar) {
      const fila = (data ?? []).find((r) => r.shopify_order_id === id);
      if (fila) await marcarClienteCreado([fila]);
      return;
    }
    setGuardando(id);
    const { error } = await (supabase as any)
      .from("pedido_factura_electronica")
      .update({ estado: nuevo, actualizado_en: new Date().toISOString() })
      .eq("shopify_order_id", id);
    setGuardando(null);
    if (error) { toast.error(`No se pudo actualizar: ${error.message}`); return; }
    toast.success(nuevo === "facturado" ? "Marcado como facturado" : "Marcado como cliente creado");
    qc.invalidateQueries({ queryKey: ["pedido-factura-electronica"] });
  };

  const marcarClienteCreado = async (lista: RowA[]) => {
    if (!lista.length) return;
    if (lista.length > 100) { toast.error("Máximo 100 pedidos por envío"); return; }
    const ids = lista.map((r) => r.shopify_order_id);
    setGuardando(lista.length === 1 ? ids[0] : "__lote__");
    try {
      if (etiquetar) {
        const { data: res, error } = await supabase.functions.invoke("shopify-etiquetar", {
          body: { etiqueta: "REGISTRADO", pedidos: lista.map((r) => ({ pedido: r.pedido })) },
        });
        if (error) { toast.error(`No se pudo etiquetar: ${error.message}`); return; }
        const resultados: { pedido?: string; ok?: boolean; error?: string }[] = res?.resultados ?? [];
        if (lista.length === 1) {
          if (!res?.ok) { toast.error(resultados[0]?.error ?? res?.error ?? "Error al etiquetar en Shopify"); return; }
          toast.success("Etiquetado REGISTRADO y marcado como cliente creado");
        } else {
          const fallos = resultados.filter((r) => r.ok === false);
          const exitos = resultados.length ? resultados.length - fallos.length : (res?.ok ? lista.length : 0);
          if (exitos) toast.success(`${exitos} pedido(s) etiquetados y marcados como cliente creado`);
          if (fallos.length) toast.error(`${fallos.length} con error: ${fallos.slice(0, 3).map((f) => `${f.pedido ?? ""} ${f.error ?? ""}`.trim()).join(" · ")}`);
          if (!exitos && !fallos.length && !res?.ok) { toast.error(res?.error ?? "Error al etiquetar en Shopify"); return; }
          if (!exitos) return;
        }
      } else {
        const { error } = await (supabase as any)
          .from("pedido_factura_electronica")
          .update({ estado: "cliente_creado", actualizado_en: new Date().toISOString() })
          .in("shopify_order_id", ids);
        if (error) { toast.error(`No se pudo actualizar: ${error.message}`); return; }
        toast.success(`${ids.length} pedido(s) marcados como cliente creado`);
      }
      setSel(new Set());
      qc.invalidateQueries({ queryKey: ["pedido-factura-electronica"] });
    } finally {
      setGuardando(null);
    }
  };

  const exportar = () => {
    if (!filas.length) { toast.info("No hay datos para exportar"); return; }
    const header = ["Pedido", "Razón social", "Documento Qikify", "Documento dirección", "Alerta", "Email", "Teléfono", "Dirección", "Ciudad", "Departamento", "Estado"];
    const rows = filas.map((r) => [r.pedido ?? "", r.razon_social ?? "", r.documento ?? "", r.documento_direccion ?? "", ALERTA_LABEL[r.alerta].slice(3), r.email ?? "", r.telefono ?? "", r.direccion ?? "", r.ciudad ?? "", r.departamento ?? "", ESTADO_LABEL[r.estado]]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // Forzar texto en todas las celdas de datos (documentos y teléfonos no pierden ceros)
    for (let i = 1; i <= rows.length; i++) {
      for (let c = 0; c < header.length; c++) {
        const ref = XLSX.utils.encode_cell({ r: i, c });
        if (ws[ref]) { ws[ref].t = "s"; ws[ref].v = String(ws[ref].v); ws[ref].z = "@"; }
      }
    }
    ws["!cols"] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Factura electrónica");
    const fecha = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
    XLSX.writeFile(wb, `Factura_electronica_${estado}_${fecha}.xlsx`);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Pendientes factura electrónica</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Logística · Datos de facturación por pedido</p>
            </div>
          </header>
          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-4">
            {!puedeVer || error ? (
              <Card><CardContent className="py-12 text-center space-y-2">
                <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-medium text-foreground">Sin acceso</p>
                {error && puedeVer && <p className="text-xs text-muted-foreground">{(error as any).message}</p>}
              </CardContent></Card>
            ) : isLoading ? <LoadingState /> : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ESTADOS.map((e) => (
                    <button key={e.key} onClick={() => setEstado(e.key)} className="text-left">
                      <Card className={cn("transition-colors", estado === e.key ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30")}>
                        <CardContent className="p-4">
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">{e.label}</p>
                          <p className="text-2xl font-semibold tabular-nums text-foreground">{conteos[e.key].toLocaleString("es-CO")}</p>
                        </CardContent>
                      </Card>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pedido, documento o razón social" className="pl-8" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 opacity-60">
                      <Switch id="etiquetar" disabled />
                      <Label htmlFor="etiquetar" className="text-xs">Etiquetar REGISTRADO en Shopify · Próximamente</Label>
                    </div>
                    <Button variant="outline" size="sm" onClick={exportar}><Download className="h-4 w-4 mr-1" />Exportar Excel</Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2 bg-muted/40">
                  Datos personales protegidos por Ley 1581. Uso exclusivo para facturación.
                </p>

                <div className="overflow-x-auto border border-border rounded-md">
                  <Table className="min-w-[1300px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Alerta</TableHead><TableHead>Pedido</TableHead><TableHead>Razón social</TableHead>
                        <TableHead>Documento (Qikify)</TableHead><TableHead>Documento (dirección)</TableHead>
                        <TableHead>Ciudad / Departamento</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead>
                        <TableHead>Fecha</TableHead><TableHead>Estado</TableHead>
                        {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filas.length === 0 ? (
                        <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                      ) : filas.map((r) => (
                        <TableRow key={r.shopify_order_id}>
                          <TableCell className="whitespace-nowrap text-xs">{ALERTA_LABEL[r.alerta]}</TableCell>
                          <TableCell className="font-medium">{r.pedido ?? "—"}</TableCell>
                          <TableCell>{r.razon_social ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{r.documento || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className={cn("tabular-nums", r.alerta === "sin_documento" && "font-medium text-foreground")}>{r.documento_direccion || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-xs">{[r.ciudad, r.departamento].filter(Boolean).join(" / ") || "—"}</TableCell>
                          <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{r.telefono ?? "—"}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{fmtFecha(r.capturado_en)}</TableCell>
                          <TableCell className="text-xs">{ESTADO_LABEL[r.estado] ?? r.estado}</TableCell>
                          {puedeEditar && (
                            <TableCell className="text-right whitespace-nowrap space-x-2">
                              {r.estado === "pendiente" && (
                                <Button size="sm" variant="outline" disabled={guardando === r.shopify_order_id} onClick={() => marcar(r.shopify_order_id, "cliente_creado")}>Marcar cliente creado</Button>
                              )}
                              {r.estado !== "facturado" && (
                                <Button size="sm" disabled={guardando === r.shopify_order_id} onClick={() => marcar(r.shopify_order_id, "facturado")}>Marcar facturado</Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
