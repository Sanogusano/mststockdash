import { useEffect, useMemo, useState } from "react";
import { FinanzasLayout } from "./FinanzasLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Construction, Download, Upload, Globe, User, Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCOP, fmtInt, fmtFecha } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";

type LocMap = Record<string, { name: string; tipo: string | null }>;

// ============== Tab Conciliación ==============
function TabConciliacion() {
  const [mes, setMes] = useState<string>("");
  const [filtroCanal, setFiltroCanal] = useState<string>("all");
  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroEstado, setFiltroEstado] = useState<string>("all");
  const [filtroDiscrepancia, setFiltroDiscrepancia] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [locMap, setLocMap] = useState<LocMap>({});

  // Inicializar mes con el último mes con datos disponibles
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("addi_transactions")
        .select("fecha_creacion")
        .not("fecha_creacion", "is", null)
        .order("fecha_creacion", { ascending: false })
        .limit(1);
      const last = data?.[0]?.fecha_creacion ? new Date(data[0].fecha_creacion as string) : new Date();
      setMes(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`);
    })();
  }, []);

  useEffect(() => {
    if (!mes) return;
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  async function cargar() {
    setLoading(true);
    try {
      const [anioStr, mesStr] = mes.split("-");
      const anio = Number(anioStr);
      const m = Number(mesStr);
      const desde = new Date(anio, m - 1, 1).toISOString();
      const hastaDate = new Date(anio, m, 1);
      const hasta = hastaDate.toISOString();

      // 1) Locations
      const { data: locs } = await supabase.from("locations").select("location_id,name,tipo_tienda");
      const lm: LocMap = {};
      (locs ?? []).forEach((l: any) => { lm[l.location_id] = { name: l.name, tipo: l.tipo_tienda }; });
      setLocMap(lm);

      // 2) Addi transactions del mes
      const { data: addi, error: errAddi } = await supabase
        .from("addi_transactions")
        .select("shopify_order_id,id_orden,canal,tipo_de_venta,monto,estado,fecha_creacion,email_vendedor,nombre_tienda")
        .gte("fecha_creacion", desde)
        .lt("fecha_creacion", hasta);
      if (errAddi) throw errAddi;

      const shopifyIds = Array.from(new Set((addi ?? []).map((a: any) => a.shopify_order_id).filter(Boolean)));
      const idOrdenes = Array.from(new Set((addi ?? []).map((a: any) => a.id_orden).filter(Boolean)));

      // 3) Orders — cruzar por shopify_order_id O por payment_token = id_orden
      const ordersByShopifyId: Record<string, any> = {};
      const ordersByPaymentToken: Record<string, any> = {};
      const orderNumbersSet = new Set<string>();
      const ORDER_COLS = "shopify_order_id,order_number,created_at,total_price,location_id,source_name,user_id,payment_token";

      async function fetchOrdersIn(field: "shopify_order_id" | "payment_token", values: string[]) {
        const out: any[] = [];
        for (let i = 0; i < values.length; i += 200) {
          const c = values.slice(i, i + 200);
          const { data } = await supabase.from("orders").select(ORDER_COLS).in(field, c);
          (data ?? []).forEach((o: any) => out.push(o));
        }
        return out;
      }

      const collectOrder = (o: any) => {
        if (o.shopify_order_id) ordersByShopifyId[o.shopify_order_id] = o;
        if (o.payment_token) ordersByPaymentToken[o.payment_token] = o;
        if (o.order_number) orderNumbersSet.add(String(o.order_number));
      };

      if (shopifyIds.length) (await fetchOrdersIn("shopify_order_id", shopifyIds)).forEach(collectOrder);
      if (idOrdenes.length) (await fetchOrdersIn("payment_token", idOrdenes)).forEach(collectOrder);

      // 4) Netsuite facturas — cruzar por shopify_order_number = orders.order_number
      const nsByOrderNumber: Record<string, any> = {};
      const orderNumbers = Array.from(orderNumbersSet);
      for (let i = 0; i < orderNumbers.length; i += 200) {
        const c = orderNumbers.slice(i, i + 200);
        const { data: ns } = await supabase
          .from("netsuite_facturas")
          .select("shopify_order_number,numero_factura,valor_facturado,base_gravable,discrepancia,tipo_discrepancia,estado_factura")
          .in("shopify_order_number", c);
        (ns ?? []).forEach((n: any) => { if (n.shopify_order_number) nsByOrderNumber[String(n.shopify_order_number)] = n; });
      }

      const merged = (addi ?? []).map((a: any) => {
        const ord =
          (a.shopify_order_id && ordersByShopifyId[a.shopify_order_id]) ||
          (a.id_orden && ordersByPaymentToken[a.id_orden]) ||
          null;
        const ns = ord?.order_number ? nsByOrderNumber[String(ord.order_number)] : null;

        const loc = ord?.location_id ? lm[ord.location_id] : null;

        // canal display
        let canalLabel = "—";
        let canalIcon: "web" | "ps" | "tienda" = "web";
        let canalDetalle = "";
        if (ord) {
          const src = String(ord.source_name ?? "").toLowerCase();
          if (src === "shopify_draft_order") {
            canalIcon = "ps";
            canalLabel = "Personal Shopper";
            canalDetalle = ord.user_id ?? "";
          } else if (loc?.tipo === "ECOMMERCE" || ["web", "580111"].includes(src)) {
            canalIcon = "web";
            canalLabel = "E-Commerce";
          } else if (loc) {
            canalIcon = "tienda";
            canalLabel = loc.name;
          }
        }

        const tieneDiscrepancia = ns && ns.tipo_discrepancia && ns.tipo_discrepancia !== "sin_discrepancia";
        let estadoFinal: "conciliado" | "discrepancia" | "sin_factura" | "sin_cruce";
        if (!ord) estadoFinal = "sin_cruce";
        else if (!ns) estadoFinal = "sin_factura";
        else if (tieneDiscrepancia) estadoFinal = "discrepancia";
        else estadoFinal = "conciliado";

        return {
          ...a,
          order_number: ord?.order_number ?? null,
          fecha_pedido: ord?.created_at ?? a.fecha_creacion,
          monto_shopify: ord?.total_price ?? null,
          canalLabel,
          canalIcon,
          canalDetalle,
          ns_factura: ns?.numero_factura ?? null,
          ns_valor: ns?.valor_facturado ?? null,
          ns_base: ns?.base_gravable ?? (ns?.valor_facturado ? Number(ns.valor_facturado) / 1.19 : null),
          ns_discrepancia: ns?.discrepancia ?? null,
          ns_tipo_discrepancia: ns?.tipo_discrepancia ?? null,
          estadoFinal,
        };
      });

      setRows(merged);
    } catch (e: any) {
      toast.error(`Error cargando conciliación Addi: ${e.message ?? e}`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filtroCanal !== "all" && r.canal !== filtroCanal) return false;
      if (filtroTipo !== "all" && r.tipo_de_venta !== filtroTipo) return false;
      if (filtroEstado !== "all" && r.estadoFinal !== filtroEstado) return false;
      if (filtroDiscrepancia !== "all") {
        if (filtroDiscrepancia === "sin_discrepancia" && r.ns_tipo_discrepancia && r.ns_tipo_discrepancia !== "sin_discrepancia") return false;
        if (filtroDiscrepancia !== "sin_discrepancia" && r.ns_tipo_discrepancia !== filtroDiscrepancia) return false;
      }
      return true;
    });
  }, [rows, filtroCanal, filtroTipo, filtroEstado, filtroDiscrepancia]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const conc = filtered.filter((r) => r.estadoFinal === "conciliado").length;
    const disc = filtered.filter((r) => r.estadoFinal === "discrepancia");
    const sinFact = filtered.filter((r) => r.estadoFinal === "sin_factura").length;
    const sinCruce = filtered.filter((r) => r.estadoFinal === "sin_cruce").length;
    return {
      total,
      conc,
      pctConc: total ? (conc / total) * 100 : 0,
      disc: disc.length,
      discMonto: disc.reduce((s, r) => s + Math.abs(Number(r.ns_discrepancia ?? 0)), 0),
      sinFact,
      sinCruce,
    };
  }, [filtered]);

  function exportar() {
    const data = filtered.map((r) => ({
      order_number: r.order_number ?? "",
      fecha: r.fecha_pedido ? new Date(r.fecha_pedido).toISOString().slice(0, 10) : "",
      canal: r.canalLabel,
      vendedor_tienda: r.canalDetalle,
      monto_shopify: Number(r.monto_shopify ?? 0),
      monto_addi: Number(r.monto ?? 0),
      tipo_venta: r.tipo_de_venta ?? "",
      estado_addi: r.estado ?? "",
      numero_factura_ns: r.ns_factura ?? "",
      valor_facturado_ns: Number(r.ns_valor ?? 0),
      base_gravable_ns: Number(r.ns_base ?? 0),
      discrepancia: Number(r.ns_discrepancia ?? 0),
      tipo_discrepancia: r.ns_tipo_discrepancia ?? "",
      estado_conciliacion: r.estadoFinal,
    }));
    exportToXLS(data, `conciliacion-addi-${mes}`, "Conciliación");
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mes</label>
            <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Canal Addi</label>
            <Select value={filtroCanal} onValueChange={setFiltroCanal}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="E_COMMERCE_SHOPIFY">E-Commerce</SelectItem>
                <SelectItem value="PAY_LINK">Personal Shopper</SelectItem>
                <SelectItem value="ADDI_MARKETPLACE">Marketplace</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tipo</label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Crédito">Crédito</SelectItem>
                <SelectItem value="Débito PSE">Débito PSE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Estado</label>
            <Select value={filtroEstado} onValueChange={setFiltroEstado}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="conciliado">✅ Conciliado</SelectItem>
                <SelectItem value="discrepancia">⚠️ Discrepancia</SelectItem>
                <SelectItem value="sin_factura">📄 Sin factura NS</SelectItem>
                <SelectItem value="sin_cruce">🔴 Sin cruce</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Discrepancia</label>
            <Select value={filtroDiscrepancia} onValueChange={setFiltroDiscrepancia}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="sin_discrepancia">Sin discrepancia</SelectItem>
                <SelectItem value="mayor_valor">Mayor valor</SelectItem>
                <SelectItem value="menor_valor">Menor valor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportar} variant="outline" className="gap-2 ml-auto">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Conciliadas</p>
          <p className="text-2xl font-semibold text-emerald-600">{fmtInt(kpis.conc)} <span className="text-sm text-muted-foreground">/ {fmtInt(kpis.total)}</span></p>
          <p className="text-xs text-muted-foreground">{kpis.pctConc.toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Con discrepancia</p>
          <p className="text-2xl font-semibold text-amber-600">{fmtInt(kpis.disc)} <span className="text-sm text-muted-foreground">facturas</span></p>
          <p className="text-xs text-muted-foreground">{fmtCOP(kpis.discMonto)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sin factura NS / Sin cruce</p>
          <p className="text-2xl font-semibold text-rose-600">{fmtInt(kpis.sinFact)} <span className="text-sm text-muted-foreground">/ {fmtInt(kpis.sinCruce)}</span></p>
        </CardContent></Card>
      </div>

      {/* Tabla maestra */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Sin transacciones para los filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr className="text-left">
                    <th className="px-3 py-2 sticky left-0 bg-muted/50 z-10 min-w-[120px]">Orden</th>
                    <th className="px-3 py-2 min-w-[110px]">Fecha</th>
                    <th className="px-3 py-2 min-w-[200px]">Canal</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Shopify</th>
                    <th className="px-3 py-2 min-w-[90px]">Estado Addi</th>
                    <th className="px-3 py-2 min-w-[100px]">Tipo</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Addi</th>
                    <th className="px-3 py-2 min-w-[120px]">Factura NS</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Facturado</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Discrepancia</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Base gravable</th>
                    <th className="px-3 py-2 min-w-[150px]">Estado final</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{r.order_number ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{fmtFecha(r.fecha_pedido)}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          {r.canalIcon === "web" && <Globe className="h-3.5 w-3.5 text-sky-600" />}
                          {r.canalIcon === "ps" && <User className="h-3.5 w-3.5 text-purple-600" />}
                          {r.canalIcon === "tienda" && <StoreIcon className="h-3.5 w-3.5 text-emerald-600" />}
                          <span className="truncate max-w-[180px]">{r.canalLabel}</span>
                          {r.canalDetalle && <span className="text-xs text-muted-foreground">· {r.canalDetalle}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.monto_shopify != null ? fmtCOP(r.monto_shopify) : "—"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={r.estado === "Exitosa" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : ""}>{r.estado ?? "—"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.tipo_de_venta ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(r.monto)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ns_factura ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.ns_valor != null ? fmtCOP(r.ns_valor) : "—"}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.ns_tipo_discrepancia && r.ns_tipo_discrepancia !== "sin_discrepancia" ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                        {r.ns_discrepancia != null ? fmtCOP(r.ns_discrepancia) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.ns_base != null ? fmtCOP(r.ns_base) : "—"}</td>
                      <td className="px-3 py-2">
                        {r.estadoFinal === "conciliado" && <Badge className="bg-emerald-100 text-emerald-800 border-0">✅ Conciliado</Badge>}
                        {r.estadoFinal === "discrepancia" && <Badge className="bg-amber-100 text-amber-800 border-0">⚠️ Discrepancia</Badge>}
                        {r.estadoFinal === "sin_factura" && <Badge className="bg-slate-100 text-slate-700 border-0">📄 Sin factura</Badge>}
                        {r.estadoFinal === "sin_cruce" && <Badge className="bg-rose-100 text-rose-800 border-0">🔴 Sin cruce</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p className="px-4 py-2 text-xs text-muted-foreground border-t">
                  Mostrando 500 de {fmtInt(filtered.length)}. Aplica filtros o exporta para ver todo.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Tab placeholder ==============
function TabSoon({ msg }: { msg: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-3">
        <Construction className="h-8 w-8 text-amber-600 mx-auto" />
        <p className="text-sm text-muted-foreground">{msg}</p>
      </CardContent>
    </Card>
  );
}

// ============== Page ==============
export default function AddiPage() {
  return (
    <FinanzasLayout title="Conciliación Addi">
      <Tabs defaultValue="conciliacion">
        <TabsList className="mb-4 bg-muted/50 p-1">
          <TabsTrigger value="resumen" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Resumen</TabsTrigger>
          <TabsTrigger value="conciliacion" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Conciliación</TabsTrigger>
          <TabsTrigger value="liquidaciones" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Liquidaciones</TabsTrigger>
          <TabsTrigger value="cargar" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Upload className="h-3.5 w-3.5" /> Cargar Archivo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="resumen"><TabSoon msg="KPIs, tendencia mensual y participación por canal — próxima iteración." /></TabsContent>
        <TabsContent value="conciliacion"><TabConciliacion /></TabsContent>
        <TabsContent value="liquidaciones"><TabSoon msg="Liquidaciones contables con desglose de tarifas y retenciones — próxima iteración." /></TabsContent>
        <TabsContent value="cargar"><TabSoon msg="Carga de archivos Excel de transacciones y liquidaciones — próxima iteración." /></TabsContent>
      </Tabs>
    </FinanzasLayout>
  );
}
