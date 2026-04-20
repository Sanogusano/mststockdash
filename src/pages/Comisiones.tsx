import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";
import {
  Calculator,
  Plus,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  Save,
  History,
  ListOrdered,
  Eye,
  CircleDollarSign,
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

const ROLES = [
  { value: "vendedor", label: "Vendedor" },
  { value: "personal_shopper", label: "Personal Shopper" },
  { value: "administrador", label: "Administrador" },
  { value: "gerente_zona", label: "Gerente Zona" },
  { value: "lider_canal", label: "Líder Canal" },
];

const DEFAULT_TRAMOS: Tramo[] = [
  { min_pct: 90, max_pct: 99.99, comision_pct: 0.40 },
  { min_pct: 100, max_pct: 104.99, comision_pct: 0.60 },
  { min_pct: 105, max_pct: null, comision_pct: 0.80 },
];

interface Tramo {
  min_pct: number;
  max_pct: number | null;
  comision_pct: number;
}

interface ResultadoRow {
  staff_id: string;
  shopify_user_id: string;
  nombre: string;
  rol: string;
  tienda: string | null;
  venta_facturada: number;
  presupuesto: number;
  pct_cumplimiento: number;
  pct_comision: number;
  monto_comision: number;
  tramo_aplicado: string | null;
}

interface Batch {
  id: string;
  anio: number;
  mes: number;
  rol: string;
  estado: string;
  reglas: Tramo[];
  created_at: string;
}

function StatusBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    borrador: "bg-muted text-muted-foreground ring-border",
    calculado: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
    aprobado: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
    pagado: "bg-purple-500/15 text-purple-700 ring-purple-500/30",
  };
  const cls = map[estado] ?? map.borrador;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ring-1 capitalize ${cls}`}>
      {estado}
    </span>
  );
}

function CumplimientoBar({ pct }: { pct: number }) {
  const v = Number.isFinite(pct) ? pct : 0;
  const color = v >= 100 ? "bg-emerald-500" : v >= 90 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(v, 100)}%` }} />
      </div>
      <span className="text-xs font-mono w-10 text-right">{v.toFixed(0)}%</span>
    </div>
  );
}

