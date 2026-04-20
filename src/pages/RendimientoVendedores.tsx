import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import {
  Download,
  FileText,
  Users,
  ArrowUpDown,
  Trophy,
  Receipt,
  Package,
  Target,
} from "lucide-react";

const fmtCOP = (v: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v ?? 0);

const fmtNum = (v: number) => new Intl.NumberFormat("es-CO").format(v ?? 0);

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface VendedorRow {
  shopify_user_id: string;
  nombre_vendedor: string;
  rol: string;
  tipo_contrato: string;
  tienda: string;
  total_pedidos: number;
  unidades_vendidas: number;
  venta_bruta: number;
  venta_neta: number;
  ticket_promedio: number;
  upt: number;
  presupuesto?: number;
  pct_cumplimiento?: number;
}

interface Location {
  location_id: string;
  name: string;
  zona: string | null;
}

type SortKey =
  | "nombre_vendedor"
  | "total_pedidos"
  | "unidades_vendidas"
  | "venta_neta"
  | "ticket_promedio"
  | "upt"
  | "pct_cumplimiento";

function RoleBadge({ rol }: { rol: string }) {
  const styles: Record<string, string> = {
    vendedor: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
    personal_shopper: "bg-purple-500/15 text-purple-700 ring-purple-500/30",
    administrador: "bg-muted text-muted-foreground ring-border",
    gerente_zona: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
    lider_canal: "bg-teal-500/15 text-teal-700 ring-teal-500/30",
  };
  const cls = styles[rol] ?? styles.administrador;
  const label = rol?.replace("_", " ") ?? "—";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 capitalize ${cls}`}>
      {label}
    </span>
  );
}

function ContratoBadge({ tipo }: { tipo: string }) {
  const cls =
    tipo === "fijo"
      ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30"
      : "bg-orange-500/15 text-orange-700 ring-orange-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 capitalize ${cls}`}>
      {tipo ?? "—"}
    </span>
  );
}

