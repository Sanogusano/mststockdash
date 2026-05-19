import { useEffect, useState } from "react";
import { FinanzasLayout } from "./FinanzasLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Construction, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";
import { TabProyeccionPagos } from "./AddiProyeccionTab";
import { TabCargarArchivo } from "./AddiCargarTab";

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
  total: 0, conc: 0, pctConc: 0, disc: 0, discMonto: 0, sinFact: 0, sinCruce: 0,
};

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const toNumber = (v: unknown) => Number(v ?? 0);

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ============== Tab Conciliación ==============
function TabConciliacion() {
  const [mes, setMes] = useState<string>(currentMonth()); // YYYY-MM
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [kpis, setKpis] = useState<AddiKpis>(emptyKpis);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes, page, pageSize]);

  function getMonthRange() {
    const [y, m] = mes.split("-").map(Number);
    const desde = new Date(Date.UTC(y, m - 1, 1));
    const hasta = new Date(Date.UTC(y, m, 1));
    return {
      pMes: `${mes}-01`,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    };
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

      const [kpiResult, detalleResult] = await Promise.all([
        (supabase as any).rpc("get_addi_conciliacion_kpis", {
          p_mes: pMes, p_canal: "all", p_tipo: "all", p_estado: "all", p_discrepancia: "all",
        }),
        (supabase as any).rpc("reporte_addi_conciliacion",
          { p_desde: desde, p_hasta: hasta },
          { count: "exact" }
        ).range(from, to),
      ]);

      if (kpiResult.error) throw kpiResult.error;
      if (detalleResult.error) throw detalleResult.error;

      const rawKpi = Array.isArray(kpiResult.data) ? kpiResult.data[0] : kpiResult.data;
      setKpis(normalizeKpis(rawKpi));
      setRows(detalleResult.data ?? []);
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
      const all: any[] = [];
      for (let f = 0; f < kpis.total; f += chunkSize) {
        const { data, error } = await (supabase as any).rpc(
          "reporte_addi_conciliacion", { p_desde: desde, p_hasta: hasta }
        ).range(f, f + chunkSize - 1);
        if (error) throw error;
        all.push(...(data ?? []));
      }
      const data = all.map((r) => ({
        id_transaccion: r.id_orden ?? "",
        canal: r.canal ?? "",
        tipo_venta: r.tipo_de_venta ?? "",
        monto_addi: Number(r.monto ?? 0),
        orden_shopify: r.order_number ?? "",
        valor_shopify: Number(r.monto_shopify ?? 0),
        factura_ns: r.ns_factura ?? "",
        valor_ns: Number(r.ns_valor ?? 0),
        estado: r.estado_final,
        fecha: r.fecha_creacion ? new Date(r.fecha_creacion).toISOString().slice(0, 10) : "",
      }));
      exportToXLS(data, `conciliacion-addi-${mes}`, "Conciliación");
    } catch (e: any) {
      toast.error(`Error exportando conciliación Addi: ${e.message ?? e}`);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(kpis.total / pageSize));
  const rowStart = kpis.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rowEnd = Math.min(page * pageSize, kpis.total);

  const estadoBadge = (estado: string) => {
    switch (estado) {
      case "conciliado":
        return <Badge className="bg-emerald-100 text-emerald-800 border-0">✅ Conciliado</Badge>;
      case "discrepancia":
        return <Badge className="bg-amber-100 text-amber-800 border-0">⚠️ Discrepancia</Badge>;
      case "sin_factura":
        return <Badge className="bg-orange-100 text-orange-800 border-0">📄 Sin factura</Badge>;
      case "sin_cruce":
        return <Badge className="bg-rose-100 text-rose-800 border-0">🔴 Sin cruce</Badge>;
      default:
        return <Badge variant="outline">{estado ?? "—"}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Mes</label>
            <Input
              type="month"
              value={mes}
              onChange={(e) => { setPage(1); setMes(e.target.value || currentMonth()); }}
              className="h-9 w-44"
            />
          </div>
          <Button onClick={exportar} variant="outline" className="gap-2 ml-auto">
            <Download className="h-4 w-4" /> Exportar Excel
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total transacciones</p>
          <p className="text-2xl font-semibold">{fmtInt(kpis.total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Conciliadas</p>
          <p className="text-2xl font-semibold text-emerald-600">{fmtInt(kpis.conc)}</p>
          <p className="text-xs text-muted-foreground">{kpis.pctConc.toFixed(1)}%</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Con discrepancia</p>
          <p className="text-2xl font-semibold text-amber-600">{fmtInt(kpis.disc)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sin factura NS</p>
          <p className="text-2xl font-semibold text-orange-600">{fmtInt(kpis.sinFact)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sin cruce Shopify</p>
          <p className="text-2xl font-semibold text-rose-600">{fmtInt(kpis.sinCruce)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Monto discrepancia</p>
          <p className="text-xl font-semibold text-amber-600">{fmtCOP(kpis.discMonto)}</p>
        </CardContent></Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              Sin transacciones para el mes seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                  <tr className="text-left">
                    <th className="px-3 py-2 min-w-[140px]">ID Transacción</th>
                    <th className="px-3 py-2 min-w-[120px]">Canal</th>
                    <th className="px-3 py-2 min-w-[110px]">Tipo Venta</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Monto Addi</th>
                    <th className="px-3 py-2 min-w-[120px]">Orden Shopify</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Valor Shopify</th>
                    <th className="px-3 py-2 min-w-[120px]">Factura NS</th>
                    <th className="px-3 py-2 text-right min-w-[110px]">Valor NS</th>
                    <th className="px-3 py-2 min-w-[150px]">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono text-xs">{r.id_orden ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.canal ?? "—"}</td>
                      <td className="px-3 py-2">
                        {r.tipo_de_venta === "Crédito" && <Badge className="bg-blue-100 text-blue-800 border-0">Crédito</Badge>}
                        {r.tipo_de_venta === "Débito (PSE)" && <Badge className="bg-emerald-100 text-emerald-800 border-0">PSE</Badge>}
                        {r.tipo_de_venta !== "Crédito" && r.tipo_de_venta !== "Débito (PSE)" && (r.tipo_de_venta ?? "—")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtCOP(r.monto)}</td>
                      <td className="px-3 py-2 font-medium">{r.order_number ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.monto_shopify != null ? fmtCOP(r.monto_shopify) : "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.ns_factura ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.ns_valor != null ? fmtCOP(r.ns_valor) : "—"}</td>
                      <td className="px-3 py-2">{estadoBadge(r.estado_final)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Mostrando {fmtInt(rowStart)}–{fmtInt(rowEnd)} de {fmtInt(kpis.total)} · Página {fmtInt(page)} de {fmtInt(totalPaginas)}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Por página</span>
                    <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
                      <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZE_OPTIONS.map((o) => <SelectItem key={o} value={String(o)}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                    <Button type="button" variant="outline" size="sm" disabled={page >= totalPaginas} onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}>Siguiente</Button>
                  </div>
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
          <TabsTrigger value="proyeccion" className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white">Proyección de Pagos</TabsTrigger>
          <TabsTrigger value="cargar" className="gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
            <Upload className="h-3.5 w-3.5" /> Cargar Archivo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="resumen"><TabSoon msg="KPIs, tendencia mensual y participación por canal — próxima iteración." /></TabsContent>
        <TabsContent value="conciliacion"><TabConciliacion /></TabsContent>
        <TabsContent value="liquidaciones"><TabSoon msg="Liquidaciones contables con desglose de tarifas y retenciones — próxima iteración." /></TabsContent>
        <TabsContent value="proyeccion"><TabProyeccionPagos /></TabsContent>
        <TabsContent value="cargar"><TabCargarArchivo /></TabsContent>
      </Tabs>
    </FinanzasLayout>
  );
}
