import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download, Package, AlertTriangle, Clock, ImageOff, PackageX } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Salud de publicacion — diagnostico operativo del canal online.
 *
 * Responde: ¿el producto esta en condiciones de venderse online?
 * NO responde si el producto es bueno — eso es la Clasificacion de producto.
 *
 * El caso central es `revisar_online`: producto con foto, con demanda probada
 * en tienda, con stock asignado a la ubicacion online, y CERO venta web despues
 * de mas de 4 semanas. Si aparece con indice online bajo en la clasificacion,
 * el sistema estaria culpando al producto de un problema de publicacion.
 */

interface Row {
  product_id: string;
  title: string;
  category: string;
  coleccion: string;
  image_url: string | null;
  semanas_en_venta: number;
  dias_en_venta: number;
  fecha_inicio: string | null;
  uds_tienda: number;
  uds_online: number;
  stock_actual: number;
  stock_online: number;
  tiendas_con_stock: number;
  estado_online: string;
  estado_tallas: string;
}

const ESTADOS = {
  revisar_online: {
    label: "Revisar publicación",
    desc: "Con foto y demanda en tienda, stock online disponible, sin una sola venta web en más de 4 semanas.",
    icon: AlertTriangle,
    cls: "border-rose-200 bg-rose-50 text-rose-700",
    prioridad: 1,
  },
  sin_foto: {
    label: "Sin fotografía",
    desc: "No puede publicarse. Bloqueado por producción de contenido.",
    icon: ImageOff,
    cls: "border-amber-200 bg-amber-50 text-amber-700",
    prioridad: 2,
  },
  recien_liberado: {
    label: "Recién liberado",
    desc: "Menos de 4 semanas desde su primera venta en tienda. Todavía no es concluyente.",
    icon: Clock,
    cls: "border-sky-200 bg-sky-50 text-sky-700",
    prioridad: 3,
  },
  agotado_online: {
    label: "Agotado en online",
    desc: "Sin stock asignado al canal online. Su índice web no aplica.",
    icon: PackageX,
    cls: "border-slate-200 bg-slate-50 text-slate-600",
    prioridad: 4,
  },
} as const;

type EstadoKey = keyof typeof ESTADOS;
const ORDEN: EstadoKey[] = ["revisar_online", "sin_foto", "recien_liberado", "agotado_online"];

const nf = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("es-CO");

