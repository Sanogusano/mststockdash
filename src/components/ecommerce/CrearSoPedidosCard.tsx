import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState } from "@/components/dashboard/LoadingState";

type PedidoSinSo = {
  pedido: string;
  shopify_order_id: string | null;
  creado: string | null;
  origen: string | null;
  financial_status: string | null;
  despacho: string | null;
  total: number | null;
  descuento: number | null;
  unidades: number | null;
  items: string | null;
  dias: number | null;
};

type SoLinea = {
  sku: string;
  cantidad: number;
  con_iva: number;
  sin_iva: number;
};

type SoRespuesta = {
  ok?: boolean;
  error?: string;
  cliente?: {
    nombre?: string;
    documento?: string;
    tipo?: string;
    existe?: boolean;
    cliente_ns_id?: string | number;
    requiere_elegir?: boolean;
    opciones?: string[];
  };
  so?: {
    tranid?: string;
    resumen?: {
      lineas?: SoLinea[];
      total_pedido?: number;
    };
  };
};

const fmtFecha = (s: string | null, hora = true) =>
  s
    ? new Date(s).toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "2-digit",
        month: "short",
        year: "numeric",
        ...(hora ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
const fmtCOP = (n: number | null | undefined) =>
  `$ ${Math.round(Number(n ?? 0)).toLocaleString("es-CO")}`;
const errMsg = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : String(e);
const esErrorPermiso = (msg: string) =>
  /403|permiso|unauthori[sz]ed|forbidden/i.test(msg);
const MENSAJE_PERMISO = "No tienes permiso para crear órdenes de venta";

export function CrearSoPedidosCard() {
  const q = useQuery({
    queryKey: ["ecommerce-pedidos-sin-so"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pedidos_online_sin_so" as never)
        .select("*")
        .order("creado", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PedidoSinSo[];
    },
  });
  const rows = q.data ?? [];
  const totalMonto = rows.reduce((a, r) => a + Number(r.total ?? 0), 0);

  const [pedidoActivo, setPedidoActivo] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState<SoRespuesta | null>(null);
  const [documentoElegido, setDocumentoElegido] = useState<string | null>(null);
  const [errorDialogo, setErrorDialogo] = useState("");
  const [cargando, setCargando] = useState<"prueba" | "real" | null>(null);

  const invocarSo = async (
    pedido: string,
    modo: "prueba" | "real",
    documento?: string | null,
  ): Promise<SoRespuesta> => {
    const { data, error } = await supabase.functions.invoke("netsuite-crear", {
      body: {
        accion: "so",
        pedido,
        modo,
        ...(documento ? { documento_elegido: documento } : {}),
      },
    });
    if (error) {
      if (error.context instanceof Response) {
        const detalle = await error.context.clone().json().catch(() => null);
        if (detalle?.error) return detalle as SoRespuesta;
      }
      throw error;
    }
    return data as SoRespuesta;
  };

  const abrirVistaPrevia = async (pedido: string, documento?: string | null) => {
    if (cargando) return;
    setPedidoActivo(pedido);
    setRespuesta(null);
    if (documento === undefined) setDocumentoElegido(null);
    setErrorDialogo("");
    setCargando("prueba");
    try {
      const r = await invocarSo(pedido, "prueba", documento ?? null);
      setRespuesta(r);
      if (r?.ok === false && r.error) setErrorDialogo(r.error);
    } catch (e) {
      const msg = errMsg(e);
      setErrorDialogo(esErrorPermiso(msg) ? MENSAJE_PERMISO : msg);
    } finally {
      setCargando(null);
    }
  };

  const elegirDocumento = (documento: string) => {
    if (!pedidoActivo || cargando) return;
    setDocumentoElegido(documento);
    void abrirVistaPrevia(pedidoActivo, documento);
  };

  const confirmarSo = async () => {
    if (!pedidoActivo || cargando || !respuesta || respuesta.ok === false) return;
    setCargando("real");
    try {
      const r = await invocarSo(pedidoActivo, "real", documentoElegido);
      if (!r?.ok) {
        const msg = String(r?.error ?? "No se pudo crear la orden de venta");
        setErrorDialogo(esErrorPermiso(msg) ? MENSAJE_PERMISO : msg);
        return;
      }
      toast.success(`SO ${r.so?.tranid ?? ""} creada`.trim());
      cerrarDialogo(true);
      q.refetch();
    } catch (e) {
      const msg = errMsg(e);
      setErrorDialogo(esErrorPermiso(msg) ? MENSAJE_PERMISO : msg);
    } finally {
      setCargando(null);
    }
  };

  const cerrarDialogo = (forzar = false) => {
    if (cargando && !forzar) return; // no se puede cerrar mientras corre
    setPedidoActivo(null);
    setRespuesta(null);
    setDocumentoElegido(null);
    setErrorDialogo("");
  };

  const cliente = respuesta?.cliente;
  const lineas = respuesta?.so?.resumen?.lineas ?? [];
  const confirmarDeshabilitado =
    !!cargando || !respuesta || respuesta.ok === false || !!errorDialogo;

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-sm">
              Crear orden de venta en NetSuite · {rows.length.toLocaleString("es-CO")} pedidos · {fmtCOP(totalMonto)}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Pedidos online de CEDI Guayabal sin SO (más de 2 horas, sin tarjetas de regalo). Usa la
              plantilla de marketplace: formulario 420, lista Website sin IVA, ubicación Guayabal,
              contado. Siempre muestra vista previa antes de enviar.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${q.isFetching ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {q.isLoading ? (
            <LoadingState />
          ) : q.error ? (
            <p className="text-sm text-destructive p-4">Error: {errMsg(q.error)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Despacho</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Uds</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Días</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-6">
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" /> Sin pedidos pendientes ✓
                      </span>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const conDescuento = Number(r.descuento ?? 0) > 0;
                  return (
                    <TableRow key={r.pedido}>
                      <TableCell className="font-medium">{r.pedido}</TableCell>
                      <TableCell>{fmtFecha(r.creado)}</TableCell>
                      <TableCell>{r.origen ?? "—"}</TableCell>
                      <TableCell>{r.financial_status ?? "—"}</TableCell>
                      <TableCell>{r.despacho ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtCOP(r.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.unidades ?? 0).toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell className="text-xs max-w-[220px] truncate" title={r.items ?? ""}>
                        {r.items ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          Number(r.dias ?? 0) > 2 ? "text-destructive" : ""
                        }`}
                      >
                        {Number(r.dias ?? 0).toLocaleString("es-CO")}
                      </TableCell>
                      <TableCell>
                        {conDescuento ? (
                          <div className="space-y-1">
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-800 text-[10px]"
                            >
                              Descuento de pedido: revisar a mano
                            </Badge>
                            <Button size="sm" variant="outline" disabled>
                              Crear SO
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void abrirVistaPrevia(r.pedido)}
                            disabled={!!cargando}
                          >
                            Crear SO
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!pedidoActivo} onOpenChange={(open) => !open && cerrarDialogo()}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => cargando && e.preventDefault()}
          onEscapeKeyDown={(e) => cargando && e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Crear orden de venta – Pedido {pedidoActivo}</DialogTitle>
            <DialogDescription>
              Revisa la vista previa antes de enviar la orden a NetSuite.
            </DialogDescription>
          </DialogHeader>

          {cargando === "prueba" ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Generando vista previa…
            </p>
          ) : (
            <div className="space-y-4">
              {errorDialogo && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errorDialogo}</AlertDescription>
                </Alert>
              )}

              {cliente && (
                <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                  <p>
                    <span className="text-muted-foreground">Cliente:</span>{" "}
                    <span className="font-medium">{cliente.nombre ?? "—"}</span>
                    {" · "}
                    {cliente.documento ?? "—"}
                    {" · "}
                    {cliente.tipo ?? "—"}
                  </p>
                  <p className="text-muted-foreground">
                    {cliente.existe
                      ? `Ya existe en NetSuite (ID ${cliente.cliente_ns_id ?? "—"})`
                      : "Se creará cliente nuevo"}
                  </p>
                </div>
              )}

              {cliente?.requiere_elegir && (cliente.opciones?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Elige el documento correcto:</p>
                  <div className="flex flex-wrap gap-2">
                    {cliente.opciones!.map((op) => (
                      <Button
                        key={op}
                        size="sm"
                        variant={documentoElegido === op ? "default" : "outline"}
                        onClick={() => elegirDocumento(op)}
                        disabled={!!cargando}
                      >
                        {op}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {lineas.length > 0 && (
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Precio con IVA</TableHead>
                        <TableHead className="text-right">Precio sin IVA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineas.map((l, i) => (
                        <TableRow key={`${l.sku}-${i}`}>
                          <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {Number(l.cantidad ?? 0).toLocaleString("es-CO")}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCOP(l.con_iva)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmtCOP(l.sin_iva)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs font-medium p-3 border-t">
                    Total pedido {fmtCOP(respuesta?.so?.resumen?.total_pedido)}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => cerrarDialogo()} disabled={!!cargando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmarSo()} disabled={confirmarDeshabilitado}>
              {cargando === "real" ? "Creando en NetSuite…" : "Crear SO en NetSuite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
