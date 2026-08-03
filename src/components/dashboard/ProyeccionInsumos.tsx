import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Download, Search, ChevronRight, ChevronDown } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Proyeccion de demanda de insumos.
 * Fuente: RPC reporte_proyeccion_insumos(p_dias, p_crecimiento, p_desde, p_hasta).
 *
 *   consumo_dia = unidades VENDIDAS del insumo en el rango / dias del rango
 *   demanda     = consumo_dia * dias_cobertura * (1 + crecimiento%)
 *   a_comprar   = demanda - stock_actual  (minimo 0)
 *
 * El rango historico es libre a proposito: proyectar temporada alta con una
 * ventana movil reciente subestima el pico. Con la misma cobertura, la base
 * nov-dic 2025 arroja casi el doble de demanda que los ultimos 90 dias.
 *
 * Dos vistas: consolidado por SKU (orden de compra) y detalle por tienda
 * (distribucion). El consolidado es plegable: clic en la fila abre sus tiendas.
 */

interface Fila {
  location_id: string;
  tienda: string;
  tipo_tienda: string | null;
  sku: string;
  insumo: string;
  dias_base: number;
  consumo_dia: number;
  stock_actual: number | null;
  demanda: number;
  a_comprar: number;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

const COBERTURAS = [30, 60, 90, 120, 180];

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Presets de base histórica. El rango decide la estacionalidad de la proyección. */
function rangoPreset(p: string): [string, string] {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (p) {
    case "30":  return [iso(new Date(y, m, hoy.getDate() - 30)), iso(hoy)];
    case "60":  return [iso(new Date(y, m, hoy.getDate() - 60)), iso(hoy)];
    case "90":  return [iso(new Date(y, m, hoy.getDate() - 90)), iso(hoy)];
    case "180": return [iso(new Date(y, m, hoy.getDate() - 180)), iso(hoy)];
    // Mismo periodo del año pasado, con el ancho del horizonte que se proyecta
    case "ap":  return [iso(new Date(y - 1, m, hoy.getDate())),
                        iso(new Date(y - 1, m + 4, hoy.getDate()))];
    default:    return [iso(new Date(y, m, hoy.getDate() - 90)), iso(hoy)];
  }
}

const PRESETS_BASE = [
  { value: "30",  label: "Últimos 30 días" },
  { value: "60",  label: "Últimos 60 días" },
  { value: "90",  label: "Últimos 90 días" },
  { value: "180", label: "Últimos 180 días" },
  { value: "ap",  label: "Mismo periodo año pasado" },
  { value: "custom", label: "Rango personalizado" },
];

export default function ProyeccionInsumos() {
  const [dias, setDias] = useState(120);
  const [crecimiento, setCrecimiento] = useState(0);
  const [draftCrec, setDraftCrec] = useState("0");

  const [presetBase, setPresetBase] = useState("90");
  const [draftDesde, setDraftDesde] = useState(rangoPreset("90")[0]);
  const [draftHasta, setDraftHasta] = useState(rangoPreset("90")[1]);
  // Rango efectivamente consultado: solo cambia con un preset o con "Aplicar"
  const [rango, setRango] = useState<[string, string]>(rangoPreset("90"));

  const cambiarPreset = (p: string) => {
    setPresetBase(p);
    if (p !== "custom") {
      const r = rangoPreset(p);
      setDraftDesde(r[0]); setDraftHasta(r[1]); setRango(r);
    }
  };

  const rangoValido = Boolean(draftDesde && draftHasta && draftDesde <= draftHasta);
  const rangoCambiado = draftDesde !== rango[0] || draftHasta !== rango[1];

  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [tienda, setTienda] = useState("all");
  const [abierto, setAbierto] = useState<Set<string>>(new Set());

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase.rpc("reporte_proyeccion_insumos", {
        p_dias: dias,
        p_crecimiento: crecimiento,
        p_desde: rango[0],
        p_hasta: rango[1],
      });
      if (!activo) return;
      if (error) setError(error.message);
      else setFilas((data ?? []) as Fila[]);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, [dias, crecimiento, rango]);