export default function SaludPublicacion() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [estado, setEstado] = useState<EstadoKey>("revisar_online");
  const [coleccion, setColeccion] = useState("all");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      // PostgREST corta en 1.000 filas: se pagina para no perder registros.
      const PAGINA = 1000;
      const acc: Row[] = [];
      let desde = 0;
      try {
        for (;;) {
          const { data, error } = await supabase
            .from("mv_producto_clasificacion")
            .select("product_id,title,category,coleccion,image_url,semanas_en_venta,dias_en_venta,fecha_inicio,uds_tienda,uds_online,stock_actual,stock_online,tiendas_con_stock,estado_online,estado_tallas")
            .neq("estado_online", "normal")
            .order("stock_online", { ascending: false })
            .order("product_id", { ascending: true })
            .range(desde, desde + PAGINA - 1);
          if (error) throw error;
          const lote = (data ?? []) as Row[];
          acc.push(...lote);
          if (lote.length < PAGINA) break;
          desde += PAGINA;
          if (desde > 20000) break;
        }
        if (!activo) return;
        setRows(acc);
      } catch (e: any) {
        if (activo) setError(e?.message ?? String(e));
      } finally {
        if (activo) setLoading(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const conteos = useMemo(() => {
    const m: Record<string, { n: number; stock: number; uds: number }> = {};
    ORDEN.forEach(k => (m[k] = { n: 0, stock: 0, uds: 0 }));
    rows.forEach(r => {
      if (!m[r.estado_online]) return;
      m[r.estado_online].n++;
      m[r.estado_online].stock += r.stock_online || 0;
      m[r.estado_online].uds += r.uds_tienda || 0;
    });
    return m;
  }, [rows]);

  const colecciones = useMemo(
    () => Array.from(new Set(rows.map(r => r.coleccion).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return rows.filter(r =>
      r.estado_online === estado &&
      (coleccion === "all" || r.coleccion === coleccion) &&
      (!q || r.title?.toLowerCase().includes(q))
    );
  }, [rows, estado, coleccion, busqueda]);

  const exportar = () => {
    if (!filtered.length) return;
    const info = ESTADOS[estado];
    const datos = filtered.map(r => ({
      Producto: r.title,
      Categoria: r.category,
      Coleccion: r.coleccion,
      "Primera venta tienda": r.fecha_inicio ?? "",
      "Semanas en venta": r.semanas_en_venta,
      "Uds vendidas tienda": r.uds_tienda,
      "Uds vendidas online": r.uds_online,
      "Stock online": r.stock_online,
      "Stock total": r.stock_actual,
      "Tiendas con stock": r.tiendas_con_stock,
      Estado: info.label,
    }));
    const ws = XLSX.utils.json_to_sheet(datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(ws, [
      [`Salud de publicación — ${info.label}`],
      [`${info.desc} · ${new Date().toLocaleDateString("es-CO")}`],
    ], { origin: "A1" });
    ws["!cols"] = [{ wch: 44 }, { wch: 22 }, { wch: 13 }, { wch: 17 },
                   ...Array(6).fill({ wch: 14 }), { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salud publicación");
    XLSX.writeFile(wb, `salud-publicacion-${estado}.xlsx`);
  };

  const info = ESTADOS[estado];

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 overflow-x-hidden">
          <header className="h-14 flex items-center gap-3 border-b px-4">
            <SidebarTrigger />
            <div>
              <h1 className="text-base font-semibold leading-tight">Salud de publicación</h1>
              <p className="text-xs text-muted-foreground">
                Si el producto está en condiciones de venderse online. No mide su desempeño.
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {loading ? (
              <div className="p-6"><LoadingState rows={8} /></div>
            ) : error ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
                No se pudo cargar: {error}
              </div>
            ) : (
              <>
                {/* Estados */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {ORDEN.map(k => {
                    const e = ESTADOS[k];
                    const c = conteos[k];
                    const activo = estado === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setEstado(k)}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          activo ? e.cls : "hover:bg-muted/40"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 text-xs">
                          <e.icon className="h-3.5 w-3.5" />{e.label}
                        </div>
                        <div className="text-xl font-semibold tabular-nums mt-1">{nf(c.n)}</div>
                        <div className="text-[11px] opacity-70">
                          {nf(c.stock)} uds en online
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {info.desc}
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar producto…" className="pl-8 w-[210px]"
                           value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                  </div>
                  <Select value={coleccion} onValueChange={setColeccion}>
                    <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las colecciones</SelectItem>
                      {colecciones.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">
                    {nf(filtered.length)} productos
                  </span>
                  <Button variant="outline" size="sm" className="ml-auto"
                          onClick={exportar} disabled={!filtered.length}>
                    <Download className="h-4 w-4 mr-1.5" />Excel
                  </Button>
                </div>

                {!filtered.length ? (
                  <EmptyState message="No hay productos en este estado." />
                ) : (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                          <th className="text-left p-2.5 font-medium" colSpan={2}>Producto</th>
                          <th className="text-left p-2.5 font-medium">Primera venta</th>
                          <th className="text-right p-2.5 font-medium">Semanas</th>
                          <th className="text-right p-2.5 font-medium">Vendido tienda</th>
                          <th className="text-right p-2.5 font-medium">Stock online</th>
                          <th className="text-right p-2.5 font-medium">Stock total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 200).map(r => (
                          <tr key={r.product_id} className="border-b hover:bg-muted/20">
                            <td className="p-2 w-[52px]">
                              {r.image_url ? (
                                <img src={r.image_url} alt=""
                                     className="h-11 w-11 rounded object-cover bg-muted"
                                     loading="lazy" />
                              ) : (
                                <div className="h-11 w-11 rounded bg-muted flex items-center justify-center">
                                  <ImageOff className="h-4 w-4 text-muted-foreground/50" />
                                </div>
                              )}
                            </td>
                            <td className="p-2.5 min-w-[230px]">
                              <div className="font-medium leading-tight line-clamp-1">{r.title}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {r.category} · {r.coleccion}
                              </div>
                            </td>
                            <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {r.fecha_inicio ?? "—"}
                            </td>
                            <td className="p-2.5 text-right tabular-nums">{r.semanas_en_venta}</td>
                            <td className="p-2.5 text-right tabular-nums font-medium">
                              {nf(r.uds_tienda)}
                            </td>
                            <td className="p-2.5 text-right tabular-nums">{nf(r.stock_online)}</td>
                            <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                              {nf(r.stock_actual)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filtered.length > 200 && (
                      <div className="p-2.5 text-center text-xs text-muted-foreground border-t">
                        Mostrando 200 de {nf(filtered.length)}. Exporta el Excel para ver el resto.
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
