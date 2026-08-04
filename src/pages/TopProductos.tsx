import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Download, Package, Trophy, TrendingDown, Tag, HelpCircle, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Top ganadores y perdedores.
 *
 * DOS EVALUACIONES SEPARADAS, no se mezclan:
 *   Calidad de la REFERENCIA -> ¿el producto funcionó?  RDV + % precio full
 *   Calidad de la COMPRA     -> ¿pedimos bien?          sell-through + cobertura
 *
 * Un producto que vendió 400 de 1.000 es MEJOR referencia que uno que vendió
 * 250 de 500, aunque su sell-through sea menor: vendió más unidades. El 40%
 * no dice que el producto sea peor, dice que se compró de más.
 *
 * Tabs de precio: full y rebajado cuentan solo SUS unidades, así el mismo
 * producto puede aparecer en ambos sin doble conteo.
 */

interface Row {
  product_id: string;
  title: string;
  category: string;
  coleccion: string;
  image_url: string | null;
  semanas_en_venta: number;
  semanas_full: number;
  semanas_rebajada: number;
  unidades_vendidas: number;
  unidades_full: number;
  unidades_rebajada: number;
  uds_tienda: number;
  uds_outlet: number;
  uds_online: number;
  stock_actual: number;
  ros_total: number | null;
  ros_full: number | null;
  ros_rebajado: number | null;
  indice_total: number | null;
  indice_full: number | null;
  indice_rebajado: number | null;
  pct_venta_full: number | null;
  profundidad_desc_pct: number | null;
  sell_through_pct: number | null;
  wos: number | null;
  semanas_objetivo: number;
  desempeno: string;
  cobertura: string;
  estado_tallas: string;
  med_pctfull_cohorte: number | null;
  med_st_cohorte: number | null;
}

type Modo = "full" | "rebajado" | "prom";
type Lado = "top" | "bottom";

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function colorIdx(i: number | null) {
  if (i == null) return "#898781";
  if (i >= 130) return "#2a78d6";
  if (i >= 100) return "#0ca30c";
  if (i >= 70)  return "#c98500";
  return "#d03b3b";
}

const COBERTURA_CLS: Record<string, string> = {
  AJUSTADA: "bg-sky-100 text-sky-700 border-sky-200",
  SANA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ALTA: "bg-amber-100 text-amber-700 border-amber-200",
  CRITICA: "bg-rose-100 text-rose-700 border-rose-200",
  "SIN STOCK": "bg-slate-100 text-slate-600 border-slate-200",
};

function Ayuda({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>
      <div>
        <h3 className="font-semibold text-sm">Cómo se arma este ranking</h3>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
          Ordena por <strong className="text-foreground">RDV índice</strong>: qué tan rápido vendió
          comparado con la mediana de su cohorte (colección × categoría). 100 = va al ritmo de sus
          pares.
        </p>
      </div>
      <div className="grid md:grid-cols-3 gap-2 text-xs">
        <div className="rounded border bg-background p-2.5">
          <div className="font-medium">RDV full</div>
          <div className="text-muted-foreground mt-0.5">
            Ritmo por mérito propio, solo unidades vendidas a precio lleno.
          </div>
        </div>
        <div className="rounded border bg-background p-2.5">
          <div className="font-medium">RDV rebajado</div>
          <div className="text-muted-foreground mt-0.5">
            Ritmo cuando se empuja con precio. Solo unidades con descuento.
          </div>
        </div>
        <div className="rounded border bg-background p-2.5">
          <div className="font-medium">RDV promedio</div>
          <div className="text-muted-foreground mt-0.5">
            Todas las unidades, sin distinguir precio.
          </div>
        </div>
      </div>
      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Referencia y compra son cosas distintas</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          El RDV y el % a precio full dicen si <strong className="text-foreground">el producto
          funcionó</strong>. El sell-through y la cobertura dicen si{" "}
          <strong className="text-foreground">se compró la cantidad correcta</strong>. Un producto
          que vendió 400 de 1.000 es mejor referencia que uno que vendió 250 de 500 — vendió más
          unidades. El 40% de sell-through señala un error de compra, no de diseño. Por eso las dos
          columnas van separadas y no se combinan en una sola nota.
        </p>
      </div>
      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Filtros mínimos</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Se exige un mínimo de unidades vendidas y al menos 4 semanas de venta del tipo elegido.
          Sin eso, un producto con 3 unidades en una semana encabezaría el ranking sin significar
          nada.
        </p>
      </div>
    </div>
  );
}

