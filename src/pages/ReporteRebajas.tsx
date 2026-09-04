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
import { Download, FileText, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import monasteryLogoWhite from "@/assets/monastery-logo-white.png";

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

const PDF_HEAD = [
  "Producto", "SKU", "Colección", "Línea", "Género",
  "Precio Lista", "Precio Actual", "% Desc.", "Sem. Vida", "Stock", `Vend. ${DIAS_VENTA}d`,
];

const EXCEL_HEAD = [
  "Producto", "SKU", "Product ID", "Colección", "Línea", "Género",
  "Precio de Lista", "Precio Actual", "% Descuento", "Semanas de Vida",
  "Stock Total", `Vendidas ${DIAS_VENTA}d`, "Unidades desde rebaja",
  "Variantes", "Fecha Inicio", "Foto",
];

/** Fecha y hora de generación en Bogotá. */
const generadoEl = () => {
  const d = new Date();
  const f = d.toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric", timeZone: "America/Bogota",
  });
  const h = d.toLocaleTimeString("es-CO", {
    hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota",
  });
  return `${f}, ${h}`;
};

/** Productos Rebajados Monastery YYYY-MM-DD HHmm */
const nombreArchivo = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `Productos Rebajados Monastery ${g("year")}-${g("month")}-${g("day")} ${g("hour")}${g("minute")}`;
};

