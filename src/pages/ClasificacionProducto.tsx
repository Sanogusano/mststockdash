import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, RotateCcw, Download, Package, Store, Globe } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Clasificacion de producto — vista operativa.
 * Lee mv_producto_clasificacion (materializada, refresco diario post-snapshot).
 *
 * Dos ejes:
 *   Velocidad de rotacion — indice base 100 contra la mediana de su cohorte
 *     (coleccion x categoria). 100 = va al ritmo de sus pares.
 *   Cobertura — semanas de inventario vs. semanas restantes de ventana comercial.
 *
 * Zoom por canal: cada canal se compara SOLO contra su propio canal.
 *   Tienda  -> unidades por tienda-semana
 *   Online  -> unidades por semana (una sola ubicacion, no se divide)
 * Nunca se promedian indices de canales distintos: son escalas diferentes.
 * Un producto que nunca estuvo en un canal tiene indice null (no aplica), no cero.
 */

interface Row {
  product_id: string;
  title: string;
  category: string;
  genero: string | null;
  coleccion: string;
  anio: number | null;
  tipo: string | null;
  image_url: string | null;
  dias_en_venta: number;
  semanas_en_venta: number;
  semanas_objetivo: number;
  fuera_de_ventana: boolean;
  unidades_vendidas: number;
  uds_tienda: number;
  uds_online: number;
  stock_actual: number;
  stock_online: number;
  tiendas_con_stock: number;
  tiendas_con_venta: number;
  pct_venta_full: number | null;
  sell_through_pct: number | null;
  estuvo_en_online: boolean;
  estuvo_en_tienda: boolean;
  ros_total: number | null;
  ros_tienda: number | null;
  ros_online: number | null;
  wos: number | null;
  indice_total: number | null;
  indice_tienda: number | null;
  indice_online: number | null;
  mix_online_pct: number | null;
  mix_online_cat: number | null;
  perfil_canal: string;
  ratio_cobertura: number | null;
  desempeno: string;
  cobertura: string;
}

const VENTANA = 16; // semanas de ventana comercial

const nf = (v: number | null | undefined, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

/** Corte de color del indice de rotacion. 100 = mediana de su cohorte. */
function nivelIndice(i: number | null) {
  if (i == null) return { color: "#898781", label: "Sin dato" };
  if (i >= 130)  return { color: "#2a78d6", label: "Supera" };
  if (i >= 100)  return { color: "#0ca30c", label: "Al ritmo" };
  if (i >= 70)   return { color: "#c98500", label: "Se acerca" };
  return { color: "#d03b3b", label: "Rezagado" };
}

const PERFIL = {
  fuerte_online:  { txt: "Fuerte en online",  cls: "bg-sky-100 text-sky-700 border-sky-200" },
  fuerte_tienda:  { txt: "Fuerte en tienda",  cls: "bg-violet-100 text-violet-700 border-violet-200" },
  solo_online:    { txt: "Solo online",       cls: "bg-sky-100 text-sky-700 border-sky-200" },
  solo_tienda:    { txt: "Solo tienda",       cls: "bg-violet-100 text-violet-700 border-violet-200" },
  equilibrado:    { txt: "",                  cls: "" },
} as const;

const COBERTURA_CLS: Record<string, string> = {
  AJUSTADA: "text-sky-700",
  SANA: "text-emerald-700",
  ALTA: "text-amber-700",
  CRITICA: "text-rose-700",
  "SIN STOCK": "text-muted-foreground",
};

/** Barra de vida: semanas transcurridas dentro de la ventana comercial. */
function BarraVida({ sem, dias, fuera }: { sem: number; dias: number; fuera: boolean }) {
  const pct = Math.min(100, (sem / VENTANA) * 100);
  return (
    <div className="w-[104px]">
      <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: fuera ? "#d03b3b" : "var(--primary)" }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
        sem {sem} de {VENTANA} · {nf(dias)} días
      </div>
    </div>
  );
}

/** Barra de rotacion con checkpoint en 100 (mediana de la cohorte). */
function BarraRotacion({ indice, ros }: { indice: number | null; ros: number | null }) {
  const { color, label } = nivelIndice(indice);
  if (indice == null) {
    return <span className="text-xs text-muted-foreground">No aplica</span>;
  }
  const MAX = 200;               // 100 queda al 50% del ancho
  const pct = Math.min(100, (indice / MAX) * 100);
  return (
    <div className="w-[132px]">
      <div className="relative h-4">
        <div className="absolute top-1 inset-x-0 h-2 rounded-full bg-muted" />
        <div
          className="absolute top-1 left-0 h-2 rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
        <div className="absolute top-0 h-4 w-0.5 bg-foreground" style={{ left: "50%" }} />
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-sm font-medium tabular-nums" style={{ color }}>{indice}</span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
        {ros != null && (
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">
            {nf(ros, 2)}/sem
          </span>
        )}
      </div>
    </div>
  );
}

