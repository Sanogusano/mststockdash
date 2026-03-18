import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar, AlertTriangle, CheckCircle2, Target, TrendingDown, TrendingUp,
  Play, Activity, Percent, ShoppingCart, ArrowUpRight, ArrowDownRight, Zap
} from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

function fmtCOP(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CO");
}
function fmtPct(n: number, decimals = 1) {
  return `${(n * 100).toFixed(decimals)}%`;
}

interface StoreRow {
  nombre: string;
  tipo: string;
  tipo_tienda: string;
  es_digital: boolean;
  presupuesto: number;
  venta_mtd: number;
  proyeccion_conservadora: number;
  crecimiento_mom: number;
  crecimiento_yoy: number;
  esfuerzo_requerido: number;
  ticket_promedio: number;
  upt: number;
  pct_descuento: number;
  tiene_stamp: boolean;
  stamped_at: string | null;
  stamp_variacion: number;
}

interface Tactica {
  regla: string;
  icono: string;
  colorClass: string;
  descripcion: string;
}

function evalTactica(row: StoreRow): Tactica | null {
  // Priority 1: Fuga de Margen Inútil (not Outlets)
  if (row.tipo_tienda !== "Outlet" && row.pct_descuento > 0.05 && row.crecimiento_mom <= 0) {
    return {
      regla: "Fuga de Margen Inútil",
      icono: "⚠️",
      colorClass: "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/5",
      descripcion:
        "Los descuentos no están trayendo volumen. Bloquear/restringir descuentos manuales en POS. Reubicar mercancía de precio full en la zona caliente de entrada.",
    };
  }
  // Priority 2: Caída Estructural
  if (row.crecimiento_yoy < 0 && row.upt >= 1.5) {
    return {
      regla: "Caída Estructural",
      icono: "📉",
      colorClass: "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/5",
      descripcion:
        "Caída histórica de tráfico. Revisar vitrina urgente y activar base de datos local (Clienteling) para atraer visitas.",
    };
  }
  // Priority 3: Cesta Débil
  if (row.upt < 1.5) {
    return {
      regla: "Cesta Débil",
      icono: "🛒",
      colorClass: "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5",
      descripcion:
        "Foco en Venta Cruzada. Imponer cuota diaria de facturas con 2+ artículos. Ofrecer accesorios obligatoriamente.",
    };
  }
  // Priority 4: Estancamiento Sano
  if (row.crecimiento_mom > 0 && row.proyeccion_conservadora < 0.9) {
    return {
      regla: "Estancamiento Sano",
      icono: "📊",
      colorClass: "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5",
      descripcion:
        "La tienda crece, pero el presupuesto exige más. Foco en subir el Ticket Promedio mediante anclaje de precios más altos.",
    };
  }
  return null;
}