export default function TopProductos() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [lado, setLado] = useState<Lado>("top");
  const [modo, setModo] = useState<Modo>("full");
  const [coleccion, setColeccion] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [minUds, setMinUds] = useState("30");
  const [limite, setLimite] = useState("25");
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      const PAGINA = 1000;
      const acc: Row[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("mv_producto_clasificacion")
            .select("*")
            .order("product_id", { ascending: true })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 50000) break;
        }
        if (activo) setRows(acc);
      } catch (e: any) {
        if (activo) setError(e?.message ?? String(e));
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const colecciones = useMemo(
    () => Array.from(new Set(rows.map(r => r.coleccion).filter(Boolean))).sort(), [rows]);
  const categorias = useMemo(
    () => Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort(), [rows]);

  const idxDe = (r: Row) =>
    modo === "full" ? r.indice_full : modo === "rebajado" ? r.indice_rebajado : r.indice_total;
  const rdvDe = (r: Row) =>
    modo === "full" ? r.ros_full : modo === "rebajado" ? r.ros_rebajado : r.ros_total;
  const udsDe = (r: Row) =>
    modo === "full" ? r.unidades_full : modo === "rebajado" ? r.unidades_rebajada : r.unidades_vendidas;

  const ranking = useMemo(() => {
    const min = Number(minUds);
    const base = rows.filter(r => {
      if (coleccion !== "all" && r.coleccion !== coleccion) return false;
      if (categoria !== "all" && r.category !== categoria) return false;
      if (idxDe(r) == null) return false;
      if (udsDe(r) < min) return false;
      // Exige historia suficiente del modo elegido: sin esto, un producto que
      // concentró su venta en una semana distorsiona el ranking.
      if (modo === "full" && r.semanas_full < 4) return false;
      if (modo === "rebajado" && r.semanas_rebajada < 4) return false;
      return true;
    });
    const ord = [...base].sort((a, b) =>
      lado === "top"
        ? (idxDe(b) ?? 0) - (idxDe(a) ?? 0)
        : (idxDe(a) ?? 0) - (idxDe(b) ?? 0));
    return ord.slice(0, Number(limite));
  }, [rows, lado, modo, coleccion, categoria, minUds, limite]);

  const exportar = () => {
    if (!ranking.length) return;
    const datos = ranking.map((r, i) => ({
      "#": i + 1,
      Producto: r.title,
      Categoría: r.category,
      Colección: r.coleccion,
      "Semanas en venta": r.semanas_en_venta,
      "Uds del modo": udsDe(r),
      "Uds totales": r.unidades_vendidas,
      "RDV del modo": rdvDe(r),
      "Índice RDV": idxDe(r),
      "% venta full": r.pct_venta_full,
      "% full mediana cohorte": r.med_pctfull_cohorte,
      "Profundidad desc %": r.profundidad_desc_pct,
      "Sell-through %": r.sell_through_pct,
      "ST mediana cohorte": r.med_st_cohorte,
      "Semanas de stock": r.wos,
      "Semanas restantes": r.semanas_objetivo,
      Stock: r.stock_actual,
      Cobertura: r.cobertura,
      "Estado tallas": r.estado_tallas,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" });
    const titulo = lado === "top" ? "Top ganadores" : "Bottom perdedores";
    const mm = modo === "full" ? "precio full" : modo === "rebajado" ? "rebajado" : "promedio";
    XLSX.utils.sheet_add_aoa(ws, [
      [`${titulo} — RDV ${mm}, índice base 100 = mediana de su cohorte (colección × categoría)`],
      [`Mínimo ${minUds} unidades y 4 semanas de venta · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 5 }, { wch: 44 }, { wch: 22 }, { wch: 13 }, ...Array(15).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, titulo);
    XLSX.writeFile(wb, `${lado}-productos-${modo}.xlsx`);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Top de productos</h1>
              <p className="text-xs text-muted-foreground">
                Ordenado por ritmo de venta contra su cohorte · calidad de referencia y de compra
                se leen por separado
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />Cómo se calcula
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <Ayuda onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5">
                <button onClick={() => setLado("top")}
                  className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                    lado === "top" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <Trophy className="h-3.5 w-3.5" />Ganadores
                </button>
                <button onClick={() => setLado("bottom")}
                  className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                    lado === "bottom" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                  <TrendingDown className="h-3.5 w-3.5" />Perdedores
                </button>
              </div>

              <div className="inline-flex rounded-md border p-0.5">
                {([
                  { v: "full", l: "Precio full", i: Trophy },
                  { v: "rebajado", l: "Rebajado", i: Tag },
                  { v: "prom", l: "Promedio", i: Package },
                ] as const).map(m => (
                  <button key={m.v} onClick={() => setModo(m.v)}
                    className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                      modo === m.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                    <m.i className="h-3.5 w-3.5" />{m.l}
                  </button>
                ))}
              </div>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[165px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={minUds} onValueChange={setMinUds}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Mínimo 10 uds</SelectItem>
                  <SelectItem value="30">Mínimo 30 uds</SelectItem>
                  <SelectItem value="50">Mínimo 50 uds</SelectItem>
                  <SelectItem value="100">Mínimo 100 uds</SelectItem>
                </SelectContent>
              </Select>

              <Select value={limite} onValueChange={setLimite}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="ml-auto"
                      onClick={exportar} disabled={!ranking.length}>
                <Download className="h-4 w-4 mr-1.5" />Excel
              </Button>
            </div>

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : !ranking.length ? (
              <EmptyState message="Ningún producto cumple estos filtros. Baja el mínimo de unidades." />
            ) : (
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                      <th className="p-2.5 w-8"></th>
                      <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                      <th className="text-right p-2.5 font-medium">
                        Uds {modo === "full" ? "full" : modo === "rebajado" ? "rebaj." : "total"}
                      </th>
                      <th className="text-left p-2.5 font-medium">
                        RDV {modo === "full" ? "full" : modo === "rebajado" ? "rebajado" : "prom."}
                      </th>
                      <th className="text-right p-2.5 font-medium">% full</th>
                      <th className="text-right p-2.5 font-medium">Sell-thr.</th>
                      <th className="text-left p-2.5 font-medium">Compra</th>
                      <th className="text-right p-2.5 font-medium">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => {
                      const idx = idxDe(r);
                      const col = colorIdx(idx);
                      const pctOk = (r.pct_venta_full ?? 0) >= (r.med_pctfull_cohorte ?? 0);
                      const stOk = (r.sell_through_pct ?? 0) >= (r.med_st_cohorte ?? 0);
                      return (
                        <tr key={r.product_id} className="border-b hover:bg-muted/20">
                          <td className="p-2.5 text-right text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="p-2 w-[52px]">
                            {r.image_url ? (
                              <img src={r.image_url} alt=""
                                   className="h-11 w-11 rounded object-cover bg-muted" loading="lazy" />
                            ) : (
                              <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground/50" />
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 min-w-[210px]">
                            <div className="font-medium leading-tight line-clamp-1">{r.title}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {r.category} · {r.coleccion} · sem {r.semanas_en_venta}
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="font-medium tabular-nums">{nf(udsDe(r))}</div>
                            {modo !== "prom" && (
                              <div className="text-[10px] text-muted-foreground">
                                de {nf(r.unidades_vendidas)}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="w-[112px]">
                              <div className="relative h-3">
                                <div className="absolute top-0.5 inset-x-0 h-2 rounded-full bg-muted" />
                                <div className="absolute top-0.5 left-0 h-2 rounded-full"
                                     style={{ width: `${Math.min(100, ((idx ?? 0) / 300) * 100)}%`,
                                              background: col }} />
                                <div className="absolute top-0 h-3 w-0.5 bg-foreground"
                                     style={{ left: "33.3%" }} />
                              </div>
                              <div className="flex items-baseline gap-1.5 mt-1">
                                <span className="text-sm font-medium tabular-nums" style={{ color: col }}>
                                  {idx ?? "—"}
                                </span>
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {nf(rdvDe(r), 2)} uds/t/sem
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`tabular-nums ${pctOk ? "text-emerald-700 font-medium" : ""}`}>
                              {nf(r.pct_venta_full, 1)}%
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              cat {nf(r.med_pctfull_cohorte, 0)}%
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`tabular-nums ${stOk ? "text-emerald-700 font-medium" : ""}`}>
                              {nf(r.sell_through_pct, 1)}%
                            </span>
                            <div className="text-[10px] text-muted-foreground">
                              cat {nf(r.med_st_cohorte, 0)}%
                            </div>
                          </td>
                          <td className="p-2.5">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                              COBERTURA_CLS[r.cobertura] ?? ""}`}>
                              {r.cobertura}
                            </span>
                            {r.wos != null && r.cobertura !== "SIN STOCK" && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                                {nf(Math.min(r.wos, 99), 0)} sem · quedan {r.semanas_objetivo}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{nf(r.stock_actual)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Índice RDV:</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />≥130</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />100–129</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />70–99</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d03b3b" }} />&lt;70</span>
              <span className="ml-2">
                En verde, cuando el producto supera la mediana de su categoría · "Compra" evalúa
                la cantidad pedida, no el producto
              </span>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
