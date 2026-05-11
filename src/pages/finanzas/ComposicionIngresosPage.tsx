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
    return { brutas, sinIva, ordenes, byCanal, byMetodo, byCanalMetodo, pos, dig };
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
                      {c}
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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Ventas POS Tienda
              {!loading && (
                <Badge variant="secondary">{pctPos.toFixed(1)}%</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCOP(totals.pos.brutas)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sin IVA: {fmtCOP(totals.pos.sinIva)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              Ventas Digitales
              {!loading && (
                <Badge variant="secondary">{pctDig.toFixed(1)}%</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCOP(totals.dig.brutas)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Sin IVA: {fmtCOP(totals.dig.sinIva)}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalle por canal, tienda y método</CardTitle>
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
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("canal")}>
                      Canal
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("tienda")}>
                      Tienda
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => toggleSort("metodo")}>
                      Método
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("ordenes")}>
                      Órdenes
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("brutas")}>
                      Ventas brutas
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("sin_iva")}>
                      Ventas sin IVA
                    </TableHead>
                    <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("pct")}>
                      % del total
                    </TableHead>
                    <TableHead className="text-center cursor-pointer" onClick={() => toggleSort("dias")}>
                      Días liquidación
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByCanal.map(([c, items]) => {
                    const sub = items.reduce(
                      (a, r) => ({
                        brutas: a.brutas + Number(r.r_ventas_brutas ?? 0),
                        sinIva: a.sinIva + Number(r.r_ventas_sin_iva ?? 0),
                        ordenes: a.ordenes + Number(r.r_ordenes ?? 0),
                      }),
                      { brutas: 0, sinIva: 0, ordenes: 0 },
                    );
                    const open = openCanales[c] ?? true;
                    return (
                      <>
                        <TableRow
                          key={`g-${c}`}
                          className="bg-muted/40 cursor-pointer"
                          onClick={() => setOpenCanales((o) => ({ ...o, [c]: !open }))}
                        >
                          <TableCell colSpan={3} className="font-semibold">
                            <span className="inline-flex items-center gap-2">
                              {open ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              <Badge className={canalBadge(c)} variant="secondary">
                                {c}
                              </Badge>
                              <span className="text-muted-foreground text-xs">
                                ({items.length})
                              </span>
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
                          <TableCell />
                        </TableRow>
                        {open &&
                          items.map((r, i) => {
                            const liq = liqBadge(r.r_dias_liquidacion);
                            return (
                              <TableRow key={`r-${c}-${i}`}>
                                <TableCell>
                                  <Badge className={canalBadge(r.r_canal)} variant="secondary">
                                    {r.r_canal}
                                  </Badge>
                                </TableCell>
                                <TableCell>{r.r_tienda}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{r.r_metodo_grupo}</Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtInt(r.r_ordenes)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtCOP(r.r_ventas_brutas)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {fmtCOP(r.r_ventas_sin_iva)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {r.pct.toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge className={liq.cls} variant="secondary">
                                    {liq.label}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </>
                    );
                  })}
                  {/* Totales */}
                  <TableRow className="border-t-2 bg-muted font-bold">
                    <TableCell colSpan={3}>TOTAL</TableCell>
                    <TableCell className="text-right">{fmtInt(totals.ordenes)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.brutas)}</TableCell>
                    <TableCell className="text-right">{fmtCOP(totals.sinIva)}</TableCell>
                    <TableCell className="text-right">100.0%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
              {!sortedRows.length && (
                <div className="text-center text-muted-foreground py-8">
                  No hay datos para los filtros seleccionados.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </FinanzasLayout>
  );
}
