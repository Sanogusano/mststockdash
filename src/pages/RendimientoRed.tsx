import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { TrendingUp, TrendingDown, Download, ArrowUpDown, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToXLS } from "@/lib/xls-export";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer, BarChart, Bar, ReferenceLine, Cell } from "recharts";

// ──────── Helpers ────────
const fmtMoneyShort = (n: number) => {
  if (n == null || isNaN(n)) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
};
const fmtMoneyFull = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
const fmtPct = (n: number, decimals = 1) => `${(n ?? 0).toFixed(decimals)}%`;

const tipoColors: Record<string, string> = {
  A: "hsl(142 71% 45%)",
  B: "hsl(217 91% 60%)",
  C: "hsl(38 92% 50%)",
  OUTLET: "hsl(280 65% 60%)",
};

const TipoBadge = ({ tipo }: { tipo: string | null }) => {
  if (!tipo) return <span className="text-muted-foreground text-xs">—</span>;
  const colorClass: Record<string, string> = {
    A: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    B: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    C: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    OUTLET: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  };
  return <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${colorClass[tipo] ?? ""}`}>{tipo}</Badge>;
};

const SemaforoDot = ({ value }: { value: string | null }) => {
  const color =
    value === "verde" ? "bg-emerald-500" :
    value === "amarillo" ? "bg-amber-500" :
    value === "rojo" ? "bg-red-500" :
    "bg-muted";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
};

const DeltaCell = ({ value }: { value: number | null }) => {
  const v = Number(value ?? 0);
  const positive = v > 0;
  const negative = v < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : null;
  const cls = positive ? "text-emerald-600" : negative ? "text-red-600" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${cls}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />} {fmtPct(v)}
    </span>
  );
};

// ──────── Types ────────
type SameStoreRow = {
  r_location_id: string;
  r_nombre: string;
  r_tipo_tienda: string | null;
  r_zona: string | null;
  r_dimension_m2: number;
  r_ventas_base: number;
  r_ordenes_base: number;
  r_vpm_base: number;
  r_ticket_base: number;
  r_ventas_actual: number;
  r_ordenes_actual: number;
  r_vpm_actual: number;
  r_ticket_actual: number;
  r_crecimiento_ventas: number;
  r_crecimiento_vpm: number;
  r_semaforo: string | null;
};

type CurvaRow = {
  r_location_id: string;
  r_nombre: string;
  r_tipo_tienda: string | null;
  r_cohorte: string;
  r_mes_de_vida: number;
  r_mes_fecha: string;
  r_ventas: number;
  r_ordenes: number;
  r_vpm: number;
  r_ticket: number;
};

type EficienciaRow = {
  r_location_id: string;
  r_nombre: string;
  r_tipo_tienda: string | null;
  r_zona: string | null;
  r_dimension_m2: number;
  r_meses_activa: number;
  r_ventas: number;
  r_ordenes: number;
  r_vpm: number;
  r_ticket: number;
  r_vpm_vs_red: number;
};

// ════════════════════════════════════════════════════════════════
// TAB 1 — SAME STORE
// ════════════════════════════════════════════════════════════════
function SameStoreTab() {
  const [fechaDesdeBase, setFechaDesdeBase] = useState("2025-01-01");
  const [fechaHastaBase, setFechaHastaBase] = useState("2025-04-23");
  const [fechaDesdeActual, setFechaDesdeActual] = useState("2026-01-01");
  const [fechaHastaActual, setFechaHastaActual] = useState("2026-04-23");
  const [data, setData] = useState<SameStoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFilter, setTipoFilter] = useState<string>("all");
  const [zonaFilter, setZonaFilter] = useState<string>("all");
  const [solo, setSolo] = useState<"all" | "subidas" | "bajas">("all");
  const [sortKey, setSortKey] = useState<keyof SameStoreRow>("r_crecimiento_ventas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    setLoading(true);
    const { data: rows, error } = await (supabase.rpc as any)("reporte_same_store", {
      p_fecha_desde_base: fechaDesdeBase,
      p_fecha_hasta_base: fechaHastaBase,
      p_fecha_desde_actual: fechaDesdeActual,
      p_fecha_hasta_actual: fechaHastaActual,
    });
    if (error) {
      toast.error("Error: " + error.message);
      setData([]);
    } else {
      setData((rows ?? []) as SameStoreRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const zonas = useMemo(() => Array.from(new Set(data.map(d => d.r_zona).filter(Boolean))) as string[], [data]);

  const filtered = useMemo(() => {
    let out = [...data];
    if (tipoFilter !== "all") out = out.filter(r => r.r_tipo_tienda === tipoFilter);
    if (zonaFilter !== "all") out = out.filter(r => r.r_zona === zonaFilter);
    if (solo === "subidas") out = out.filter(r => Number(r.r_crecimiento_ventas) > 0);
    if (solo === "bajas") out = out.filter(r => Number(r.r_crecimiento_ventas) < 0);
    out.sort((a, b) => {
      const av = a[sortKey] as any;
      const bv = b[sortKey] as any;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc" ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return out;
  }, [data, tipoFilter, zonaFilter, solo, sortKey, sortDir]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const avgVentas = total > 0 ? filtered.reduce((s, r) => s + Number(r.r_crecimiento_ventas || 0), 0) / total : 0;
    const avgVpm = total > 0 ? filtered.reduce((s, r) => s + Number(r.r_crecimiento_vpm || 0), 0) / total : 0;
    const subieron = filtered.filter(r => Number(r.r_crecimiento_ventas) > 0).length;
    const bajaron = filtered.filter(r => Number(r.r_crecimiento_ventas) < 0).length;
    return { total, avgVentas, avgVpm, subieron, bajaron };
  }, [filtered]);

  const toggleSort = (key: keyof SameStoreRow) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const exportar = () => {
    exportToXLS(
      filtered.map(r => ({
        Tienda: r.r_nombre,
        Tipo: r.r_tipo_tienda,
        Zona: r.r_zona,
        M2: r.r_dimension_m2,
        "Ventas Base": r.r_ventas_base,
        "$/m² Base": r.r_vpm_base,
        "Ventas Actual": r.r_ventas_actual,
        "$/m² Actual": r.r_vpm_actual,
        "Δ Ventas %": r.r_crecimiento_ventas,
        "Δ $/m² %": r.r_crecimiento_vpm,
        Semáforo: r.r_semaforo,
      })),
      `same-store-${fechaDesdeActual}-${fechaHastaActual}`,
      "Same Store"
    );
  };

  return (
    <div className="space-y-4">
      {/* Selectores */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período base</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input type="date" value={fechaDesdeBase} onChange={e => setFechaDesdeBase(e.target.value)} />
                <Input type="date" value={fechaHastaBase} onChange={e => setFechaHastaBase(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período actual</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input type="date" value={fechaDesdeActual} onChange={e => setFechaDesdeActual(e.target.value)} />
                <Input type="date" value={fechaHastaActual} onChange={e => setFechaHastaActual(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={load} disabled={loading}>{loading ? "Cargando…" : "Aplicar"}</Button>
            <Button variant="outline" onClick={exportar} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-1" /> Exportar Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Tiendas comparables</p><p className="text-2xl font-bold mt-1">{kpis.total}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Crec. promedio ventas</p><p className={`text-2xl font-bold mt-1 ${kpis.avgVentas >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(kpis.avgVentas)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Crec. promedio $/m²</p><p className={`text-2xl font-bold mt-1 ${kpis.avgVpm >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmtPct(kpis.avgVpm)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Subieron / Bajaron</p><p className="text-2xl font-bold mt-1"><span className="text-emerald-600">{kpis.subieron}</span> / <span className="text-red-600">{kpis.bajaron}</span></p></CardContent></Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3">
          <div>
            <Label className="text-[10px] uppercase">Tipo</Label>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="OUTLET">OUTLET</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase">Zona</Label>
            <Select value={zonaFilter} onValueChange={setZonaFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {zonas.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase">Mostrar</Label>
            <Select value={solo} onValueChange={(v: any) => setSolo(v)}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="subidas">Solo subidas</SelectItem>
                <SelectItem value="bajas">Solo bajas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader><CardTitle className="text-base">Comparativo Same-Store</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-2 cursor-pointer" onClick={() => toggleSort("r_nombre")}>Tienda <ArrowUpDown className="h-3 w-3 inline" /></th>
                    <th className="p-2">Zona</th>
                    <th className="p-2 text-right">m²</th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => toggleSort("r_ventas_base")}>Ventas base</th>
                    <th className="p-2 text-right">$/m² base</th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => toggleSort("r_ventas_actual")}>Ventas actual</th>
                    <th className="p-2 text-right">$/m² actual</th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => toggleSort("r_crecimiento_ventas")}>Δ ventas</th>
                    <th className="p-2 text-right cursor-pointer" onClick={() => toggleSort("r_crecimiento_vpm")}>Δ $/m²</th>
                    <th className="p-2 text-center">●</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.r_location_id} className="border-b hover:bg-muted/20">
                      <td className="p-2"><div className="flex items-center gap-2"><span className="font-medium">{r.r_nombre}</span><TipoBadge tipo={r.r_tipo_tienda} /></div></td>
                      <td className="p-2 text-muted-foreground">{r.r_zona ?? "—"}</td>
                      <td className="p-2 text-right">{Number(r.r_dimension_m2 || 0).toFixed(0)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMoneyShort(Number(r.r_ventas_base))}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoneyShort(Number(r.r_vpm_base))}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMoneyShort(Number(r.r_ventas_actual))}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoneyShort(Number(r.r_vpm_actual))}</td>
                      <td className="p-2 text-right"><DeltaCell value={Number(r.r_crecimiento_ventas)} /></td>
                      <td className="p-2 text-right"><DeltaCell value={Number(r.r_crecimiento_vpm)} /></td>
                      <td className="p-2 text-center"><SemaforoDot value={r.r_semaforo} /></td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 2 — CURVA DE MADURACIÓN
// ════════════════════════════════════════════════════════════════
const COHORT_DEFS: Array<{ key: string; label: string; color: string; matches: (cohorte: string) => boolean }> = [
  { key: "ene2025", label: "Ene 2025 — Fundadoras", color: "hsl(217 91% 60%)", matches: c => /2025-01|ene.*2025/i.test(c) },
  { key: "abr2025", label: "Abr 2025", color: "hsl(142 71% 45%)", matches: c => /2025-04|abr.*2025/i.test(c) },
  { key: "may2025", label: "May 2025", color: "hsl(25 95% 55%)", matches: c => /2025-05|may.*2025/i.test(c) },
  { key: "jul-sep2025", label: "Jul-Sep 2025", color: "hsl(280 65% 60%)", matches: c => /2025-0[789]|jul.*2025|ago.*2025|sep.*2025/i.test(c) },
  { key: "y2026", label: "2026", color: "hsl(0 72% 51%)", matches: c => /^2026|2026/i.test(c) },
];

function getCohortBucket(cohorte: string): typeof COHORT_DEFS[0] | null {
  return COHORT_DEFS.find(d => d.matches(cohorte ?? "")) ?? null;
}

function CurvaMaduracionTab() {
  const [data, setData] = useState<CurvaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCohorts, setActiveCohorts] = useState<Set<string>>(new Set(COHORT_DEFS.map(c => c.key)));
  const [tipoFilter, setTipoFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: rows, error } = await (supabase.rpc as any)("reporte_curva_maduracion");
      if (error) { toast.error("Error: " + error.message); setData([]); }
      else setData((rows ?? []) as CurvaRow[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return data.filter(r => {
      const bucket = getCohortBucket(r.r_cohorte);
      if (!bucket || !activeCohorts.has(bucket.key)) return false;
      if (tipoFilter !== "all" && r.r_tipo_tienda !== tipoFilter) return false;
      return true;
    });
  }, [data, activeCohorts, tipoFilter]);

  // Pivotear: filas = mes_de_vida; columnas = location_id; valor = vpm
  const chartData = useMemo(() => {
    const tiendas = Array.from(new Set(filtered.map(r => r.r_location_id)));
    const meses = Array.from(new Set(filtered.map(r => r.r_mes_de_vida))).sort((a, b) => a - b);
    return meses.map(m => {
      const row: any = { mes: m };
      tiendas.forEach(t => {
        const found = filtered.find(r => r.r_location_id === t && r.r_mes_de_vida === m);
        if (found) row[t] = Number(found.r_vpm);
      });
      return row;
    });
  }, [filtered]);

  const tiendaMeta = useMemo(() => {
    const map = new Map<string, { nombre: string; cohorte: string; color: string }>();
    filtered.forEach(r => {
      if (!map.has(r.r_location_id)) {
        const bucket = getCohortBucket(r.r_cohorte);
        map.set(r.r_location_id, { nombre: r.r_nombre, cohorte: r.r_cohorte, color: bucket?.color ?? "hsl(var(--muted-foreground))" });
      }
    });
    return map;
  }, [filtered]);

  const cohortSummary = useMemo(() => {
    return COHORT_DEFS.map(def => {
      const rows = data.filter(r => getCohortBucket(r.r_cohorte)?.key === def.key);
      const tiendas = new Set(rows.map(r => r.r_location_id)).size;
      const avgVpm = rows.length ? rows.reduce((s, r) => s + Number(r.r_vpm || 0), 0) / rows.length : 0;
      const avgTicket = rows.length ? rows.reduce((s, r) => s + Number(r.r_ticket || 0), 0) / rows.length : 0;
      return { ...def, tiendas, avgVpm, avgTicket };
    });
  }, [data]);

  const toggleCohort = (key: string) => {
    setActiveCohorts(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const exportar = () => {
    exportToXLS(
      data.map(r => ({
        Tienda: r.r_nombre, Tipo: r.r_tipo_tienda, Cohorte: r.r_cohorte,
        "Mes Vida": r.r_mes_de_vida, "Mes Calendario": r.r_mes_fecha,
        Ventas: r.r_ventas, "$/m²": r.r_vpm, Ticket: r.r_ticket,
      })),
      "curva-maduracion", "Curva"
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-muted/50 border border-border rounded-lg">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">Compara el rendimiento de cada tienda en el mismo punto de su vida. <strong>Mes 1</strong> = primer mes de operación.</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-[10px] uppercase mb-2 block">Cohortes</Label>
            <div className="flex flex-wrap gap-3">
              {COHORT_DEFS.map(c => (
                <label key={c.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox checked={activeCohorts.has(c.key)} onCheckedChange={() => toggleCohort(c.key)} />
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase">Tipo</Label>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="OUTLET">OUTLET</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportar} disabled={!data.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">$/m² por Mes de Vida</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[400px] w-full" /> : (
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" label={{ value: "Mes de vida", position: "insideBottom", offset: -5 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tickFormatter={fmtMoneyShort} stroke="hsl(var(--muted-foreground))" />
                <RTooltip
                  formatter={(value: any, name: any) => {
                    const meta = tiendaMeta.get(name);
                    return [fmtMoneyFull(Number(value)), meta?.nombre ?? name];
                  }}
                  labelFormatter={(label) => `Mes de vida: ${label}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                {Array.from(tiendaMeta.entries()).map(([id, meta]) => (
                  <Line key={id} type="monotone" dataKey={id} stroke={meta.color} strokeWidth={1.5} dot={{ r: 2 }} activeDot={{ r: 4 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Resumen por Cohorte</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2">Cohorte</th>
                  <th className="p-2 text-right">Tiendas</th>
                  <th className="p-2 text-right">$/m² promedio</th>
                  <th className="p-2 text-right">Ticket promedio</th>
                </tr>
              </thead>
              <tbody>
                {cohortSummary.map(c => (
                  <tr key={c.key} className="border-b">
                    <td className="p-2"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} />{c.label}</span></td>
                    <td className="p-2 text-right tabular-nums">{c.tiendas}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoneyShort(c.avgVpm)}</td>
                    <td className="p-2 text-right tabular-nums">{fmtMoneyShort(c.avgTicket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAB 3 — EFICIENCIA ACTUAL
// ════════════════════════════════════════════════════════════════
function EficienciaActualTab() {
  const [dias, setDias] = useState<number>(90);
  const [data, setData] = useState<EficienciaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async (d: number) => {
    setLoading(true);
    const { data: rows, error } = await (supabase.rpc as any)("reporte_eficiencia_actual", { p_dias: d });
    if (error) { toast.error("Error: " + error.message); setData([]); }
    else setData((rows ?? []) as EficienciaRow[]);
    setLoading(false);
  };

  useEffect(() => { load(dias); /* eslint-disable-next-line */ }, []);

  const sorted = useMemo(() => [...data].sort((a, b) => Number(b.r_vpm) - Number(a.r_vpm)), [data]);

  const tierAvg = useMemo(() => {
    const map: Record<string, number> = {};
    ["A", "B", "C", "OUTLET"].forEach(t => {
      const rows = data.filter(r => r.r_tipo_tienda === t);
      map[t] = rows.length ? rows.reduce((s, r) => s + Number(r.r_vpm), 0) / rows.length : 0;
    });
    return map;
  }, [data]);

  const redAvg = useMemo(() => data.length ? data.reduce((s, r) => s + Number(r.r_vpm), 0) / data.length : 0, [data]);

  const kpis = useMemo(() => {
    const sortedAll = [...data].sort((a, b) => Number(b.r_vpm) - Number(a.r_vpm));
    const best = sortedAll[0];
    const worst = sortedAll[sortedAll.length - 1];
    const sobre = data.filter(r => Number(r.r_vpm) >= redAvg).length;
    const bajo = data.filter(r => Number(r.r_vpm) < redAvg).length;
    return { best, worst, sobre, bajo };
  }, [data, redAvg]);

  const exportar = () => {
    exportToXLS(
      sorted.map((r, i) => ({
        "#": i + 1, Tienda: r.r_nombre, Tipo: r.r_tipo_tienda, Zona: r.r_zona,
        M2: r.r_dimension_m2, "Meses Activa": r.r_meses_activa,
        Ventas: r.r_ventas, "$/m²": r.r_vpm,
        "vs Tier %": Number(r.r_vpm) - (tierAvg[r.r_tipo_tienda ?? ""] ?? 0),
        Ticket: r.r_ticket,
      })),
      `eficiencia-actual-${dias}d`, "Eficiencia"
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-[10px] uppercase">Período</Label>
            <Select value={String(dias)} onValueChange={v => { const n = Number(v); setDias(n); load(n); }}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="60">Últimos 60 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
                <SelectItem value="180">Últimos 180 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={exportar} disabled={!data.length}>
            <Download className="h-4 w-4 mr-1" /> Exportar Excel
          </Button>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Mejor tienda</p><p className="text-base font-bold mt-1 truncate">{kpis.best?.r_nombre ?? "—"}</p><p className="text-xs text-emerald-600 tabular-nums">{kpis.best ? fmtMoneyShort(Number(kpis.best.r_vpm)) + " /m²" : ""}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Peor tienda</p><p className="text-base font-bold mt-1 truncate">{kpis.worst?.r_nombre ?? "—"}</p><p className="text-xs text-red-600 tabular-nums">{kpis.worst ? fmtMoneyShort(Number(kpis.worst.r_vpm)) + " /m²" : ""}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Promedio red $/m²</p><p className="text-2xl font-bold mt-1 tabular-nums">{fmtMoneyShort(redAvg)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">Sobre / Bajo promedio</p><p className="text-2xl font-bold mt-1"><span className="text-emerald-600">{kpis.sobre}</span> / <span className="text-red-600">{kpis.bajo}</span></p></CardContent></Card>
      </div>

      {/* Gráfico de barras */}
      <Card>
        <CardHeader><CardTitle className="text-base">Ranking $/m² (últimos {dias} días)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[400px] w-full" /> : (
            <ResponsiveContainer width="100%" height={Math.max(400, sorted.length * 26)}>
              <BarChart data={sorted} layout="vertical" margin={{ top: 10, right: 30, left: 100, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtMoneyShort} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="r_nombre" width={140} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <RTooltip
                  formatter={(value: any, _n, payload: any) => {
                    const r: EficienciaRow = payload.payload;
                    const avg = tierAvg[r.r_tipo_tienda ?? ""] ?? 0;
                    const pct = avg > 0 ? ((Number(value) - avg) / avg) * 100 : 0;
                    return [`${fmtMoneyFull(Number(value))} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs tier ${r.r_tipo_tienda})`, "$/m²"];
                  }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <ReferenceLine x={redAvg} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Promedio red", position: "top", fontSize: 10 }} />
                <Bar dataKey="r_vpm">
                  {sorted.map((r, i) => (
                    <Cell key={i} fill={tipoColors[r.r_tipo_tienda ?? ""] ?? "hsl(var(--muted))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader><CardTitle className="text-base">Detalle</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-2">#</th>
                    <th className="p-2">Tienda</th>
                    <th className="p-2">Zona</th>
                    <th className="p-2 text-right">m²</th>
                    <th className="p-2 text-right">Meses</th>
                    <th className="p-2 text-right">Ventas</th>
                    <th className="p-2 text-right">$/m²</th>
                    <th className="p-2 text-right">vs tier</th>
                    <th className="p-2 text-right">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r, i) => {
                    const avg = tierAvg[r.r_tipo_tienda ?? ""] ?? 0;
                    const pct = avg > 0 ? ((Number(r.r_vpm) - avg) / avg) * 100 : 0;
                    return (
                      <tr key={r.r_location_id} className="border-b hover:bg-muted/20">
                        <td className="p-2 font-mono text-xs">#{i + 1}</td>
                        <td className="p-2"><div className="flex items-center gap-2"><span className="font-medium">{r.r_nombre}</span><TipoBadge tipo={r.r_tipo_tienda} /></div></td>
                        <td className="p-2 text-muted-foreground">{r.r_zona ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">{Number(r.r_dimension_m2 || 0).toFixed(0)}</td>
                        <td className="p-2 text-right tabular-nums">{r.r_meses_activa}</td>
                        <td className="p-2 text-right tabular-nums">{fmtMoneyShort(Number(r.r_ventas))}</td>
                        <td className="p-2 text-right tabular-nums font-semibold">{fmtMoneyShort(Number(r.r_vpm))}</td>
                        <td className="p-2 text-right">
                          <Badge variant="outline" className={pct >= 0 ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" : "bg-red-500/15 text-red-700 border-red-500/30"}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMoneyShort(Number(r.r_ticket))}</td>
                      </tr>
                    );
                  })}
                  {!sorted.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PÁGINA
// ════════════════════════════════════════════════════════════════
export default function RendimientoRed() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b border-border px-4 sticky top-0 bg-background/95 backdrop-blur z-10">
            <SidebarTrigger />
            <h1 className="ml-3 text-sm font-semibold">Rendimiento de Red</h1>
          </header>
          <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
            <div className="mb-5">
              <h2 className="text-2xl font-bold tracking-tight">Rendimiento de Red</h2>
              <p className="text-sm text-muted-foreground">Análisis comparativo entre tiendas: same-store, maduración por cohorte y eficiencia actual.</p>
            </div>
            <Tabs defaultValue="same-store" className="space-y-4">
              <TabsList>
                <TabsTrigger value="same-store">Same-Store</TabsTrigger>
                <TabsTrigger value="curva">Curva de Maduración</TabsTrigger>
                <TabsTrigger value="eficiencia">Eficiencia Actual</TabsTrigger>
              </TabsList>
              <TabsContent value="same-store"><SameStoreTab /></TabsContent>
              <TabsContent value="curva"><CurvaMaduracionTab /></TabsContent>
              <TabsContent value="eficiencia"><EficienciaActualTab /></TabsContent>
            </Tabs>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