/** Logo a base64 (mismo patrón que ReportGenerator). */
async function getLogoBase64(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

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

  const { data: fechaInventario } = useQuery({
    queryKey: ["rebajas_fecha_inventario"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_snapshot")
        .select("snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.snapshot_date as string | null) ?? null;
    },
    staleTime: 10 * 60 * 1000,
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

  /** Filtros activos, en una línea, para encabezado de PDF y Excel. */
  const filtrosTexto = useMemo(() => {
    const p: string[] = [
      `Colección: ${coleccion === "all" ? "Todas" : coleccion}`,
      `Línea: ${linea === "all" ? "Todas" : linea}`,
      `Género: ${genero === "all" ? "Todos" : genero}`,
      `Existencias: ${incluirAgotados ? "Incluye agotados" : "Solo con stock"}`,
      `Ventas: últimos ${DIAS_VENTA} días`,
    ];
    if (busqueda.trim()) p.push(`Búsqueda: "${busqueda.trim()}"`);
    return p.join("  ·  ");
  }, [coleccion, linea, genero, incluirAgotados, busqueda]);

  const kpiPares = useMemo(
    () => [
      ["Productos", fmtInt(kpis.total)],
      ["Unidades en stock", fmtInt(kpis.stock)],
      ["Descuento promedio", fmtPct(kpis.descProm)],
      ["Semanas promedio", kpis.semProm == null ? "—" : `${kpis.semProm.toFixed(0)}`],
      ["Más de un año", fmtInt(kpis.masDeUnAnio)],
      [`Sin venta ${DIAS_VENTA}d`, fmtInt(kpis.sinVenta)],
    ] as [string, string][],
    [kpis]
  );

  const handleExportXLS = () => {
    if (!filtradas.length) return;
    const wb = XLSX.utils.book_new();

    const aoa: (string | number)[][] = [
      [`Productos Rebajados Monastery  ·  Generado ${generadoEl()}`],
      [filtrosTexto],
      [],
      [...EXCEL_HEAD],
      ...filtradas.map((r) => [
        r.producto ?? "",
        r.sku ?? "",
        r.product_id,
        r.coleccion ?? "",
        r.linea ?? "",
        r.genero ?? "",
        Number(r.pvp ?? 0),
        Number(r.precio_actual ?? 0),
        Number(r.pct_descuento ?? 0),
        r.semanas_vida ?? "",
        Number(r.stock_total ?? 0),
        Number(r.und_vendidas ?? 0),
        Number(r.und_desde_rebaja ?? 0),
        Number(r.variantes ?? 0),
        r.fecha_inicio ?? "",
        r.foto ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 42 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 40 },
    ];
    ws["!freeze"] = { xSplit: "0", ySplit: "4", topLeftCell: "A5" } as never;
    ws["!panes"] = [{ ySplit: 4, topLeftCell: "A5", activePane: "bottomLeft", state: "frozen" }] as never;

    // Encabezados en negrita con fondo azul + formatos numéricos.
    for (let c = 0; c < EXCEL_HEAD.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 3, c });
      const cell = ws[ref];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E40AF" } },
          alignment: { horizontal: "center" },
        };
      }
    }
    for (let i = 0; i < filtradas.length; i++) {
      const r = 4 + i;
      for (const c of [6, 7]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = "#,##0";
      }
      const pct = ws[XLSX.utils.encode_cell({ r, c: 8 })];
      if (pct) pct.z = "0.0";
      for (const c of [10, 11, 12, 13]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell) cell.z = "#,##0";
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, "Rebajas");

    const resumen = XLSX.utils.aoa_to_sheet([
      ["Productos Rebajados Monastery"],
      [`Generado ${generadoEl()}`],
      [filtrosTexto],
      [`Inventario al ${fechaInventario ?? "—"}`],
      [],
      ["Indicador", "Valor"],
      ...kpiPares,
    ]);
    resumen["!cols"] = [{ wch: 30 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, resumen, "Resumen");

    XLSX.writeFile(wb, `${nombreArchivo()}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!filtradas.length) return;
    const logoB64 = await getLogoBase64();
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    // Encabezado (mismo patrón que ReportGenerator)
    doc.setFillColor(15, 15, 15);
    doc.rect(0, 0, pageW, 30, "F");
    if (logoB64) {
      try { doc.addImage(logoB64, "PNG", margin, 4, 50, 22); } catch { /* skip */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Productos Rebajados", pageW - margin, 11, { align: "right" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado ${generadoEl()}`, pageW - margin, 17, { align: "right" });
    doc.text(filtrosTexto, pageW - margin, 21.5, { align: "right" });
    doc.text(`Inventario al ${fechaInventario ?? "—"}`, pageW - margin, 26, { align: "right" });
    doc.setTextColor(0, 0, 0);

    // Fila de KPIs
    let y = 36;
    const cardW = (pageW - 2 * margin - 5 * 3) / 6;
    kpiPares.forEach(([label, val], i) => {
      const x = margin + i * (cardW + 3);
      doc.setFillColor(245, 245, 245);
      doc.roundedRect(x, y, cardW, 16, 2, 2, "F");
      doc.setDrawColor(220, 220, 230);
      doc.roundedRect(x, y, cardW, 16, 2, 2, "S");
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      doc.text(label, x + 3, y + 5.5);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 15, 15);
      doc.text(val, x + 3, y + 12.5);
    });
    y += 22;

    autoTable(doc, {
      startY: y,
      head: [PDF_HEAD],
      body: filtradas.map((r) => [
        r.producto ?? "-",
        r.sku ?? "-",
        r.coleccion ?? "-",
        r.linea ?? "-",
        r.genero ?? "-",
        fmtCOP(r.pvp),
        fmtCOP(r.precio_actual),
        fmtPct(r.pct_descuento),
        r.semanas_vida == null ? "-" : String(r.semanas_vida),
        fmtInt(r.stock_total),
        fmtInt(r.und_vendidas),
      ]),
      styles: { fontSize: 6.8, cellPadding: 1.4 },
      headStyles: { fillColor: [15, 15, 15], textColor: 255, fontStyle: "bold", fontSize: 6.8 },
      alternateRowStyles: { fillColor: [245, 245, 248] },
      margin: { left: margin, right: margin, top: 14, bottom: 14 },
      showHead: "everyPage",
      columnStyles: {
        5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
        8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = filtradas[data.row.index];
        if (!row) return;
        if (data.column.index === 7 && Number(row.pct_descuento ?? 0) > 50) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 8 && Number(row.semanas_vida ?? 0) > 52) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 10 && Number(row.und_vendidas ?? 0) === 0) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    // Pie de página en todas
    const pageH = doc.internal.pageSize.getHeight();
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.setDrawColor(200, 200, 210);
      doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
      doc.text("MST-Retail Intelligence · powered by Selliq", margin, pageH - 6);
      doc.text(generadoEl(), pageW / 2, pageH - 6, { align: "center" });
      doc.text(`Página ${i} de ${total}`, pageW - margin, pageH - 6, { align: "right" });
    }

    doc.save(`${nombreArchivo()}.pdf`);
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
            <div className="flex items-center gap-2">
              <Button onClick={handleExportXLS} disabled={!filtradas.length} size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button onClick={handleExportPDF} disabled={!filtradas.length} size="sm" className="gap-2">
                <FileText className="h-4 w-4" /> PDF
              </Button>
            </div>
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
