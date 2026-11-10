import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { CommercialSectionHeader } from "@/components/dashboard/ExecutivePresentation";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { fmtMonto, fmtNum, fmtFecha, tituloNombre } from "@/lib/mayoristas-format";
import { ConsultaError } from "@/components/mayoristas/MayoristasPanel";
import { TablaCard, TablaTh, VendedoraSelect } from "@/components/mayoristas/MayoristasOrdenes";

interface FacturaRow {
  factura: string; fecha: string; cliente_id: string; cliente: string; punto_entrega: string | null;
  vendedor_id: string | null; vendedora: string; unidades: number; referencias: number; valor: number;
  estado: string; nota_credito: string | null;
}
interface DetalleRow {
  producto: string; coleccion: string | null; linea: string | null; image_url: string | null; tallas: string | null;
  unidades: number; precio_unitario: number | null; valor: number;
}

const anulada = (r: FacturaRow) => r.estado === "Anulada";

function EstadoFactura({ r }: { r: FacturaRow }) {
  if (!anulada(r)) return <Badge variant="outline" className="font-medium text-muted-foreground">{r.estado}</Badge>;
  const badge = <Badge variant="outline" className="font-medium status-danger text-danger">Anulada</Badge>;
  if (!r.nota_credito) return badge;
  return <Tooltip><TooltipTrigger asChild><span>{badge}</span></TooltipTrigger><TooltipContent>Nota crédito: {r.nota_credito}</TooltipContent></Tooltip>;
}

