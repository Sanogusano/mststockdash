import { useEffect, useState } from "react";
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
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";

type LocMap = Record<string, { name: string; tipo: string | null }>;
type AddiKpis = {
  total: number;
  conc: number;
  pctConc: number;
  disc: number;
  discMonto: number;
  sinFact: number;
  sinCruce: number;
};

const emptyKpis: AddiKpis = {
  total: 0,
  conc: 0,
  pctConc: 0,
  disc: 0,
  discMonto: 0,
  sinFact: 0,
  sinCruce: 0,
};

const PAGE_SIZE_OPTIONS = [50, 100, 200];

const toNumber = (value: unknown) => Number(value ?? 0);

// ============== Tab Conciliación ==============
function TabConciliacion() {
  const [mes, setMes] = useState<string>("");
  const [filtroCanal, setFiltroCanal] = useState<string>("all");
  const [filtroTipo, setFiltroTipo] = useState<string>("all");
  const [filtroEstado, setFiltroEstado] = useState<string>("all");
  const [filtroDiscrepancia, setFiltroDiscrepancia] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [kpis, setKpis] = useState<AddiKpis>(emptyKpis);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
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
  }, [mes, page, pageSize, filtroCanal, filtroTipo, filtroEstado, filtroDiscrepancia]);

  function getMonthRange() {
    const [anioStr, mesStr] = mes.split("-");
    const anio = Number(anioStr);
    const m = Number(mesStr);
    const nextAnio = m === 12 ? anio + 1 : anio;
    const nextMes = m === 12 ? 1 : m + 1;

    return {
      pMes: `${mes}-01`,
      desde: `${anioStr}-${mesStr}-01T00:00:00.000Z`,
      hasta: `${nextAnio}-${String(nextMes).padStart(2, "0")}-01T00:00:00.000Z`,
    };
  }

  function applyServerFilters(query: any) {
    let q = query;
    if (filtroCanal !== "all") q = q.eq("canal", filtroCanal);
    if (filtroTipo !== "all") q = q.eq("tipo_de_venta", filtroTipo);
    if (filtroEstado !== "all") q = q.eq("estado_final", filtroEstado);
    if (filtroDiscrepancia !== "all") {
      q = filtroDiscrepancia === "sin_discrepancia"
        ? q.or("ns_tipo_discrepancia.is.null,ns_tipo_discrepancia.eq.sin_discrepancia")
        : q.eq("ns_tipo_discrepancia", filtroDiscrepancia);
    }
    return q;
  }

  function mapConciliacionRows(conciliacion: any[], lm: LocMap) {
    return (conciliacion ?? []).map((r: any) => {
      const loc = r.location_id ? lm[r.location_id] : null;

      let canalLabel = "—";
      let canalIcon: "web" | "ps" | "tienda" = "web";
      let canalDetalle = "";
      if (r.order_number) {
        const src = String(r.source_name ?? "").toLowerCase();
        if (src === "shopify_draft_order") {
          canalIcon = "ps";
          canalLabel = "Personal Shopper";
          canalDetalle = r.user_id ?? "";
        } else if (loc?.tipo === "ECOMMERCE" || ["web", "580111"].includes(src)) {
          canalIcon = "web";
          canalLabel = "E-Commerce";
        } else if (loc) {
          canalIcon = "tienda";
          canalLabel = loc.name;
        }
      }

      return {
        ...r,
        estadoFinal: r.estado_final,
        canalLabel,
        canalIcon,
        canalDetalle,
      };
    });
  }

  function normalizeKpis(raw: any): AddiKpis {
    const total = toNumber(raw?.total);
    const conc = toNumber(raw?.conciliadas);
    return {
      total,
      conc,
      pctConc: total ? (conc / total) * 100 : 0,
      disc: toNumber(raw?.con_discrepancia),
      discMonto: toNumber(raw?.monto_discrepancia),
      sinFact: toNumber(raw?.sin_factura_ns),
      sinCruce: toNumber(raw?.sin_cruce),
    };
  }

  async function cargar() {
    setLoading(true);
    try {
      const { pMes, desde, hasta } = getMonthRange();
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const detalleQuery = applyServerFilters(
        (supabase as any).rpc("reporte_addi_conciliacion", { p_desde: desde, p_hasta: hasta }, { count: "exact" })
      ).range(from, to);

      const [locResult, kpiResult, detalleResult] = await Promise.all([
        supabase.from("locations").select("location_id,name,tipo_tienda"),
        (supabase as any).rpc("get_addi_conciliacion_kpis", {
          p_mes: pMes,
          p_canal: filtroCanal,
          p_tipo: filtroTipo,
          p_estado: filtroEstado,
          p_discrepancia: filtroDiscrepancia,
        }),
        detalleQuery,
      ]);

      if (locResult.error) throw locResult.error;
      if (kpiResult.error) throw kpiResult.error;
      if (detalleResult.error) throw detalleResult.error;

      const locs = locResult.data;
      const lm: LocMap = {};
      (locs ?? []).forEach((l: any) => { lm[l.location_id] = { name: l.name, tipo: l.tipo_tienda }; });
      setLocMap(lm);

      const rawKpi = Array.isArray(kpiResult.data) ? kpiResult.data[0] : kpiResult.data;
      setKpis(normalizeKpis(rawKpi));
      setRows(mapConciliacionRows(detalleResult.data ?? [], lm));
    } catch (e: any) {
      toast.error(`Error cargando conciliación Addi: ${e.message ?? e}`);
      setRows([]);
      setKpis(emptyKpis);
    } finally {
      setLoading(false);
    }
  }

  async function exportar() {
    try {
      const { desde, hasta } = getMonthRange();
      const chunkSize = 1000;
      const allRows: any[] = [];

      for (let from = 0; from < kpis.total; from += chunkSize) {
        const { data, error } = await applyServerFilters(
          (supabase as any).rpc("reporte_addi_conciliacion", { p_desde: desde, p_hasta: hasta })
        ).range(from, from + chunkSize - 1);
        if (error) throw error;
        allRows.push(...mapConciliacionRows(data ?? [], locMap));
      }

      const data = allRows.map((r) => ({
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
    } catch (e: any) {
      toast.error(`Error exportando conciliación Addi: ${e.message ?? e}`);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(kpis.total / pageSize));
  const rowStart = kpis.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rowEnd = Math.min(page * pageSize, kpis.total);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mes</label>
            <Input type="month" value={mes} onChange={(e) => { setPage(1); setMes(e.target.value); }} className="h-9 w-40" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Canal Addi</label>
            <Select value={filtroCanal} onValueChange={(value) => { setPage(1); setFiltroCanal(value); }}>
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
            <Select value={filtroTipo} onValueChange={(value) => { setPage(1); setFiltroTipo(value); }}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Crédito">Crédito</SelectItem>
                <SelectItem value="Débito (PSE)">Débito PSE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Estado</label>
            <Select value={filtroEstado} onValueChange={(value) => { setPage(1); setFiltroEstado(value); }}>
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
            <Select value={filtroDiscrepancia} onValueChange={(value) => { setPage(1); setFiltroDiscrepancia(value); }}>
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
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Sin transacciones para los filtros aplicados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr className="text-left">
                    <th className="px-3 py-2 sticky left-0 bg-muted/50 z-10 min-w-[120px]">Orden</th>
                    <th className="px-3 py-2 min-w-[110px]">Fecha pedido</th>
                    <th className="px-3 py-2 min-w-[200px]">Canal</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Shopify</th>
                    <th className="px-3 py-2 min-w-[90px]">Estado Addi</th>
                    <th className="px-3 py-2 min-w-[100px]">Tipo</th>
                    <th className="px-3 py-2 min-w-[100px]">Tipo crédito</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Addi</th>
                    <th className="px-3 py-2 min-w-[120px]">Factura NS</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Facturado</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Discrepancia</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Base gravable</th>
                    <th className="px-3 py-2 min-w-[150px]">Estado final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 sticky left-0 bg-background z-10 font-medium">{r.order_number ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.fecha_pedido ? new Date(r.fecha_pedido).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}</td>
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
                      <td className="px-3 py-2">
                        {r.tipo_de_venta === "Crédito" && (
                          <Badge className="bg-blue-100 text-blue-800 border-0">Crédito</Badge>
                        )}
                        {r.tipo_de_venta === "Débito (PSE)" && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-0">PSE</Badge>
                        )}
                      </td>
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
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Mostrando {fmtInt(rowStart)}–{fmtInt(rowEnd)} de {fmtInt(kpis.total)} registros · Página {fmtInt(page)} de {fmtInt(totalPaginas)}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Registros por página</span>
                    <Select value={String(pageSize)} onValueChange={(value) => { setPage(1); setPageSize(Number(value)); }}>
                      <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <SelectItem key={option} value={String(option)}>{option}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          aria-disabled={page <= 1}
                          className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          aria-disabled={page >= totalPaginas}
                          className={page >= totalPaginas ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPaginas, p + 1)); }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
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
