import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionBadge } from "@/components/dashboard/CollectionBadge";
import { Download, Search, RotateCcw, Info } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { exportToCSV } from "@/lib/csv-export";

/**
 * Pantalla de VALIDACION de la clasificacion de producto.
 * Lee mv_producto_clasificacion (materializada, refresco diario post-snapshot).
 * No reemplaza a DesempenoProductos ni a BajaRotacion: existe para que el equipo
 * comercial contraste el criterio antes de conectarlo a los modulos en uso.
 */

interface Row {
  product_id: string;
  title: string;
  category: string;
  genero: string | null;
  coleccion: string;
  anio: number | null;
  tipo: string | null;
  semanas_en_venta: number;
  semanas_objetivo: number;
  fuera_de_ventana: boolean;
  unidades_vendidas: number;
  stock_actual: number;
  tiendas_con_stock: number;
  pct_venta_full: number | null;
  profundidad_desc_pct: number | null;
  sell_through_pct: number | null;
  ros: number | null;
  ros_mediano_categoria: number | null;
  wos: number | null;
  indice_ros: number | null;
  ratio_cobertura: number | null;
  base_cohorte: string;
  desempeno: string;
  cobertura: string;
  accion: string;
}

const DESEMPENOS = ["EXCELENTE", "BUENO", "REGULAR", "BAJO"] as const;
const COBERTURAS = ["AJUSTADA", "SANA", "ALTA", "CRITICA"] as const;

const DESEMPENO_STYLE: Record<string, string> = {
  EXCELENTE: "bg-emerald-100 text-emerald-700 border-emerald-200",
  BUENO: "bg-teal-100 text-teal-700 border-teal-200",
  REGULAR: "bg-amber-100 text-amber-700 border-amber-200",
  BAJO: "bg-rose-100 text-rose-700 border-rose-200",
  AGOTADO: "bg-slate-100 text-slate-600 border-slate-200",
  "SIN VENTA": "bg-slate-100 text-slate-600 border-slate-200",
};

const COBERTURA_STYLE: Record<string, string> = {
  AJUSTADA: "bg-sky-100 text-sky-700 border-sky-200",
  SANA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ALTA: "bg-amber-100 text-amber-700 border-amber-200",
  CRITICA: "bg-rose-100 text-rose-700 border-rose-200",
  "SIN STOCK": "bg-slate-100 text-slate-600 border-slate-200",
  "SIN REFERENCIA": "bg-slate-100 text-slate-600 border-slate-200",
};

function Chip({ text, styles }: { text: string; styles: Record<string, string> }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
        styles[text] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {text}
    </span>
  );
}

