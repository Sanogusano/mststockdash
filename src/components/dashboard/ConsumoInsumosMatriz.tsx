import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/dashboard/LoadingState";
import { Download, Search, Info } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import * as XLSX from "xlsx";

/**
 * Matriz de consumo de insumos: insumos en filas (columna fija), tiendas en columnas.
 * Fuente: RPC reporte_consumo_insumos_tienda(p_desde, p_hasta).
 *
 * Dos modos de lectura:
 *  - Unidades: cuanto se consumio. Sirve para comprar.
 *  - Por 100 pedidos: normaliza el tamano de la tienda. Sirve para detectar
 *    tiendas que no estan registrando el empaque en la venta.
 */

interface Fila {
  location_id: string;
  tienda: string;
  tipo_tienda: string | null;
  sku: string;
  insumo: string;
  unidades: number;
  pedidos_tienda: number;
  uds_producto: number;
  insumos_x_pedido: number;
}

interface Props {
  desde?: string; // YYYY-MM-DD — opcional: si no llega, el componente maneja su propio periodo
  hasta?: string;
}

const TIPO_ORDEN: Record<string, number> = { A: 1, B: 2, C: 3, OUTLET: 4 };

const nf = (v: number, d = 0) =>
  v.toLocaleString("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d });

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Devuelve [desde, hasta] en YYYY-MM-DD para cada preset. */
function rangoPreset(p: string): [string, string] {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (p) {
    case "30":  return [iso(new Date(y, m, hoy.getDate() - 30)), iso(hoy)];
    case "60":  return [iso(new Date(y, m, hoy.getDate() - 60)), iso(hoy)];
    case "90":  return [iso(new Date(y, m, hoy.getDate() - 90)), iso(hoy)];
    case "mes": return [iso(new Date(y, m, 1)), iso(hoy)];
    case "mes_ant": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "anio": return [iso(new Date(y, 0, 1)), iso(hoy)];
    default:    return [iso(new Date(y, m, hoy.getDate() - 90)), iso(hoy)];
  }
}

const PRESETS = [
  { value: "30", label: "Últimos 30 días" },
  { value: "60", label: "Últimos 60 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "mes", label: "Este mes" },
  { value: "mes_ant", label: "Mes anterior" },
  { value: "anio", label: "Año corrido" },
  { value: "custom", label: "Personalizado" },
];

export default function ConsumoInsumosMatriz({ desde, hasta }: Props) {
  const controlado = Boolean(desde && hasta);

  const [preset, setPreset] = useState("90");
  // Borrador: lo que el usuario esta escribiendo en los campos de fecha.
  const [draftDesde, setDraftDesde] = useState(rangoPreset("90")[0]);
  const [draftHasta, setDraftHasta] = useState(rangoPreset("90")[1]);
  // Rango realmente consultado. Solo cambia al elegir un preset o al pulsar Aplicar,
  // nunca en cada tecla o clic del calendario.
  const [rango, setRango] = useState<[string, string]>(rangoPreset("90"));

  const [pDesde, pHasta] = controlado ? [desde as string, hasta as string] : rango;

  const cambiarPreset = (p: string) => {
    setPreset(p);
    if (p !== "custom") {
      const r = rangoPreset(p);
      setDraftDesde(r[0]);
      setDraftHasta(r[1]);
      setRango(r);           // un preset es una intencion completa: se aplica solo
    }
  };

  const rangoValido = Boolean(draftDesde && draftHasta && draftDesde <= draftHasta);
  const hayCambios = draftDesde !== rango[0] || draftHasta !== rango[1];

  const [filas, setFilas] = useState<Fila[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modo, setModo] = useState<"unidades" | "normalizado">("unidades");
  const [tipo, setTipo] = useState("all");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    let activo = true;
    (async () => {
      setLoading(true);
      setError(null);
      // Siempre se mandan LAS DOS fechas explicitas. Nunca dejar que p_hasta
      // caiga al default del servidor: eso convierte un rango cerrado en una
      // ventana movil y devuelve datos que no corresponden al periodo pedido.
      const { data, error } = await supabase.rpc(
        "reporte_consumo_insumos_tienda",
        { p_desde: pDesde, p_hasta: pHasta }
      );
      if (!activo) return;
      if (error) setError(error.message);
      else setFilas((data ?? []) as Fila[]);
      setLoading(false);
    })();
    return () => { activo = false; };
  }, [pDesde, pHasta]);

  // Tiendas: una entrada por location, con su total de pedidos del periodo
  const tiendas = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; tipo: string; pedidos: number }>();
    filas.forEach(f => {
      if (!m.has(f.location_id)) {
        m.set(f.location_id, {
          id: f.location_id,
          nombre: f.tienda,
          tipo: f.tipo_tienda ?? "—",
          pedidos: f.pedidos_tienda ?? 0,
        });
      }
    });
    return Array.from(m.values())
      .filter(t => tipo === "all" || t.tipo === tipo)
      .sort((a, b) =>
        (TIPO_ORDEN[a.tipo] ?? 9) - (TIPO_ORDEN[b.tipo] ?? 9) ||
        a.nombre.localeCompare(b.nombre)
      );
  }, [filas, tipo]);

  const tiposDisponibles = useMemo(
    () => Array.from(new Set(filas.map(f => f.tipo_tienda).filter(Boolean) as string[]))
      .sort((a, b) => (TIPO_ORDEN[a] ?? 9) - (TIPO_ORDEN[b] ?? 9)),
    [filas]
  );

  // Celdas: sku -> location -> unidades
  const celdas = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    filas.forEach(f => {
      if (!m.has(f.sku)) m.set(f.sku, new Map());
      const fila = m.get(f.sku)!;
      fila.set(f.location_id, (fila.get(f.location_id) ?? 0) + Number(f.unidades ?? 0));
    });
    return m;
  }, [filas]);

  const insumos = useMemo(() => {
    const m = new Map<string, string>();
    filas.forEach(f => m.set(f.sku, f.insumo));
    const q = busqueda.trim().toLowerCase();
    const idsVisibles = new Set(tiendas.map(t => t.id));
    return Array.from(m.entries())
      .map(([sku, nombre]) => {
        const fila = celdas.get(sku);
        let total = 0;
        idsVisibles.forEach(id => { total += fila?.get(id) ?? 0; });
        return { sku, nombre, total };
      })
      .filter(i => i.total > 0)
      .filter(i => !q || i.nombre.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))
      .sort((a, b) => b.total - a.total);
  }, [filas, celdas, tiendas, busqueda]);

  // Valor mostrado segun modo
  const valor = (sku: string, t: { id: string; pedidos: number }) => {
    const uds = celdas.get(sku)?.get(t.id) ?? 0;
    if (modo === "unidades") return uds;
    return t.pedidos ? (uds * 100) / t.pedidos : 0;
  };

  const maxValor = useMemo(() => {
    let mx = 0;
    insumos.forEach(i => tiendas.forEach(t => { mx = Math.max(mx, valor(i.sku, t)); }));
    return mx || 1;
  }, [insumos, tiendas, modo, celdas]);

  const intensidad = (v: number) => {
    if (!v) return "";
    const r = Math.min(1, Math.sqrt(v / maxValor)); // raiz para que los valores bajos se vean
    if (r > 0.75) return "bg-primary/25";
    if (r > 0.45) return "bg-primary/15";
    if (r > 0.20) return "bg-primary/10";
    return "bg-primary/5";
  };

  const totalTienda = (t: { id: string; pedidos: number }) =>
    insumos.reduce((s, i) => s + valor(i.sku, t), 0);

  const granTotal = useMemo(
    () => insumos.reduce((s, i) =>
      s + tiendas.reduce((ss, t) => ss + valor(i.sku, t), 0), 0),
    [insumos, tiendas, modo]
  );

  /** Filas planas para exportar: SKU e Insumo van en columnas separadas. */
  const datosExport = () =>
    insumos.map(i => {
      const row: Record<string, string | number> = { SKU: i.sku, Insumo: i.nombre };
      tiendas.forEach(t => {
        const v = valor(i.sku, t);
        row[t.nombre] = modo === "unidades" ? v : Number(v.toFixed(1));
      });
      row.Total = Number(
        tiendas.reduce((s, t) => s + valor(i.sku, t), 0).toFixed(modo === "unidades" ? 0 : 1)
      );
      return row;
    });

  const exportarExcel = () => {
    if (!insumos.length) return;
    const datos = datosExport();

    // Los datos arrancan en A3 para dejar dos filas de encabezado con el contexto
    const ws = XLSX.utils.aoa_to_sheet([[], []]);
    XLSX.utils.sheet_add_json(ws, datos, { origin: "A3" });
    XLSX.utils.sheet_add_aoa(
      ws,
      [
        [`Consumo de insumos por tienda — ${modo === "unidades" ? "Unidades" : "Por 100 pedidos"}`],
        [`Período: ${pDesde} a ${pHasta}${tipo !== "all" ? ` · Tipo ${tipo}` : ""}`],
      ],
      { origin: "A1" }
    );

    ws["!cols"] = [
      { wch: 12 },                        // SKU
      { wch: 46 },                        // Insumo
      ...tiendas.map(() => ({ wch: 15 })),
      { wch: 12 },                        // Total
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consumo insumos");
    XLSX.writeFile(wb, `consumo-insumos-${pDesde}_a_${pHasta}.xlsx`);
  };

  if (loading) return <div className="p-6"><LoadingState rows={8} /></div>;
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        No se pudo cargar el consumo de insumos: {error}
      </div>
    );
  }
  if (!filas.length) return <EmptyState message="No hay consumo de insumos en este periodo." />;

  return (
    <div className="space-y-3">
      {/* Controles */}
      <div className="flex flex-wrap gap-2 items-center">
        {!controlado && (
          <>
            <Select value={preset} onValueChange={cambiarPreset}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESETS.map(p => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={draftDesde}
                  max={draftHasta}
                  onChange={e => setDraftDesde(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && rangoValido && hayCambios) {
                      setRango([draftDesde, draftHasta]);
                    }
                  }}
                  className="w-[150px]"
                />
                <span className="text-xs text-muted-foreground">a</span>
                <Input
                  type="date"
                  value={draftHasta}
                  min={draftDesde}
                  onChange={e => setDraftHasta(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && rangoValido && hayCambios) {
                      setRango([draftDesde, draftHasta]);
                    }
                  }}
                  className="w-[150px]"
                />
                <Button
                  size="sm"
                  variant={hayCambios && rangoValido ? "default" : "outline"}
                  disabled={!rangoValido || !hayCambios || loading}
                  onClick={() => setRango([draftDesde, draftHasta])}
                >
                  Aplicar
                </Button>
                {!rangoValido && (
                  <span className="text-xs text-destructive">
                    La fecha inicial debe ser anterior a la final
                  </span>
                )}
              </div>
            )}
          </>
        )}

        <div className="inline-flex rounded-md border p-0.5">
          <button
            onClick={() => setModo("unidades")}
            className={`px-3 py-1.5 text-xs rounded ${
              modo === "unidades" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Unidades
          </button>
          <button
            onClick={() => setModo("normalizado")}
            className={`px-3 py-1.5 text-xs rounded ${
              modo === "normalizado" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            Por 100 pedidos
          </button>
        </div>

        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {tiposDisponibles.map(t => (
              <SelectItem key={t} value={t}>Tipo {t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar insumo…"
            className="pl-8 w-[200px]"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {pDesde} a {pHasta} · {insumos.length} insumos · {tiendas.length} tiendas ·{" "}
            {modo === "unidades" ? `${nf(granTotal)} uds` : "normalizado"}
          </span>
          <Button variant="default" size="sm" onClick={exportarExcel} disabled={!insumos.length}>
            <Download className="h-4 w-4 mr-1.5" /> Excel
          </Button>
        </div>
      </div>

      {modo === "normalizado" && (
        <div className="rounded-lg border bg-muted/30 p-2.5 text-xs text-muted-foreground flex gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Unidades de insumo por cada 100 pedidos de esa tienda. Elimina el efecto del tamaño:
            una celda vacía o muy baja frente a tiendas del mismo tipo indica que el empaque
            <strong className="text-foreground"> no se está registrando en la venta</strong>, no que
            se consuma menos.
          </p>
        </div>
      )}

      {/* Matriz */}
      <div className="rounded-lg border overflow-auto max-h-[70vh]">
        <table className="text-xs border-collapse">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 bg-muted text-left p-2 border-b border-r w-[96px] min-w-[96px]">
                SKU
              </th>
              <th className="sticky left-[96px] z-30 bg-muted text-left p-2 border-b border-r min-w-[240px]">
                Insumo
              </th>
              <th className="bg-muted p-2 border-b border-r text-right min-w-[70px]">Total</th>
              {tiendas.map(t => (
                <th
                  key={t.id}
                  className="bg-muted p-2 border-b border-r text-right min-w-[92px] align-bottom"
                  title={`${t.nombre} · ${nf(t.pedidos)} pedidos`}
                >
                  <div className="font-medium leading-tight line-clamp-2">
                    {t.nombre.replace(/^Tienda\s+/i, "")}
                  </div>
                  <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
                    {t.tipo} · {nf(t.pedidos)} ped.
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {insumos.map(i => (
              <tr key={i.sku} className="hover:bg-muted/20">
                <td className="sticky left-0 z-10 bg-background p-2 border-b border-r font-mono text-[11px] text-muted-foreground align-top">
                  {i.sku}
                </td>
                <td className="sticky left-[96px] z-10 bg-background p-2 border-b border-r">
                  <div className="font-medium leading-tight line-clamp-2">{i.nombre}</div>
                </td>
                <td className="p-2 border-b border-r text-right font-semibold tabular-nums bg-muted/30">
                  {nf(
                    tiendas.reduce((s, t) => s + valor(i.sku, t), 0),
                    modo === "unidades" ? 0 : 1
                  )}
                </td>
                {tiendas.map(t => {
                  const v = valor(i.sku, t);
                  return (
                    <td
                      key={t.id}
                      className={`p-2 border-b border-r text-right tabular-nums ${intensidad(v)}`}
                    >
                      {v ? nf(v, modo === "unidades" ? 0 : 1)
                         : <span className="text-muted-foreground/40">·</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr>
              <td className="sticky left-0 z-30 bg-muted p-2 border-t border-r" />
              <td className="sticky left-[96px] z-30 bg-muted p-2 border-t border-r font-semibold">
                Total
              </td>
              <td className="bg-muted p-2 border-t border-r text-right font-semibold tabular-nums">
                {nf(granTotal, modo === "unidades" ? 0 : 1)}
              </td>
              {tiendas.map(t => (
                <td
                  key={t.id}
                  className="bg-muted p-2 border-t border-r text-right font-semibold tabular-nums"
                >
                  {nf(totalTienda(t), modo === "unidades" ? 0 : 1)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
