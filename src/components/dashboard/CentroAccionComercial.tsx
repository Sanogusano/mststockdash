import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertTriangle, CheckCircle2, Target, TrendingDown, TrendingUp, ShoppingCart, Percent, Users, BarChart3, Store, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

function fmtCOP(n: number) {
  return "$" + Math.round(n).toLocaleString("es-CO");
}

interface AlertaRow {
  nombre: string;
  tipo: string;
  es_digital: boolean;
  presupuesto: number;
  venta_mtd: number;
  pct_proyeccion: number;
  ticket_promedio_local: number;
  ticket_promedio_nacional: number;
  upt_local: number;
  upt_nacional: number;
  tendencia_transacciones: number;
  pct_recompra: number;
  pct_descuento: number;
}

interface Diagnostico {
  regla: string;
  icono: string;
  color: string;
  colorClass: string;
  diagnostico: string;
  checklist: string[];
  tacticaFisica: string[];
  tacticaDigital: string[];
}

function evalDiagnosticos(row: AlertaRow): Diagnostico[] {
  const diagnosticos: Diagnostico[] = [];

  // REGLA 1: EL MIRADOR
  if (row.tendencia_transacciones >= 0 && row.upt_local < 1.5) {
    diagnosticos.push({
      regla: "EL MIRADOR",
      icono: "🔭",
      color: "warning",
      colorClass: "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5",
      diagnostico: "Tráfico estable pero compras de un solo artículo (Bajo UPT).",
      checklist: [
        "¿Se ofrecen complementos obligatorios en cada interacción?",
        "¿La exhibición fomenta looks completos?"
      ],
      tacticaFisica: [
        "Script obligatorio: 'Esto se complementa con...'",
        "Incentivo interno hoy por UPT > 2"
      ],
      tacticaDigital: [
        "Validar activación de Cross-sell ('Completa el look') en el carrito",
        "Revisar sugerencias de productos complementarios"
      ]
    });
  }

  // REGLA 2: COMPRAS PEQUEÑAS
  if (row.ticket_promedio_local < row.ticket_promedio_nacional * 0.85) {
    diagnosticos.push({
      regla: "COMPRAS PEQUEÑAS",
      icono: "💰",
      color: "warning",
      colorClass: "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5",
      diagnostico: "Falla en argumentación de valor o anclaje de precio.",
      checklist: [
        "¿Se están mostrando primero los productos High Ticket?",
        "¿Falta argumentación de diseño/materiales?"
      ],
      tacticaFisica: [
        "Anclaje de precio en vitrina y abordaje",
        "Upsell dirigido por el asesor"
      ],
      tacticaDigital: [
        "Revisar ordenación del catálogo (High ticket primero)",
        "Validar banners de umbral (ej. 'Envío gratis por compras superiores a X')"
      ]
    });
  }

  // REGLA 3: ALERTA DE RENTABILIDAD
  if (row.pct_descuento > 0.05) {
    diagnosticos.push({
      regla: "ALERTA DE RENTABILIDAD",
      icono: "⚠️",
      color: "danger",
      colorClass: "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/5",
      diagnostico: "Dependencia peligrosa del descuento para cerrar ventas.",
      checklist: [
        "¿Se está evadiendo la venta consultiva?",
        "¿Hay códigos de descuento filtrados?"
      ],
      tacticaFisica: [
        "Migrar a narrativa de valor. Eliminar descuentos abiertos",
        "Requerir autorización para cualquier descuento"
      ],
      tacticaDigital: [
        "Segmentar promociones por audiencia",
        "Ofrecer acceso anticipado a colecciones en lugar de rebajas de precio"
      ]
    });
  }

  // REGLA 4: FUGA DE CLIENTES
  if (row.pct_recompra < 0.15) {
    diagnosticos.push({
      regla: "FUGA DE CLIENTES",
      icono: "🚪",
      color: "danger",
      colorClass: "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/5",
      diagnostico: "Adquisición sana, pero los clientes no regresan.",
      checklist: [
        "¿Se captura el 100% de los datos en POS?",
        "¿Hay experiencia post-compra memorable?"
      ],
      tacticaFisica: [
        "Captura obligatoria en caja",
        "Administrador debe hacer seguimiento por WhatsApp post-visita"
      ],
      tacticaDigital: [
        "Revisar flujos post-compra (Email/WhatsApp)",
        "Activar campaña de remarketing para inactivos"
      ]
    });
  }

  // REGLA 5: PROBLEMA ESTRUCTURAL
  if (row.tendencia_transacciones < -0.15) {
    diagnosticos.push({
      regla: "PROBLEMA ESTRUCTURAL",
      icono: "🔴",
      color: "danger",
      colorClass: "border-[hsl(var(--danger))]/40 bg-[hsl(var(--danger))]/5",
      diagnostico: "Caída severa de tráfico o conversión nula.",
      checklist: [
        "¿Ubicación/Vitrina bloqueada?",
        "¿Atención fría o demorada?"
      ],
      tacticaFisica: [
        "Activación local inmediata (Clienteling agresivo a base VIP)",
        "Auditoría presencial de experiencia"
      ],
      tacticaDigital: [
        "Rediseño UX urgente. Test A/B de creativos en pauta",
        "Revisar velocidad de carga del sitio"
      ]
    });
  }

  return diagnosticos;
}

