import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Download, FileText, AlertTriangle, AlertCircle, CircleOff, ChevronDown, ChevronRight, Store, Tag, Globe, Warehouse, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { exportToXLS } from "@/lib/xls-export";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import monasteryLogoWhite from "@/assets/monastery-logo-white.png";

type TallaInfo = {
  talla?: string;
  stock?: number;
  stock_linea?: number;
  stock_outlet?: number;
  stock_digital?: number;
  stock_bodega?: number;
  linea?: number;
  outlet?: number;
  digital?: number;
  bodega?: number;
} & Record<string, unknown>;

type Row = {
  product_id: string;
  titulo: string;
  category: string;
  color: string;
  collection_season: string | null;
  es_rebaja: boolean;
  precio_actual: number;
  precio_original: number;
  descuento_actual: number;
  primera_venta: string | null;
  fecha_llegada_tienda: string | null;
  fue_distribuido: boolean;
  dias_en_tienda: number | null;
  semanas_en_tienda: number | null;
  tallas_disponibles: TallaInfo[] | null;
  tallas_con_stock: number;
  tallas_totales: number;
  cobertura_curva: number;
  unidades_vendidas: number;
  stock_actual: number;
  stock_linea?: number;
  stock_outlet?: number;
  stock_digital?: number;
  stock_bodega?: number;
  inventario_inicial: number;
  sell_through: number;
  velocidad_semanal: number | null;
  adu?: number | null;
  ubicacion_dominante?: string | null;
  nivel: "atencion" | "critico" | "liquidar" | "sin distribuir" | string;
  descuento_sugerido: number;
  accion: string;
};

type Location = { location_id: string; name: string };

