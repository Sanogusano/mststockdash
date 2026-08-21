import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { CampanasListView } from "./liquidacion/CampanasListView";
import { SemanalDetailView } from "./liquidacion/SemanalDetailView";
import { PresupuestoSemanalDetailView } from "./liquidacion/PresupuestoSemanalDetailView";
import { CategoriaDetailView } from "./liquidacion/CategoriaDetailView";
import { SkuDetailView } from "./liquidacion/SkuDetailView";
import { TransaccionesDetailView } from "./liquidacion/TransaccionesDetailView";
import { TiendaCumplimientoDetailView } from "./liquidacion/TiendaCumplimientoDetailView";
import type { CampanaResumen, LiquidacionRow } from "./liquidacion/types";

export function LiquidacionPanel() {
  const [loading, setLoading] = useState(true);
  const [campanas, setCampanas] = useState<CampanaResumen[]>([]);
  const [allRows, setAllRows] = useState<LiquidacionRow[]>([]);
  const [locMap, setLocMap] = useState<Map<string, string>>(new Map());
  const [vendedorMap, setVendedorMap] = useState<Map<string, string>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: liq } = await supabase
        .from("incentivo_liquidaciones")
        .select("id, incentivo_id, location_id, vendedor_id, progreso_actual, cumple_meta, monto_ganado");

      if (!liq || liq.length === 0) {
        setCampanas([]);
        setLoading(false);
        return;
      }

      const incentivoIds = [...new Set(liq.map((r) => r.incentivo_id))];
      const locationIds = [...new Set(liq.map((r) => r.location_id).filter(Boolean) as string[])];
      const vendedorIds = [...new Set(liq.map((r) => r.vendedor_id).filter(Boolean) as string[])];

      const [incRes, reglasRes, recompRes, locRes, staffRes] = await Promise.all([
        supabase.from("incentivos").select("id, nombre, fecha_inicio, fecha_fin, alcance").in("id", incentivoIds),
        supabase.from("incentivo_reglas").select("incentivo_id, tipo_regla, parametros, valor_objetivo").in("incentivo_id", incentivoIds),
        supabase.from("incentivo_recompensas").select("incentivo_id, tipo_pago, valor, tope_minimo, tope_maximo").in("incentivo_id", incentivoIds),
        locationIds.length > 0
          ? supabase.from("locations").select("location_id, name").in("location_id", locationIds)
          : Promise.resolve({ data: [] as any[] }),
        vendedorIds.length > 0
          ? supabase.from("staff_members").select("shopify_user_id, nombre").in("shopify_user_id", vendedorIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const incMap = new Map((incRes.data ?? []).map((i: any) => [i.id, i]));
      const reglaMap = new Map((reglasRes.data ?? []).map((r: any) => [r.incentivo_id, r]));
      const recompMap = new Map((recompRes.data ?? []).map((r: any) => [r.incentivo_id, r]));
      const locM = new Map((locRes.data ?? []).map((l: any) => [l.location_id, l.name]));
      const vendM = new Map((staffRes.data ?? []).map((s: any) => [s.shopify_user_id, s.nombre]));

      setLocMap(locM);
      setVendedorMap(vendM);
      setAllRows(liq as LiquidacionRow[]);

      // Group by incentivo to build summaries
      const byIncentivo = new Map<string, LiquidacionRow[]>();
      (liq as LiquidacionRow[]).forEach((r) => {
        if (!byIncentivo.has(r.incentivo_id)) byIncentivo.set(r.incentivo_id, []);
        byIncentivo.get(r.incentivo_id)!.push(r);
      });

      const summaries: CampanaResumen[] = [];
      byIncentivo.forEach((rows, id) => {
        const inc: any = incMap.get(id);
        const regla: any = reglaMap.get(id);
        const recomp: any = recompMap.get(id);
        if (!inc) return;
        const tipo_regla = regla?.tipo_regla ?? "desconocido";

        let totalParticipantes = 0;
        let cumplenMeta = 0;
        let totalSemanas: number | undefined;
        let semanasCumplidas: number | undefined;

        if (tipo_regla === "presupuesto_semanal" || tipo_regla === "presupuesto_semanal_dual") {
          const stores = new Set(
            rows.map((r) => ((r.progreso_actual as any)?.nombre as string) ?? r.location_id)
          );
          totalParticipantes = stores.size;
          totalSemanas = rows.length;
          semanasCumplidas = rows.filter((r) => r.cumple_meta).length;
          // Stores que cumplieron al menos una semana
          const cumplenSet = new Set(
            rows.filter((r) => r.cumple_meta).map((r) => ((r.progreso_actual as any)?.nombre as string) ?? r.location_id)
          );
          cumplenMeta = cumplenSet.size;
        } else {
          totalParticipantes = rows.length;
          cumplenMeta = rows.filter((r) => r.cumple_meta).length;
        }

        summaries.push({
          incentivo_id: id,
          nombre: inc.nombre,
          fecha_inicio: inc.fecha_inicio,
          fecha_fin: inc.fecha_fin,
          alcance: inc.alcance,
          tipo_regla,
          parametros: regla?.parametros ?? {},
          valor_objetivo: regla?.valor_objetivo ?? 0,
          recompensa: recomp
            ? { tipo_pago: recomp.tipo_pago, valor: recomp.valor, tope_minimo: recomp.tope_minimo, tope_maximo: recomp.tope_maximo }
            : undefined,
          totalParticipantes,
          cumplenMeta,
          totalGanado: rows.reduce((s, r) => s + (r.monto_ganado ?? 0), 0),
          totalSemanas,
          semanasCumplidas,
        });
      });

      summaries.sort((a, b) => a.nombre.localeCompare(b.nombre));
      setCampanas(summaries);
      setLoading(false);
    };
    fetchData();
  }, []);

  const selected = useMemo(() => campanas.find((c) => c.incentivo_id === selectedId), [campanas, selectedId]);
  const selectedRows = useMemo(
    () => (selectedId ? allRows.filter((r) => r.incentivo_id === selectedId) : []),
    [allRows, selectedId]
  );

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          {selected && (
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedId(null)}>
              <ArrowLeft className="h-3.5 w-3.5" /> Volver
            </Button>
          )}
          <CardTitle className="text-base font-semibold">
            {selected ? selected.nombre : "Liquidación de Campañas"}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !selected ? (
          <CampanasListView campanas={campanas} onSelect={setSelectedId} />
        ) : selected.tipo_regla === "presupuesto_semanal" ? (
          <PresupuestoSemanalDetailView campana={selected} rows={selectedRows} locMap={locMap} />
        ) : selected.tipo_regla === "presupuesto_semanal_dual" ? (
          <SemanalDetailView campana={selected} rows={selectedRows} locMap={locMap} />
        ) : selected.tipo_regla === "tienda_cumplimiento" ? (
          <TiendaCumplimientoDetailView campana={selected} rows={selectedRows} locMap={locMap} />
        ) : selected.tipo_regla === "venta_categoria" ? (
          <CategoriaDetailView campana={selected} rows={selectedRows} vendedorMap={vendedorMap} />
        ) : selected.tipo_regla === "venta_sku" ? (
          <SkuDetailView campana={selected} rows={selectedRows} vendedorMap={vendedorMap} locMap={locMap} />
        ) : ["ticket_minimo", "upt_minimo", "numero_pedidos"].includes(selected.tipo_regla) ? (
          <TransaccionesDetailView campana={selected} rows={selectedRows} vendedorMap={vendedorMap} locMap={locMap} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Tipo de regla no soportado: {selected.tipo_regla}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