export function CentroAccionComercial() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState<AlertaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: rows, error } = await supabase.rpc(
        "get_alertas_comerciales" as any,
        { p_anio: anio, p_mes: mes }
      );
      if (!error && rows) {
        setData((rows as any[]).map(r => ({
          nombre: r.nombre,
          tipo: r.tipo,
          es_digital: r.es_digital,
          presupuesto: Number(r.presupuesto),
          venta_mtd: Number(r.venta_mtd),
          pct_proyeccion: Number(r.pct_proyeccion),
          ticket_promedio_local: Number(r.ticket_promedio_local),
          ticket_promedio_nacional: Number(r.ticket_promedio_nacional),
          upt_local: Number(r.upt_local),
          upt_nacional: Number(r.upt_nacional),
          tendencia_transacciones: Number(r.tendencia_transacciones),
          pct_recompra: Number(r.pct_recompra),
          pct_descuento: Number(r.pct_descuento),
        })));
      } else {
        setData([]);
      }
      setLoading(false);
    };
    load();
  }, [anio, mes]);

  const alertas = useMemo(() => {
    return data
      .filter(r => r.pct_proyeccion < 90 && r.presupuesto > 0)
      .sort((a, b) => a.pct_proyeccion - b.pct_proyeccion);
  }, [data]);

  const totalAlertas = alertas.length;
  const alertasCriticas = alertas.filter(a => a.pct_proyeccion < 70).length;
  const alertasRiesgo = alertas.filter(a => a.pct_proyeccion >= 70 && a.pct_proyeccion < 90).length;

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Analizando métricas comerciales...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex items-center gap-3">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <Select value={anio.toString()} onValueChange={(v) => setAnio(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
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
            <p className="text-[10px] text-muted-foreground mt-1">Puntos de venta con proyección &lt; 90%</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-[hsl(var(--danger))]" /> Críticas (&lt;70%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[hsl(var(--danger))]">{alertasCriticas}</p>
          </CardContent>
        </Card>
        <Card className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> En Riesgo (70-89%)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-[hsl(var(--warning))]">{alertasRiesgo}</p>
          </CardContent>
        </Card>
      </div>

      {/* No Alerts State */}
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

      {/* Alert Cards */}
      {alertas.map((alerta) => {
        const diagnosticos = evalDiagnosticos(alerta);
        const pctColor = alerta.pct_proyeccion < 70 ? "text-[hsl(var(--danger))]" : "text-[hsl(var(--warning))]";
        const borderColor = alerta.pct_proyeccion < 70 ? "border-[hsl(var(--danger))]/30" : "border-[hsl(var(--warning))]/30";

        return (
          <Card key={alerta.nombre} className={`${borderColor} overflow-hidden`}>
            {/* Header */}
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {alerta.es_digital ? (
                    <Globe className="h-5 w-5 text-blue-500" />
                  ) : (
                    <Store className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle className="text-base font-semibold">{alerta.nombre}</CardTitle>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {alerta.es_digital ? "Canal Digital" : "Tienda Física"} · {alerta.tipo}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold tabular-nums ${pctColor}`}>
                    {alerta.pct_proyeccion.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">Proyección</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* KPIs Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiMini
                  label="Venta MTD"
                  value={fmtCOP(alerta.venta_mtd)}
                  sub={`Meta: ${fmtCOP(alerta.presupuesto)}`}
                />
                <KpiMini
                  label="Ticket Promedio"
                  value={fmtCOP(alerta.ticket_promedio_local)}
                  sub={`Nacional: ${fmtCOP(alerta.ticket_promedio_nacional)}`}
                  alert={alerta.ticket_promedio_local < alerta.ticket_promedio_nacional * 0.85}
                />
                <KpiMini
                  label="UPT"
                  value={alerta.upt_local.toFixed(2)}
                  sub={`Nacional: ${alerta.upt_nacional.toFixed(2)}`}
                  alert={alerta.upt_local < 1.5}
                />
                <KpiMini
                  label="Tendencia 7d"
                  value={`${alerta.tendencia_transacciones >= 0 ? "+" : ""}${(alerta.tendencia_transacciones * 100).toFixed(1)}%`}
                  sub="vs 7d anteriores"
                  alert={alerta.tendencia_transacciones < -0.15}
                />
                <KpiMini
                  label="% Descuento"
                  value={`${(alerta.pct_descuento * 100).toFixed(1)}%`}
                  sub="Desc / Vta Bruta"
                  alert={alerta.pct_descuento > 0.05}
                />
                <KpiMini
                  label="% Recompra"
                  value={`${(alerta.pct_recompra * 100).toFixed(1)}%`}
                  sub="Clientes recurrentes"
                  alert={alerta.pct_recompra < 0.15}
                  muted
                />
              </div>

              {/* Diagnostics */}
              {diagnosticos.length > 0 ? (
                <Accordion type="multiple" className="w-full">
                  {diagnosticos.map((diag, idx) => (
                    <AccordionItem key={idx} value={`${alerta.nombre}-${idx}`} className={`rounded-lg border ${diag.colorClass} mb-2 last:mb-0`}>
                      <AccordionTrigger className="px-4 py-3 hover:no-underline">
                        <div className="flex items-center gap-2 text-left">
                          <span className="text-lg">{diag.icono}</span>
                          <div>
                            <p className="text-sm font-semibold">{diag.regla}</p>
                            <p className="text-xs text-muted-foreground">{diag.diagnostico}</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4">
                        <div className="space-y-3">
                          {/* Checklist */}
                          <div>
                            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                              Checklist de Revisión
                            </p>
                            <ul className="space-y-1">
                              {diag.checklist.map((item, ci) => (
                                <li key={ci} className="flex items-start gap-2 text-xs text-foreground">
                                  <span className="text-muted-foreground mt-0.5">☐</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Tactics */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {!alerta.es_digital && (
                              <div className="rounded-md bg-background/80 p-3 border">
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <Store className="h-3 w-3" /> Táctica Física
                                </p>
                                <ul className="space-y-1">
                                  {diag.tacticaFisica.map((t, ti) => (
                                    <li key={ti} className="text-xs text-foreground flex items-start gap-1.5">
                                      <span className="text-[hsl(var(--primary))]">→</span> {t}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {alerta.es_digital && (
                              <div className="rounded-md bg-background/80 p-3 border">
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <Globe className="h-3 w-3" /> Táctica Digital
                                </p>
                                <ul className="space-y-1">
                                  {diag.tacticaDigital.map((t, ti) => (
                                    <li key={ti} className="text-xs text-foreground flex items-start gap-1.5">
                                      <span className="text-[hsl(var(--primary))]">→</span> {t}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {/* Show both for mixed context */}
                            {!alerta.es_digital && (
                              <div className="rounded-md bg-background/80 p-3 border">
                                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                                  <Globe className="h-3 w-3" /> Táctica Digital (Referencia)
                                </p>
                                <ul className="space-y-1">
                                  {diag.tacticaDigital.map((t, ti) => (
                                    <li key={ti} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                      <span>→</span> {t}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 text-center">
                  Sin diagnóstico específico por reglas — revisar métricas manualmente.
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function KpiMini({ label, value, sub, alert, muted }: { label: string; value: string; sub: string; alert?: boolean; muted?: boolean }) {
  return (
    <div className={`rounded-lg p-2.5 border ${alert ? "border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/5" : "border-border bg-muted/20"}`}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${alert ? "text-[hsl(var(--danger))]" : "text-foreground"} ${muted ? "opacity-50" : ""}`}>
        {value}
      </p>
      <p className="text-[9px] text-muted-foreground">{sub}</p>
    </div>
  );
}