export function CentroAccionComercial() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stampingStore, setStampingStore] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase.rpc(
      "get_centro_accion_comercial" as any,
      { p_anio: anio, p_mes: mes }
    );
    if (!error && rows) {
      setData(
        (rows as any[]).map((r) => ({
          nombre: r.nombre,
          tipo: r.tipo,
          tipo_tienda: r.tipo_tienda ?? "",
          es_digital: r.es_digital,
          presupuesto: Number(r.presupuesto),
          venta_mtd: Number(r.venta_mtd),
          proyeccion_conservadora: Number(r.proyeccion_conservadora),
          crecimiento_mom: Number(r.crecimiento_mom),
          crecimiento_yoy: Number(r.crecimiento_yoy),
          esfuerzo_requerido: Number(r.esfuerzo_requerido),
          ticket_promedio: Number(r.ticket_promedio),
          upt: Number(r.upt),
          pct_descuento: Number(r.pct_descuento),
          tiene_stamp: r.tiene_stamp,
          stamped_at: r.stamped_at,
          stamp_variacion: Number(r.stamp_variacion),
        }))
      );
    } else {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [anio, mes]);

  const alertas = useMemo(() => {
    return data
      .filter((r) => r.proyeccion_conservadora < 0.9 && r.presupuesto > 0)
      .sort((a, b) => a.proyeccion_conservadora - b.proyeccion_conservadora);
  }, [data]);

  const totalAlertas = alertas.length;
  const criticas = alertas.filter((a) => a.proyeccion_conservadora < 0.7).length;
  const enRiesgo = alertas.filter((a) => a.proyeccion_conservadora >= 0.7 && a.proyeccion_conservadora < 0.9).length;

  const handleStamp = async (storeName: string) => {
    setStampingStore(storeName);
    // Deactivate any previous active stamp for this store
    await supabase
      .from("store_action_stamps" as any)
      .update({ active: false } as any)
      .eq("location_name", storeName)
      .eq("active", true);

    // Insert new stamp
    const { error } = await supabase
      .from("store_action_stamps" as any)
      .insert({ location_name: storeName, active: true } as any);

    if (error) {
      toast.error("Error al crear seguimiento");
    } else {
      toast.success(`Seguimiento iniciado para ${storeName}`);
      fetchData();
    }
    setStampingStore(null);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Analizando métricas comerciales...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <Select value={anio.toString()} onValueChange={(v) => setAnio(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={mes.toString()} onValueChange={(v) => setMes(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-[hsl(var(--danger))]/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--danger))]" /> Alertas Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{totalAlertas}</p>
            <p className="text-[10px] text-muted-foreground mt-1">Proyección conservadora &lt; 90%</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-[hsl(var(--danger))]" /> Críticas (&lt;70%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[hsl(var(--danger))]">{criticas}</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> En Riesgo (70-89%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[hsl(var(--warning))]">{enRiesgo}</p>
          </CardContent>
        </Card>
      </div>

      {/* No Alerts */}
      {alertas.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-[hsl(var(--success))]/40 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              {data.length === 0
                ? `No hay presupuestos configurados para ${MONTHS[mes - 1]} ${anio}`
                : "¡Excelente! Todos los puntos de venta proyectan cumplimiento ≥ 90%"}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Store Cards */}
      {alertas.map((store) => {
        const tactica = evalTactica(store);
        const pctColor =
          store.proyeccion_conservadora < 0.7
            ? "text-[hsl(var(--danger))]"
            : "text-[hsl(var(--warning))]";
        const borderColor =
          store.proyeccion_conservadora < 0.7
            ? "border-[hsl(var(--danger))]/30"
            : "border-[hsl(var(--warning))]/30";

        return (
          <Card key={store.nombre} className={`${borderColor} overflow-hidden`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      {store.nombre}
                      {store.tipo_tienda && (
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {store.tipo_tienda}
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                      {store.tipo}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold tabular-nums ${pctColor}`}>
                    {fmtPct(store.proyeccion_conservadora)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Proyección Conservadora</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* KPIs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiMini
                  label="Venta MTD"
                  value={fmtCOP(store.venta_mtd)}
                  sub={`Meta: ${fmtCOP(store.presupuesto)}`}
                />
                <KpiMini
                  label="Ticket Promedio"
                  value={fmtCOP(store.ticket_promedio)}
                />
                <KpiMini
                  label="UPT"
                  value={store.upt.toFixed(2)}
                  alert={store.upt < 1.5}
                />
                <KpiMini
                  label="% Descuento"
                  value={fmtPct(store.pct_descuento)}
                  alert={store.pct_descuento > 0.05}
                />
              </div>

              {/* Growth & Effort Row */}
              <div className="grid grid-cols-3 gap-3">
                <GrowthMini label="MoM" value={store.crecimiento_mom} />
                <GrowthMini label="YoY" value={store.crecimiento_yoy} />
                <div className="rounded-lg p-2.5 border border-[hsl(var(--primary))]/20 bg-[hsl(var(--primary))]/5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Esfuerzo Requerido
                  </p>
                  <p className={`text-sm font-bold tabular-nums ${store.esfuerzo_requerido > 0.5 ? "text-[hsl(var(--danger))]" : "text-foreground"}`}>
                    {store.esfuerzo_requerido > 0
                      ? `+${fmtPct(store.esfuerzo_requerido)}`
                      : "Meta alcanzable"}
                  </p>
                  <p className="text-[9px] text-muted-foreground">vs ritmo actual</p>
                </div>
              </div>

              {/* Tactic */}
              {tactica && (
                <div className={`rounded-lg border p-4 ${tactica.colorClass}`}>
                  <div className="flex items-start gap-2">
                    <span className="text-lg">{tactica.icono}</span>
                    <div>
                      <p className="text-sm font-semibold">{tactica.regla}</p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {tactica.descripcion}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Stamp / Tracking */}
              <div className="flex items-center justify-between border-t pt-3">
                {store.tiene_stamp ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-[hsl(var(--primary))]" />
                      <span className="text-xs font-medium text-[hsl(var(--primary))]">
                        Seguimiento activo
                      </span>
                    </div>
                    <div className="rounded-md bg-muted/40 px-2.5 py-1">
                      <p className="text-[10px] text-muted-foreground">Variación Post-Táctica</p>
                      <p
                        className={`text-sm font-bold tabular-nums ${
                          store.stamp_variacion > 0
                            ? "text-[hsl(var(--success))]"
                            : store.stamp_variacion < 0
                            ? "text-[hsl(var(--danger))]"
                            : "text-muted-foreground"
                        }`}
                      >
                        {store.stamp_variacion > 0 ? "+" : ""}
                        {fmtPct(store.stamp_variacion)}
                      </p>
                    </div>
                    {store.stamped_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Desde {new Date(store.stamped_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                      </p>
                    )}
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStamp(store.nombre)}
                    disabled={stampingStore === store.nombre}
                    className="gap-1.5"
                  >
                    <Play className="h-3.5 w-3.5" />
                    {stampingStore === store.nombre ? "Iniciando..." : "Comenzar Seguimiento"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function KpiMini({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2.5 border ${
        alert
          ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5"
          : "border-border bg-muted/20"
      }`}
    >
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className={`text-sm font-bold tabular-nums ${
          alert ? "text-[hsl(var(--danger))]" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function GrowthMini({ label, value }: { label: string; value: number }) {
  const isPositive = value > 0;
  const isNegative = value < 0;
  return (
    <div className="rounded-lg p-2.5 border border-border bg-muted/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Crecimiento {label}
      </p>
      <div className="flex items-center gap-1">
        {isPositive && <ArrowUpRight className="h-3.5 w-3.5 text-[hsl(var(--success))]" />}
        {isNegative && <ArrowDownRight className="h-3.5 w-3.5 text-[hsl(var(--danger))]" />}
        <p
          className={`text-sm font-bold tabular-nums ${
            isPositive
              ? "text-[hsl(var(--success))]"
              : isNegative
              ? "text-[hsl(var(--danger))]"
              : "text-muted-foreground"
          }`}
        >
          {value > 0 ? "+" : ""}
          {fmtPct(value)}
        </p>
      </div>
    </div>
  );
}
