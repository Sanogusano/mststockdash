import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { HeaderTooltip } from "@/components/HeaderTooltip";

import { Button } from "@/components/ui/button";
import {
  Download, Package, Trophy, TrendingDown, Tag, HelpCircle, X,
  Store, ShoppingBag, Globe,
} from "lucide-react";
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
  categoria_padre: string | null;
  genero_norm: string | null;
  coleccion: string;
  image_url: string | null;
  semanas_en_venta: number;
  semanas_full: number;
  semanas_rebajada: number;
  unidades_vendidas: number;
  unidades_full: number;
  unidades_rebaja: number;
  unidades_activacion: number;
  unidades_rebajada: number;
  uds_tie_full: number;
  uds_tie_rebaja: number;
  uds_tie_activacion: number;
  uds_onl_full: number;
  uds_onl_rebaja: number;
  uds_onl_activacion: number;
  pct_rebaja: number | null;
  pct_activacion: number | null;
  pct_tie_full: number | null;
  pct_onl_full: number | null;
  stock_tienda: number;
  stock_online: number;
  n_cohorte: number;
  uds_tienda: number;
  uds_outlet: number;
  uds_online: number;
  perfil_canal: string;
  mix_online_pct: number | null;
  mix_online_cat: number | null;
  stock_actual: number;
  stock_outlet: number;
  st_tienda_pct: number | null;
  st_online_pct: number | null;
  tallas_con_stock: number | null;
  tiendas_con_stock: number | null;
  tallas_totales: number | null;
  base_cohorte: string;
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
  stock_detenido: number;
  diagnostico: string;
  pct_venta_sana: number | null;
  pct_activacion: number | null;
  pct_activacion_tienda: number | null;
  pct_activacion_online: number | null;
  desc_activacion_pct: number | null;
  desc_activacion_tienda_pct: number | null;
  desc_activacion_online_pct: number | null;
  objetivo_unidades: number;
  meta_st: number;
  st_total: number | null;
  semanas_restantes: number;
}


type Modo = "full" | "rebajado" | "prom";
type Lado = "top" | "bottom";

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

function colorIdx(i: number | null) {
  if (i == null) return "#898781";
  if (i >= 1.30) return "#2a78d6";
  if (i >= 1.00) return "#0ca30c";
  if (i >= 0.70)  return "#c98500";
  return "#d03b3b";
}


