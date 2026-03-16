import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, ChevronLeft, Save, Store, Globe, BarChart3 } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026];
const CHANNELS = ["Web", "POS", "WhatsApp"];

type LocationData = { location_id: string; name: string; zona: string | null };

export function PresupuestosWizard() {
  const [step, setStep] = useState(0);
  const [anio, setAnio] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [storeBudgets, setStoreBudgets] = useState<Record<string, number>>({});
  const [channelBudgets, setChannelBudgets] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Load locations
  useEffect(() => {
    supabase.from("locations").select("location_id, name, zona").eq("is_active", true).order("name")
      .then(({ data }) => {
        if (data) setLocations(data);
      });
  }, []);

  // Load existing config when period changes
  const loadExisting = useCallback(async () => {
    if (!anio || !mes) return;
    const { data } = await supabase
      .from("presupuestos_config")
      .select("nombre_identificador, monto, tipo")
      .eq("anio", anio)
      .eq("mes", mes);
    if (data && data.length > 0) {
      const sb: Record<string, number> = {};
      const cb: Record<string, number> = {};
      data.forEach((r: any) => {
        if (r.tipo === "tienda") sb[r.nombre_identificador] = Number(r.monto);
        if (r.tipo === "canal") cb[r.nombre_identificador] = Number(r.monto);
      });
      setStoreBudgets(sb);
      setChannelBudgets(cb);
    } else {
      setStoreBudgets({});
      setChannelBudgets({});
    }
  }, [anio, mes]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const canNext = () => {
    if (step === 0) return anio !== null && mes !== null;
    return true;
  };

  const handleSave = async () => {
    if (!anio || !mes) return;
    setSaving(true);
    try {
      const rows: any[] = [];
      Object.entries(storeBudgets).forEach(([name, monto]) => {
        if (monto > 0) rows.push({ nombre_identificador: name, mes, anio, monto, tipo: "tienda", updated_at: new Date().toISOString() });
      });
      Object.entries(channelBudgets).forEach(([name, monto]) => {
        if (monto > 0) rows.push({ nombre_identificador: name, mes, anio, monto, tipo: "canal", updated_at: new Date().toISOString() });
      });

      if (rows.length === 0) {
        toast.error("Asigna al menos un presupuesto");
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("presupuestos_config")
        .upsert(rows, { onConflict: "nombre_identificador,mes,anio" });

      if (error) throw error;
      toast.success("Presupuestos guardados exitosamente");
    } catch (e: any) {
      toast.error("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Summary calculations
  const zonaGroups = locations.reduce<Record<string, { stores: string[]; total: number }>>((acc, loc) => {
    const zona = loc.zona || "Sin Zona";
    if (!acc[zona]) acc[zona] = { stores: [], total: 0 };
    acc[zona].stores.push(loc.name);
    acc[zona].total += storeBudgets[loc.name] || 0;
    return acc;
  }, {});

  const totalCanales = Object.values(channelBudgets).reduce((s, v) => s + (v || 0), 0);
  const totalTiendas = Object.values(storeBudgets).reduce((s, v) => s + (v || 0), 0);
  const totalGeneral = totalTiendas + totalCanales;

  const stepLabels = ["Periodo", "Tiendas", "Canales", "Resumen"];
  const stepIcons = [BarChart3, Store, Globe, Check];

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const Icon = stepIcons[i];
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={label} className="flex items-center gap-2">
              <button
                onClick={() => { if (isDone) setStep(i); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
              {i < stepLabels.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
            </div>
          );
        })}
      </div>

      {/* Step 0: Periodo */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Selecciona el periodo</CardTitle></CardHeader>
          <CardContent className="flex gap-4">
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Año</label>
              <Select value={anio?.toString() || ""} onValueChange={(v) => setAnio(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger>
                <SelectContent>
                  {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mes</label>
              <Select value={mes?.toString() || ""} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Tiendas */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Presupuesto por Tienda</CardTitle>
            <p className="text-xs text-muted-foreground">
              {MONTHS[(mes || 1) - 1]} {anio} — Asigna el presupuesto mensual de cada tienda
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {locations.map((loc) => (
                <div key={loc.location_id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{loc.name}</p>
                    <p className="text-[10px] text-muted-foreground">{loc.zona || "Sin zona"}</p>
                  </div>
                  <div className="w-44">
                    <Input
                      type="number"
                      min={0}
                      placeholder="$ 0"
                      value={storeBudgets[loc.name] || ""}
                      onChange={(e) => setStoreBudgets(prev => ({ ...prev, [loc.name]: Number(e.target.value) }))}
                      className="text-right text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total Tiendas</span>
              <span className="text-lg font-semibold text-foreground">${totalTiendas.toLocaleString("es-CO")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Canales */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Presupuesto por Canal</CardTitle>
            <p className="text-xs text-muted-foreground">
              {MONTHS[(mes || 1) - 1]} {anio} — Metas de venta directa
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {CHANNELS.map((ch) => (
                <div key={ch} className="flex items-center gap-3 py-3 border-b border-border last:border-0">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-sm font-medium text-foreground">{ch}</span>
                  <div className="w-44">
                    <Input
                      type="number"
                      min={0}
                      placeholder="$ 0"
                      value={channelBudgets[ch] || ""}
                      onChange={(e) => setChannelBudgets(prev => ({ ...prev, [ch]: Number(e.target.value) }))}
                      className="text-right text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
              <span className="text-sm font-medium text-muted-foreground">Total Canales</span>
              <span className="text-lg font-semibold text-foreground">${totalCanales.toLocaleString("es-CO")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Resumen */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen — {MONTHS[(mes || 1) - 1]} {anio}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Por Zonas */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Store className="h-4 w-4" /> Presupuesto por Zona
                </h3>
                <div className="grid gap-2">
                  {Object.entries(zonaGroups).map(([zona, data]) => (
                    <div key={zona} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium text-foreground">{zona}</p>
                        <p className="text-[10px] text-muted-foreground">{data.stores.length} tienda(s)</p>
                      </div>
                      <Badge variant="secondary" className="text-sm font-semibold">
                        ${data.total.toLocaleString("es-CO")}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-sm font-semibold text-primary">Subtotal Tiendas</span>
                  <span className="text-sm font-bold text-primary">${totalTiendas.toLocaleString("es-CO")}</span>
                </div>
              </div>

              {/* Venta Directa */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Venta Directa (Canales)
                </h3>
                <div className="grid gap-2">
                  {CHANNELS.map((ch) => (
                    <div key={ch} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                      <span className="text-sm text-foreground">{ch}</span>
                      <Badge variant="secondary" className="text-sm font-semibold">
                        ${(channelBudgets[ch] || 0).toLocaleString("es-CO")}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-sm font-semibold text-primary">Subtotal Canales</span>
                  <span className="text-sm font-bold text-primary">${totalCanales.toLocaleString("es-CO")}</span>
                </div>
              </div>

              {/* Gran Total */}
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-primary text-primary-foreground">
                <span className="font-semibold">PRESUPUESTO TOTAL</span>
                <span className="text-xl font-bold">${totalGeneral.toLocaleString("es-CO")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        {step < 3 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Guardando..." : "Guardar Presupuestos"}
          </Button>
        )}
      </div>
    </div>
  );
}