  // Tiendas presentes en el resultado, ordenadas por tipo y nombre
  const tiendas = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; tipo: string }>();
    filas.forEach(f => {
      if (!m.has(f.location_id)) {
        m.set(f.location_id, {
          id: f.location_id,
          nombre: f.tienda,
          tipo: f.tipo_tienda ?? "—",
        });
      }
    });
    return Array.from(m.values()).sort(
      (a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)
    );
  }, [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas.filter(f =>
      (tienda === "all" || f.location_id === tienda) &&
      (!q || f.insumo?.toLowerCase().includes(q) || f.sku?.toLowerCase().includes(q))
    );
  }, [filas, tienda, busqueda]);

  // Consolidado por SKU
  const consolidado = useMemo(() => {
    const m = new Map<string, {
      sku: string; insumo: string; consumo: number;
      stock: number; demanda: number; comprar: number; tiendas: Fila[];
    }>();
    visibles.forEach(f => {
      if (!m.has(f.sku)) {
        m.set(f.sku, {
          sku: f.sku, insumo: f.insumo,
          consumo: 0, stock: 0, demanda: 0, comprar: 0, tiendas: [],
        });
      }
      const r = m.get(f.sku)!;
      r.consumo += Number(f.consumo_dia) || 0;
      r.stock   += Number(f.stock_actual) || 0;
      r.demanda += Number(f.demanda) || 0;
      r.comprar += Number(f.a_comprar) || 0;
      r.tiendas.push(f);
    });
    return Array.from(m.values()).sort((a, b) => b.demanda - a.demanda);
  }, [visibles]);

  const totales = useMemo(() => ({
    demanda: consolidado.reduce((s, r) => s + r.demanda, 0),
    comprar: consolidado.reduce((s, r) => s + r.comprar, 0),
    stock:   consolidado.reduce((s, r) => s + r.stock, 0),
  }), [consolidado]);

  const diasBaseReal = filas[0]?.dias_base ?? 0;

  const toggle = (sku: string) => {
    setAbierto(prev => {
      const n = new Set(prev);
      n.has(sku) ? n.delete(sku) : n.add(sku);
      return n;
    });
  };

  const aplicarCrecimiento = () => {
    const v = parseFloat(draftCrec.replace(",", "."));
    if (Number.isFinite(v)) setCrecimiento(v);
  };

  const exportar = () => {
    if (!consolidado.length) return;
    const wb = XLSX.utils.book_new();

    // Hoja 1 — consolidado (orden de compra)
    const cons = consolidado.map(r => ({
      SKU: r.sku,
      Insumo: r.insumo,
      "Consumo/día": Number(r.consumo.toFixed(2)),
      "Stock actual": r.stock,
      [`Demanda ${dias} días`]: Math.round(r.demanda),
      "A comprar": Math.round(r.comprar),
      Tiendas: r.tiendas.length,
    }));
    const ws1 = XLSX.utils.aoa_to_sheet([[], []]);
    XLSX.utils.sheet_add_json(ws1, cons, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws1, [
      [`Proyección de insumos — cobertura ${dias} días — crecimiento ${crecimiento}%`],
      [`Base de cálculo: ${diasBaseReal} días de historia de inventario`],
    ], { origin: "A1" });
    ws1["!cols"] = [{ wch: 12 }, { wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 9 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Orden de compra");

    // Hoja 2 — detalle por tienda (distribucion)
    const det = visibles.map(f => ({
      SKU: f.sku,
      Insumo: f.insumo,
      Tienda: f.tienda,
      Tipo: f.tipo_tienda ?? "",
      "Consumo/día": Number(Number(f.consumo_dia).toFixed(3)),
      "Stock actual": f.stock_actual ?? 0,
      [`Demanda ${dias} días`]: Math.round(Number(f.demanda) || 0),
      "A comprar": Math.round(Number(f.a_comprar) || 0),
    }));
    const ws2 = XLSX.utils.json_to_sheet(det);
    ws2["!cols"] = [{ wch: 12 }, { wch: 44 }, { wch: 26 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Por tienda");

    XLSX.writeFile(wb, `proyeccion-insumos-${dias}d-${crecimiento}pct.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cobertura</label>
          <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COBERTURAS.map(d => (
                <SelectItem key={d} value={String(d)}>{d} días</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Crecimiento</label>
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Input
                type="number"
                value={draftCrec}
                onChange={e => setDraftCrec(e.target.value)}
                onKeyDown={e => e.key === "Enter" && aplicarCrecimiento()}
                className="w-[92px] pr-6"
                step="5"
              />
              <span className="absolute right-2.5 top-2 text-xs text-muted-foreground">%</span>
            </div>
            <Button
              size="sm"
              variant={parseFloat(draftCrec) !== crecimiento ? "default" : "outline"}
              onClick={aplicarCrecimiento}
              disabled={loading || parseFloat(draftCrec) === crecimiento}
            >
              Aplicar
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Base histórica</label>
          <div className="flex items-center gap-1.5">
            <Select value={presetBase} onValueChange={cambiarPreset}>
              <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS_BASE.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {presetBase === "custom" && (
              <>
                <Input type="date" value={draftDesde} max={draftHasta}
                       onChange={e => setDraftDesde(e.target.value)}
                       className="w-[145px]" />
                <span className="text-xs text-muted-foreground">a</span>
                <Input type="date" value={draftHasta} min={draftDesde}
                       onChange={e => setDraftHasta(e.target.value)}
                       className="w-[145px]" />
                <Button
                  size="sm"
                  variant={rangoCambiado && rangoValido ? "default" : "outline"}
                  disabled={!rangoValido || !rangoCambiado || loading}
                  onClick={() => setRango([draftDesde, draftHasta])}
                >
                  Aplicar
                </Button>
              </>
            )}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tienda</label>
          <Select value={tienda} onValueChange={setTienda}>
            <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-[320px]">
              <SelectItem value="all">Todas las tiendas</SelectItem>
              {tiendas.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nombre}
                  {t.tipo !== "—" && (
                    <span className="text-muted-foreground ml-1.5">({t.tipo})</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar insumo…"
            className="pl-8 w-[200px]"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <Button variant="outline" size="sm" className="ml-auto"
                onClick={exportar} disabled={!consolidado.length}>
          <Download className="h-4 w-4 mr-1.5" /> Excel
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Referencias", v: nf(consolidado.length) },
          { l: "Stock actual", v: nf(totales.stock) },
          { l: `Demanda ${dias} días`, v: nf(Math.round(totales.demanda)) },
          { l: "A comprar", v: nf(Math.round(totales.comprar)), destacar: true },
        ].map(k => (
          <div key={k.l} className={`rounded-lg border p-3 ${k.destacar ? "bg-primary/5 border-primary/30" : ""}`}>
            <div className="text-xs text-muted-foreground">{k.l}</div>
            <div className="text-xl font-semibold tabular-nums mt-0.5">{k.v}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Consumo diario = unidades vendidas del insumo entre {rango[0]} y {rango[1]} ({diasBaseReal || "—"} días).
        Demanda = consumo diario × {dias} días{crecimiento !== 0 ? ` × ${(1 + crecimiento / 100).toFixed(2)}` : ""}.
        A comprar descuenta el stock actual.
      </p>

      {loading ? (
        <div className="p-6"><LoadingState rows={8} /></div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          No se pudo calcular la proyección: {error}
        </div>
      ) : !consolidado.length ? (
        <EmptyState message="No hay consumo registrado para proyectar en este periodo." />
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs">
                <th className="w-8" />
                <th className="text-left p-2.5 font-medium">SKU</th>
                <th className="text-left p-2.5 font-medium min-w-[240px]">Insumo</th>
                <th className="text-right p-2.5 font-medium">Consumo/día</th>
                <th className="text-right p-2.5 font-medium">Stock</th>
                <th className="text-right p-2.5 font-medium">Demanda {dias}d</th>
                <th className="text-right p-2.5 font-medium">A comprar</th>
                <th className="text-right p-2.5 font-medium">Tiendas</th>
              </tr>
            </thead>
            <tbody>
              {consolidado.map(r => (
                <>
                  <tr
                    key={r.sku}
                    className="border-b hover:bg-muted/20 cursor-pointer"
                    onClick={() => toggle(r.sku)}
                  >
                    <td className="pl-2">
                      {abierto.has(r.sku)
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </td>
                    <td className="p-2.5 font-mono text-xs text-muted-foreground">{r.sku}</td>
                    <td className="p-2.5">
                      <span className="line-clamp-1">{r.insumo}</span>
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{nf(r.consumo, 2)}</td>
                    <td className="p-2.5 text-right tabular-nums">{nf(r.stock)}</td>
                    <td className="p-2.5 text-right tabular-nums">{nf(Math.round(r.demanda))}</td>
                    <td className="p-2.5 text-right tabular-nums font-semibold">
                      {nf(Math.round(r.comprar))}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                      {r.tiendas.length}
                    </td>
                  </tr>

                  {abierto.has(r.sku) && r.tiendas
                    .slice()
                    .sort((a, b) => Number(b.a_comprar) - Number(a.a_comprar))
                    .map(f => (
                      <tr key={`${r.sku}-${f.location_id}`} className="border-b bg-muted/10 text-xs">
                        <td />
                        <td />
                        <td className="p-2 pl-6 text-muted-foreground">
                          {f.tienda}
                          {f.tipo_tienda && (
                            <span className="ml-1.5 opacity-60">({f.tipo_tienda})</span>
                          )}
                        </td>
                        <td className="p-2 text-right tabular-nums">{nf(f.consumo_dia, 3)}</td>
                        <td className="p-2 text-right tabular-nums">{nf(f.stock_actual)}</td>
                        <td className="p-2 text-right tabular-nums">{nf(Math.round(Number(f.demanda) || 0))}</td>
                        <td className="p-2 text-right tabular-nums">{nf(Math.round(Number(f.a_comprar) || 0))}</td>
                        <td />
                      </tr>
                    ))}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td /><td /><td className="p-2.5">Total</td>
                <td />
                <td className="p-2.5 text-right tabular-nums">{nf(totales.stock)}</td>
                <td className="p-2.5 text-right tabular-nums">{nf(Math.round(totales.demanda))}</td>
                <td className="p-2.5 text-right tabular-nums">{nf(Math.round(totales.comprar))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