/** Cobertura: verde = lo que alcanza a venderse, rojo = sobrante al cierre.
 *  La barra se topa en 52 semanas: por encima de un año el número exacto no
 *  aporta (todo es "no rota") y aplasta visualmente al resto de la tabla.
 *  El valor sin topar sigue en el Excel. */
function BarraCobertura({ wos, objetivo, estado }: {
  wos: number | null; objetivo: number; estado: string;
}) {
  if (wos == null || estado === "SIN STOCK") {
    return <span className="text-xs text-muted-foreground">Agotado</span>;
  }
  const TOPE = 52;
  const excede = wos > TOPE;
  const wosVis = Math.min(wos, TOPE);
  const total = Math.max(wosVis, objetivo);
  const pctVendible = (Math.min(wosVis, objetivo) / total) * 100;
  const pctStock = (wosVis / total) * 100;
  const pctCierre = (objetivo / total) * 100;
  return (
    <div className="w-[128px]">
      <div className="relative h-4">
        <div
          className="absolute top-1 left-0 h-2"
          style={{
            width: `${pctStock}%`,
            background: "#d03b3b",
            borderRadius: excede ? "9999px 2px 2px 9999px" : "9999px",
          }}
        />
        <div
          className="absolute top-1 left-0 h-2 rounded-l-full"
          style={{ width: `${pctVendible}%`, background: "#0ca30c" }}
        />
        <div
          className="absolute top-0 h-4 w-0.5 bg-foreground"
          style={{ left: `calc(${pctCierre}% - 1px)` }}
        />
      </div>
      <div className="text-[10px] mt-1 whitespace-nowrap">
        <span className={`font-medium ${COBERTURA_CLS[estado] ?? ""}`}
              title={excede ? `${nf(wos, 0)} semanas` : undefined}>
          {excede ? "+52" : nf(wos, 0)} sem de stock
        </span>
        <span className="text-muted-foreground"> · quedan {objetivo}</span>
      </div>
    </div>
  );
}