/* ============================== TAB 1: LIQUIDAR ============================== */
function TabLiquidar({ isAdmin }: { isAdmin: boolean }) {
  const today = new Date();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [anio, setAnio] = useState<number>(today.getFullYear());
  const [mes, setMes] = useState<number>(today.getMonth() + 1);
  const [rol, setRol] = useState<string>("vendedor");
  const [tramos, setTramos] = useState<Tramo[]>(DEFAULT_TRAMOS);

  const [calculating, setCalculating] = useState(false);
  const [results, setResults] = useState<ResultadoRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [calcError, setCalcError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const yearOptions = useMemo(() => {
    const y = today.getFullYear();
    return Array.from({ length: 7 }, (_, i) => y - 5 + i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateTramos = (): string | null => {
    if (!tramos.length) return "Debe definir al menos un tramo.";
    if (tramos[0].min_pct < 90) return "El mínimo del primer tramo debe ser ≥ 90%.";
    for (let i = 0; i < tramos.length; i++) {
      const t = tramos[i];
      if (t.max_pct !== null && t.min_pct >= t.max_pct) {
        return `Tramo ${i + 1}: el mínimo debe ser menor al máximo.`;
      }
      if (t.comision_pct < 0) return `Tramo ${i + 1}: % comisión inválido.`;
      if (i > 0) {
        const prev = tramos[i - 1];
        if (prev.max_pct === null) return `Tramo ${i}: no puede haber tramos después de uno sin tope.`;
        if (t.min_pct < prev.max_pct) return `Tramo ${i + 1}: se solapa con el anterior.`;
      }
    }
    return null;
  };

  const addTramo = () => {
    const last = tramos[tramos.length - 1];
    const nextMin = last && last.max_pct !== null ? last.max_pct + 0.01 : 100;
    setTramos([...tramos, { min_pct: nextMin, max_pct: null, comision_pct: 0 }]);
  };

  const updateTramo = (i: number, key: keyof Tramo, val: string) => {
    const next = [...tramos];
    if (key === "max_pct" && val === "") next[i] = { ...next[i], max_pct: null };
    else next[i] = { ...next[i], [key]: Number(val) } as Tramo;
    setTramos(next);
  };

  const removeTramo = (i: number) => setTramos(tramos.filter((_, k) => k !== i));

  const handleCalculate = async () => {
    const err = validateTramos();
    if (err) {
      setCalcError(err);
      return;
    }
    setCalcError(null);
    setCalculating(true);
    try {
      const { data, error } = await (supabase as any).rpc("calcular_comisiones_periodo", {
        p_anio: anio,
        p_mes: mes,
        p_rol: rol,
        p_reglas: tramos,
      });
      if (error) throw error;
      const list = (data ?? []) as ResultadoRow[];
      setResults(list);
      // Seleccionar por defecto los que cumplen meta
      setSelected(new Set(list.filter((r) => r.monto_comision > 0).map((r) => r.staff_id)));
      setStep(3);
    } catch (e: any) {
      setCalcError(e?.message ?? "Error al calcular comisiones");
    } finally {
      setCalculating(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === results.length) setSelected(new Set());
    else setSelected(new Set(results.map((r) => r.staff_id)));
  };

  const summary = useMemo(() => {
    const cumplen = results.filter((r) => (r.pct_cumplimiento ?? 0) >= 90).length;
    const totalSel = results
      .filter((r) => selected.has(r.staff_id))
      .reduce((s, r) => s + (Number(r.monto_comision) || 0), 0);
    return { total: results.length, cumplen, totalSel };
  }, [results, selected]);

  const saveBatch = async (estado: "borrador" | "aprobado") => {
    if (!isAdmin) {
      toast({ title: "Solo administradores", description: "Necesitas rol admin para guardar.", variant: "destructive" });
      return;
    }
    if (estado === "aprobado" && !selected.size) {
      toast({ title: "Sin selección", description: "Selecciona al menos un vendedor.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      const batchInsert: any = {
        anio, mes, rol,
        reglas: tramos,
        estado,
        creado_por: uid,
      };
      if (estado === "aprobado") {
        batchInsert.aprobado_por = uid;
        batchInsert.aprobado_at = new Date().toISOString();
      }

      const { data: batch, error: bErr } = await (supabase as any)
        .from("commission_batches")
        .insert(batchInsert)
        .select()
        .single();
      if (bErr) throw bErr;

      const rowsToInsert = (estado === "aprobado"
        ? results.filter((r) => selected.has(r.staff_id))
        : results
      ).map((r) => ({
        batch_id: batch.id,
        staff_id: r.staff_id,
        anio, mes,
        venta_facturada: r.venta_facturada,
        presupuesto: r.presupuesto,
        pct_cumplimiento: r.pct_cumplimiento,
        pct_comision_aplicado: r.pct_comision,
        monto_comision: r.monto_comision,
        estado: estado === "aprobado" ? "aprobado" : "pendiente",
      }));

      if (rowsToInsert.length) {
        const { error: sErr } = await (supabase as any)
          .from("commission_settlements")
          .insert(rowsToInsert);
        if (sErr) throw sErr;
      }

      toast({
        title: estado === "aprobado" ? "Liquidación aprobada" : "Borrador guardado",
        description: `${rowsToInsert.length} registros guardados.`,
      });
      // Reset
      setResults([]);
      setSelected(new Set());
      setStep(1);
    } catch (e: any) {
      toast({ title: "Error al guardar", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold ${
                step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {n}
            </div>
            <span className={step === n ? "font-medium text-foreground" : "text-muted-foreground"}>
              {n === 1 ? "Periodo y rol" : n === 2 ? "Escalas" : "Resultados"}
            </span>
            {n < 3 && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paso 1 — Periodo y rol</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mes</label>
                <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Año</label>
                <Select value={String(anio)} onValueChange={(v) => setAnio(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rol</label>
                <Select value={rol} onValueChange={setRol}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>Siguiente</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paso 2 — Escalas de comisión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs text-muted-foreground">
              Define los tramos. Deja vacío "% Hasta" en el último tramo para que sea sin tope.
            </div>
            <div className="space-y-2">
              {tramos.map((t, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Desde</label>
                    <Input
                      type="number" step="0.01" value={t.min_pct}
                      onChange={(e) => updateTramo(i, "min_pct", e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Hasta</label>
                    <Input
                      type="number" step="0.01" value={t.max_pct ?? ""}
                      placeholder="sin tope"
                      onChange={(e) => updateTramo(i, "max_pct", e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Comisión</label>
                    <Input
                      type="number" step="0.01" value={t.comision_pct}
                      onChange={(e) => updateTramo(i, "comision_pct", e.target.value)}
                    />
                  </div>
                  <div className="col-span-3">
                    <Button variant="ghost" size="sm" onClick={() => removeTramo(i)} disabled={tramos.length === 1}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addTramo}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar tramo
            </Button>
            {calcError && <div className="text-sm text-red-600">{calcError}</div>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Atrás
              </Button>
              <Button onClick={handleCalculate} disabled={calculating}>
                <Calculator className="h-4 w-4 mr-1" /> {calculating ? "Calculando…" : "Calcular comisiones"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Paso 3 — Resultados ({MONTHS[mes - 1]} {anio} · {ROLES.find((r) => r.value === rol)?.label})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!results.length ? (
              <EmptyState message="Sin resultados para este periodo y rol." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 w-8">
                          <Checkbox
                            checked={selected.size === results.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </th>
                        <th className="px-2 py-2 text-left">Vendedor</th>
                        <th className="px-2 py-2 text-left">Tienda</th>
                        <th className="px-2 py-2 text-right">Venta</th>
                        <th className="px-2 py-2 text-right">Presupuesto</th>
                        <th className="px-2 py-2 text-left">% Cumpl.</th>
                        <th className="px-2 py-2 text-left">Tramo</th>
                        <th className="px-2 py-2 text-right">% Comisión</th>
                        <th className="px-2 py-2 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.staff_id} className="border-b border-border/50 hover:bg-muted/40">
                          <td className="px-2 py-2.5">
                            <Checkbox
                              checked={selected.has(r.staff_id)}
                              onCheckedChange={() => toggleSelect(r.staff_id)}
                            />
                          </td>
                          <td className="px-2 py-2.5 font-medium text-foreground">{r.nombre}</td>
                          <td className="px-2 py-2.5 text-muted-foreground">{r.tienda ?? "—"}</td>
                          <td className="px-2 py-2.5 text-right">{fmtCOP(r.venta_facturada)}</td>
                          <td className="px-2 py-2.5 text-right text-muted-foreground">
                            {r.presupuesto ? fmtCOP(r.presupuesto) : <span className="text-xs italic">Sin asignar</span>}
                          </td>
                          <td className="px-2 py-2.5"><CumplimientoBar pct={r.pct_cumplimiento ?? 0} /></td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground">{r.tramo_aplicado ?? "—"}</td>
                          <td className="px-2 py-2.5 text-right text-muted-foreground">{(r.pct_comision ?? 0).toFixed(2)}%</td>
                          <td className="px-2 py-2.5 text-right font-semibold text-foreground">{fmtCOP(r.monto_comision)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Resumen */}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Total vendedores</div>
                    <div className="text-xl font-semibold">{fmtNum(summary.total)}</div>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Cumplen meta (≥90%)</div>
                    <div className="text-xl font-semibold">{fmtNum(summary.cumplen)} <span className="text-sm text-muted-foreground">de {summary.total}</span></div>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">Total comisiones (selección)</div>
                    <div className="text-xl font-semibold text-emerald-700">{fmtCOP(summary.totalSel)}</div>
                  </CardContent></Card>
                </div>

                <div className="flex justify-between mt-6">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Volver
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => saveBatch("borrador")} disabled={saving || !isAdmin}>
                      <Save className="h-4 w-4 mr-1" /> Guardar borrador
                    </Button>
                    <Button onClick={() => saveBatch("aprobado")} disabled={saving || !isAdmin || !selected.size}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar seleccionados
                    </Button>
                  </div>
                </div>
                {!isAdmin && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Necesitas rol administrador para guardar liquidaciones.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ============================== TAB 2: HISTORIAL ============================== */
function TabHistorial({ isAdmin }: { isAdmin: boolean }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [drawerBatch, setDrawerBatch] = useState<Batch | null>(null);
  const [drawerRows, setDrawerRows] = useState<any[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Batch | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("commission_batches")
      .select("id, anio, mes, rol, estado, reglas, created_at")
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Batch[];
    setBatches(list);

    if (list.length) {
      const ids = list.map((b) => b.id);
      const { data: sums } = await (supabase as any)
        .from("commission_settlements")
        .select("batch_id, monto_comision")
        .in("batch_id", ids);
      const acc: Record<string, number> = {};
      (sums ?? []).forEach((s: any) => {
        acc[s.batch_id] = (acc[s.batch_id] ?? 0) + (Number(s.monto_comision) || 0);
      });
      setTotals(acc);
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const openDrawer = async (b: Batch) => {
    setDrawerBatch(b);
    setDrawerLoading(true);
    setDrawerRows([]);
    const { data: settlements } = await (supabase as any)
      .from("commission_settlements")
      .select("staff_id, venta_facturada, presupuesto, pct_cumplimiento, pct_comision_aplicado, monto_comision, estado")
      .eq("batch_id", b.id);
    const sList = settlements ?? [];
    if (sList.length) {
      const staffIds = sList.map((s: any) => s.staff_id);
      const { data: staff } = await supabase
        .from("staff_members")
        .select("id, nombre")
        .in("id", staffIds);
      const map: Record<string, string> = {};
      (staff ?? []).forEach((s: any) => { map[s.id] = s.nombre; });
      setDrawerRows(sList.map((s: any) => ({ ...s, nombre: map[s.staff_id] ?? "—" })));
    }
    setDrawerLoading(false);
  };

  const markPaid = async (b: Batch) => {
    const { error } = await (supabase as any)
      .from("commission_batches")
      .update({ estado: "pagado" })
      .eq("id", b.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    await (supabase as any)
      .from("commission_settlements")
      .update({ estado: "pagado" })
      .eq("batch_id", b.id);
    toast({ title: "Marcado como pagado" });
    reload();
  };

  const deleteBatch = async () => {
    if (!confirmDelete) return;
    const { error } = await (supabase as any)
      .from("commission_batches")
      .delete()
      .eq("id", confirmDelete.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Borrador eliminado" });
      reload();
    }
    setConfirmDelete(null);
  };

  if (loading) return <LoadingState />;
  if (!batches.length) return <EmptyState message="No hay liquidaciones registradas." />;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 text-left">Periodo</th>
                <th className="px-2 py-2 text-left">Rol</th>
                <th className="px-2 py-2 text-left">Estado</th>
                <th className="px-2 py-2 text-left">Creado</th>
                <th className="px-2 py-2 text-right">Total comisiones</th>
                <th className="px-2 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-muted/40">
                  <td className="px-2 py-2.5 font-medium">{MONTHS[b.mes - 1]} {b.anio}</td>
                  <td className="px-2 py-2.5 capitalize text-muted-foreground">{b.rol.replace("_", " ")}</td>
                  <td className="px-2 py-2.5"><StatusBadge estado={b.estado} /></td>
                  <td className="px-2 py-2.5 text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold">{fmtCOP(totals[b.id] ?? 0)}</td>
                  <td className="px-2 py-2.5 text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => openDrawer(b)}>
                      <Eye className="h-3.5 w-3.5 mr-1" /> Ver
                    </Button>
                    {b.estado === "aprobado" && isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => markPaid(b)}>
                        <CircleDollarSign className="h-3.5 w-3.5 mr-1" /> Marcar pagado
                      </Button>
                    )}
                    {b.estado === "borrador" && isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(b)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      {/* Drawer detalle */}
      <Drawer open={!!drawerBatch} onOpenChange={(o) => !o && setDrawerBatch(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>
              Liquidación {drawerBatch && `${MONTHS[drawerBatch.mes - 1]} ${drawerBatch.anio}`}
            </DrawerTitle>
            <DrawerDescription>
              Rol: <span className="capitalize">{drawerBatch?.rol.replace("_", " ")}</span> · {drawerRows.length} vendedores
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">
            {drawerLoading ? <LoadingState /> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 text-left">Vendedor</th>
                    <th className="px-2 py-2 text-right">Venta</th>
                    <th className="px-2 py-2 text-right">% Cumpl.</th>
                    <th className="px-2 py-2 text-right">% Comisión</th>
                    <th className="px-2 py-2 text-right">Monto</th>
                    <th className="px-2 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {drawerRows.map((r, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-2 py-2 font-medium">{r.nombre}</td>
                      <td className="px-2 py-2 text-right">{fmtCOP(r.venta_facturada)}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{(r.pct_cumplimiento ?? 0).toFixed(0)}%</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{(r.pct_comision_aplicado ?? 0).toFixed(2)}%</td>
                      <td className="px-2 py-2 text-right font-semibold">{fmtCOP(r.monto_comision)}</td>
                      <td className="px-2 py-2"><StatusBadge estado={r.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar borrador</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el borrador y todos sus settlements asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteBatch}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ============================== TAB 3: ESCALAS ============================== */
function TabEscalas({ isAdmin }: { isAdmin: boolean }) {
  interface Plantilla {
    id: string;
    rol: string;
    nombre: string;
    reglas: Tramo[];
    is_default: boolean;
  }
  const [items, setItems] = useState<Plantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plantilla | null>(null);

  const reload = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("commission_scale_templates")
      .select("*")
      .order("rol");
    setItems((data ?? []) as Plantilla[]);
    setLoading(false);
  };
  useEffect(() => { reload(); }, []);

  const updateTramo = (i: number, key: keyof Tramo, val: string) => {
    if (!editing) return;
    const next = [...editing.reglas];
    if (key === "max_pct" && val === "") next[i] = { ...next[i], max_pct: null };
    else next[i] = { ...next[i], [key]: Number(val) } as Tramo;
    setEditing({ ...editing, reglas: next });
  };

  const save = async () => {
    if (!editing) return;
    const payload = {
      rol: editing.rol,
      nombre: editing.nombre,
      reglas: editing.reglas,
      is_default: editing.is_default,
    };
    let error;
    if (editing.id) {
      ({ error } = await (supabase as any)
        .from("commission_scale_templates")
        .update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase as any)
        .from("commission_scale_templates")
        .insert(payload));
    }
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Escala guardada" });
    setEditing(null);
    reload();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any)
      .from("commission_scale_templates").delete().eq("id", id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Escala eliminada" }); reload(); }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Plantillas de referencia. En cada liquidación puedes ajustar los valores antes de calcular.
        </p>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing({
            id: "", rol: "vendedor", nombre: "Nueva escala",
            reglas: DEFAULT_TRAMOS, is_default: false,
          })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Nueva escala
          </Button>
        )}
      </div>

      {!items.length ? (
        <EmptyState message="No hay plantillas configuradas." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-sm capitalize">{p.nombre}</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">{p.rol.replace("_", " ")}</p>
                </div>
                {p.is_default && (
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 px-2 py-0.5 rounded-full font-semibold">
                    Por defecto
                  </span>
                )}
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-muted-foreground border-b border-border">
                      <th className="text-left py-1">Desde</th>
                      <th className="text-left py-1">Hasta</th>
                      <th className="text-right py-1">Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.reglas.map((t, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5">{t.min_pct}%</td>
                        <td className="py-1.5">{t.max_pct === null ? "Sin tope" : `${t.max_pct}%`}</td>
                        <td className="py-1.5 text-right font-medium">{t.comision_pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isAdmin && (
                  <div className="flex justify-end gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Editar</Button>
                    <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog edición — usando AlertDialog estilizado simple via Drawer/Card */}
      <Drawer open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader>
            <DrawerTitle>Editar escala</DrawerTitle>
          </DrawerHeader>
          {editing && (
            <div className="px-4 pb-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre</label>
                  <Input value={editing.nombre} onChange={(e) => setEditing({ ...editing, nombre: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Rol</label>
                  <Select value={editing.rol} onValueChange={(v) => setEditing({ ...editing, rol: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                {editing.reglas.map((t, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Desde</label>
                      <Input type="number" step="0.01" value={t.min_pct} onChange={(e) => updateTramo(i, "min_pct", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Hasta</label>
                      <Input type="number" step="0.01" value={t.max_pct ?? ""} placeholder="sin tope" onChange={(e) => updateTramo(i, "max_pct", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">% Comisión</label>
                      <Input type="number" step="0.01" value={t.comision_pct} onChange={(e) => updateTramo(i, "comision_pct", e.target.value)} />
                    </div>
                    <div className="col-span-3">
                      <Button variant="ghost" size="sm" onClick={() => setEditing({
                        ...editing,
                        reglas: editing.reglas.filter((_, k) => k !== i),
                      })} disabled={editing.reglas.length === 1}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => {
                  const last = editing.reglas[editing.reglas.length - 1];
                  const nextMin = last && last.max_pct !== null ? last.max_pct + 0.01 : 100;
                  setEditing({ ...editing, reglas: [...editing.reglas, { min_pct: nextMin, max_pct: null, comision_pct: 0 }] });
                }}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar tramo
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox checked={editing.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: !!v })} />
                <span className="text-xs">Marcar como escala por defecto</span>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button onClick={save}>Guardar</Button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/* ============================== PAGE ============================== */
export default function ComisionesPage() {
  const { isAdmin } = useUserRole();

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Liquidación de Comisiones</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Cálculo, aprobación y seguimiento de pagos</p>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6">
            <Tabs defaultValue="liquidar" className="space-y-6">
              <TabsList>
                <TabsTrigger value="liquidar"><Calculator className="h-3.5 w-3.5 mr-1.5" /> Liquidar</TabsTrigger>
                <TabsTrigger value="historial"><History className="h-3.5 w-3.5 mr-1.5" /> Historial</TabsTrigger>
                <TabsTrigger value="escalas"><ListOrdered className="h-3.5 w-3.5 mr-1.5" /> Escalas</TabsTrigger>
              </TabsList>
              <TabsContent value="liquidar"><TabLiquidar isAdmin={isAdmin} /></TabsContent>
              <TabsContent value="historial"><TabHistorial isAdmin={isAdmin} /></TabsContent>
              <TabsContent value="escalas"><TabEscalas isAdmin={isAdmin} /></TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
