import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Download, HelpCircle, X, Store, Globe, Package } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Desempeño por categoría.
 * Lee la vista categoria_desempeno (agregado de mv_producto_clasificacion).
 *
 * Las medianas se calculan sobre productos, no sobre unidades: una categoría
 * con 225 productos no debe pesar más que una de 20 al comparar ritmos.
 * El volumen va aparte, como contexto.
 */

interface Row {
  categoria: string;
  categoria_padre: string | null;
  genero_norm: string | null;
  productos: number;
  excelente: number;
  bueno: number;
  regular: number;
  bajo: number;
  cobertura_critica: number;
  cobertura_ajustada: number;
  uds_vendidas: number;
  uds_tienda: number;
  uds_online: number;
  stock_actual: number;
  stock_en_riesgo: number | null;
  ros_mediano: number | null;
  ros_tienda_mediano: number | null;
  ros_online_mediano: number | null;
  wos_mediano: number | null;
  sell_through_mediano: number | null;
  pct_full_prom: number | null;
  semanas_prom: number | null;
  mix_online_pct: number | null;
  destallados: number;
  revisar_online: number;
}

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

/** Panel explicativo del RDV. Se despliega bajo el encabezado.
 *  RDV = Ritmo de Venta. NO usar "ROS" en interfaz: colisiona con Return on
 *  Sales (metrica financiera). En BD los campos siguen siendo ros_*. */