function DetalleFactura({ factura, onClose }: { factura: FacturaRow | null; onClose: () => void }) {
  const q = useQuery({
    retry: false,
    queryKey: ["mayoristas-factura-detalle", factura?.factura],
    enabled: !!factura,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_factura_detalle" as never, { p_factura: factura!.factura } as never);
      if (error) throw error;
      return (data as unknown as DetalleRow[]) ?? [];
    },
  });
  return (
    <Sheet open={!!factura} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        {factura && <>
          <SheetHeader>
            <SheetTitle>{factura.factura}</SheetTitle>
            <SheetDescription asChild>
              <div className="space-y-0.5 text-sm">
                <p>{fmtFecha(factura.fecha)} · {factura.cliente}{factura.punto_entrega ? ` · ${factura.punto_entrega}` : ""}</p>
                <p>{tituloNombre(factura.vendedora)}</p>
                <p className="text-lg font-semibold text-foreground tabular-nums">{fmtMonto(factura.valor)}</p>
              </div>
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : (q.data ?? []).length === 0 ? <EmptyState message="Sin detalle para esta factura." /> : (
              <TablaCard title={`Productos (${fmtNum(q.data!.length)})`} minW={760}>
                <TablaTh cols={["", "Producto", "Colección", "Línea", "Tallas", "Unidades", "Precio unitario", "Valor"]} />
                <tbody>{q.data!.map((d, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{d.image_url ? <img src={d.image_url} alt={d.producto} loading="lazy" className="h-12 w-12 rounded object-cover" /> : <div className="h-12 w-12 rounded bg-muted" />}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{d.producto}</td>
                    <td className="px-3 py-2">{d.coleccion ?? "—"}</td>
                    <td className="px-3 py-2">{d.linea ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{d.tallas ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtNum(d.unidades)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmtMonto(d.precio_unitario)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{fmtMonto(d.valor)}</td>
                  </tr>
                ))}</tbody>
              </TablaCard>
            )}
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

export function MayoristasFacturas({ desde, hasta, vendedor, onVendedorChange, cliente, onClienteChange }: {
  desde: string | null; hasta: string | null; vendedor: string | null; onVendedorChange: (v: string | null) => void;
  cliente: string | null; onClienteChange: (v: string | null) => void;
}) {
  const valido = !!desde && !!hasta && desde <= hasta;
  const [busqueda, setBusqueda] = useState("");
  const [abierta, setAbierta] = useState<FacturaRow | null>(null);
  const q = useQuery({
    retry: false,
    queryKey: ["mayoristas-facturas", desde, hasta, vendedor, cliente],
    enabled: valido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_mayoristas_facturas" as never, { p_desde: desde, p_hasta: hasta, p_vendedor: vendedor, p_cliente: cliente } as never);
      if (error) throw error;
      return (data as unknown as FacturaRow[]) ?? [];
    },
  });
  const rows = q.data ?? [];
  const term = busqueda.trim().toLowerCase();
  const visibles = term ? rows.filter(r => r.cliente?.toLowerCase().includes(term) || r.factura?.toLowerCase().includes(term)) : rows;
  const validas = visibles.filter(r => !anulada(r));
  const totUnd = validas.reduce((s, r) => s + Number(r.unidades), 0);
  const totValor = validas.reduce((s, r) => s + Number(r.valor), 0);
  const clienteNombre = cliente ? rows[0]?.cliente ?? cliente : null;

  return (
    <TooltipProvider>
      <div className="space-y-4 min-w-0">
        <div className="glass-card p-5">
          <CommercialSectionHeader title="🧾 PEDIDOS FACTURADOS">
            <VendedoraSelect desde={desde} hasta={hasta} value={vendedor} onChange={onVendedorChange} />
          </CommercialSectionHeader>
          <p className="text-xs text-muted-foreground mb-3">Venta neta sin IVA · fuente: facturas NetSuite</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative w-full sm:w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o factura" className="pl-9 h-9" />
            </div>
            {cliente && (
              <Button variant="outline" size="sm" onClick={() => onClienteChange(null)} className="self-start sm:self-auto">
                Cliente: {clienteNombre} <X className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {q.error ? <ConsultaError error={q.error} /> : q.isLoading ? <LoadingState /> : visibles.length === 0 ? <EmptyState message="Sin facturas para el periodo." /> : (
          <>
            <div className="hidden md:block">
              <TablaCard title={`Facturas (${fmtNum(visibles.length)})`} minW={1050}>
                <TablaTh cols={["Factura", "Fecha", "Cliente", "Asesora", "Unidades", "Referencias", "Valor", "Estado"]} />
                <tbody>
                  {visibles.map(r => (
                    <tr key={r.factura} onClick={() => setAbierta(r)} className="border-b border-border cursor-pointer hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-medium text-primary">{r.factura}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtFecha(r.fecha)}</td>
                      <td className="px-3 py-2.5"><p className="font-medium text-foreground">{r.cliente}</p>{r.punto_entrega && <p className="text-xs text-muted-foreground">{r.punto_entrega}</p>}</td>
                      <td className="px-3 py-2.5">{tituloNombre(r.vendedora)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.unidades)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{fmtNum(r.referencias)}</td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">{fmtMonto(r.valor)}</td>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}><EstadoFactura r={r} /></td>
                    </tr>
                  ))}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-3 py-2.5" colSpan={4}>Total · {fmtNum(validas.length)} facturas</td>
                    <td className="px-3 py-2.5 tabular-nums">{fmtNum(totUnd)}</td>
                    <td className="px-3 py-2.5" />
                    <td className="px-3 py-2.5 tabular-nums">{fmtMonto(totValor)}</td>
                    <td className="px-3 py-2.5 text-xs font-normal text-muted-foreground">sin anuladas</td>
                  </tr>
                </tbody>
              </TablaCard>
            </div>
            <div className="md:hidden space-y-3">
              {visibles.map(r => (
                <button key={r.factura} type="button" onClick={() => setAbierta(r)} className="glass-card p-4 space-y-2 w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><p className="font-medium text-primary text-sm">{r.factura} · {fmtFecha(r.fecha)}</p><p className="text-sm text-foreground">{r.cliente}</p>{r.punto_entrega && <p className="text-xs text-muted-foreground">{r.punto_entrega}</p>}</div>
                    <span onClick={(e) => e.stopPropagation()}><EstadoFactura r={r} /></span>
                  </div>
                  <p className="text-lg font-semibold tabular-nums">{fmtMonto(r.valor)}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{tituloNombre(r.vendedora)}</span><span>Unidades: {fmtNum(r.unidades)}</span><span>Referencias: {fmtNum(r.referencias)}</span>
                  </div>
                </button>
              ))}
              <div className="glass-card p-4 text-sm font-semibold flex flex-wrap justify-between gap-2">
                <span>Total · {fmtNum(validas.length)} facturas</span><span>{fmtNum(totUnd)} uds</span><span>{fmtMonto(totValor)}</span>
              </div>
            </div>
          </>
        )}
        <DetalleFactura factura={abierta} onClose={() => setAbierta(null)} />
      </div>
    </TooltipProvider>
  );
}
