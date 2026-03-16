import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Calendar, MapPin, Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

type ConfigRow = {
  nombre_identificador: string;
  monto: number;
  tipo: string;
  anio: number;
  mes: number;
};

type PeriodGroup = {
  key: string;
  anio: number;
  mes: number;
  tiendas: ConfigRow[];
  canales: ConfigRow[];
  totalTiendas: number;
  totalDigital: number;
  total: number;
};

export function PresupuestosGuardados({ refreshKey }: { refreshKey?: number }) {
  const [periods, setPeriods] = useState<PeriodGroup[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [refreshKey]);

  const loadData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("presupuestos_config")
      .select("nombre_identificador, monto, tipo, anio, mes")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false });

    if (error) {
      toast.error("Error cargando presupuestos");
      setLoading(false);
      return;
    }

    // Group by period
    const grouped: Record<string, ConfigRow[]> = {};
    (data || []).forEach((row) => {
      const key = `${row.anio}-${row.mes}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });

    const result: PeriodGroup[] = Object.entries(grouped).map(([key, rows]) => {
      const tiendas = rows.filter(r => r.tipo === "tienda");
      const canales = rows.filter(r => r.tipo === "canal");
      const totalTiendas = tiendas.reduce((s, r) => s + Number(r.monto), 0);
      const totalDigital = canales.reduce((s, r) => s + Number(r.monto), 0);
      return {
        key,
        anio: rows[0].anio,
        mes: rows[0].mes,
        tiendas,
        canales,
        totalTiendas,
        totalDigital,
        total: totalTiendas + totalDigital,
      };
    });

    result.sort((a, b) => b.anio - a.anio || b.mes - a.mes);
    setPeriods(result);
    setLoading(false);
  };

  const handleDelete = async (anio: number, mes: number) => {
    if (!confirm(`¿Eliminar presupuestos de ${MONTHS[mes - 1]} ${anio}?`)) return;
    const { error } = await supabase
      .from("presupuestos_config")
      .delete()
      .eq("anio", anio)
      .eq("mes", mes);

    if (error) {
      toast.error("Error eliminando: " + error.message);
    } else {
      toast.success("Presupuesto eliminado");
      loadData();
    }
  };

  const toggle = (key: string) => {
    setExpanded(prev => prev === key ? null : key);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Cargando presupuestos guardados...
        </CardContent>
      </Card>
    );
  }

  if (periods.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No hay presupuestos configurados aún.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Presupuestos Guardados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {periods.map((period) => {
          const isOpen = expanded === period.key;
          return (
            <div key={period.key} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggle(period.key)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-semibold">
                    {MONTHS[period.mes - 1]} {period.anio}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {period.tiendas.length} tienda(s) · {period.canales.length} canal(es)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">
                    ${period.total.toLocaleString("es-CO")}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/20">
                  {/* Tiendas */}
                  {period.tiendas.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" /> Tiendas
                      </h4>
                      <div className="grid gap-1">
                        {period.tiendas
                          .sort((a, b) => a.nombre_identificador.localeCompare(b.nombre_identificador))
                          .map((r) => (
                            <div key={r.nombre_identificador} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                              <span className="text-foreground">{r.nombre_identificador}</span>
                              <span className="text-muted-foreground font-medium">${Number(r.monto).toLocaleString("es-CO")}</span>
                            </div>
                          ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t border-border/50 text-xs font-semibold">
                        <span className="text-primary">Total Tiendas</span>
                        <span className="text-primary">${period.totalTiendas.toLocaleString("es-CO")}</span>
                      </div>
                    </div>
                  )}

                  {/* Digital */}
                  {period.canales.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" /> Digital
                      </h4>
                      <div className="grid gap-1">
                        {period.canales.map((r) => (
                          <div key={r.nombre_identificador} className="flex justify-between text-xs py-1 border-b border-border/30 last:border-0">
                            <span className="text-foreground">{r.nombre_identificador}</span>
                            <span className="text-muted-foreground font-medium">${Number(r.monto).toLocaleString("es-CO")}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2 pt-2 border-t border-border/50 text-xs font-semibold">
                        <span className="text-primary">Total Digital</span>
                        <span className="text-primary">${period.totalDigital.toLocaleString("es-CO")}</span>
                      </div>
                    </div>
                  )}

                  {/* Gran Total + Delete */}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">Total</span>
                      <span className="text-sm font-bold text-foreground">${period.total.toLocaleString("es-CO")}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(period.anio, period.mes)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