const NIVEL_LABELS: Record<string, { label: string; emoji: string; className: string }> = {
  atencion: { label: "Atención", emoji: "🟡", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  critico: { label: "Crítico", emoji: "🔴", className: "bg-red-100 text-red-800 border-red-300" },
  liquidar: { label: "Liquidar", emoji: "⚫", className: "bg-neutral-200 text-neutral-800 border-neutral-400" },
  "sin distribuir": { label: "Sin distribuir", emoji: "📦", className: "bg-violet-100 text-violet-800 border-violet-300" },
};


function pct(n: number) {
  return `${(Number(n) || 0).toFixed(1)}%`;
}

function fmtCOP(n: number) {
  const v = Number(n) || 0;
  return `$ ${v.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

function fmtInt(n: number) {
  return (Number(n) || 0).toLocaleString("es-CO");
}

/** Fecha y hora de generación en Bogotá. */
const generadoEl = () => {
  const d = new Date();
  const f = d.toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Bogota" });
  const h = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
  return `${f}, ${h}`;
};

/** Baja Rotacion Monastery YYYY-MM-DD HHmm */
const nombreArchivo = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `Baja Rotacion Monastery ${g("year")}-${g("month")}-${g("day")} ${g("hour")}${g("minute")}`;
};

async function getLogoBase64(): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(""); return; }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = monasteryLogoWhite;
  });
}

type Ubicacion = { label: string; className: string };

const UBIC_CLS: Record<string, string> = {
  "EN BODEGA": "bg-violet-100 text-violet-800 border-violet-300",
  "EN OUTLET": "bg-orange-100 text-orange-800 border-orange-300",
  "EN TIENDAS": "bg-sky-100 text-sky-800 border-sky-300",
};

/** Dónde está el grueso del inventario: define la acción a tomar. */
function ubicacionDominante(r: Row): Ubicacion | null {
  const desdeRpc = (r.ubicacion_dominante ?? "").trim().toUpperCase();
  if (desdeRpc) {
    return { label: desdeRpc, className: UBIC_CLS[desdeRpc] ?? "bg-muted text-muted-foreground border-border" };
  }
  const linea = Number(r.stock_linea) || 0;
  const outlet = Number(r.stock_outlet) || 0;
  const digital = Number(r.stock_digital) || 0;
  const bodega = Number(r.stock_bodega) || 0;
  const total = linea + outlet + digital + bodega;
  if (total <= 0) return null;
  if (bodega / total >= 0.8) return { label: "EN BODEGA", className: UBIC_CLS["EN BODEGA"] };
  if (outlet > linea) return { label: "EN OUTLET", className: UBIC_CLS["EN OUTLET"] };
  return { label: "EN TIENDAS", className: UBIC_CLS["EN TIENDAS"] };
}

function fmtAdu(n?: number | null) {
  if (n == null) return "—";
  return (Number(n) || 0).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtFecha(f?: string | null) {
  if (!f) return null;
  return new Date(f).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtNum2(n?: number | null) {
  if (n == null) return "—";
  return (Number(n) || 0).toFixed(2);
}


function stBadge(st: number) {
  const v = Number(st) || 0;
  if (v < 10) return "bg-neutral-200 text-neutral-800 border-neutral-400";
  if (v < 15) return "bg-red-100 text-red-800 border-red-300";
  if (v < 30) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-green-100 text-green-800 border-green-300";
}

function coberturaBadge(con: number, total: number) {
  if (!total) return "bg-muted text-muted-foreground border-border";
  const r = con / total;
  if (r >= 0.8) return "bg-green-100 text-green-800 border-green-300";
  if (r >= 0.4) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-red-100 text-red-800 border-red-300";
}

function toHexColor(color?: string): string | null {
  if (!color) return null;
  const t = color.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(t)) return `#${t.toUpperCase()}`;
  return null;
}

type TallaParsed = {
  talla: string;
  stock: number;
  linea: number;
  outlet: number;
  digital: number;
  bodega: number;
};

function parseTallas(t: Row["tallas_disponibles"]): TallaParsed[] {
  if (!t) return [];
  const arr = Array.isArray(t) ? t : [];
  return arr
    .map((x: any) => {
      const linea = Number(x?.stock_linea ?? x?.linea ?? x?.tiendas ?? 0) || 0;
      const outlet = Number(x?.stock_outlet ?? x?.outlet ?? x?.outlets ?? 0) || 0;
      const digital = Number(x?.stock_digital ?? x?.digital ?? x?.cedi ?? x?.ecommerce ?? 0) || 0;
      const bodega = Number(x?.stock_bodega ?? x?.bodega ?? 0) || 0;
      const stockRaw = Number(x?.stock ?? x?.available ?? x?.qty ?? 0) || 0;
      const stock = stockRaw || linea + outlet + digital + bodega;
      return {
        talla: String(x?.talla ?? x?.size ?? x?.name ?? ""),
        stock,
        linea,
        outlet,
        digital,
        bodega,
      };
    })
    .filter((x) => x.talla);
}


const PAGE_SIZE = 100;
const ST_MAX = 30;

export default function BajaRotacionPage() {
  const [nivel, setNivel] = useState<string>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [coleccion, setColeccion] = useState<string>("todas");
  const [semanasMin, setSemanasMin] = useState<string>("4");
  const [incluirRebajas, setIncluirRebajas] = useState<boolean>(true);
  const [incluirNoDistribuidos, setIncluirNoDistribuidos] = useState<boolean>(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState<number>(1);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: rows = [], isLoading, error, isFetching } = useQuery<Row[]>({
    queryKey: ["baja-rotacion", semanasMin, incluirRebajas, incluirNoDistribuidos],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_baja_rotacion", {
        p_semanas_minimas: Number(semanasMin),
        p_sell_through_max: ST_MAX,
        p_location_id: null,
        p_incluir_rebajas: incluirRebajas,
        p_incluir_no_distribuidos: incluirNoDistribuidos,
      } as any);
      if (error) throw error;
      // El RPC devuelve stock_tiendas_linea / stock_outlets; normalizamos al modelo del UI.
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        stock_linea: Number(r.stock_linea ?? r.stock_tiendas_linea ?? 0) || 0,
        stock_outlet: Number(r.stock_outlet ?? r.stock_outlets ?? 0) || 0,
        stock_digital: Number(r.stock_digital ?? 0) || 0,
        stock_bodega: Number(r.stock_bodega ?? r.stock_bodegas ?? 0) || 0,
        fue_distribuido: r.fue_distribuido !== false,
        adu: r.adu != null ? Number(r.adu) || 0 : null,
      })) as Row[];

    },
  });

  const categorias = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.category && s.add(r.category));
    return Array.from(s).sort();
  }, [rows]);

  const colecciones = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.collection_season && s.add(r.collection_season));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (nivel !== "todos" && r.nivel !== nivel) return false;
        if (categoria !== "todas" && r.category !== categoria) return false;
        if (coleccion !== "todas" && (r.collection_season ?? "") !== coleccion) return false;
        return true;
      })
      .sort((a, b) => (Number(b.stock_actual) || 0) - (Number(a.stock_actual) || 0));
  }, [rows, nivel, categoria, coleccion]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const productIds = useMemo(() => pageRows.map((r) => r.product_id).filter(Boolean), [pageRows]);
  const { data: imagesMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["baja-rot-images", productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const chunkSize = 200;
      for (let i = 0; i < productIds.length; i += chunkSize) {
        const chunk = productIds.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("product_catalog")
          .select("product_id,image_url")
          .in("product_id", chunk);
        if (error) throw error;
        (data ?? []).forEach((r: any) => {
          if (r.product_id && r.image_url && !map[r.product_id]) map[r.product_id] = r.image_url;
        });
      }
      return map;
    },
  });

  const counts = useMemo(() => {
    const c = {
      atencion: { full: 0, rebaja: 0 },
      critico: { full: 0, rebaja: 0 },
      liquidar: { full: 0, rebaja: 0 },
      "sin distribuir": { full: 0, rebaja: 0 },
    };
    rows.forEach((r) => {
      if (r.nivel in c) {
        const k = r.nivel as keyof typeof c;
        if (r.es_rebaja) c[k].rebaja++;
        else c[k].full++;
      }
    });
    return c;
  }, [rows]);


  const stockTotals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.linea += Number(r.stock_linea) || 0;
        acc.outlet += Number(r.stock_outlet) || 0;
        acc.digital += Number(r.stock_digital) || 0;
        acc.bodega += Number(r.stock_bodega) || 0;
        return acc;
      },
      { linea: 0, outlet: 0, digital: 0, bodega: 0 },
    );
  }, [filtered]);


  const handleExport = () => {
    const data = filtered.map((r) => ({
      Producto: r.titulo,
      "Product ID": r.product_id,
      Categoría: r.category,
      Color: r.color,
      Colección: r.collection_season ?? "",
      "Tallas con stock": r.tallas_con_stock,
      "Tallas totales": r.tallas_totales,
      "Cobertura curva (%)": Number(r.cobertura_curva).toFixed(1),
      "Semanas en tienda": r.semanas_en_tienda == null ? "—" : Number(r.semanas_en_tienda).toFixed(1),
      "Días en tienda": r.dias_en_tienda ?? "—",
      "Fecha llegada a tienda": fmtFecha(r.fecha_llegada_tienda) ?? "—",
      Distribuido: r.fue_distribuido ? "Sí" : "No",
      "Unidades vendidas": r.unidades_vendidas,
      "Stock actual": r.stock_actual,
      "Stock Línea": Number(r.stock_linea) || 0,
      "Stock Outlet": Number(r.stock_outlet) || 0,
      "Stock Digital/CEDI": Number(r.stock_digital) || 0,
      "Stock Bodega": Number(r.stock_bodega) || 0,
      "Inventario inicial": r.inventario_inicial,
      "Sell-through (%)": Number(r.sell_through).toFixed(2),
      "Velocidad semanal": fmtNum2(r.velocidad_semanal),


      "Precio actual": Number(r.precio_actual) || 0,
      "Precio original": Number(r.precio_original) || 0,
      "Es rebaja": r.es_rebaja ? "Sí" : "No",
      "Descuento actual (%)": Number(r.descuento_actual).toFixed(1),
      "Descuento sugerido (%)": Number(r.descuento_sugerido).toFixed(1),
      Nivel: NIVEL_LABELS[r.nivel]?.label ?? r.nivel,
      "Acción sugerida": r.accion,
    }));
    exportToXLS(data, `baja-rotacion-${new Date().toISOString().slice(0, 10)}`, "Baja Rotación");
  };

  const handleExportPDF = async () => {
    if (!filtered.length) return;
    const logoB64 = await getLogoBase64();
    const generated = generadoEl();
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;

    doc.setFillColor(15, 15, 15);
    doc.rect(0, 0, pageW, 30, "F");
    if (logoB64) {
      try { doc.addImage(logoB64, "PNG", margin, 4, 50, 22); } catch { /* sin logo */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Baja Rotación", pageW - margin, 11, { align: "right" });
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.text(`Generado ${generated}`, pageW - margin, 18, { align: "right" });
    doc.text(`${fmtInt(filtered.length)} productos`, pageW - margin, 24, { align: "right" });
    doc.setTextColor(0, 0, 0);

    autoTable(doc, {
      startY: 35,
      head: [[
        "Producto", "Categoría", "Colección", "Tallas", "Días rot.", "U. vend.",
        "Stock", "Línea", "Outlet", "Digital", "Bodega",
        "Sell-through", "Vel/sem", "Precio", "Dcto. sug.", "Nivel", "Acción sugerida",
      ]],
      body: filtered.map((r) => [
        r.titulo,
        r.category ?? "-",
        r.collection_season ?? "-",
        `${r.tallas_con_stock}/${r.tallas_totales}`,
        r.fue_distribuido ? String(r.dias_en_tienda ?? "-") : "Sin distribuir",
        fmtInt(r.unidades_vendidas),
        fmtInt(r.stock_actual),
        fmtInt(r.stock_linea ?? 0),
        fmtInt(r.stock_outlet ?? 0),
        fmtInt(r.stock_digital ?? 0),
        fmtInt(r.stock_bodega ?? 0),
        pct(r.sell_through),
        fmtNum2(r.velocidad_semanal),
        fmtCOP(r.precio_actual),
        `-${pct(r.descuento_sugerido)}`,
        NIVEL_LABELS[r.nivel]?.label ?? r.nivel,
        r.accion ?? "-",
      ]),
      styles: { fontSize: 6.4, cellPadding: 1.3, valign: "middle" },
      headStyles: { fillColor: [15, 15, 15], textColor: 255, fontStyle: "bold", fontSize: 6.4 },
      alternateRowStyles: { fillColor: [245, 245, 248] },
      margin: { left: margin, right: margin, top: 14, bottom: 14 },
      showHead: "everyPage",
      columnStyles: {
        0: { cellWidth: 46 },
        4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
        7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
        10: { halign: "right" }, 11: { halign: "right" }, 12: { halign: "right" },
        13: { halign: "right" }, 14: { halign: "right" },
        16: { cellWidth: 38 },
      },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const row = filtered[data.row.index];
        if (!row) return;
        if (data.column.index === 11 && Number(row.sell_through) < 15) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      },

    });

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
                <h2 className="font-display text-base sm:text-lg font-semibold text-foreground">Baja Rotación</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Productos con bajo sell-through y antigüedad en tienda
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handleExport} disabled={!filtered.length} size="sm" variant="outline" className="gap-2">
                <Download className="h-4 w-4" /> Excel
              </Button>
              <Button onClick={handleExportPDF} disabled={!filtered.length} size="sm" className="gap-2">
                <FileText className="h-4 w-4" /> PDF
              </Button>
            </div>
          </header>

          <div className="flex-1 px-4 sm:px-6 py-4 sm:py-6 space-y-6">
            {/* Unidades por canal */}
            <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1"><Store className="h-3.5 w-3.5" /> Tiendas {fmtInt(stockTotals.linea)}</span>
              <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5" /> Outlet {fmtInt(stockTotals.outlet)}</span>
              <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" /> Digital {fmtInt(stockTotals.digital)}</span>
              <span className="flex items-center gap-1"><Warehouse className="h-3.5 w-3.5" /> Bodega {fmtInt(stockTotals.bodega)}</span>
            </p>

            {/* Tarjetas de nivel — filtro rápido */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "atencion", label: "🟡 Atención", icon: AlertTriangle, text: "text-yellow-700", ring: "ring-yellow-400 bg-yellow-50", hint: "cobertura bajo 17 semanas" },
                { key: "critico", label: "🔴 Crítico", icon: AlertCircle, text: "text-red-700", ring: "ring-red-400 bg-red-50", hint: "cobertura entre 17 y 32 semanas" },
                { key: "liquidar", label: "⚫ Liquidar", icon: CircleOff, text: "text-neutral-700", ring: "ring-neutral-500 bg-neutral-100", hint: "cobertura sobre 32 semanas" },
              ] as const).map((n) => {
                const c = counts[n.key as keyof typeof counts];
                const active = nivel === n.key;
                const Icon = n.icon;
                return (
                  <Card
                    key={n.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setNivel(active ? "todos" : n.key); setPage(1); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setNivel(active ? "todos" : n.key); setPage(1); } }}
                    className={`cursor-pointer transition-shadow hover:shadow-md ${active ? `ring-2 ${n.ring}` : ""}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm font-medium flex items-center gap-2 ${n.text}`}>
                        <Icon className="h-4 w-4" /> {n.label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-semibold">{c.full + c.rebaja}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {c.full} full + {c.rebaja} rebajas · {n.hint}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Filtros */}
            <Card>
              <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Nivel</label>
                  <Select value={nivel} onValueChange={(v) => { setNivel(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="atencion">🟡 Atención</SelectItem>
                      <SelectItem value="critico">🔴 Crítico</SelectItem>
                      <SelectItem value="liquidar">⚫ Liquidar</SelectItem>
                      <SelectItem value="sin distribuir">📦 Sin distribuir</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Colección</label>
                  <Select value={coleccion} onValueChange={(v) => { setColeccion(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {colecciones.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Categoría</label>
                  <Select value={categoria} onValueChange={(v) => { setCategoria(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {categorias.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Semanas mínimas</label>
                  <Select value={semanasMin} onValueChange={(v) => { setSemanasMin(v); setPage(1); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 semanas</SelectItem>
                      <SelectItem value="8">8 semanas</SelectItem>
                      <SelectItem value="12">12 semanas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Incluir rebajas</label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={incluirRebajas} onCheckedChange={(v) => { setIncluirRebajas(v); setPage(1); }} />
                    <span className="text-xs text-muted-foreground">{incluirRebajas ? "Sí" : "No"}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Incluir no distribuidos</label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={incluirNoDistribuidos} onCheckedChange={(v) => { setIncluirNoDistribuidos(v); setPage(1); }} />
                    <span className="text-xs text-muted-foreground">{incluirNoDistribuidos ? "Sí" : "No"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* Tabla */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Resultados <span className="text-muted-foreground font-normal">
                    ({fmtInt(filtered.length)} · mostrando {fmtInt(pageRows.length)})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {error ? (
                  <div className="text-sm text-destructive py-8 text-center">
                    Error: {(error as Error).message}
                  </div>
                ) : isLoading || isFetching ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">Cargando…</div>
                ) : filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-8 text-center">
                    Sin productos que cumplan los filtros.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8"></TableHead>
                          <TableHead className="w-16">Foto</TableHead>
                          <TableHead>Producto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead>Colección</TableHead>
                          <TableHead className="text-center">Tallas</TableHead>
                          <TableHead className="text-right">Días rot.</TableHead>
                          <TableHead className="text-right">U. vend.</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Sell-through</TableHead>
                          <TableHead className="text-right">Vel/sem</TableHead>
                          <TableHead className="text-right">Precio</TableHead>
                          <TableHead className="text-right">Dcto. actual</TableHead>
                          <TableHead className="text-right">Dcto. sugerido</TableHead>
                          <TableHead>Nivel</TableHead>
                          <TableHead>Acción sugerida</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => {
                          const niv = NIVEL_LABELS[r.nivel];
                          const img = imagesMap[r.product_id];
                          const hex = toHexColor(r.color);
                          const tallas = parseTallas(r.tallas_disponibles);
                          const isOpen = expanded.has(r.product_id);

                          return (
                            <Fragment key={r.product_id}>
                              <TableRow className="cursor-pointer" onClick={() => toggleExpand(r.product_id)}>
                                <TableCell className="p-2">
                                  {isOpen ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {img ? (
                                    <img
                                      src={img}
                                      alt={r.titulo}
                                      loading="lazy"
                                      className="h-12 w-12 rounded object-cover border border-border bg-muted"
                                    />
                                  ) : (
                                    <div className="h-12 w-12 rounded border border-dashed border-border bg-muted" />
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="font-medium text-sm">{r.titulo}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{r.product_id}</div>
                                </TableCell>
                                <TableCell className="text-xs">{r.category}</TableCell>
                                <TableCell className="text-xs">
                                  <div className="flex items-center gap-2">
                                    {hex && (
                                      <span
                                        className="inline-block h-4 w-4 rounded-full border border-border shadow-sm"
                                        style={{ backgroundColor: hex }}
                                        title={hex}
                                      />
                                    )}
                                    <span className="font-mono">{hex ?? r.color}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {r.collection_season ?? "—"}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${coberturaBadge(
                                      r.tallas_con_stock,
                                      r.tallas_totales,
                                    )}`}
                                  >
                                    {r.tallas_con_stock}/{r.tallas_totales}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {!r.fue_distribuido ? (
                                    <span className="text-violet-700 font-medium">Sin distribuir</span>
                                  ) : r.dias_en_tienda != null ? (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="tabular-nums cursor-help border-b border-dotted border-muted-foreground/40">
                                            {r.dias_en_tienda}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          {fmtFecha(r.fecha_llegada_tienda)
                                            ? `Llegó a tienda el ${fmtFecha(r.fecha_llegada_tienda)}`
                                            : "Contado desde el despacho a tienda"}
                                          {fmtFecha(r.primera_venta) ? ` · primera venta ${fmtFecha(r.primera_venta)}` : ""}
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>

                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs">{r.unidades_vendidas}</TableCell>
                                <TableCell className="text-right text-xs whitespace-nowrap">
                                  <div className="font-semibold tabular-nums">{fmtInt(r.stock_actual)}</div>
                                  <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground tabular-nums">
                                    <span className="flex items-center gap-0.5"><Store className="h-3 w-3" />{fmtInt(r.stock_linea ?? 0)}</span>
                                    <span className="flex items-center gap-0.5"><Tag className="h-3 w-3" />{fmtInt(r.stock_outlet ?? 0)}</span>
                                    <span className="flex items-center gap-0.5"><Globe className="h-3 w-3" />{fmtInt(r.stock_digital ?? 0)}</span>
                                    <span className="flex items-center gap-0.5"><Warehouse className="h-3 w-3" />{fmtInt(r.stock_bodega ?? 0)}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${stBadge(
                                      r.sell_through,
                                    )}`}
                                  >
                                    {pct(r.sell_through)}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {fmtNum2(r.velocidad_semanal)}
                                </TableCell>

                                <TableCell className="text-right text-xs">
                                  <div className="font-medium">{fmtCOP(r.precio_actual)}</div>
                                  {r.es_rebaja && r.precio_original > r.precio_actual && (
                                    <div className="text-[10px] text-muted-foreground line-through">
                                      {fmtCOP(r.precio_original)}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right text-xs">
                                  {r.es_rebaja ? (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium border bg-orange-100 text-orange-800 border-orange-300">
                                      -{pct(r.descuento_actual)}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold border bg-primary/10 text-primary border-primary/30">
                                    -{pct(r.descuento_sugerido)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {niv ? (
                                    <span
                                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${niv.className}`}
                                    >
                                      {niv.emoji} {niv.label}
                                    </span>
                                  ) : (
                                    <Badge variant="outline">{r.nivel}</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                                  {r.accion}
                                </TableCell>
                              </TableRow>
                              {isOpen && (
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableCell colSpan={17} className="py-3">
                                    <div className="space-y-2">
                                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                        Stock por talla y canal
                                      </div>
                                      {tallas.length === 0 ? (
                                        <div className="text-xs text-muted-foreground">Sin detalle de tallas</div>
                                      ) : (
                                        <div className="flex flex-wrap gap-2">
                                          {tallas.map((t, i) => {
                                            const cls =
                                              t.stock <= 0
                                                ? "bg-red-50 text-red-700 border-red-200"
                                                : t.stock < 3
                                                  ? "bg-yellow-50 text-yellow-800 border-yellow-200"
                                                  : "bg-green-50 text-green-800 border-green-200";
                                            return (
                                              <div
                                                key={`${t.talla}-${i}`}
                                                className={`inline-flex flex-col gap-1 px-2.5 py-1.5 rounded-md border text-xs ${cls}`}
                                              >
                                                <div className="flex items-center gap-1.5 font-semibold">
                                                  <span>{t.talla}</span>
                                                  <span className="opacity-60">·</span>
                                                  <span>{t.stock}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[10px] font-normal opacity-90">
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🏪 {t.linea}
                                                  </span>
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🏷️ {t.outlet}
                                                  </span>
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🌐 {t.digital}
                                                  </span>
                                                  <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-background/60 border border-border">
                                                    🏭 {t.bodega}

                                                  </span>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between gap-3 pt-4 text-xs text-muted-foreground">
                        <span>
                          Página {currentPage} de {totalPages} · {fmtInt(filtered.length)} productos
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={currentPage <= 1}
                            onClick={() => setPage(currentPage - 1)}
                          >
                            Anterior
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={currentPage >= totalPages}
                            onClick={() => setPage(currentPage + 1)}
                          >
                            Siguiente
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
