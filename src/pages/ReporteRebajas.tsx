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
import ExcelJS from "exceljs";
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
  "Foto", "Producto", "SKU", "Colección", "Línea", "Género",
  "Precio Lista", "Precio Actual", "% Desc.", "Sem. Vida",
];

const EXCEL_HEAD = [
  "Foto", "Producto", "SKU", "Colección", "Línea", "Género",
  "Precio Lista", "Precio Actual", "% Desc.", "Sem. Vida",
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
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

/** Convierte una foto remota en una miniatura JPEG tolerando imágenes ausentes o bloqueadas. */
async function getPhotoThumbnail(url: string | null): Promise<string> {
  if (!url) return "";
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("");
        return;
      }
      const scale = Math.max(96 / img.naturalWidth, 96 / img.naturalHeight);
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 96, 96);
      ctx.drawImage(img, (96 - width) / 2, (96 - height) / 2, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

async function getPhotoThumbnails(rows: Row[]): Promise<string[]> {
  const thumbnails = new Array<string>(rows.length).fill("");
  const concurrency = 8;
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const index = next++;
      thumbnails[index] = await getPhotoThumbnail(rows[index]?.foto ?? null);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return thumbnails;
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
      .sort((a, b) => {
        const la = (a.linea ?? "").localeCompare(b.linea ?? "", "es");
        if (la !== 0) return la;
        const ca = (a.coleccion ?? "").localeCompare(b.coleccion ?? "", "es");
        if (ca !== 0) return ca;
        return Number(b.pct_descuento ?? 0) - Number(a.pct_descuento ?? 0);
      });
  }, [rows, coleccion, linea, genero, busqueda]);

  // Agrupación por línea preservando el orden (línea → colección → mayor descuento)
  const grupos = useMemo(() => {
    const out: { linea: string; items: Row[]; startIndex: number }[] = [];
    filtradas.forEach((r, i) => {
      const nombre = r.linea ?? "SIN LÍNEA";
      const last = out[out.length - 1];
      if (last && last.linea === nombre) last.items.push(r);
      else out.push({ linea: nombre, items: [r], startIndex: i });
    });
    return out;
  }, [filtradas]);


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

  const handleExportXLS = async () => {
    if (!filtradas.length) return;
    const generated = generadoEl();
    const photos = await getPhotoThumbnails(filtradas);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Rebajas", { views: [{ state: "frozen", ySplit: 4 }] });
    ws.columns = [
      { width: 14 }, { width: 42 }, { width: 18 }, { width: 18 }, { width: 20 },
      { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 14 },
    ];

    ws.addRow([`Productos Rebajados Monastery  ·  Generado ${generated}`]);
    ws.mergeCells(1, 1, 1, EXCEL_HEAD.length);
    ws.getRow(1).getCell(1).font = { bold: true, size: 14 };
    ws.addRow([`Inventario al ${fechaInventario ?? "—"}`]);
    ws.mergeCells(2, 1, 2, EXCEL_HEAD.length);
    ws.getRow(2).getCell(1).font = { color: { argb: "FF666666" } };
    ws.addRow([]);
    const header = ws.addRow(EXCEL_HEAD);
    header.height = 24;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    grupos.forEach((grupo) => {
      const gRow = ws.addRow([
        `${grupo.linea}  ·  ${fmtInt(grupo.items.length)} productos`,
      ]);
      ws.mergeCells(gRow.number, 1, gRow.number, EXCEL_HEAD.length);
      gRow.height = 20;
      gRow.getCell(1).font = { bold: true, color: { argb: "FF1E293B" } };
      gRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
      gRow.getCell(1).alignment = { vertical: "middle" };

      grupo.items.forEach((item, i) => {
      const index = grupo.startIndex + i;
      const row = ws.addRow([

        "",
        item.producto ?? "",
        item.sku ?? "",
        item.coleccion ?? "",
        item.linea ?? "",
        item.genero ?? "",
        Number(item.pvp ?? 0),
        Number(item.precio_actual ?? 0),
        Number(item.pct_descuento ?? 0) / 100,
        item.semanas_vida ?? "",
      ]);
      row.height = 42;
      row.alignment = { vertical: "middle" };
      row.getCell(7).numFmt = '"$" #,##0';
      row.getCell(8).numFmt = '"$" #,##0';
      row.getCell(9).numFmt = "0.0%";
      if (Number(item.pct_descuento ?? 0) > 50) {
        row.getCell(9).font = { bold: true, color: { argb: "FFDC2626" } };
      }
      if (Number(item.semanas_vida ?? 0) > 52) {
        row.getCell(10).font = { bold: true, color: { argb: "FFDC2626" } };
      }
      const photo = photos[index];
      if (photo) {
        const imageId = wb.addImage({ base64: photo, extension: "jpeg" });
        ws.addImage(imageId, {
          tl: { col: 0.12, row: row.number - 0.88 },
          ext: { width: 48, height: 48 },
        });
      }
      });
    });


    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nombreArchivo()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!filtradas.length) return;
    const [logoB64, photos] = await Promise.all([getLogoBase64(), getPhotoThumbnails(filtradas)]);
    const generated = generadoEl();
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
    doc.text(`Generado ${generated}`, pageW - margin, 18, { align: "right" });
    doc.text(`Inventario al ${fechaInventario ?? "—"}`, pageW - margin, 24, { align: "right" });
    doc.setTextColor(0, 0, 0);

    let cursorY = 35;
    grupos.forEach((grupo) => {
      autoTable(doc, {
        startY: cursorY,
        head: [
          [
            {
              content: `${grupo.linea}  ·  ${fmtInt(grupo.items.length)} productos`,
              colSpan: PDF_HEAD.length,
              styles: {
                fillColor: [226, 232, 240] as [number, number, number],
                textColor: [30, 41, 59] as [number, number, number],
                fontStyle: "bold" as const,
                halign: "left" as const,
                fontSize: 8,
              },
            },
          ],
          PDF_HEAD,
        ],
        body: grupo.items.map((r) => [
          "",
          r.producto ?? "-",
          r.sku ?? "-",
          r.coleccion ?? "-",
          r.linea ?? "-",
          r.genero ?? "-",
          fmtCOP(r.pvp),
          fmtCOP(r.precio_actual),
          fmtPct(r.pct_descuento),
          r.semanas_vida == null ? "-" : String(r.semanas_vida),
        ]),
        styles: { fontSize: 6.8, cellPadding: 1.4, minCellHeight: 14, valign: "middle" },
        headStyles: { fillColor: [15, 15, 15], textColor: 255, fontStyle: "bold", fontSize: 6.8 },
        alternateRowStyles: { fillColor: [245, 245, 248] },
        margin: { left: margin, right: margin, top: 14, bottom: 14 },
        showHead: "everyPage",
        columnStyles: {
          0: { cellWidth: 14 },
          1: { cellWidth: 48 },
          6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
          9: { halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const row = grupo.items[data.row.index];
          if (!row) return;
          if (data.column.index === 8 && Number(row.pct_descuento ?? 0) > 50) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          }
          if (data.column.index === 9 && Number(row.semanas_vida ?? 0) > 52) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawCell: (data) => {
          if (data.section === "body" && data.column.index === 0) {
            const photo = photos[grupo.startIndex + data.row.index];
            if (!photo) return;
            try {
              doc.addImage(photo, "JPEG", data.cell.x + 1, data.cell.y + 1, 12, 12);
            } catch {
              // La celda queda vacía si la miniatura no puede incrustarse.
            }
          }
        },
      });
      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY;
      cursorY = finalY + 4;
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
      doc.text(generated, pageW / 2, pageH - 6, { align: "center" });
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
