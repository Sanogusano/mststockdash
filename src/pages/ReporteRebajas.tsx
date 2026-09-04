import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

interface Row {
  product_id: string;
  producto: string | null;
  sku: string | null;
  foto: string | null;
  coleccion: string | null;
  linea: string | null;
  genero: string | null;
  pvp: number | null;
  precio_actual: number | null;
  pct_descuento: number | null;
  semanas_vida: number | null;
  fecha_inicio: string | null;
  variantes: number | null;
  stock_total: number | null;
  und_vendidas: number | null;
  und_desde_rebaja: number | null;
}

const DIAS_VENTA = 90;

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString("es-CO");

const fmtCOP = (n: number | null | undefined) =>
  n == null ? "—" : "$ " + Math.round(Number(n)).toLocaleString("es-CO");

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${Number(n).toFixed(1).replace(".", ",")}%`;

/** Normaliza texto: minúsculas y sin acentos. */
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function descCls(p: number | null) {
  const v = Number(p ?? 0);
  if (v > 50) return "border-rose-300 bg-rose-50 text-rose-700";
  if (v > 30) return "border-amber-300 bg-amber-50 text-amber-700";
  return "border-border bg-muted/40 text-foreground";
}

export default function ReporteRebajasPage() {
  const [coleccion, setColeccion] = useState("all");
  const [linea, setLinea] = useState("all");
  const [genero, setGenero] = useState("all");
  const [busqueda, setBusqueda] = useState("");
  const [incluirAgotados, setIncluirAgotados] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["reporte_rebajas_activas", DIAS_VENTA, incluirAgotados],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_rebajas_activas" as never, {
        p_coleccion: null,
        p_linea: null,
        p_genero: null,
        p_dias_venta: DIAS_VENTA,
        p_solo_con_stock: !incluirAgotados,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const opciones = useMemo(() => {
    const uniq = (vals: (string | null)[]) =>
      Array.from(new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))).sort();
    return {
      colecciones: uniq(rows.map((r) => r.coleccion)),
      lineas: uniq(rows.map((r) => r.linea)),
      generos: uniq(rows.map((r) => r.genero)),
    };
  }, [rows]);

  const filtradas = useMemo(() => {
    const q = norm(busqueda.trim());
    return rows
      .filter((r) => coleccion === "all" || r.coleccion === coleccion)
      .filter((r) => linea === "all" || r.linea === linea)
      .filter((r) => genero === "all" || r.genero === genero)
      .filter((r) =>
        !q ||
        norm(r.producto ?? "").includes(q) ||
        norm(r.sku ?? "").includes(q)
      )
      .sort((a, b) => Number(b.pct_descuento ?? 0) - Number(a.pct_descuento ?? 0));
  }, [rows, coleccion, linea, genero, busqueda]);

  const kpis = useMemo(() => {
    const n = filtradas.length;
    const descs = filtradas.map((r) => Number(r.pct_descuento ?? 0));
    const semanas = filtradas
      .map((r) => r.semanas_vida)
      .filter((v): v is number => v != null);
    return {
      total: n,
      descProm: n ? descs.reduce((a, b) => a + b, 0) / n : 0,
      stock: filtradas.reduce((a, r) => a + Number(r.stock_total ?? 0), 0),
      semProm: semanas.length ? semanas.reduce((a, b) => a + b, 0) / semanas.length : null,
      masDeUnAnio: filtradas.filter((r) => Number(r.semanas_vida ?? 0) > 52).length,
      sinVenta: filtradas.filter((r) => Number(r.und_vendidas ?? 0) === 0).length,
    };
  }, [filtradas]);

  const handleExport = () => {
    if (!filtradas.length) return;
    const out = filtradas.map((r) => ({
      Producto: r.producto ?? "",
      SKU: r.sku ?? "",
      "Product ID": r.product_id,
      Colección: r.coleccion ?? "",
      Línea: r.linea ?? "",
      Género: r.genero ?? "",
      "Precio de Lista": Number(r.pvp ?? 0),
      "Precio Actual": Number(r.precio_actual ?? 0),
      "% Descuento": Number(r.pct_descuento ?? 0),
      "Semanas de Vida": r.semanas_vida ?? "",
      "Fecha Inicio": r.fecha_inicio ?? "",
      Variantes: Number(r.variantes ?? 0),
      "Stock Total": Number(r.stock_total ?? 0),
      [`Unidades vendidas ${DIAS_VENTA}d`]: Number(r.und_vendidas ?? 0),
      "Unidades desde rebaja": Number(r.und_desde_rebaja ?? 0),
      Foto: r.foto ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rebajas");
    XLSX.writeFile(wb, `reporte-rebajas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/90 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">
                  Reporte de Rebajas
                </h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Productos con precio de catálogo por debajo del precio de lista
                </p>
              </div>
            </div>
            <Button onClick={handleExport} disabled={!filtradas.length} size="sm" className="gap-2">
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {[
                { label: "Productos rebajados", val: fmtInt(kpis.total) },
                { label: "Unidades en stock", val: fmtInt(kpis.stock) },
                { label: "Descuento promedio", val: fmtPct(kpis.descProm) },
                {
                  label: "Semanas de vida promedio",
                  val: kpis.semProm == null ? "—" : `${kpis.semProm.toFixed(0)} sem`,
                },
                { label: "Más de un año rebajados", val: fmtInt(kpis.masDeUnAnio), alerta: kpis.masDeUnAnio > 0 },
                { label: "Sin venta en 90 días", val: fmtInt(kpis.sinVenta), alerta: kpis.sinVenta > 0 },
              ].map((k) => (
                <Card key={k.label}>
                  <CardContent className="p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                    <p className={cn(
                      "text-xl font-semibold mt-1 tabular-nums",
                      k.alerta ? "text-rose-600" : "text-foreground"
                    )}>{k.val}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Colección</p>
                <Select value={coleccion} onValueChange={setColeccion}>
                  <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {opciones.colecciones.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Línea</p>
                <Select value={linea} onValueChange={setLinea}>
                  <SelectTrigger className="h-9 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las líneas</SelectItem>
                    {opciones.lineas.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Género</p>
                <Select value={genero} onValueChange={setGenero}>
                  <SelectTrigger className="h-9 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los géneros</SelectItem>
                    {opciones.generos.map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Buscar</p>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Nombre o SKU..."
                    className="h-9 w-[240px] pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch id="incluir-agotados" checked={incluirAgotados} onCheckedChange={setIncluirAgotados} />
                <Label htmlFor="incluir-agotados" className="text-xs text-muted-foreground cursor-pointer">
                  Incluir agotados
                </Label>
              </div>
              <p className="text-xs text-muted-foreground pb-2">
                {fmtInt(filtradas.length)} de {fmtInt(rows.length)} productos
              </p>
            </div>

            {/* Tabla */}
            {error ? (
              <p className="text-sm text-destructive">Error: {(error as Error).message}</p>
            ) : isLoading ? (
              <LoadingState rows={6} />
            ) : !filtradas.length ? (
              <EmptyState message="No hay productos rebajados con estos filtros" />
            ) : (
              <div className="rounded-lg border border-border overflow-x-auto">
                <Table className="min-w-[1080px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[64px]">Foto</TableHead>
                      <TableHead className="min-w-[220px]">Producto</TableHead>
                      <TableHead className="min-w-[120px]">SKU</TableHead>
                      <TableHead className="min-w-[120px]">Colección</TableHead>
                      <TableHead className="text-right">Precio de Lista</TableHead>
                      <TableHead className="text-right">Precio Actual</TableHead>
                      <TableHead className="text-right">% Descuento</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Uds. vendidas 90d</TableHead>
                      <TableHead className="text-right">Semanas de Vida</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtradas.map((r) => (
                      <TableRow key={r.product_id}>
                        <TableCell>
                          {r.foto ? (
                            <img
                              src={r.foto}
                              alt={r.producto ?? ""}
                              loading="lazy"
                              className="h-10 w-10 rounded object-cover border border-border"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded bg-muted" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {r.producto ?? "—"}
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {r.linea ?? "—"} · {r.genero ?? "—"} · {fmtInt(r.variantes)} variantes
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{r.sku ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.coleccion ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground line-through">
                          {fmtCOP(r.pvp)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-semibold">
                          {fmtCOP(r.precio_actual)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={cn(
                              "inline-block rounded border px-1.5 py-0.5 text-xs tabular-nums font-medium",
                              descCls(r.pct_descuento)
                            )}
                          >
                            {fmtPct(r.pct_descuento)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{fmtInt(r.stock_total)}</TableCell>
                        <TableCell className={cn(
                          "text-xs text-right tabular-nums",
                          Number(r.und_vendidas ?? 0) === 0 && "text-rose-600 font-semibold"
                        )}>{fmtInt(r.und_vendidas)}</TableCell>
                        <TableCell
                          className={cn(
                            "text-xs text-right tabular-nums",
                            Number(r.semanas_vida ?? 0) > 52 && "text-rose-600 font-semibold"
                          )}
                        >
                          {r.semanas_vida == null ? "—" : `${fmtInt(r.semanas_vida)} sem`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Rebajado = precio de catálogo menor al precio de lista. No incluye descuentos promocionales
              en caja. Semanas de vida desde la primera venta del producto.
              {!incluirAgotados && " Solo se muestran productos con existencias."}
            </p>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