const nf = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined ? "—" : Number(v).toLocaleString("es-CO", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

export default function ValidacionClasificacion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [coleccion, setColeccion] = useState("all");
  const [categoria, setCategoria] = useState("all");
  const [desempeno, setDesempeno] = useState("all");
  const [cobertura, setCobertura] = useState("all");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("mv_producto_clasificacion")
        .select("*")
        .order("stock_actual", { ascending: false })
        .limit(5000); // el default de PostgREST es 1000 y hoy hay ~1.041 filas
      if (!activo) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, []);

  const colecciones = useMemo(
    () => Array.from(new Set(rows.map(r => r.coleccion).filter(Boolean))).sort(),
    [rows]
  );
  const categorias = useMemo(
    () => Array.from(new Set(rows.map(r => r.category).filter(Boolean))).sort(),
    [rows]
  );

  // Base de la matriz: respeta coleccion y categoria, ignora los filtros de la propia matriz
  const baseMatriz = useMemo(
    () => rows.filter(r =>
      (coleccion === "all" || r.coleccion === coleccion) &&
      (categoria === "all" || r.category === categoria)
    ),
    [rows, coleccion, categoria]
  );

  const celda = (d: string, c: string) => {
    const items = baseMatriz.filter(r => r.desempeno === d && r.cobertura === c);
    return { n: items.length, uds: items.reduce((s, r) => s + (r.stock_actual || 0), 0) };
  };

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return baseMatriz.filter(r =>
      (desempeno === "all" || r.desempeno === desempeno) &&
      (cobertura === "all" || r.cobertura === cobertura) &&
      (!q || r.title?.toLowerCase().includes(q) || r.product_id?.toLowerCase().includes(q))
    );
  }, [baseMatriz, desempeno, cobertura, busqueda]);

  const totales = useMemo(() => ({
    productos: filtered.length,
    unidades: filtered.reduce((s, r) => s + (r.stock_actual || 0), 0),
    vendidas: filtered.reduce((s, r) => s + (r.unidades_vendidas || 0), 0),
  }), [filtered]);

  const limpiar = () => {
    setColeccion("all"); setCategoria("all");
    setDesempeno("all"); setCobertura("all"); setBusqueda("");
  };

  const exportar = () => {
    if (!filtered.length) return;
    exportToCSV(
      filtered.map(r => ({
        Producto: r.title,
        Categoria: r.category,
        Coleccion: r.coleccion,
        Anio: r.anio ?? "",
        Tipo: r.tipo ?? "",
        "Semanas en venta": r.semanas_en_venta,
        "Semanas objetivo": r.semanas_objetivo,
        "Fuera de ventana": r.fuera_de_ventana ? "Si" : "No",
        "Uds vendidas": r.unidades_vendidas,
        "Stock actual": r.stock_actual,
        "Tiendas con stock": r.tiendas_con_stock,
        ROS: r.ros,
        "ROS mediano categoria": r.ros_mediano_categoria,
        "Indice ROS": r.indice_ros,
        WOS: r.wos,
        "Ratio cobertura": r.ratio_cobertura,
        "Sell-through %": r.sell_through_pct,
        "Venta full %": r.pct_venta_full,
        "Profundidad desc %": r.profundidad_desc_pct,
        "Base cohorte": r.base_cohorte,
        Desempeno: r.desempeno,
        Cobertura: r.cobertura,
        Accion: r.accion,
      })),
      "validacion-clasificacion-producto"
    );
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div>
              <h1 className="text-base font-semibold leading-tight">
                Validación · Clasificación de producto
              </h1>
              <p className="text-xs text-muted-foreground">
                Pantalla de contraste. No alimenta todavía Desempeño ni Baja Rotación.
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Criterio, visible para poder discutirlo */}
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <strong className="text-foreground">Desempeño</strong> compara el ROS del producto
                (unidades por tienda-semana) contra la mediana de su cohorte —colección × categoría—:
                Excelente ≥ 1,80 · Bueno ≥ 1,30 · Regular ≥ 0,70 · Bajo &lt; 0,70.{" "}
                <strong className="text-foreground">Cobertura</strong> divide las semanas de
                inventario entre las semanas que le quedan de ventana (16 semanas, mínimo 8 para
                liquidar): Ajustada &lt; 0,8 · Sana ≤ 1,2 · Alta ≤ 2,5 · Crítica &gt; 2,5.
              </p>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar producto…"
                  className="pl-8 w-[220px]"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>

              <Select value={coleccion} onValueChange={setColeccion}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las colecciones</SelectItem>
                  {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las categorías</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Button variant="ghost" size="sm" onClick={limpiar}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Limpiar
              </Button>

              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {nf(totales.productos)} productos · {nf(totales.unidades)} uds en stock ·{" "}
                  {nf(totales.vendidas)} vendidas
                </span>
                <Button variant="outline" size="sm" onClick={exportar} disabled={!filtered.length}>
                  <Download className="h-4 w-4 mr-1.5" /> CSV
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="p-6"><LoadingState rows={10} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar la clasificación: {error}
              </div>
            ) : (
              <>
                {/* Matriz: clic en una celda filtra la tabla */}
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2.5 text-xs font-medium text-muted-foreground w-[140px]">
                          Desempeño ↓ / Cobertura →
                        </th>
                        {COBERTURAS.map(c => (
                          <th key={c} className="p-2.5 text-xs font-medium">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DESEMPENOS.map(d => (
                        <tr key={d} className="border-b last:border-0">
                          <td className="p-2.5">
                            <Chip text={d} styles={DESEMPENO_STYLE} />
                          </td>
                          {COBERTURAS.map(c => {
                            const { n, uds } = celda(d, c);
                            const activa = desempeno === d && cobertura === c;
                            return (
                              <td key={c} className="p-1.5 text-center">
                                <button
                                  type="button"
                                  disabled={!n}
                                  onClick={() => {
                                    if (activa) { setDesempeno("all"); setCobertura("all"); }
                                    else { setDesempeno(d); setCobertura(c); }
                                  }}
                                  className={`w-full rounded-md py-2 px-1 transition-colors ${
                                    activa ? "bg-primary text-primary-foreground"
                                    : n ? "hover:bg-muted" : "opacity-30 cursor-default"
                                  }`}
                                >
                                  <div className="text-base font-semibold leading-none">{n}</div>
                                  <div className="text-[10px] opacity-70 mt-1">{nf(uds)} uds</div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Detalle */}
                {!filtered.length ? (
                  <EmptyState message="No hay productos para estos filtros." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[220px]">Producto</TableHead>
                          <TableHead>Colección</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Sem.</TableHead>
                          <TableHead className="text-right">Uds vend.</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">ROS</TableHead>
                          <TableHead className="text-right">Mediana cat.</TableHead>
                          <TableHead className="text-right">Índice</TableHead>
                          <TableHead className="text-right">WOS</TableHead>
                          <TableHead className="text-right">Ratio cob.</TableHead>
                          <TableHead className="text-right">ST %</TableHead>
                          <TableHead className="text-right">Full %</TableHead>
                          <TableHead>Desempeño</TableHead>
                          <TableHead>Cobertura</TableHead>
                          <TableHead className="min-w-[200px]">Acción sugerida</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.slice(0, 300).map(r => (
                          <TableRow key={r.product_id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="line-clamp-1">{r.title}</span>
                                {r.fuera_de_ventana && (
                                  <span className="text-[10px] rounded border border-border px-1 py-0.5 text-muted-foreground whitespace-nowrap">
                                    fuera de ventana
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell><CollectionBadge coleccion={r.coleccion} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{r.category}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.semanas_en_venta}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.unidades_vendidas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.stock_actual)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.ros, 3)}</TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {nf(r.ros_mediano_categoria, 3)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {nf(r.indice_ros, 2)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.wos, 1)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.ratio_cobertura, 2)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.sell_through_pct, 1)}</TableCell>
                            <TableCell className="text-right tabular-nums">{nf(r.pct_venta_full, 1)}</TableCell>
                            <TableCell><Chip text={r.desempeno} styles={DESEMPENO_STYLE} /></TableCell>
                            <TableCell><Chip text={r.cobertura} styles={COBERTURA_STYLE} /></TableCell>
                            <TableCell className="text-xs">{r.accion}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filtered.length > 300 && (
                      <div className="p-2.5 text-center text-xs text-muted-foreground border-t">
                        Mostrando 300 de {nf(filtered.length)}. Filtra o exporta el CSV para ver el resto.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
