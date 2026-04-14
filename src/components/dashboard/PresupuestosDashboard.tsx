import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Store, Globe, Target, TrendingUp } from "lucide-react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026];

type ConfigRow = { nombre_identificador: string; monto: number; tipo: string };

export function PresupuestosDashboard() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [salesByStore, setSalesByStore] = useState<Record<string, number>>({});
  const [salesByChannel, setSalesByChannel] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Load budgets
      const { data: cfgs } = await supabase
        .from("presupuestos_config")
        .select("nombre_identificador, monto, tipo")
        .eq("anio", anio)
        .eq("mes", mes);
      setConfigs(cfgs || []);

      // Load actual sales for this month from orders
      const startDate = `${anio}-${String(mes).padStart(2, "0")}-01`;
      const endMonth = mes === 12 ? 1 : mes + 1;
      const endYear = mes === 12 ? anio + 1 : anio;
      const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;

      const { data: orders } = await supabase
        .from("orders")
        .select("location_id, total_price, source_name, financial_status")
        .gte("created_at", startDate)
        .lt("created_at", endDate)
        .in("financial_status", ["paid", "partially_refunded", "partially_paid"]);

      if (orders) {
        // Get location names
        const { data: locs } = await supabase.from("locations").select("location_id, name");
        const locMap = (locs || []).reduce<Record<string, string>>((acc, l) => {
          acc[l.location_id] = l.name;
          return acc;
        }, {});

        const byStore: Record<string, number> = {};
        const byChannel: Record<string, number> = {};

        orders.forEach((o: any) => {
          const storeName = locMap[o.location_id] || o.location_id;
          byStore[storeName] = (byStore[storeName] || 0) + Number(o.total_price || 0);

          let channel = "POS";
          if (o.location_id === "71474315479" || o.source_name !== "pos") {
            channel = o.source_name === "web" ? "Tienda Online" : "Personal Shopper";
            if (o.source_name === "pos" && o.location_id === "71474315479") channel = "Tienda Online";
          }
          byChannel[channel] = (byChannel[channel] || 0) + Number(o.total_price || 0);
        });

        setSalesByStore(byStore);
        setSalesByChannel(byChannel);
      }
      setLoading(false);
    };
    load();
  }, [anio, mes]);

  const storeConfigs = configs.filter(c => c.tipo === "tienda");
  const channelConfigs = configs.filter(c => c.tipo === "canal");
  const totalBudget = configs.reduce((s, c) => s + Number(c.monto), 0);
  const totalSales = Object.values(salesByStore).reduce((s, v) => s + v, 0);
  const globalPct = totalBudget > 0 ? Math.min((totalSales / totalBudget) * 100, 150) : 0;

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Cargando presupuestos...</div>;
  }

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No hay presupuestos configurados para {MONTHS[mes - 1]} {anio}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex gap-3">
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

      {/* Global Progress */}
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Cumplimiento Global</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{globalPct.toFixed(1)}%</span>
          </div>
          <Progress value={Math.min(globalPct, 100)} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>Venta: ${totalSales.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
            <span>Meta: ${totalBudget.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
          </div>
        </CardContent>
      </Card>

      {/* Store budgets */}
      {storeConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Store className="h-4 w-4" /> Tiendas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {storeConfigs.map((c) => {
              const actual = salesByStore[c.nombre_identificador] || 0;
              const pct = Number(c.monto) > 0 ? (actual / Number(c.monto)) * 100 : 0;
              return (
                <div key={c.nombre_identificador}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-foreground">{c.nombre_identificador}</span>
                    <Badge variant={pct >= 100 ? "default" : "secondary"} className="text-xs">
                      {pct.toFixed(1)}%
                    </Badge>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="h-2" />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>${actual.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                    <span>${Number(c.monto).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Channel budgets */}
      {channelConfigs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" /> Canales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {channelConfigs.map((c) => {
              const actual = salesByChannel[c.nombre_identificador] || 0;
              const pct = Number(c.monto) > 0 ? (actual / Number(c.monto)) * 100 : 0;
              return (
                <div key={c.nombre_identificador}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-foreground">{c.nombre_identificador}</span>
                    <Badge variant={pct >= 100 ? "default" : "secondary"} className="text-xs">
                      {pct.toFixed(1)}%
                    </Badge>
                  </div>
                  <Progress value={Math.min(pct, 100)} className="h-2" />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>${actual.toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                    <span>${Number(c.monto).toLocaleString("es-CO", { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
