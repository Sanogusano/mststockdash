import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronRight, ChevronLeft, Save, Store, Globe, BarChart3, MapPin, AlertTriangle, Pencil, Users } from "lucide-react";
import { toast } from "sonner";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const YEARS = [2025, 2026, 2027, 2028, 2029, 2030];
const DIGITAL_CHANNELS = ["Tienda Online", "Personal Shopper"];

const STORAGE_KEY = "presupuestos_wizard_state";

type LocationData = { location_id: string; name: string; zona: string | null };
type StaffData = { id: string; shopify_user_id: string; nombre: string; rol: string; location_id: string | null };

type WizardState = {
  step: number;
  anio: number | null;
  mes: number | null;
  storeBudgets: Record<string, number>;
  channelBudgets: Record<string, number>;
  sellerBudgets: Record<string, number>;
  isEditing: boolean;
};

function loadState(): WizardState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveState(state: WizardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

interface WizardProps {
  onSaved?: () => void;
  editPeriod?: { anio: number; mes: number } | null;
}

export function PresupuestosWizard({ onSaved, editPeriod }: WizardProps) {
  const saved = loadState();
  const [step, setStep] = useState(saved?.step ?? 0);
  const [anio, setAnio] = useState<number | null>(saved?.anio ?? null);
  const [mes, setMes] = useState<number | null>(saved?.mes ?? null);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [sellers, setSellers] = useState<StaffData[]>([]);
  const [storeBudgets, setStoreBudgets] = useState<Record<string, number>>(saved?.storeBudgets ?? {});
  const [channelBudgets, setChannelBudgets] = useState<Record<string, number>>(saved?.channelBudgets ?? {});
  const [sellerBudgets, setSellerBudgets] = useState<Record<string, number>>(saved?.sellerBudgets ?? {});
  const [saving, setSaving] = useState(false);
  const [loadedPeriod, setLoadedPeriod] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(saved?.isEditing ?? false);
  const [existingPeriods, setExistingPeriods] = useState<Set<string>>(new Set());
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [sellerFilterLocation, setSellerFilterLocation] = useState<string>("all");

  // Persist state on every change
  useEffect(() => {
    saveState({ step, anio, mes, storeBudgets, channelBudgets, sellerBudgets, isEditing });
  }, [step, anio, mes, storeBudgets, channelBudgets, sellerBudgets, isEditing]);

  // Load locations
  useEffect(() => {
    supabase.from("locations").select("location_id, name, zona").eq("is_active", true).neq("name", "CEDI Guayabal").order("name")
      .then(({ data }) => {
        if (data) setLocations(data);
      });
    supabase.from("staff_members")
      .select("id, shopify_user_id, nombre, rol, location_id")
      .eq("is_active", true)
      .in("rol", ["vendedor", "personal_shopper"])
      .order("nombre")
      .then(({ data }) => {
        if (data) setSellers(data as any);
      });
  }, []);

  // Load existing periods to prevent duplicates
  useEffect(() => {
    supabase.from("presupuestos_config")
      .select("anio, mes")
      .then(({ data }) => {
        if (data) {
          const set = new Set<string>();
          data.forEach((r: any) => set.add(`${r.anio}-${r.mes}`));
          setExistingPeriods(set);
        }
      });
  }, []);

  // Handle edit mode from parent
  useEffect(() => {
    if (editPeriod) {
      setAnio(editPeriod.anio);
      setMes(editPeriod.mes);
      setIsEditing(true);
      setLoadedPeriod(null);
      setStep(0);
      setDuplicateWarning(false);
    }
  }, [editPeriod]);

  // Check for duplicate when period changes
  useEffect(() => {
    if (anio && mes && !isEditing) {
      const key = `${anio}-${mes}`;
      setDuplicateWarning(existingPeriods.has(key));
    } else {
      setDuplicateWarning(false);
    }
  }, [anio, mes, isEditing, existingPeriods]);

  // Load existing config when period changes
  const loadExisting = useCallback(async () => {
    if (!anio || !mes) return;
    const periodKey = `${anio}-${mes}`;
    if (periodKey === loadedPeriod) return;

    const { data } = await supabase
      .from("presupuestos_config")
      .select("nombre_identificador, monto, tipo")
      .eq("anio", anio)
      .eq("mes", mes);

    if (data && data.length > 0) {
      const sb: Record<string, number> = {};
      const cb: Record<string, number> = {};
      const vb: Record<string, number> = {};
      data.forEach((r: any) => {
        if (r.tipo === "tienda") sb[r.nombre_identificador] = Number(r.monto);
        if (r.tipo === "canal") cb[r.nombre_identificador] = Number(r.monto);
        if (r.tipo === "vendedor") vb[r.nombre_identificador] = Number(r.monto);
      });
      setStoreBudgets(sb);
      setChannelBudgets(cb);
      setSellerBudgets(vb);
    } else if (!isEditing) {
      setStoreBudgets({});
      setChannelBudgets({});
      setSellerBudgets({});
    }
    setLoadedPeriod(periodKey);
  }, [anio, mes, loadedPeriod, isEditing]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const canNext = () => {
    if (step === 0) {
      if (anio === null || mes === null) return false;
      if (duplicateWarning) return false;
      return true;
    }
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
      Object.entries(sellerBudgets).forEach(([id, monto]) => {
        if (monto > 0) rows.push({ nombre_identificador: id, mes, anio, monto, tipo: "vendedor", updated_at: new Date().toISOString() });
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
      clearState();
      setIsEditing(false);
      setStep(0);
      setAnio(null);
      setMes(null);
      setStoreBudgets({});
      setChannelBudgets({});
      setSellerBudgets({});
      setLoadedPeriod(null);
      toast.success(isEditing ? "Presupuesto actualizado exitosamente" : "Presupuestos guardados exitosamente");
      onSaved?.();
    } catch (e: any) {
      toast.error("Error al guardar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Group locations by zona
  const zonaGroups = locations.reduce<Record<string, LocationData[]>>((acc, loc) => {
    const zona = loc.zona || "Sin Zona";
    if (!acc[zona]) acc[zona] = [];
    acc[zona].push(loc);
    return acc;
  }, {});

  const zonaTotals = Object.entries(zonaGroups).map(([zona, locs]) => ({
    zona,
    stores: locs,
    total: locs.reduce((s, l) => s + (storeBudgets[l.name] || 0), 0),
  }));

  const totalTiendas = Object.values(storeBudgets).reduce((s, v) => s + (v || 0), 0);
  const totalDigital = DIGITAL_CHANNELS.reduce((s, ch) => s + (channelBudgets[ch] || 0), 0);
  const totalVendedores = Object.values(sellerBudgets).reduce((s, v) => s + (v || 0), 0);
  const totalGeneral = totalTiendas + totalDigital;

  const filteredSellers = sellers.filter((s) => sellerFilterLocation === "all" || s.location_id === sellerFilterLocation);

  const stepLabels = ["Periodo", "Digital", "Zonas", "Vendedores", "Resumen"];
  const stepIcons = [BarChart3, Globe, MapPin, Users, Check];

  return (
    <div className="space-y-6">
      {/* Editing Banner */}
      {isEditing && anio && mes && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/20">
          <Pencil className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-primary">
            Editando presupuesto de {MONTHS[(mes || 1) - 1]} {anio}
          </span>
        </div>
      )}

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
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="w-40">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Año</label>
                <Select
                  value={anio?.toString() || ""}
                  onValueChange={(v) => { setAnio(Number(v)); setLoadedPeriod(null); }}
                  disabled={isEditing}
                >
                  <SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mes</label>
                <Select
                  value={mes?.toString() || ""}
                  onValueChange={(v) => { setMes(Number(v)); setLoadedPeriod(null); }}
                  disabled={isEditing}
                >
                  <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {duplicateWarning && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  Ya existe un presupuesto para {MONTHS[(mes || 1) - 1]} {anio}. Usa "Modificar" desde el panel de Visualización.
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 1: Digital */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Presupuesto Digital</CardTitle>
            <p className="text-xs text-muted-foreground">
              {MONTHS[(mes || 1) - 1]} {anio} — Ventas Online + Personal Shopper
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {DIGITAL_CHANNELS.map((ch) => (
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
              <span className="text-sm font-medium text-muted-foreground">Total Digital</span>
              <span className="text-lg font-semibold text-foreground">${totalDigital.toLocaleString("es-CO")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Zonas con Tiendas */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Presupuesto por Zona y Tienda</CardTitle>
              <p className="text-xs text-muted-foreground">
                {MONTHS[(mes || 1) - 1]} {anio} — Asigna el presupuesto de cada tienda. El total de zona se calcula automáticamente.
              </p>
            </CardHeader>
          </Card>
          {Object.entries(zonaGroups).sort(([a], [b]) => a.localeCompare(b)).map(([zona, locs]) => {
            const zonaTotal = locs.reduce((s, l) => s + (storeBudgets[l.name] || 0), 0);
            return (
              <Card key={zona}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {zona}
                    </CardTitle>
                    <Badge variant="secondary" className="text-sm font-semibold">
                      ${zonaTotal.toLocaleString("es-CO")}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-2">
                    {locs.map((loc) => (
                      <div key={loc.location_id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <Store className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 text-sm text-foreground truncate">{loc.name}</span>
                        <div className="w-40">
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
                </CardContent>
              </Card>
            );
          })}
          <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-muted">
            <span className="font-medium text-foreground">Total Tiendas</span>
            <span className="text-lg font-bold text-foreground">${totalTiendas.toLocaleString("es-CO")}</span>
          </div>
        </div>
      )}

      {/* Step 3: Vendedores (opcional) */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-4 w-4" /> Presupuesto por Vendedor
                <Badge variant="outline" className="ml-2 text-[10px] font-normal">Opcional</Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {MONTHS[(mes || 1) - 1]} {anio} — Asigna metas individuales (vendedores y personal shoppers activos)
              </p>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <label className="text-xs text-muted-foreground">Filtrar por tienda:</label>
                <div className="w-64">
                  <Select value={sellerFilterLocation} onValueChange={setSellerFilterLocation}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {locations.map((l) => <SelectItem key={l.location_id} value={l.location_id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="max-h-[500px] overflow-y-auto pr-2">
                <div className="grid gap-2">
                  {filteredSellers.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{s.nombre}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {s.rol === "personal_shopper" ? "Personal Shopper" : "Vendedor"}
                          {s.location_id && ` · ${locations.find((l) => l.location_id === s.location_id)?.name || s.location_id}`}
                        </p>
                      </div>
                      <div className="w-40">
                        <Input
                          type="number"
                          min={0}
                          placeholder="$ 0"
                          value={sellerBudgets[s.shopify_user_id] || ""}
                          onChange={(e) => setSellerBudgets((prev) => ({ ...prev, [s.shopify_user_id]: Number(e.target.value) }))}
                          className="text-right text-sm"
                        />
                      </div>
                    </div>
                  ))}
                  {filteredSellers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">No hay vendedores para mostrar</p>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-muted-foreground">Total Vendedores</span>
                <span className="text-lg font-semibold text-foreground">${totalVendedores.toLocaleString("es-CO")}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 4: Resumen */}
      {step === 4 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen — {MONTHS[(mes || 1) - 1]} {anio}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Presupuesto por Zona
                </h3>
                <div className="space-y-3">
                  {zonaTotals.map(({ zona, stores, total }) => (
                    <div key={zona} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/50">
                        <div>
                          <p className="text-sm font-medium text-foreground">{zona}</p>
                          <p className="text-[10px] text-muted-foreground">{stores.length} tienda(s)</p>
                        </div>
                        <Badge variant="secondary" className="text-sm font-semibold">
                          ${total.toLocaleString("es-CO")}
                        </Badge>
                      </div>
                      <div className="px-3 py-1">
                        {stores.map((loc) => (
                          <div key={loc.location_id} className="flex justify-between py-1 text-xs text-muted-foreground border-b border-border/50 last:border-0">
                            <span>{loc.name}</span>
                            <span>${(storeBudgets[loc.name] || 0).toLocaleString("es-CO")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-sm font-semibold text-primary">Total Tiendas</span>
                  <span className="text-sm font-bold text-primary">${totalTiendas.toLocaleString("es-CO")}</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Presupuesto Digital
                </h3>
                <div className="grid gap-2">
                  {DIGITAL_CHANNELS.map((ch) => (
                    <div key={ch} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50">
                      <span className="text-sm text-foreground">{ch}</span>
                      <Badge variant="secondary" className="text-sm font-semibold">
                        ${(channelBudgets[ch] || 0).toLocaleString("es-CO")}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                  <span className="text-sm font-semibold text-primary">Total Digital</span>
                  <span className="text-sm font-bold text-primary">${totalDigital.toLocaleString("es-CO")}</span>
                </div>
              </div>

              {totalVendedores > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" /> Presupuesto Vendedores
                    <Badge variant="outline" className="ml-1 text-[10px] font-normal">
                      {Object.values(sellerBudgets).filter((v) => v > 0).length} con meta
                    </Badge>
                  </h3>
                  <div className="flex justify-between px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
                    <span className="text-sm font-semibold text-primary">Total Vendedores</span>
                    <span className="text-sm font-bold text-primary">${totalVendedores.toLocaleString("es-CO")}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Las metas individuales no se suman al presupuesto total (son metas paralelas para liquidación de comisiones).
                  </p>
                </div>
              )}

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
        {step < 4 ? (
          <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? "Guardando..." : isEditing ? "Actualizar Presupuesto" : "Guardar Presupuestos"}
          </Button>
        )}
      </div>
    </div>
  );
}
