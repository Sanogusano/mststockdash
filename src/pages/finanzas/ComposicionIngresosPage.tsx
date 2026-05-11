import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { fmtCOP, fmtInt } from "@/lib/finanzas-format";
import { exportToXLS } from "@/lib/xls-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Row = {
  r_canal: string | null;
  r_tienda: string | null;
  r_location_id: string | null;
  r_metodo_pago: string | null;
  r_metodo_grupo: string | null;
  r_ordenes: number;
  r_ventas_brutas: number;
  r_ventas_sin_iva: number;
  r_dias_liquidacion: number | null;
};

const CANALES = [
  "POS Tienda",
  "Tienda Online",
  "Personal Shopper",
  "Addi Marketplace",
];

const METODOS = [
  "Efectivo",
  "Datáfonos",
  "Wompi",
  "Mercado Pago",
  "Addi",
  "Sistecredito",
  "Transferencia/Manual",
  "Notas Crédito",
  "Otros",
];

function displayCanal(canal: string | null): string {
  if (canal === "POS Tienda") return "Tiendas Físicas";
  return canal ?? "Otros";
}

function canalBadge(canal: string | null) {
  switch (canal) {
    case "POS Tienda":
      return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "Tienda Online":
      return "bg-green-100 text-green-800 hover:bg-green-100";
    case "Personal Shopper":
      return "bg-orange-100 text-orange-800 hover:bg-orange-100";
    case "Addi Marketplace":
      return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function classifyCanal(source: string | null): string {
  if (source === "271832285185") return "Addi Marketplace";
  if (source === "pos") return "POS Tienda";
  if (source === "shopify_draft_order") return "Personal Shopper";
  if (source === "web") return "Tienda Online";
  return source ?? "Otros";
}

function classifyMetodo(gateway: string | null): string {
  const g = gateway ?? "";
  if (g === "cash") return "Efectivo";
  if (
    [
      "Tarjeta Mastercard / Maestro / Nequi",
      "Tarjeta Visa",
      "Tarjeta American Express (Amex)",
      "Tarjeta Dinners",
      "Tarjeta de regalo (Redeban)",
    ].includes(g)
  )
    return "Datáfonos";
  if (g === "Wompi") return "Wompi";
  if (["Checkout Mercado Pago", "Mercadopago"].includes(g)) return "Mercado Pago";
  if (["Addi Payment", "Venta Addi"].includes(g)) return "Addi";
  if (g === "Addi Marketplace") return "Addi Marketplace";
  if (["Venta Sistecredito", "Sistecredito"].includes(g)) return "Sistecredito";
  if (["manual", "Transferencia Corporativa"].includes(g)) return "Transferencia/Manual";
  if (g === "Saldos a favor") return "Notas Crédito";
  return "Otros";
}

type SortKey =
  | "canal"
  | "tienda"
  | "metodo"
  | "ordenes"
  | "brutas"
  | "sin_iva"
  | "pct"
  | "dias";

export default function ComposicionIngresosPage() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [desde, setDesde] = useState<Date>(firstOfMonth);
  const [hasta, setHasta] = useState<Date>(today);
  const [canal, setCanal] = useState<string>("__all__");
  const [locationId, setLocationId] = useState<string>("__all__");
  const [metodo, setMetodo] = useState<string>("__all__");

  const [locations, setLocations] = useState<{ location_id: string; name: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>("brutas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openCanales, setOpenCanales] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("locations")
        .select("location_id, name")
        .eq("is_active", true)
        .order("name");
      setLocations(data ?? []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("reporte_composicion_ingresos", {
        p_desde: format(desde, "yyyy-MM-dd"),
        p_hasta: format(hasta, "yyyy-MM-dd"),
        p_canal: canal === "__all__" ? null : canal,
        p_location_id: locationId === "__all__" ? null : locationId,
        p_metodo_pago: metodo === "__all__" ? null : metodo,
      } as any);
      if (error) {
        toast.error(`Error cargando datos: ${error.message}`);
        setRows([]);
      } else {
        setRows((data as Row[]) ?? []);
      }
      setLoading(false);
    })();
  }, [desde, hasta, canal, locationId, metodo]);

  type Agg = { brutas: number; sinIva: number; ordenes: number };
  const totals = useMemo(() => {
    let brutas = 0,
      sinIva = 0,
      ordenes = 0;
    const byCanal: Record<string, Agg> = {};
    const byMetodo: Record<string, Agg> = {};
    const byCanalMetodo: Record<string, Record<string, Agg>> = {};
    const byTienda: Record<string, Agg & { canal: string | null; location_id: string | null }> = {};
    rows.forEach((r) => {
      const b = Number(r.r_ventas_brutas ?? 0);
      const s = Number(r.r_ventas_sin_iva ?? 0);
      const o = Number(r.r_ordenes ?? 0);
      brutas += b;
      sinIva += s;
      ordenes += o;
      const c = r.r_canal ?? "Otros";
      const m = r.r_metodo_grupo ?? "Otros";
      if (!byCanal[c]) byCanal[c] = { brutas: 0, sinIva: 0, ordenes: 0 };
      byCanal[c].brutas += b;
      byCanal[c].sinIva += s;
      byCanal[c].ordenes += o;
      if (!byMetodo[m]) byMetodo[m] = { brutas: 0, sinIva: 0, ordenes: 0 };
      byMetodo[m].brutas += b;
      byMetodo[m].sinIva += s;
      byMetodo[m].ordenes += o;
      if (!byCanalMetodo[c]) byCanalMetodo[c] = {};
      if (!byCanalMetodo[c][m]) byCanalMetodo[c][m] = { brutas: 0, sinIva: 0, ordenes: 0 };
      byCanalMetodo[c][m].brutas += b;
      byCanalMetodo[c][m].sinIva += s;
      byCanalMetodo[c][m].ordenes += o;
      const tKey = r.r_tienda ?? r.r_location_id ?? "Sin tienda";
      if (!byTienda[tKey])
        byTienda[tKey] = {
          brutas: 0,
          sinIva: 0,
          ordenes: 0,
          canal: r.r_canal,
          location_id: r.r_location_id,
        };
      byTienda[tKey].brutas += b;
      byTienda[tKey].sinIva += s;
      byTienda[tKey].ordenes += o;
    });
    const pos: Agg = byCanal["POS Tienda"] ?? { brutas: 0, sinIva: 0, ordenes: 0 };
    const dig: Agg = ["Tienda Online", "Personal Shopper", "Addi Marketplace"].reduce<Agg>(
      (acc, c) => {
        const x = byCanal[c] ?? { brutas: 0, sinIva: 0, ordenes: 0 };
        return {
          brutas: acc.brutas + x.brutas,
          sinIva: acc.sinIva + x.sinIva,
          ordenes: acc.ordenes + x.ordenes,
        };
      },
      { brutas: 0, sinIva: 0, ordenes: 0 },
    );
    return { brutas, sinIva, ordenes, byCanal, byMetodo, byCanalMetodo, byTienda, pos, dig };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const total = totals.brutas || 1;
    const enriched = rows.map((r) => ({
      ...r,
      pct: (Number(r.r_ventas_brutas ?? 0) / total) * 100,
    }));
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (r: typeof enriched[number]) => {
      switch (sortKey) {
        case "canal":
          return r.r_canal ?? "";
        case "tienda":
          return r.r_tienda ?? "";
        case "metodo":
          return r.r_metodo_grupo ?? "";
        case "ordenes":
          return Number(r.r_ordenes ?? 0);
        case "brutas":
          return Number(r.r_ventas_brutas ?? 0);
        case "sin_iva":
          return Number(r.r_ventas_sin_iva ?? 0);
        case "pct":
          return r.pct;
        case "dias":
          return Number(r.r_dias_liquidacion ?? 0);
      }
    };
    enriched.sort((a, b) => {
      const av = get(a),
        bv = get(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return enriched;
  }, [rows, sortKey, sortDir, totals.brutas]);

  const groupedByCanal = useMemo(() => {
    const map = new Map<string, typeof sortedRows>();
    sortedRows.forEach((r) => {
      const c = r.r_canal ?? "Otros";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(r);
    });
    return Array.from(map.entries());
  }, [sortedRows]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const handleExport = async () => {
    try {
      // Fetch orders detail in chunks
      const desdeStr = format(desde, "yyyy-MM-dd");
      const hastaStr = format(hasta, "yyyy-MM-dd");
      const all: any[] = [];
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabase
          .from("orders")
          .select(
            "order_number, created_at, source_name, location_id, payment_gateway, total_price, financial_status",
          )
          .in("financial_status", ["paid", "partially_refunded", "partially_paid"])
          .gte("created_at", `${desdeStr}T00:00:00-05:00`)
          .lte("created_at", `${hastaStr}T23:59:59-05:00`)
          .not("payment_gateway", "is", null)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (locationId !== "__all__") q = q.eq("location_id", locationId);
        const { data, error } = await q;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const locMap = new Map(locations.map((l) => [l.location_id, l.name]));
      const filtered = all
        .map((o) => {
          const c = classifyCanal(o.source_name);
          const m = classifyMetodo(o.payment_gateway);
          return {
            "# Pedido": o.order_number,
            Fecha: o.created_at,
            Canal: c,
            Tienda: locMap.get(o.location_id) ?? o.location_id ?? "",
            "Método Pago": o.payment_gateway,
            "Grupo Método": m,
            "Ventas Brutas": Number(o.total_price ?? 0),
            "Ventas Sin IVA": Math.round(Number(o.total_price ?? 0) / 1.19),
            IVA: Math.round(Number(o.total_price ?? 0) - Number(o.total_price ?? 0) / 1.19),
            Estado: o.financial_status,
            _canal: c,
            _metodo: m,
          };
        })
        .filter((r) => (canal === "__all__" ? true : r._canal === canal))
        .filter((r) => (metodo === "__all__" ? true : r._metodo === metodo))
        .map(({ _canal, _metodo, ...rest }) => rest);

      if (!filtered.length) {
        toast.warning("Sin datos para exportar");
        return;
      }
      exportToXLS(
        filtered,
        `composicion_ingresos_${desdeStr}_${hastaStr}`,
        "Pedidos",
      );
      toast.success(`Exportados ${filtered.length} pedidos`);
    } catch (e: any) {
      toast.error(`Error exportando: ${e.message ?? e}`);
    }
  };

  const exportMetodo = () => {
    const dStr = format(desde, "yyyy-MM-dd");
    const hStr = format(hasta, "yyyy-MM-dd");
    const data: any[] = Object.entries(totals.byMetodo)
      .sort((a, b) => b[1].brutas - a[1].brutas)
      .map(([m, v]) => ({
        "Método de Pago": m,
        Órdenes: v.ordenes,
        "Ventas Brutas": v.brutas,
        "Ventas Sin IVA": v.sinIva,
        "% Participación": totals.brutas ? Number(((v.brutas / totals.brutas) * 100).toFixed(2)) : 0,
      }));
    if (!data.length) return toast.warning("Sin datos para exportar");
    data.push({
      "Método de Pago": "TOTAL",
      Órdenes: totals.ordenes,
      "Ventas Brutas": totals.brutas,
      "Ventas Sin IVA": totals.sinIva,
      "% Participación": 100,
    });
    exportToXLS(data, `informe_metodo_pago_${dStr}_${hStr}`, "Método de Pago");
  };

  const exportCanal = () => {
    const dStr = format(desde, "yyyy-MM-dd");
    const hStr = format(hasta, "yyyy-MM-dd");
    const data: any[] = Object.entries(totals.byCanal)
      .sort((a, b) => b[1].brutas - a[1].brutas)
      .map(([c, v]) => ({
        Canal: displayCanal(c),
        Órdenes: v.ordenes,
        "Ventas Brutas": v.brutas,
        "Ventas Sin IVA": v.sinIva,
        "Ticket Promedio": v.ordenes ? Math.round(v.brutas / v.ordenes) : 0,
        "% Participación": totals.brutas ? Number(((v.brutas / totals.brutas) * 100).toFixed(2)) : 0,
      }));
    if (!data.length) return toast.warning("Sin datos para exportar");
    data.push({
      Canal: "TOTAL",
      Órdenes: totals.ordenes,
      "Ventas Brutas": totals.brutas,
      "Ventas Sin IVA": totals.sinIva,
      "Ticket Promedio": totals.ordenes ? Math.round(totals.brutas / totals.ordenes) : 0,
      "% Participación": 100,
    });
    exportToXLS(data, `informe_canal_${dStr}_${hStr}`, "Canal");
  };

  const exportTienda = () => {
    const dStr = format(desde, "yyyy-MM-dd");
    const hStr = format(hasta, "yyyy-MM-dd");
    const data: any[] = Object.entries(totals.byTienda)
      .sort((a, b) => b[1].brutas - a[1].brutas)
      .map(([t, v]) => ({
        Tienda: t,
        Canal: displayCanal(v.canal),
        Órdenes: v.ordenes,
        "Ventas Brutas": v.brutas,
        "Ventas Sin IVA": v.sinIva,
        "Ticket Promedio": v.ordenes ? Math.round(v.brutas / v.ordenes) : 0,
        "% Participación": totals.brutas ? Number(((v.brutas / totals.brutas) * 100).toFixed(2)) : 0,
      }));
    if (!data.length) return toast.warning("Sin datos para exportar");
    data.push({
      Tienda: "TOTAL",
      Canal: "",
      Órdenes: totals.ordenes,
      "Ventas Brutas": totals.brutas,
      "Ventas Sin IVA": totals.sinIva,
      "Ticket Promedio": totals.ordenes ? Math.round(totals.brutas / totals.ordenes) : 0,
      "% Participación": 100,
    });
    exportToXLS(data, `informe_tienda_${dStr}_${hStr}`, "Tienda");
  };

  const pctPos = totals.brutas ? (totals.pos.brutas / totals.brutas) * 100 : 0;
  const pctDig = totals.brutas ? (totals.dig.brutas / totals.brutas) * 100 : 0;

  return (
    <FinanzasLayout title="Composición de Ingresos">
      {/* Filtros */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="lg:col-span-1">
              <label className="text-xs text-muted-foreground mb-1 block">Desde</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(desde, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={desde}
                    onSelect={(d) => d && setDesde(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="lg:col-span-1">
              <label className="text-xs text-muted-foreground mb-1 block">Hasta</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(hasta, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={hasta}
                    onSelect={(d) => d && setHasta(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Canal</label>
              <Select value={canal} onValueChange={setCanal}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {CANALES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {displayCanal(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tienda</label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.location_id} value={l.location_id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Método de pago</label>
              <Select value={metodo} onValueChange={setMetodo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {METODOS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleExport} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Exportar Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs Globales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Ventas Brutas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCOP(totals.brutas)}</div>
                <p className="text-xs text-muted-foreground mt-1">IVA incluido</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Ventas Sin IVA
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCOP(totals.sinIva)}</div>
                <p className="text-xs text-muted-foreground mt-1">Base gravable</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sección Tiendas Físicas */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <h2 className="text-lg font-semibold">Ventas Tiendas Físicas</h2>
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100" variant="secondary">
            {pctPos.toFixed(1)}%
          </Badge>
        </div>
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/30 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-blue-300 bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                  Total Tiendas Físicas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  <>
                    <div className="text-xl font-bold">{fmtCOP(totals.pos.brutas)}</div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Sin IVA: {fmtCOP(totals.pos.sinIva)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            {METODOS.map((m) => {
              const v = totals.byCanalMetodo["POS Tienda"]?.[m];
              if (!v || v.brutas === 0) return null;
              const pct = totals.pos.brutas ? (v.brutas / totals.pos.brutas) * 100 : 0;
              return (
                <Card key={`pos-${m}`} className="bg-background">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-2">
                      <span className="truncate">{m}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {pct.toFixed(1)}%
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <>
                        <div className="text-base font-semibold">{fmtCOP(v.brutas)}</div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {fmtInt(v.ordenes)} órdenes
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sección Ventas Digitales */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <h2 className="text-lg font-semibold">Ventas Digitales</h2>
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100" variant="secondary">
            {pctDig.toFixed(1)}%
          </Badge>
          <span className="text-xs text-muted-foreground">
            Tienda Online · Personal Shopper · Addi Marketplace
          </span>
        </div>
        <div className="rounded-lg border-2 border-green-200 bg-green-50/30 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-green-300 bg-background">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                  Total Digitales
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-7 w-28" />
                ) : (
                  <>
                    <div className="text-xl font-bold">{fmtCOP(totals.dig.brutas)}</div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Sin IVA: {fmtCOP(totals.dig.sinIva)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
            {(() => {
              const aggDig: Record<string, Agg> = {};
              ["Tienda Online", "Personal Shopper", "Addi Marketplace"].forEach((c) => {
                const cm = totals.byCanalMetodo[c] ?? {};
                Object.entries(cm).forEach(([m, v]) => {
                  if (!aggDig[m]) aggDig[m] = { brutas: 0, sinIva: 0, ordenes: 0 };
                  aggDig[m].brutas += v.brutas;
                  aggDig[m].sinIva += v.sinIva;
                  aggDig[m].ordenes += v.ordenes;
                });
              });
              return METODOS.map((m) => {
                const v = aggDig[m];
                if (!v || v.brutas === 0) return null;
                const pct = totals.dig.brutas ? (v.brutas / totals.dig.brutas) * 100 : 0;
                return (
                  <Card key={`dig-${m}`} className="bg-background">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-muted-foreground flex items-center justify-between gap-2">
                        <span className="truncate">{m}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {pct.toFixed(1)}%
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <Skeleton className="h-6 w-24" />
                      ) : (
                        <>
                          <div className="text-base font-semibold">{fmtCOP(v.brutas)}</div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {fmtInt(v.ordenes)} órdenes
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* Tabla resumida por canal y método */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle por canal y método</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método de Pago</TableHead>
                    <TableHead className="text-right">Órdenes</TableHead>
                    <TableHead className="text-right">Ventas Brutas</TableHead>
                    <TableHead className="text-right">Ventas Sin IVA</TableHead>
                    <TableHead className="text-right">% Participación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(totals.byCanalMetodo)
                    .sort((a, b) => (totals.byCanal[b[0]]?.brutas ?? 0) - (totals.byCanal[a[0]]?.brutas ?? 0))
                    .map(([c, methods]) => {
                      const sub = totals.byCanal[c] ?? { brutas: 0, sinIva: 0, ordenes: 0 };
                      const open = openCanales[c] ?? true;
                      const methodEntries = Object.entries(methods).sort(
                        (a, b) => b[1].brutas - a[1].brutas,
                      );
                      return (
                        <>
                          <TableRow
                            key={`g-${c}`}
                            className="bg-muted/40 cursor-pointer"
                            onClick={() => setOpenCanales((o) => ({ ...o, [c]: !open }))}
                          >
                            <TableCell className="font-semibold">
                              <span className="inline-flex items-center gap-2">
                                {open ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <Badge className={canalBadge(c)} variant="secondary">
                                  {displayCanal(c)}
                                </Badge>
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmtInt(sub.ordenes)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmtCOP(sub.brutas)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {fmtCOP(sub.sinIva)}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {totals.brutas
                                ? ((sub.brutas / totals.brutas) * 100).toFixed(1)
                                : "0.0"}
                              %
                            </TableCell>
                          </TableRow>
                          {open &&
                            methodEntries.map(([m, v]) => (
                              <TableRow key={`r-${c}-${m}`}>
                                <TableCell className="pl-10">
                                  <Badge variant="outline">{m}</Badge>
                                </TableCell>
                                <TableCell className="text-right">{fmtInt(v.ordenes)}</TableCell>
                                <TableCell className="text-right">{fmtCOP(v.brutas)}</TableCell>
                                <TableCell className="text-right">{fmtCOP(v.sinIva)}</TableCell>
                                <TableCell className="text-right">
                                  {totals.brutas
                                    ? ((v.brutas / totals.brutas) * 100).toFixed(2)
                                    : "0.00"}
                                  %
                                </TableCell>
                              </TableRow>
                            ))}
                        </>
                      );
                    })}
                  <TableRow className="border-t-2 bg-muted font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{fmtInt(totals.ordenes)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.brutas)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.sinIva)}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {!rows.length && (
                <div className="text-center text-muted-foreground py-8">
                  No hay datos para los filtros seleccionados.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informe General por Método de Pago */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Informe General · Método de Pago</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método de Pago</TableHead>
                    <TableHead className="text-right">Órdenes</TableHead>
                    <TableHead className="text-right">Ventas Brutas</TableHead>
                    <TableHead className="text-right">Ventas Sin IVA</TableHead>
                    <TableHead className="text-right">% Participación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(totals.byMetodo)
                    .sort((a, b) => b[1].brutas - a[1].brutas)
                    .map(([m, v]) => (
                      <TableRow key={`gm-${m}`}>
                        <TableCell>
                          <Badge variant="outline">{m}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(v.ordenes)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.brutas)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.sinIva)}</TableCell>
                        <TableCell className="text-right">
                          {totals.brutas
                            ? ((v.brutas / totals.brutas) * 100).toFixed(2)
                            : "0.00"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="border-t-2 bg-muted font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{fmtInt(totals.ordenes)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.brutas)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.sinIva)}</TableCell>
                    <TableCell className="text-right">100.00%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informe por Canal */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Informe por Canal</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Órdenes</TableHead>
                    <TableHead className="text-right">Ventas Brutas</TableHead>
                    <TableHead className="text-right">Ventas Sin IVA</TableHead>
                    <TableHead className="text-right">Ticket Promedio</TableHead>
                    <TableHead className="text-right">% Participación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(totals.byCanal)
                    .sort((a, b) => b[1].brutas - a[1].brutas)
                    .map(([c, v]) => (
                      <TableRow key={`gc-${c}`}>
                        <TableCell>
                          <Badge className={canalBadge(c)} variant="secondary">
                            {displayCanal(c)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(v.ordenes)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.brutas)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.sinIva)}</TableCell>
                        <TableCell className="text-right">
                          {v.ordenes ? fmtCOP(v.brutas / v.ordenes) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {totals.brutas
                            ? ((v.brutas / totals.brutas) * 100).toFixed(2)
                            : "0.00"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="border-t-2 bg-muted font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{fmtInt(totals.ordenes)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.brutas)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.sinIva)}</TableCell>
                    <TableCell className="text-right">
                      {totals.ordenes ? fmtCOP(totals.brutas / totals.ordenes) : "—"}
                    </TableCell>
                    <TableCell className="text-right">100.00%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Informe por Tienda */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Informe por Tienda</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tienda</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Órdenes</TableHead>
                    <TableHead className="text-right">Ventas Brutas</TableHead>
                    <TableHead className="text-right">Ventas Sin IVA</TableHead>
                    <TableHead className="text-right">Ticket Promedio</TableHead>
                    <TableHead className="text-right">% Participación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(totals.byTienda)
                    .sort((a, b) => b[1].brutas - a[1].brutas)
                    .map(([t, v]) => (
                      <TableRow key={`gt-${t}`}>
                        <TableCell className="font-medium">{t}</TableCell>
                        <TableCell>
                          <Badge className={canalBadge(v.canal)} variant="secondary">
                            {displayCanal(v.canal)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{fmtInt(v.ordenes)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.brutas)}</TableCell>
                        <TableCell className="text-right">{fmtCOP(v.sinIva)}</TableCell>
                        <TableCell className="text-right">
                          {v.ordenes ? fmtCOP(v.brutas / v.ordenes) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {totals.brutas
                            ? ((v.brutas / totals.brutas) * 100).toFixed(2)
                            : "0.00"}
                          %
                        </TableCell>
                      </TableRow>
                    ))}
                  <TableRow className="border-t-2 bg-muted font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell />
                    <TableCell className="text-right">{fmtInt(totals.ordenes)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.brutas)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.sinIva)}</TableCell>
                    <TableCell className="text-right">
                      {totals.ordenes ? fmtCOP(totals.brutas / totals.ordenes) : "—"}
                    </TableCell>
                    <TableCell className="text-right">100.00%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </FinanzasLayout>
  );
}