const PERFIL_CANAL: Record<string, { txt: string; cls: string }> = {
  fuerte_online: { txt: "Gana en online", cls: "bg-sky-100 text-sky-700 border-sky-200" },
  fuerte_tienda: { txt: "Gana en tienda", cls: "bg-violet-100 text-violet-700 border-violet-200" },
  solo_online:   { txt: "Solo online",    cls: "bg-sky-100 text-sky-700 border-sky-200" },
  solo_tienda:   { txt: "Solo tienda",    cls: "bg-violet-100 text-violet-700 border-violet-200" },
  equilibrado:   { txt: "Parejo",         cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

const COBERTURA_CLS: Record<string, string> = {
  AJUSTADA: "bg-sky-100 text-sky-700 border-sky-200",
  SANA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ALTA: "bg-amber-100 text-amber-700 border-amber-200",
  CRITICA: "bg-rose-100 text-rose-700 border-rose-200",
  "SIN STOCK": "bg-slate-100 text-slate-600 border-slate-200",
};

/** Mapeo de las etiquetas de acción del filtro al valor real de `diagnostico`. */
const FILTRO_DIAGNOSTICO: Record<string, string> = {
  "Repetir": "GANADOR",
  "Revisar cantidad": "SE PRODUJO DE MAS",
  "Revisar precio": "EVACUO LIQUIDANDO",
  "Revisar concepto": "MAL PRODUCTO",
  "En curso": "EN CURSO",
};


/** Barra apilada de calidad de venta: full / rebaja / activación. */
function BarraCalidad({ full, rebaja, activacion, ancho = 96 }: {
  full: number; rebaja: number; activacion: number; ancho?: number;
}) {
  const t = full + rebaja + activacion;
  if (!t) return <span className="text-[10px] text-muted-foreground">—</span>;
  const seg = [
    { n: full,       c: "#0ca30c", l: "Precio full" },
    { n: rebaja,     c: "#c98500", l: "Rebaja" },
    { n: activacion, c: "#2a78d6", l: "Activación" },
  ];
  return (
    <div style={{ width: ancho }}>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
        {seg.map(s => s.n > 0 && (
          <div key={s.l} style={{ width: `${(s.n / t) * 100}%`, background: s.c }}
               title={`${s.l}: ${nf(s.n)} uds (${((s.n / t) * 100).toFixed(0)}%)`} />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
        {((full / t) * 100).toFixed(0)}% full
      </div>
    </div>
  );
}

/** Lightbox: foto grande y todos los datos de la fila. */
function Detalle({ r, onClose }: { r: Row; onClose: () => void }) {
  const idx = r.indice_total == null ? null : r.indice_total / 100;
  const col = colorIdx(idx);

  const Dato = ({ l, v, sub }: { l: string; v: React.ReactNode; sub?: string }) => (
    <div>
      <div className="text-[11px] text-muted-foreground">{l}</div>
      <div className="text-sm font-medium tabular-nums">{v}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border max-w-3xl w-full max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold">{r.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {r.category} · {r.coleccion} · {r.genero_norm} · Semana {r.semanas_en_venta}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 grid md:grid-cols-[260px_1fr] gap-5">
          <div>
            {r.image_url ? (
              <img src={r.image_url} alt={r.title} className="w-full rounded-lg object-cover bg-muted" />
            ) : (
              <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                <Package className="h-10 w-10 text-muted-foreground/40" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Dato l="Unidades vendidas" v={nf(r.unidades_vendidas)} />
              <Dato l="RDV vs. sus pares"
                    v={<span style={{ color: col }}>{idx == null ? "—" : `${nf(idx, 2)}×`}</span>}
                    sub={`vs. ${r.n_cohorte} de su ${r.base_cohorte} · ${r.diagnostico}`} />

              <Dato l="Stock actual" v={nf(r.stock_actual)} />
            </div>

            <div>
              <div className="text-[11px] text-muted-foreground mb-1.5">Calidad de la venta</div>
              <BarraCalidad full={r.unidades_full} rebaja={r.unidades_rebaja}
                            activacion={r.unidades_activacion} ancho={320} />
              <div className="flex gap-4 mt-2 text-[11px]">
                <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />Full {nf(r.unidades_full)}</span>
                <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />Rebaja {nf(r.unidades_rebaja)}</span>
                <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />Activación {nf(r.unidades_activacion)}</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                  <Store className="h-3.5 w-3.5" />Tienda física
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendido</span>
                    <span className="tabular-nums">{nf(r.uds_tienda + r.uds_outlet)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Stock</span>
                    <span className="tabular-nums">{nf(r.stock_tienda + r.stock_outlet)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sell-through</span>
                    <span className="tabular-nums">{nf(r.st_tienda_pct, 1)}%</span></div>
                </div>
                <div className="mt-2">
                  <BarraCalidad full={r.uds_tie_full} rebaja={r.uds_tie_rebaja}
                                activacion={r.uds_tie_activacion} ancho={150} />
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium mb-2">
                  <Globe className="h-3.5 w-3.5" />Online
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendido</span>
                    <span className="tabular-nums">{nf(r.uds_online)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Stock</span>
                    <span className="tabular-nums">{nf(r.stock_online)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Sell-through</span>
                    <span className="tabular-nums">{nf(r.st_online_pct, 1)}%</span></div>
                </div>
                <div className="mt-2">
                  <BarraCalidad full={r.uds_onl_full} rebaja={r.uds_onl_rebaja}
                                activacion={r.uds_onl_activacion} ancho={150} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t">
              <Dato l="Sell-through total" v={`${nf(r.sell_through_pct, 1)}%`}
                    sub={`típico ${nf(r.med_st_cohorte, 0)}%`} />
              <Dato l="Cobertura" v={`${nf(Math.min(r.wos ?? 0, 99), 0)} sem`}
                    sub={`quedan ${r.semanas_objetivo} · ${r.cobertura}`} />
              <Dato l="Tallas con stock"
                    v={r.estado_tallas === "no_aplica" ? "—" : `${r.tallas_con_stock ?? 0}/${r.tallas_totales ?? 0}`}
                    sub={r.estado_tallas === "destallado_grave" ? "curva rota"
                         : r.estado_tallas === "destallado" ? "incompleta" : undefined} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
          Ordena por <strong className="text-foreground">RDV</strong> expresado como multiplicador:
          cuántas veces más rápido vendió que el producto típico de su cohorte (colección ×
          categoría). <strong className="text-foreground">1,00× = va al ritmo de sus pares</strong>;
          2,50× = vende dos veces y media más rápido. No son unidades: las unidades están en su
          propia columna.
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
          <br /><br />
          <strong className="text-foreground">Cobertura</strong> mide cuánto tiempo dura el stock
          que queda, no cuánto se pidió: las unidades compradas no están en el sistema todavía.
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
      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Qué se excluye de Perdedores</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Un producto que ya vendió su inventario no es perdedor, aunque su RDV a precio full sea
          bajo: eso solo refleja que se liquidó con precio. Por eso quedan fuera del bottom los
          productos con cobertura ajustada o sana, y los que superan el sell-through típico de su
          cohorte.
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
  const [diagnostico, setDiagnostico] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [minUds, setMinUds] = useState("30");
  const [limite, setLimite] = useState("25");
  const [ayuda, setAyuda] = useState(false);
  const [detalle, setDetalle] = useState<Row | null>(null);

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
            .from("producto_360")
            .select("*")
            .order("product_id", { ascending: true })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as unknown as Row[];

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
  const catKey = (r: Row) =>
    `${r.categoria_padre ?? r.category ?? "—"} · ${r.genero_norm ?? "—"}`;
  const categorias = useMemo(
    () => Array.from(new Set(rows.map(catKey).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, "es")), [rows]);

  const idxDe = (r: Row) => {
    const v = modo === "full" ? r.indice_full : modo === "rebajado" ? r.indice_rebajado : r.indice_total;
    return v == null ? null : v / 100;
  };
  const rdvDe = (r: Row) =>
    modo === "full" ? r.ros_full : modo === "rebajado" ? r.ros_rebajado : r.ros_total;
  const udsDe = (r: Row) =>
    modo === "full" ? r.unidades_full : modo === "rebajado" ? r.unidades_rebajada : r.unidades_vendidas;


  const ranking = useMemo(() => {
    const min = Number(minUds);
    const base = rows.filter(r => {
      if (coleccion !== "all" && r.coleccion !== coleccion) return false;
      if (categoria !== "all" && catKey(r) !== categoria) return false;
      if (diagnostico !== "all" && r.diagnostico !== diagnostico) return false;
      if (idxDe(r) == null) return false;
      if (udsDe(r) < min) return false;
      // Exige historia suficiente del modo elegido: sin esto, un producto que
      // concentró su venta en una semana distorsiona el ranking.
      if (modo === "full" && r.semanas_full < 4) return false;
      if (modo === "rebajado" && r.semanas_rebajada < 4) return false;

      // En Perdedores se excluye lo que YA se vendió. Un producto con
      // sell-through alto o cobertura ajustada no es perdedor aunque su RDV
      // full sea bajo: eso solo refleja que se liquidó con precio, no que
      // haya fracasado. (Caso real: STREIFF vendió 612 uds con 92,9% de
      // sell-through y salía #18 del bottom.)
      if (lado === "bottom") {
        if (["AJUSTADA", "SANA", "SIN STOCK"].includes(r.cobertura)) return false;
        if ((r.sell_through_pct ?? 0) >= (r.med_st_cohorte ?? 0)) return false;
      }
      return true;
    });
    const ord = [...base].sort((a, b) =>
      lado === "top"
        ? (idxDe(b) ?? 0) - (idxDe(a) ?? 0)
        : (idxDe(a) ?? 0) - (idxDe(b) ?? 0));
    return ord.slice(0, Number(limite));
  }, [rows, lado, modo, coleccion, categoria, diagnostico, minUds, limite]);

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
      "Uds tienda": r.uds_tienda + r.uds_outlet,
      "Uds online": r.uds_online,
      "Uds full": r.unidades_full,
      "Uds rebaja": r.unidades_rebaja,
      "Uds activación": r.unidades_activacion,
      "% full tienda": r.pct_tie_full,
      "% full online": r.pct_onl_full,
      "ST tienda %": r.st_tienda_pct,
      "ST online %": r.st_online_pct,
      "Stock tienda": r.stock_tienda + r.stock_outlet,
      "Stock online": r.stock_online,
      Cohorte: `${r.n_cohorte} · ${r.base_cohorte}`,
      "Perfil de canal": r.perfil_canal,
      "RDV del modo": rdvDe(r),
      "Índice del modo (× el típico)": idxDe(r) == null ? null : Number((idxDe(r) as number).toFixed(2)),
      "Índice cohorte (× el típico)": r.indice_total == null ? null : Number((r.indice_total / 100).toFixed(2)),
      Diagnóstico: r.diagnostico,
      "% venta sana": r.pct_venta_sana,
      "% activación": r.pct_activacion,

      "% venta full": r.pct_venta_full,
      "% full típico de la cohorte": r.med_pctfull_cohorte,
      "Profundidad desc %": r.profundidad_desc_pct,
      "Sell-through %": r.sell_through_pct,
      "Sell-through típico de la cohorte": r.med_st_cohorte,
      "Semanas de stock": r.wos,
      "Semanas restantes": r.semanas_objetivo,
      Stock: r.stock_actual,
      Cobertura: r.cobertura,
      "Estado tallas": r.estado_tallas,
    }));
    const ws = XLSX.utils.aoa_to_sheet([[], []]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
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

              <Select value={diagnostico} onValueChange={setDiagnostico}>
                <SelectTrigger className="w-[195px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los diagnósticos</SelectItem>
                  {DIAGNOSTICOS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
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
                          <HeaderTooltip label="Vendido" tip="Vendido + stock en tiendas, online y bodega" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Por canal" tip="Unidades por tienda y por online" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="RDV" tip="¿Vende más rápido que productos parecidos? 1,00× = igual" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Calidad de venta" tip="Qué parte se vendió sin liquidar (precio full o activación)" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Diagnóstico" tip="Cierre del producto: si funcionó, si evacuó liquidando, si sobró producción o si aún está en curso" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Por canal" tip="Calidad de venta por tienda y online" />
                        </th>
                        <th className="text-right p-2.5 font-medium">
                          <HeaderTooltip label="Sell-thr." tip="Verde: de lo disponible. Gris: incluyendo bodega" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Canal" tip="Perfil de canal según unidades vendidas" />
                        </th>
                        <th className="text-left p-2.5 font-medium">
                          <HeaderTooltip label="Cobertura" tip="Semanas que dura el stock, y cuántas quedan de temporada" />
                        </th>
                        <th className="text-right p-2.5 font-medium">
                          <HeaderTooltip label="Stock" tip="Disponible: a la venta. Detenido: en bodega" />
                        </th>
                      </tr>
                    </thead>
                  <tbody>
                    {ranking.map((r, i) => {
                      const idx = idxDe(r);
                      const col = colorIdx(idx);
                      const stOk = (r.sell_through_pct ?? 0) >= (r.med_st_cohorte ?? 0);
                      return (
                        <tr key={r.product_id} className="border-b hover:bg-muted/20">
                          <td className="p-2.5 text-right text-xs text-muted-foreground tabular-nums">
                            {i + 1}
                          </td>
                          <td className="p-2 w-[56px]">
                            <button onClick={() => setDetalle(r)} title="Ver detalle"
                                    className="block rounded overflow-hidden hover:ring-2 hover:ring-primary transition-shadow">
                              {r.image_url ? (
                                <img src={r.image_url} alt="" className="h-12 w-12 object-cover bg-muted" loading="lazy" />
                              ) : (
                                <div className="h-12 w-12 bg-muted flex items-center justify-center">
                                  <Package className="h-4 w-4 text-muted-foreground/50" />
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="p-2.5 min-w-[190px]">
                            <button onClick={() => setDetalle(r)} className="text-left">
                              <div className="font-medium leading-tight line-clamp-1 hover:underline">{r.title}</div>
                            </button>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {r.categoria_padre ?? r.category} · {r.coleccion} · Semana {r.semanas_en_venta}
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <div className="font-medium tabular-nums">{nf(r.unidades_vendidas)}</div>
                            {modo !== "prom" && (
                              <div className="text-[10px] text-muted-foreground">
                                {nf(udsDe(r))} {modo === "full" ? "full" : "rebaj."}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="space-y-0.5 text-[11px] whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Store className="h-3 w-3 text-muted-foreground" />
                                <span className="tabular-nums">{nf(r.uds_tienda + r.uds_outlet)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShoppingBag className="h-3 w-3 text-muted-foreground" />
                                <span className="tabular-nums">{nf(r.uds_online)}</span>
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="w-[112px]">
                              <div className="relative h-3">
                                <div className="absolute top-0.5 inset-x-0 h-2 rounded-full bg-muted" />
                                <div className="absolute top-0.5 left-0 h-2 rounded-full"
                                     style={{ width: `${Math.min(100, ((idx ?? 0) / 3) * 100)}%`,
                                              background: col }} />
                                <div className="absolute top-0 h-3 w-0.5 bg-foreground"
                                     style={{ left: "33.3%" }} />
                              </div>
                              <div className="mt-1">
                                <span className="text-sm font-medium tabular-nums" style={{ color: col }}
                                      title="Índice vs. sus pares">
                                  {idx == null ? "—" : `${nf(idx, 2)}×`}
                                </span>
                                <div className="text-[10px] text-muted-foreground tabular-nums">
                                  {nf((r.indice_total ?? 0) / 100, 2)}× vs. sus pares
                                </div>
                              </div>

                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="text-sm font-medium tabular-nums">
                              {nf(r.pct_venta_sana, 0)}% <span className="text-[10px] font-normal text-muted-foreground">sin liquidar</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground tabular-nums">
                              {nf(r.pct_venta_full, 0)}% full · {nf(r.pct_activacion, 0)}% activación
                            </div>
                            <BarraCalidad full={r.unidades_full} rebaja={r.unidades_rebaja}
                                          activacion={r.unidades_activacion} />
                          </td>
                          <td className="p-2.5">
                            <DiagnosticoBadge valor={r.diagnostico} />
                          </td>
                          <td className="p-2.5">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <Store className="h-3 w-3 text-muted-foreground shrink-0" />
                                <BarraCalidad full={r.uds_tie_full} rebaja={r.uds_tie_rebaja}
                                              activacion={r.uds_tie_activacion} ancho={72} />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <ShoppingBag className="h-3 w-3 text-muted-foreground shrink-0" />
                                <BarraCalidad full={r.uds_onl_full} rebaja={r.uds_onl_rebaja}
                                              activacion={r.uds_onl_activacion} ancho={72} />
                              </div>
                            </div>
                          </td>
                          <td className="p-2.5 text-right">
                            <span className={`tabular-nums ${stOk ? "text-emerald-700 font-medium" : ""}`}>
                              {nf(r.sell_through_pct, 1)}%
                            </span>
                            <div className="text-[10px] text-muted-foreground"
                                 title="Mediana de su cohorte: colección × categoría">
                              típico {nf(r.med_st_cohorte, 0)}%
                            </div>
                          </td>
                          <td className="p-2.5">
                            {(() => {
                              const pc = PERFIL_CANAL[r.perfil_canal];
                              return pc ? (
                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${pc.cls}`}>
                                  {pc.txt}
                                </span>
                              ) : null;
                            })()}
                            <div className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">
                              {nf(r.uds_tienda + r.uds_outlet)} tienda · {nf(r.uds_online)} online
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
                          <td className="p-2.5">
                            <div className="w-[104px] ml-auto">
                              <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-muted-foreground">Stock</span>
                                <span className="tabular-nums font-medium">{nf(r.stock_actual)}</span>
                              </div>
                              {r.stock_actual > 0 ? (
                                <>
                                  <div className="flex h-1.5 rounded-full overflow-hidden bg-muted mt-1">
                                    {(r.stock_tienda + r.stock_outlet) > 0 && (
                                      <div style={{ width: `${((r.stock_tienda + r.stock_outlet) / r.stock_actual) * 100}%`,
                                                    background: "#7c5cd6" }}
                                           title={`Tienda: ${nf(r.stock_tienda + r.stock_outlet)} uds`} />
                                    )}
                                    {r.stock_online > 0 && (
                                      <div style={{ width: `${(r.stock_online / r.stock_actual) * 100}%`,
                                                    background: "#2a9dd6" }}
                                           title={`Online: ${nf(r.stock_online)} uds`} />
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1">
                                    <span className="flex items-center gap-1">
                                      <Store className="h-2.5 w-2.5" />{nf(r.stock_tienda + r.stock_outlet)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <ShoppingBag className="h-2.5 w-2.5" />{nf(r.stock_online)}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    en {r.tiendas_con_stock} tienda{r.tiendas_con_stock === 1 ? "" : "s"}
                                  </div>
                                </>
                              ) : (
                                <div className="text-[10px] text-muted-foreground mt-1">Agotado</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">RDV vs. producto típico:</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />≥1,30×</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />1,00–1,29×</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />0,70–0,99×</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d03b3b" }} />&lt;0,70×</span>
              <span className="font-medium text-foreground ml-2">Calidad de venta:</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />Full</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />Rebaja</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />Activación</span>
              <span className="font-medium text-foreground ml-2">Stock:</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#7c5cd6" }} />Tienda</span>
              <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a9dd6" }} />Online</span>
              <span className="ml-2">Clic en la foto o el nombre para ver el detalle completo</span>
            </div>
          </div>

          {detalle && <Detalle r={detalle} onClose={() => setDetalle(null)} />}
        </main>
      </div>
    </SidebarProvider>
  );
}