export default function ClasificacionProducto() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [canal, setCanal] = useState<"total" | "tienda" | "online">("total");
  const [coleccion, setColeccion] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [desempeno, setDesempeno] = useState("all");
  const [cobertura, setCobertura] = useState("all");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      // PostgREST corta en 1.000 filas por defecto (db-max-rows manda sobre
      // .limit del cliente). Se pagina con .range hasta traer todo, o los KPI
      // se calculan sobre un subconjunto sin avisar.
      const PAGINA = 1000;
      const acumulado: Row[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("mv_producto_clasificacion")
            .select("*")
            .order("stock_actual", { ascending: false })
            .order("product_id", { ascending: true })   // desempate estable entre páginas
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acumulado.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 50000) break;                     // tope de seguridad
        }
        if (!activo) return;
        setRows(acumulado);
      } catch (e: any) {
        if (!activo) return;
        setError(e?.message ?? String(e));
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

  const indiceDe = (r: Row) =>
    canal === "tienda" ? r.indice_tienda
    : canal === "online" ? r.indice_online
    : r.indice_total;

  const rosDe = (r: Row) =>
    canal === "tienda" ? r.ros_tienda
    : canal === "online" ? r.ros_online
    : r.ros_total;

  const udsDe = (r: Row) =>
    canal === "tienda" ? r.uds_tienda
    : canal === "online" ? r.uds_online
    : r.unidades_vendidas;

  const base = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r =>
      (coleccion === "all" || r.coleccion === coleccion) &&
      (categoria === "all" || r.category === categoria) &&
      (!q || r.title?.toLowerCase().includes(q)) &&
      // Al hacer zoom a un canal, salen los productos que nunca estuvieron ahi:
      // su indice es "no aplica", no un cero comparable.
      (canal === "total" ||
        (canal === "tienda" ? r.estuvo_en_tienda : r.estuvo_en_online))
    );
  }, [rows, coleccion, categoria, busqueda, canal]);

  const filtered = useMemo(() => base.filter(r =>
    (desempeno === "all" || r.desempeno === desempeno) &&
    (cobertura === "all" || r.cobertura === cobertura)
  ), [base, desempeno, cobertura]);

  const kpis = useMemo(() => {
    const liquidar = base.filter(r => r.desempeno === "BAJO" && r.cobertura === "CRITICA");
    const redistribuir = base.filter(r =>
      ["EXCELENTE", "BUENO"].includes(r.desempeno) && ["ALTA", "CRITICA"].includes(r.cobertura));
    const reponer = base.filter(r =>
      ["EXCELENTE", "BUENO"].includes(r.desempeno) && r.cobertura === "AJUSTADA");
    return {
      total: base.length,
      stock: base.reduce((s, r) => s + (r.stock_actual || 0), 0),
      liquidar, redistribuir, reponer,
    };
  }, [base]);

  const limpiar = () => {
    setColeccion("all"); setCategoria("all");
    setDesempeno("all"); setCobertura("all"); setBusqueda("");
  };

  const exportar = () => {
    if (!filtered.length) return;
    const wb = XLSX.utils.book_new();
    const datos = filtered.map(r => ({
      Producto: r.title,
      Categoria: r.category,
      Coleccion: r.coleccion,
      "Semanas en venta": r.semanas_en_venta,
      "Días en venta": r.dias_en_venta,
      "Índice total": r.indice_total,
      "Índice tienda": r.indice_tienda,
      "Índice online": r.indice_online,
      "Uds tienda": r.uds_tienda,
      "Uds online": r.uds_online,
      "Uds total": r.unidades_vendidas,
      "Mix online %": r.mix_online_pct,
      "Mix online categoría %": r.mix_online_cat,
      "Perfil canal": r.perfil_canal,
      Stock: r.stock_actual,
      "Semanas de stock": r.wos,
      "Semanas restantes": r.semanas_objetivo,
      "Sell-through %": r.sell_through_pct,
      "Venta full %": r.pct_venta_full,
      Desempeño: r.desempeno,
      Cobertura: r.cobertura,
    }));
    const ws = XLSX.utils.aoa_to_sheet([[], []]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws, [
      ["Clasificación de producto — índice base 100 = mediana de su cohorte (colección × categoría)"],
      [`Ventana comercial ${VENTANA} semanas · métricas desde la primera venta de cada producto · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 42 }, { wch: 20 }, { wch: 14 }, ...Array(18).fill({ wch: 13 })];
    XLSX.utils.book_append_sheet(wb, ws, "Clasificación");
    XLSX.writeFile(wb, `clasificacion-producto-${canal}.xlsx`);
  };

  const Kpi = ({ label, n, uds, onClick, activo }: {
    label: string; n: number; uds: number; onClick: () => void; activo: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition-colors ${
        activo ? "border-primary bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(n)}</div>
      <div className="text-[11px] text-muted-foreground">{nf(uds)} uds</div>
    </button>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div>
              <h1 className="text-base font-semibold leading-tight">Clasificación de producto</h1>
              <p className="text-xs text-muted-foreground">
                Índice 100 = ritmo de su cohorte · ventana comercial {VENTANA} semanas ·
                métricas desde la primera venta de cada producto
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Zoom por canal */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5">
                {([
                  { v: "total",  l: "Todos los canales", icon: Package },
                  { v: "tienda", l: "Tienda física",     icon: Store },
                  { v: "online", l: "Online",            icon: Globe },
                ] as const).map(c => (
                  <button
                    key={c.v}
                    onClick={() => setCanal(c.v)}
                    className={`px-3 py-1.5 text-xs rounded flex items-center gap-1.5 ${
                      canal === c.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    <c.icon className="h-3.5 w-3.5" />{c.l}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar producto…" className="pl-8 w-[200px]"
                       value={busqueda} onChange={e => setBusqueda(e.target.value)} />
              </div>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[320px]">
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={limpiar}>
                <RotateCcw className="h-4 w-4 mr-1.5" />Limpiar
              </Button>

              <Button variant="outline" size="sm" className="ml-auto"
                      onClick={exportar} disabled={!filtered.length}>
                <Download className="h-4 w-4 mr-1.5" />Excel
              </Button>
            </div>

            {canal === "online" && (
              <p className="text-xs text-muted-foreground">
                En online el índice compara unidades por semana contra otros productos de su
                categoría en online. No se divide entre tiendas ni se mezcla con el índice de
                piso: son escalas distintas.
              </p>
            )}

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar la clasificación: {error}
              </div>
            ) : (
              <>
                {/* Acciones */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground">Productos</div>
                    <div className="text-xl font-semibold tabular-nums mt-0.5">{nf(kpis.total)}</div>
                    <div className="text-[11px] text-muted-foreground">{nf(kpis.stock)} uds en stock</div>
                  </div>
                  <Kpi label="Liquidar" n={kpis.liquidar.length}
                       uds={kpis.liquidar.reduce((s, r) => s + r.stock_actual, 0)}
                       activo={desempeno === "BAJO" && cobertura === "CRITICA"}
                       onClick={() => {
                         const on = desempeno === "BAJO" && cobertura === "CRITICA";
                         setDesempeno(on ? "all" : "BAJO");
                         setCobertura(on ? "all" : "CRITICA");
                       }} />
                  <Kpi label="Redistribuir" n={kpis.redistribuir.length}
                       uds={kpis.redistribuir.reduce((s, r) => s + r.stock_actual, 0)}
                       activo={desempeno === "BUENO" && cobertura === "CRITICA"}
                       onClick={() => {
                         const on = desempeno === "BUENO" && cobertura === "CRITICA";
                         setDesempeno(on ? "all" : "BUENO");
                         setCobertura(on ? "all" : "CRITICA");
                       }} />
                  <Kpi label="Reponer" n={kpis.reponer.length}
                       uds={kpis.reponer.reduce((s, r) => s + r.stock_actual, 0)}
                       activo={desempeno === "EXCELENTE" && cobertura === "AJUSTADA"}
                       onClick={() => {
                         const on = desempeno === "EXCELENTE" && cobertura === "AJUSTADA";
                         setDesempeno(on ? "all" : "EXCELENTE");
                         setCobertura(on ? "all" : "AJUSTADA");
                       }} />
                </div>

                {!filtered.length ? (
                  <EmptyState message="No hay productos para estos filtros." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                          <th className="text-left p-2.5 font-medium">Vida</th>
                          <th className="text-left p-2.5 font-medium">Velocidad de rotación</th>
                          <th className="text-left p-2.5 font-medium">Cobertura</th>
                          <th className="text-right p-2.5 font-medium">Ventas</th>
                          <th className="text-right p-2.5 font-medium">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 200).map(r => {
                          const perfil = PERFIL[r.perfil_canal as keyof typeof PERFIL];
                          return (
                            <tr key={r.product_id} className="border-b hover:bg-muted/20">
                              <td className="p-2 w-[52px]">
                                {r.image_url ? (
                                  <img src={r.image_url} alt=""
                                       className="h-11 w-11 rounded object-cover bg-muted"
                                       loading="lazy" />
                                ) : (
                                  <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                                    <Package className="h-4 w-4 text-muted-foreground/50" />
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 min-w-[210px]">
                                <div className="font-medium leading-tight line-clamp-1">{r.title}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {r.category} · {r.coleccion}
                                </div>
                                {perfil?.txt && (
                                  <span className={`inline-block mt-1 text-[10px] rounded border px-1.5 py-0.5 ${perfil.cls}`}>
                                    {perfil.txt}
                                  </span>
                                )}
                              </td>
                              <td className="p-2.5">
                                <BarraVida sem={r.semanas_en_venta} dias={r.dias_en_venta}
                                           fuera={r.fuera_de_ventana} />
                              </td>
                              <td className="p-2.5">
                                <BarraRotacion indice={indiceDe(r)} ros={rosDe(r)} />
                              </td>
                              <td className="p-2.5">
                                <BarraCobertura wos={r.wos} objetivo={r.semanas_objetivo}
                                                estado={r.cobertura} />
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="font-medium tabular-nums">{nf(udsDe(r))}</div>
                                {canal === "total" && (
                                  <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                    {nf(r.uds_tienda)} tienda · {nf(r.uds_online)} online
                                  </div>
                                )}
                              </td>
                              <td className="p-2.5 text-right">
                                <div className="tabular-nums">{nf(r.stock_actual)}</div>
                                <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {r.tiendas_con_stock} tiendas
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filtered.length > 200 && (
                      <div className="p-2.5 text-center text-xs text-muted-foreground border-t">
                        Mostrando 200 de {nf(filtered.length)}. Filtra o exporta el Excel.
                      </div>
                    )}
                  </div>
                )}

                {/* Leyenda */}
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground pt-1">
                  <span className="font-medium text-foreground">Rotación:</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#2a78d6" }} />≥130 supera</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />100–129 al ritmo</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#c98500" }} />70–99 se acerca</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d03b3b" }} />&lt;70 rezagado</span>
                  <span className="font-medium text-foreground ml-2">Cobertura:</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#0ca30c" }} />se vende antes del cierre</span>
                  <span><i className="inline-block h-2 w-2 rounded-sm mr-1" style={{ background: "#d03b3b" }} />sobrante</span>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
