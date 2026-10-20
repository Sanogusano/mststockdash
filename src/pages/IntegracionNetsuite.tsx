import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { useChequeoIntegridad } from "@/hooks/useChequeoIntegridad";
import { cn } from "@/lib/utils";

type SoCancelada = {
  so_tranid: string;
  pedido: string | null;
  fecha_so: string | null;
  monto_con_iva: number | null;
  cancelado_en: string | null;
};

const fmtFecha = (s: string | null, hora = true) =>
  s
    ? new Date(s).toLocaleString("es-CO", {
        timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
        ...(hora ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
const fmtCOP = (n: number | null | undefined) => `$ ${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export default function IntegracionNetsuitePage() {
  const navigate = useNavigate();
  const chequeo = useChequeoIntegridad();
  const filaSinOv = (chequeo.data ?? []).find((r) => r.chequeo === "pedidos_sin_orden_venta");
  const cantidad = Number(filaSinOv?.valor ?? 0) || 0;
  const conNovedad = !!filaSinOv && cantidad > 0;

  const soQ = useQuery({
    queryKey: ["ecommerce-so-canceladas"],
    queryFn: async () => {
      const out: SoCancelada[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("so_pedido_cancelado" as never)
          .select("*")
          .is("cerrada_en", null)
          .order("fecha_so", { ascending: true })
          .range(from, from + 999);
        if (error) throw error;
        const rows = (data ?? []) as unknown as SoCancelada[];
        out.push(...rows);
        if (rows.length < 1000) break;
      }
      return out;
    },
  });
  const soRows = soQ.data ?? [];
  const soTotal = soRows.reduce((a, r) => a + Number(r.monto_con_iva ?? 0), 0);

  const exportarSo = () => {
    if (!soRows.length) return toast.info("No hay filas para exportar");
    const ws = XLSX.utils.json_to_sheet(
      soRows.map((r) => ({
        "Orden de venta": r.so_tranid,
        Pedido: r.pedido ?? "",
        "Fecha SO": fmtFecha(r.fecha_so, false),
        "Cancelado en Shopify": fmtFecha(r.cancelado_en),
        "Valor ($ COP)": Number(r.monto_con_iva ?? 0),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SO abiertas");
    XLSX.writeFile(wb, `so_pedidos_cancelados_${hoy()}.xlsx`);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Integración NetSuite</h2>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Pedidos sin orden de venta y órdenes abiertas de cancelados</p>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            <Card className={cn("max-w-md", conNovedad ? "border-destructive bg-destructive/5" : "border-emerald-400")}>
              <CardContent className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pedidos sin orden de venta</p>
                {chequeo.isLoading ? (
                  <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : chequeo.error ? (
                  <p className="text-sm text-destructive">Error: {errMsg(chequeo.error)}</p>
                ) : conNovedad ? (
                  <>
                    <p className="text-2xl font-semibold tabular-nums text-destructive">{cantidad.toLocaleString("es-CO")}</p>
                    {filaSinOv?.detalle && <p className="text-xs text-muted-foreground">{filaSinOv.detalle}</p>}
                  </>
                ) : (
                  <p className="text-2xl font-semibold text-emerald-700">0 · Sin novedad</p>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/finanzas/reporte-facturacion?estado=${encodeURIComponent("SIN ORDEN DE VENTA EN NETSUITE")}`)}
                >
                  Ver detalle
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-sm">
                    Órdenes de venta abiertas de pedidos cancelados · {soRows.length.toLocaleString("es-CO")} · {fmtCOP(soTotal)}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Cerrar estas órdenes en NetSuite; desaparecen solas en la siguiente revisión horaria</p>
                </div>
                <Button variant="outline" size="sm" onClick={exportarSo}><Download className="h-4 w-4 mr-1" /> Exportar Excel</Button>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {soQ.isLoading ? <LoadingState /> : soQ.error ? (
                  <p className="text-sm text-destructive p-4">Error: {errMsg(soQ.error)}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Orden de venta</TableHead>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Fecha SO</TableHead>
                        <TableHead>Cancelado en Shopify</TableHead>
                        <TableHead className="text-right">Valor ($ COP)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {soRows.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">Sin órdenes abiertas</TableCell></TableRow>
                      )}
                      {soRows.map((r) => (
                        <TableRow key={r.so_tranid}>
                          <TableCell className="font-medium">{r.so_tranid}</TableCell>
                          <TableCell>{r.pedido ?? "—"}</TableCell>
                          <TableCell>{fmtFecha(r.fecha_so, false)}</TableCell>
                          <TableCell>{fmtFecha(r.cancelado_en)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCOP(r.monto_con_iva)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