function CumplimientoBar({ pct }: { pct: number }) {
  const v = Number.isFinite(pct) ? pct : 0;
  const color =
    v >= 100 ? "bg-emerald-500" : v >= 90 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(v, 100)}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{v.toFixed(0)}%</span>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function RendimientoVendedoresPage() {
  const today = new Date();
  const [anio, setAnio] = useState<number>(today.getFullYear());
  const [mes, setMes] = useState<number>(today.getMonth() + 1);
  const [locationId, setLocationId] = useState<string>("all");
  const [zona, setZona] = useState<string>("all");
  const [rol, setRol] = useState<string>("all");

  const [locations, setLocations] = useState<Location[]>([]);
  const [rows, setRows] = useState<VendedorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("venta_neta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<VendedorRow | null>(null);
  const [topProducts, setTopProducts] = useState<{ producto: string; unidades: number; ingresos: number }[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Cargar locations una vez
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("locations")
        .select("location_id, name, zona")
        .eq("is_active", true)
        .order("name");
      setLocations(data ?? []);
    })();
  }, []);

  // Cargar reporte
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params: Record<string, unknown> = { p_anio: anio, p_mes: mes };
        if (locationId !== "all") params.p_location_id = locationId;
        if (zona !== "all") params.p_zona = zona;

        // RPC aún no presente en types.ts
        const { data, error: rpcErr } = await (supabase as any).rpc(
          "reporte_ventas_por_vendedor",
          params,
        );
        if (rpcErr) throw rpcErr;

        let list = (data ?? []) as VendedorRow[];

        // Filtro de rol en cliente (RPC no lo soporta)
        if (rol !== "all") list = list.filter((r) => r.rol === rol);

        // Buscar presupuestos por vendedor (tipo='vendedor', nombre_identificador=shopify_user_id)
        const ids = list.map((r) => r.shopify_user_id).filter(Boolean);
        let budgets: Record<string, number> = {};
        if (ids.length) {
          const { data: pres } = await supabase
            .from("presupuestos_config")
            .select("nombre_identificador, monto")
            .eq("anio", anio)
            .eq("mes", mes)
            .eq("tipo", "vendedor")
            .in("nombre_identificador", ids);
          (pres ?? []).forEach((p: any) => {
            budgets[p.nombre_identificador] = Number(p.monto) || 0;
          });
        }

        list = list.map((r) => {
          const presupuesto = budgets[r.shopify_user_id] ?? 0;
          const pct =
            presupuesto > 0 ? (Number(r.venta_neta) / presupuesto) * 100 : 0;
          return { ...r, presupuesto, pct_cumplimiento: pct };
        });

        if (alive) setRows(list);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Error al cargar el reporte");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [anio, mes, locationId, zona, rol]);

  // Zonas únicas
  const zonas = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => l.zona && set.add(l.zona));
    return Array.from(set).sort();
  }, [locations]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey] as any;
      const vb = b[sortKey] as any;
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb ?? "") : (vb ?? "").localeCompare(va);
      }
      const na = Number(va) || 0;
      const nb = Number(vb) || 0;
      return sortDir === "asc" ? na - nb : nb - na;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // KPIs
  const kpis = useMemo(() => {
    const totalVend = sorted.length;
    const ventaTotal = sorted.reduce((s, r) => s + (Number(r.venta_neta) || 0), 0);
    const ticketProm =
      sorted.length > 0
        ? sorted.reduce((s, r) => s + (Number(r.ticket_promedio) || 0), 0) / sorted.length
        : 0;
    const uptProm =
      sorted.length > 0
        ? sorted.reduce((s, r) => s + (Number(r.upt) || 0), 0) / sorted.length
        : 0;
    return { totalVend, ventaTotal, ticketProm, uptProm };
  }, [sorted]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleExportCSV = () => {
    exportToCSV(
      sorted.map((r, i) => ({
        Posicion: i + 1,
        Vendedor: r.nombre_vendedor,
        Rol: r.rol,
        Contrato: r.tipo_contrato,
        Tienda: r.tienda,
        Pedidos: r.total_pedidos,
        Unidades: r.unidades_vendidas,
        "Venta Neta": r.venta_neta,
        "Ticket Promedio": r.ticket_promedio,
        UPT: r.upt,
        Presupuesto: r.presupuesto ?? 0,
        "% Cumplimiento": (r.pct_cumplimiento ?? 0).toFixed(2),
      })),
      `rendimiento-vendedores-${anio}-${String(mes).padStart(2, "0")}`,
    );
  };

  const handleExportPDF = () => {
    exportToPDF(
      sorted.map((r, i) => ({
        "#": i + 1,
        Vendedor: r.nombre_vendedor,
        Rol: r.rol,
        Tienda: r.tienda,
        Pedidos: r.total_pedidos,
        Unidades: r.unidades_vendidas,
        "Venta Neta": fmtCOP(r.venta_neta),
        Ticket: fmtCOP(r.ticket_promedio),
        UPT: (r.upt ?? 0).toFixed(2),
        "% Cumplim.": `${(r.pct_cumplimiento ?? 0).toFixed(0)}%`,
      })),
      `rendimiento-vendedores-${anio}-${String(mes).padStart(2, "0")}`,
      `Rendimiento por Vendedor — ${MONTHS[mes - 1]} ${anio}`,
    );
  };

  const openDrawer = async (row: VendedorRow) => {
    setSelected(row);
    setDrawerOpen(true);
    setTopProducts([]);
    setDrawerLoading(true);

    try {
      // Top 5 productos del vendedor en el periodo
      const start = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const endDate = new Date(anio, mes, 0); // último día
      const end = `${anio}-${String(mes).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      // Buscar órdenes del vendedor en el periodo
      const { data: ords } = await supabase
        .from("orders")
        .select("shopify_order_id")
        .eq("user_id", row.shopify_user_id)
        .gte("created_at", start)
        .lte("created_at", `${end}T23:59:59`)
        .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
        .limit(5000);

      const orderIds = (ords ?? []).map((o: any) => o.shopify_order_id);
      if (!orderIds.length) {
        setTopProducts([]);
        return;
      }

      // Cargar items en lotes de 500 ids
      const items: any[] = [];
      const chunk = 500;
      for (let i = 0; i < orderIds.length; i += chunk) {
        const slice = orderIds.slice(i, i + chunk);
        const { data: it } = await supabase
          .from("order_items")
          .select("sku, quantity, price")
          .in("shopify_order_id", slice);
        if (it) items.push(...it);
      }

      // Agregar por SKU
      const agg: Record<string, { unidades: number; ingresos: number }> = {};
      items.forEach((it: any) => {
        const k = it.sku ?? "—";
        if (!agg[k]) agg[k] = { unidades: 0, ingresos: 0 };
        agg[k].unidades += Number(it.quantity) || 0;
        agg[k].ingresos += (Number(it.price) || 0) * (Number(it.quantity) || 0);
      });

      const skus = Object.keys(agg);
      // Resolver títulos
      const titles: Record<string, string> = {};
      if (skus.length) {
        const { data: cat } = await supabase
          .from("product_catalog")
          .select("sku, title")
          .in("sku", skus);
        (cat ?? []).forEach((c: any) => {
          if (!titles[c.sku]) titles[c.sku] = c.title ?? c.sku;
        });
      }

      const top = Object.entries(agg)
        .map(([sku, v]) => ({
          producto: titles[sku] ?? sku,
          unidades: v.unidades,
          ingresos: v.ingresos,
        }))
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 5);

      setTopProducts(top);
    } catch {
      setTopProducts([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  // Año options: 5 años hacia atrás y 1 hacia delante
  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return Array.from({ length: 7 }, (_, i) => y - 5 + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ventaDiariaPromedio =
    selected && selected.total_pedidos
      ? selected.venta_neta / new Date(anio, mes, 0).getDate()
      : 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Rendimiento por Vendedor</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Desempeño comercial individual</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!sorted.length}>
                <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!sorted.length}>
                <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF
              </Button>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            {/* Filtros */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mes</label>
                    <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map((m, i) => (
                          <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Año</label>
                    <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tienda</label>
                    <Select value={locationId} onValueChange={setLocationId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {locations.map((l) => (
                          <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Zona</label>
                    <Select value={zona} onValueChange={setZona}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {zonas.map((z) => (
                          <SelectItem key={z} value={z}>{z}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rol</label>
                    <Select value={rol} onValueChange={setRol}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="vendedor">Vendedor</SelectItem>
                        <SelectItem value="personal_shopper">Personal Shopper</SelectItem>
                        <SelectItem value="administrador">Administrador</SelectItem>
                        <SelectItem value="gerente_zona">Gerente Zona</SelectItem>
                        <SelectItem value="lider_canal">Líder Canal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard title="Vendedores activos" value={fmtNum(kpis.totalVend)} icon={Users} />
              <KpiCard title="Venta total equipo" value={fmtCOP(kpis.ventaTotal)} icon={Trophy} />
              <KpiCard title="Ticket promedio" value={fmtCOP(kpis.ticketProm)} icon={Receipt} />
              <KpiCard title="UPT promedio" value={kpis.uptProm.toFixed(2)} icon={Package} />
            </div>

            {/* Tabla */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <LoadingState />
                ) : error ? (
                  <div className="text-sm text-red-600 py-4">Error: {error}</div>
                ) : !sorted.length ? (
                  <EmptyState message="No hay datos para los filtros seleccionados." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-2 text-center w-10">#</th>
                          <th className="px-2 py-2 text-left">
                            <button onClick={() => toggleSort("nombre_vendedor")} className="inline-flex items-center gap-1 hover:text-foreground">
                              Vendedor <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-left">Rol</th>
                          <th className="px-2 py-2 text-left">Contrato</th>
                          <th className="px-2 py-2 text-left">Tienda</th>
                          <th className="px-2 py-2 text-right">
                            <button onClick={() => toggleSort("total_pedidos")} className="inline-flex items-center gap-1 hover:text-foreground">
                              Pedidos <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-right">
                            <button onClick={() => toggleSort("unidades_vendidas")} className="inline-flex items-center gap-1 hover:text-foreground">
                              Unidades <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-right">
                            <button onClick={() => toggleSort("venta_neta")} className="inline-flex items-center gap-1 hover:text-foreground">
                              Venta Neta <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-right">
                            <button onClick={() => toggleSort("ticket_promedio")} className="inline-flex items-center gap-1 hover:text-foreground">
                              Ticket Prom. <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-right">
                            <button onClick={() => toggleSort("upt")} className="inline-flex items-center gap-1 hover:text-foreground">
                              UPT <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                          <th className="px-2 py-2 text-right">Presupuesto</th>
                          <th className="px-2 py-2 text-left min-w-[140px]">
                            <button onClick={() => toggleSort("pct_cumplimiento")} className="inline-flex items-center gap-1 hover:text-foreground">
                              % Cumplim. <ArrowUpDown className="h-3 w-3" />
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((r, i) => (
                          <tr
                            key={`${r.shopify_user_id}-${i}`}
                            className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                            onClick={() => openDrawer(r)}
                          >
                            <td className="px-2 py-2.5 text-center text-xs text-muted-foreground font-mono">{i + 1}</td>
                            <td className="px-2 py-2.5 font-medium text-foreground">{r.nombre_vendedor}</td>
                            <td className="px-2 py-2.5"><RoleBadge rol={r.rol} /></td>
                            <td className="px-2 py-2.5"><ContratoBadge tipo={r.tipo_contrato} /></td>
                            <td className="px-2 py-2.5 text-muted-foreground">{r.tienda ?? "—"}</td>
                            <td className="px-2 py-2.5 text-right text-muted-foreground">{fmtNum(r.total_pedidos)}</td>
                            <td className="px-2 py-2.5 text-right text-muted-foreground">{fmtNum(r.unidades_vendidas)}</td>
                            <td className="px-2 py-2.5 text-right font-semibold text-foreground">{fmtCOP(r.venta_neta)}</td>
                            <td className="px-2 py-2.5 text-right text-muted-foreground">{fmtCOP(r.ticket_promedio)}</td>
                            <td className="px-2 py-2.5 text-right text-muted-foreground">{(r.upt ?? 0).toFixed(2)}</td>
                            <td className="px-2 py-2.5 text-right text-muted-foreground">
                              {r.presupuesto ? fmtCOP(r.presupuesto) : <span className="text-xs italic">Sin asignar</span>}
                            </td>
                            <td className="px-2 py-2.5">
                              {r.presupuesto && r.presupuesto > 0 ? (
                                <CumplimientoBar pct={r.pct_cumplimiento ?? 0} />
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Drawer detalle */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {selected?.nombre_vendedor}
              {selected && <RoleBadge rol={selected.rol} />}
              {selected && <ContratoBadge tipo={selected.tipo_contrato} />}
            </DrawerTitle>
            <DrawerDescription>
              Tienda principal: {selected?.tienda ?? "—"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto space-y-6">
            {selected && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard title="Venta neta" value={fmtCOP(selected.venta_neta)} icon={Trophy} />
                  <KpiCard title="Pedidos" value={fmtNum(selected.total_pedidos)} icon={Receipt} />
                  <KpiCard title="Venta diaria prom." value={fmtCOP(ventaDiariaPromedio)} icon={Target} />
                  <KpiCard title="UPT" value={(selected.upt ?? 0).toFixed(2)} icon={Package} />
                </div>

                {selected.presupuesto && selected.presupuesto > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Cumplimiento de presupuesto</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{fmtCOP(selected.venta_neta)}</span>
                        <span>{fmtCOP(selected.presupuesto)}</span>
                      </div>
                      <CumplimientoBar pct={selected.pct_cumplimiento ?? 0} />
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Top 5 productos vendidos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {drawerLoading ? (
                      <LoadingState />
                    ) : !topProducts.length ? (
                      <EmptyState message="Sin ventas registradas en el periodo." />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-2 py-2 text-left">Producto</th>
                            <th className="px-2 py-2 text-right">Unidades</th>
                            <th className="px-2 py-2 text-right">Ingresos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topProducts.map((p, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-2 py-2 text-foreground">{p.producto}</td>
                              <td className="px-2 py-2 text-right text-muted-foreground">{fmtNum(p.unidades)}</td>
                              <td className="px-2 py-2 text-right font-medium">{fmtCOP(p.ingresos)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </SidebarProvider>
  );
}