function ExplicaRDV({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3 relative">
      <button onClick={onClose}
              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground">
        <X className="h-4 w-4" />
      </button>

      <div>
        <h3 className="font-semibold text-sm">RDV — Ritmo de Venta</h3>
        <p className="text-muted-foreground mt-1">
          Unidades que vende un producto <strong className="text-foreground">por tienda y por
          semana</strong>. Responde: ¿a qué ritmo sale este producto de un perchero?
        </p>
      </div>

      <div className="rounded border bg-background p-3 font-mono text-xs">
        RDV = unidades vendidas ÷ semanas en venta ÷ tiendas donde está
      </div>

      <div>
        <p className="font-medium text-xs mb-1">Por qué se divide entre tiendas</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Un producto en 30 tiendas vende más unidades que uno en 5, aunque sea peor producto.
          Dividir entre tiendas quita el efecto de la distribución y deja solo el mérito del
          producto. Por eso el RDV <strong className="text-foreground">no mide volumen</strong>:
          un producto puede tener RDV excelente y haber vendido 12 unidades.
        </p>
      </div>

      <div>
        <p className="font-medium text-xs mb-1">Un RDV suelto no dice nada</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          0,25 es bueno para una camiseta y malo para una gorra: cada categoría tiene su ritmo
          natural. Por eso no se lee el RDV crudo, se lee el{" "}
          <strong className="text-foreground">índice contra la mediana de su cohorte</strong>{" "}
          (colección × categoría), en base 100.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { r: "≥ 130", t: "Supera a sus pares", c: "#2a78d6" },
          { r: "100–129", t: "Va al ritmo", c: "#0ca30c" },
          { r: "70–99", t: "Se acerca", c: "#c98500" },
          { r: "< 70", t: "Rezagado", c: "#d03b3b" },
        ].map(x => (
          <div key={x.r} className="rounded border bg-background p-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: x.c }} />
              <span className="font-medium">{x.r}</span>
            </div>
            <div className="text-muted-foreground mt-0.5">{x.t}</div>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">Cada canal se mide en su propia escala</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          En tienda física el RDV se divide entre tiendas. En online no: es una sola ubicación,
          así que se miden unidades por semana. Son escalas distintas y{" "}
          <strong className="text-foreground">nunca se promedian</strong>. Un producto puede tener
          índice 140 en online y 60 en tienda: funciona cuando lo buscan, no cuando compite en un
          perchero.
        </p>
      </div>

      <div className="border-t pt-3">
        <p className="font-medium text-xs mb-1">El RDV no es lo mismo que cobertura</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          El RDV dice si el producto gusta. La <strong className="text-foreground">cobertura</strong>{" "}
          (semanas de stock ÷ semanas restantes de temporada) dice si compraste bien. Un producto
          puede gustar mucho y estar sobrecomprado: se redistribuye, no se liquida.
        </p>
      </div>
    </div>
  );
}

/** Barra apilada de la distribución de desempeño dentro de la categoría. */
function MixDesempeno({ e, b, r, ba }: { e: number; b: number; r: number; ba: number }) {
  const t = e + b + r + ba;
  if (!t) return <span className="text-xs text-muted-foreground">—</span>;
  const seg = [
    { n: e, c: "#2a78d6", l: "Excelente" },
    { n: b, c: "#0ca30c", l: "Bueno" },
    { n: r, c: "#c98500", l: "Regular" },
    { n: ba, c: "#d03b3b", l: "Bajo" },
  ];
  return (
    <div className="w-[128px]">
      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
        {seg.map(s => s.n > 0 && (
          <div key={s.l} style={{ width: `${(s.n / t) * 100}%`, background: s.c }}
               title={`${s.l}: ${s.n}`} />
        ))}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
        {e + b} de {t} al ritmo o mejor
      </div>
    </div>
  );
}

export default function DesempenoCategoria() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [canal, setCanal] = useState<"total" | "tienda" | "online">("total");
  const [minProd, setMinProd] = useState("10");
  const [orden, setOrden] = useState<"riesgo" | "ros" | "wos" | "st" | "stock">("riesgo");
  const [ayuda, setAyuda] = useState(false);

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("categoria_desempeno")
        .select("*")
        .order("stock_actual", { ascending: false });
      if (!activo) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, []);

  const rosDe = (r: Row) =>
    canal === "tienda" ? r.ros_tienda_mediano
    : canal === "online" ? r.ros_online_mediano
    : r.ros_mediano;

  const udsDe = (r: Row) =>
    canal === "tienda" ? r.uds_tienda
    : canal === "online" ? r.uds_online
    : r.uds_vendidas;

  const visibles = useMemo(() => {
    const min = Number(minProd);
    const f = rows.filter(r => r.productos >= min);
    const cmp: Record<string, (a: Row, b: Row) => number> = {
      riesgo: (a, b) => (b.stock_en_riesgo ?? 0) - (a.stock_en_riesgo ?? 0),
      ros:    (a, b) => (rosDe(b) ?? 0) - (rosDe(a) ?? 0),
      wos:    (a, b) => (b.wos_mediano ?? 0) - (a.wos_mediano ?? 0),
      st:     (a, b) => (a.sell_through_mediano ?? 0) - (b.sell_through_mediano ?? 0),
      stock:  (a, b) => b.stock_actual - a.stock_actual,
    };
    return [...f].sort(cmp[orden]);
  }, [rows, minProd, orden, canal]);

  const tot = useMemo(() => ({
    categorias: visibles.length,
    productos: visibles.reduce((s, r) => s + r.productos, 0),
    stock: visibles.reduce((s, r) => s + r.stock_actual, 0),
    riesgo: visibles.reduce((s, r) => s + (r.stock_en_riesgo ?? 0), 0),
  }), [visibles]);

  const exportar = () => {
    if (!visibles.length) return;
    const datos = visibles.map(r => ({
      Categoría: r.categoria,
      Productos: r.productos,
      Excelente: r.excelente, Bueno: r.bueno, Regular: r.regular, Bajo: r.bajo,
      "RDV mediano (uds/tienda/sem)": r.ros_mediano,
      "RDV tienda (uds/tienda/sem)": r.ros_tienda_mediano,
      "RDV online (uds/sem)": r.ros_online_mediano,
      "WOS mediano": r.wos_mediano,
      "Sell-through mediano %": r.sell_through_mediano,
      "Venta full % prom": r.pct_full_prom,
      "Semanas prom": r.semanas_prom,
      "Uds vendidas": r.uds_vendidas,
      "Uds tienda": r.uds_tienda,
      "Uds online": r.uds_online,
      "Mix online %": r.mix_online_pct,
      "Stock actual": r.stock_actual,
      "Stock en riesgo": r.stock_en_riesgo ?? 0,
      "Cobertura crítica": r.cobertura_critica,
      "Cobertura ajustada": r.cobertura_ajustada,
      Destallados: r.destallados,
      "Revisar online": r.revisar_online,
    }));
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws, [
      ["Desempeño por categoría — RDV (Ritmo de Venta) = unidades por tienda-semana; medianas sobre productos"],
      [`Stock en riesgo = desempeño bajo + cobertura crítica · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 26 }, ...Array(22).fill({ wch: 13 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Categorías");
    XLSX.writeFile(wb, "desempeno-categoria.xlsx");
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-base font-semibold leading-tight">Desempeño por categoría</h1>
              <p className="text-xs text-muted-foreground">
                Medianas calculadas sobre productos, no sobre unidades
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setAyuda(v => !v)}>
              <HelpCircle className="h-4 w-4 mr-1.5" />¿Qué es el RDV?
            </Button>
          </header>

          <div className="p-4 space-y-4">
            {ayuda && <ExplicaRDV onClose={() => setAyuda(false)} />}

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5">
                {([
                  { v: "total",  l: "Todos los canales", i: Package },
                  { v: "tienda", l: "Tienda física",     i: Store },
                  { v: "online", l: "Online",            i: Globe },
                ] as const).map(c => (
                  <button key={c.v} onClick={() => setCanal(c.v)}
                    className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                      canal === c.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}>
                    <c.i className="h-3.5 w-3.5" />{c.l}
                  </button>
                ))}
              </div>

              <Select value={orden} onValueChange={v => setOrden(v as typeof orden)}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="riesgo">Stock en riesgo</SelectItem>
                  <SelectItem value="ros">RDV mediano</SelectItem>
                  <SelectItem value="wos">Semanas de cobertura</SelectItem>
                  <SelectItem value="st">Sell-through (menor primero)</SelectItem>
                  <SelectItem value="stock">Stock total</SelectItem>
                </SelectContent>
              </Select>

              <Select value={minProd} onValueChange={setMinProd}>
                <SelectTrigger className="w-[175px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Todas las categorías</SelectItem>
                  <SelectItem value="5">Mínimo 5 productos</SelectItem>
                  <SelectItem value="10">Mínimo 10 productos</SelectItem>
                  <SelectItem value="20">Mínimo 20 productos</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" className="ml-auto"
                      onClick={exportar} disabled={!visibles.length}>
                <Download className="h-4 w-4 mr-1.5" />Excel
              </Button>
            </div>

            {loading ? (
              <div className="p-6"><LoadingState rows={8} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : !visibles.length ? (
              <EmptyState message="No hay categorías con ese mínimo de productos." />
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { l: "Categorías", v: nf(tot.categorias) },
                    { l: "Productos", v: nf(tot.productos) },
                    { l: "Stock total", v: nf(tot.stock) },
                    { l: "Stock en riesgo", v: nf(tot.riesgo), alerta: true },
                  ].map(k => (
                    <div key={k.l} className={`rounded-lg border p-3 ${
                      k.alerta ? "border-rose-200 bg-rose-50" : ""}`}>
                      <div className={`text-xs ${k.alerta ? "text-rose-700" : "text-muted-foreground"}`}>
                        {k.l}
                      </div>
                      <div className="text-xl font-semibold tabular-nums mt-0.5">{k.v}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="text-left p-2.5 font-medium">Categoría</th>
                        <th className="text-right p-2.5 font-medium">Prod.</th>
                        <th className="text-left p-2.5 font-medium">Mix de desempeño</th>
                        <th className="text-right p-2.5 font-medium">RDV med.<div className="font-normal text-[10px] opacity-70">{canal === "online" ? "uds/sem" : "uds/tienda/sem"}</div></th>
                        <th className="text-right p-2.5 font-medium">Cobertura</th>
                        <th className="text-right p-2.5 font-medium">Sell-thr.</th>
                        <th className="text-right p-2.5 font-medium">% full</th>
                        <th className="text-right p-2.5 font-medium">Mix online</th>
                        <th className="text-right p-2.5 font-medium">Vendido</th>
                        <th className="text-right p-2.5 font-medium">Stock</th>
                        <th className="text-right p-2.5 font-medium">En riesgo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map(r => (
                        <tr key={r.categoria} className="border-b hover:bg-muted/20">
                          <td className="p-2.5 font-medium min-w-[180px]">{r.categoria}</td>
                          <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                            {r.productos}
                          </td>
                          <td className="p-2.5">
                            <MixDesempeno e={r.excelente} b={r.bueno} r={r.regular} ba={r.bajo} />
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{nf(rosDe(r), 3)}</td>
                          <td className="p-2.5 text-right tabular-nums">
                            <span className={
                              (r.wos_mediano ?? 0) > 30 ? "text-rose-700 font-medium"
                              : (r.wos_mediano ?? 0) > 16 ? "text-amber-700" : ""}>
                              {nf(r.wos_mediano, 1)}
                            </span>
                            <div className="text-[10px] text-muted-foreground">semanas</div>
                          </td>
                          <td className="p-2.5 text-right tabular-nums">
                            <span className={
                              (r.sell_through_mediano ?? 0) < 45 ? "text-rose-700 font-medium"
                              : (r.sell_through_mediano ?? 0) >= 75 ? "text-emerald-700" : ""}>
                              {nf(r.sell_through_mediano, 1)}%
                            </span>
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                            {nf(r.pct_full_prom, 0)}%
                          </td>
                          <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                            {nf(r.mix_online_pct, 1)}%
                          </td>
                          <td className="p-2.5 text-right tabular-nums">{nf(udsDe(r))}</td>
                          <td className="p-2.5 text-right tabular-nums">{nf(r.stock_actual)}</td>
                          <td className="p-2.5 text-right tabular-nums">
                            {r.stock_en_riesgo ? (
                              <span className="text-rose-700 font-medium">
                                {nf(r.stock_en_riesgo)}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Mix de desempeño:</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />Excelente</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />Bueno</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />Regular</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d03b3b" }} />Bajo</span>
                  <span className="ml-2">Stock en riesgo = desempeño bajo + cobertura crítica</span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
