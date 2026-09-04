import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { differenceInCalendarDays } from "date-fns";
import { TimeFilter, resolveDays } from "@/components/dashboard/TimeFilter";
import { EmptyState } from "@/components/dashboard/LoadingState";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

import { MultiSelectFilter } from "@/components/dashboard/MultiSelectFilter";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronRight, Store, Globe, Tag, Pause, AlertTriangle } from "lucide-react";

interface Row {
  nivel: string;
  coleccion: string;
  linea: string;
  producto_id: string | null;
  producto: string | null;
  foto: string | null;
  pvp_mediana: number;
  pvp_min: number;
  pvp_max: number;
  precio_promedio: number | null;
  pct_descuento_prom: number | null;
  und_vendidas: number;
  und_tiendas: number;
  und_online: number;
  und_outlet: number;
  und_hombre?: number;
  und_mujer?: number;
  und_unisex?: number;
  genero?: string | null;
  und_full: number;
  und_rebajas: number;
  und_promo: number;
  clasificacion?: string;
  stock_tiendas: number;
  stock_online: number;
  stock_bodega: number;
  stock_total: number;
  pct_evac_0_90: number;
  pct_evac_90_120: number;
  pct_evac_120_150: number;
  pct_evac_150: number;
  uds_evac_0_90: number;
  uds_evac_90_120: number;
  uds_evac_120_150: number;
  productos_maduros: number;
  productos_total: number;
  rdv_semanal: number;
  sell_through_pct: number;
  wos: number;
  estado_salud: string;
  fecha_stock?: string | null;
  fecha_bodega?: string | null;
  dias_desde_conciliacion?: number | null;
}

const CANAL_OPTIONS = [
  { value: "all", label: "Todos los canales" },
  { value: "TIENDA", label: "🏪 Tiendas" },
  { value: "OUTLET", label: "🏷️ Outlets" },
  { value: "Online", label: "🌐 Online" },
];

const GENERO_OPTIONS = [
  { value: "all", label: "Todos los géneros" },
  { value: "HOMBRE", label: "♂ Hombre" },
  { value: "MUJER", label: "♀ Mujer" },
  { value: "UNISEX", label: "⚲ Unisex" },
  { value: "SIN GENERO", label: "Sin género" },
];

const NOTA_PIE =
  "Precio de Venta = efectivamente cobrado, ponderado por unidades vendidas. Precio de Lista = compare_at_price del catálogo, o price si está vacío; en líneas se muestra el rango de precios. Stock = tiendas + online + bodega. El stock de bodega proviene de la última conciliación con NetSuite, que puede ser anterior al día de hoy. Las bodegas internas solo se actualizan al conciliar. Evacuación = tramos incrementales sobre lo producido.";

const money = (n: number | null | undefined) =>
  "$ " + Math.round(Number(n ?? 0)).toLocaleString("es-CO");
const int = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("es-CO");
const pct = (n: number | null | undefined, d = 1) => `${Number(n ?? 0).toFixed(d)}%`;
const pctCol = (n: number | null | undefined, d = 1) =>
  `${Number(n ?? 0).toFixed(d).replace(".", ",")}%`;

const fechaCorta = (fecha: string | Date | null | undefined) => {
  if (!fecha) return "";
  // Las fechas 'YYYY-MM-DD' de la RPC son fechas calendario: no aplicar zona horaria
  if (typeof fecha === "string") {
    const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return d
        .toLocaleDateString("es-CO", { day: "numeric", month: "short" })
        .replace(/\.$/, "");
    }
  }
  const d = new Date(fecha);
  return d
    .toLocaleDateString("es-CO", {
      timeZone: "America/Bogota",
      day: "numeric",
      month: "short",
    })
    .replace(/\.$/, "");
};


const wosColor = (w: number) =>
  w > 12 ? "text-destructive" : w < 4 ? "text-amber-600" : "text-emerald-600";

function UnidadesCell({ r }: { r: Row }) {
  const total = Number(r.und_vendidas ?? 0);
  const items = [
    { label: "Tiendas", val: Math.max(0, Number(r.und_tiendas ?? 0)) },
    { label: "Online", val: Math.max(0, Number(r.und_online ?? 0)) },
    { label: "Outlet", val: Math.max(0, Number(r.und_outlet ?? 0)) },
  ].filter((i) => i.val > 0);
  return (
    <div className="text-right">
      <div className="text-sm font-semibold tabular-nums">{int(total)}</div>
      {items.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-0.5 text-xs font-medium w-full min-w-[84px]">
          {items.map((i) => (
            <div key={i.label} className="flex items-center justify-between">
              <span className="text-muted-foreground">{i.label}</span>
              <span className="tabular-nums text-foreground">{int(i.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StockCell({ r }: { r: Row }) {
  const fechaStock = fechaCorta(r.fecha_stock);
  const fechaBodega = fechaCorta(r.fecha_bodega);
  const tip = [
    fechaStock ? `Tiendas y online al ${fechaStock}` : "Tiendas y online",
    fechaBodega ? `Bodega al ${fechaBodega}` : "Bodega",
  ].join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="text-right cursor-help">
          <div className="text-sm font-semibold tabular-nums">{int(r.stock_total)}</div>
          <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground tabular-nums mt-0.5">
            <span className="inline-flex items-center gap-0.5"><Store className="h-3 w-3" />{int(r.stock_tiendas)}</span>
            <span className="inline-flex items-center gap-0.5"><Globe className="h-3 w-3" />{int(r.stock_online)}</span>
            <span className="inline-flex items-center gap-0.5"><Pause className="h-3 w-3" />{int(r.stock_bodega)}</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

const horaConciliacion = (ts: string | null | undefined) => {
  if (!ts) return "";
  return new Date(ts)
    .toLocaleTimeString("es-CO", {
      timeZone: "America/Bogota",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s?a\.?\s?m\.?/i, " a.m.")
    .replace(/\s?p\.?\s?m\.?/i, " p.m.");
};

// Fuente única: proceso_ejecucion_log.ultima_ejecucion (America/Bogota)
const bogotaYMD = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

function FrescuraBadge({ conciliadoEn }: { conciliadoEn?: string | null }) {
  if (!conciliadoEn) return null;
  const ts = new Date(conciliadoEn);
  if (Number.isNaN(ts.getTime())) return null;

  const hoyYMD = bogotaYMD(new Date());
  const conYMD = bogotaYMD(ts);
  const dias = Math.max(
    0,
    Math.round((Date.parse(`${hoyYMD}T00:00:00Z`) - Date.parse(`${conYMD}T00:00:00Z`)) / 86400000),
  );

  const fecha = fechaCorta(conYMD);
  const hora = horaConciliacion(conciliadoEn);
  const cuando = dias === 0 ? "hoy" : `el ${fecha}`;
  const bodegaTxt = `Bodega conciliada ${cuando}${hora ? `, ${hora}` : ""}`;

  if (dias === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        Inventario al {fecha} · {bodegaTxt}
      </span>
    );
  }

  if (dias <= 2) {
    return (
      <span className="text-xs font-medium text-amber-600">
        {bodegaTxt} · {dias} día{dias === 1 ? "" : "s"} de desfase
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
      <AlertTriangle className="h-3.5 w-3.5" />
      {bodegaTxt} · {dias} día{dias === 1 ? "" : "s"} sin conciliar
    </span>
  );
}


function TableSkeleton({ rows = 8, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex gap-4 px-4 py-3 bg-muted/30 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-32" : "flex-1")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 px-4 py-4 border-b border-border last:border-0">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className={cn("h-4", i === 0 ? "w-32" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}


function EvacuacionCell({ r }: { r: Row }) {
  const t1 = Math.max(0, Number(r.pct_evac_0_90 ?? 0));
  const t2 = Math.max(0, Number(r.pct_evac_90_120 ?? 0));
  const t3 = Math.max(0, Number(r.pct_evac_120_150 ?? 0));
  const u1 = Number(r.uds_evac_0_90 ?? 0);
  const u2 = Number(r.uds_evac_90_120 ?? 0);
  const u3 = Number(r.uds_evac_120_150 ?? 0);
  const total = Number(r.pct_evac_150 ?? t1 + t2 + t3);
  const maduros = Number(r.productos_maduros ?? 0);
  const totalProd = Number(r.productos_total ?? 0);
  // Señal visual solo cuando MENOS de la mitad de los productos cumplió la ventana de 150 días.
  const incompleta = totalProd > 0 && maduros / totalProd < 0.5;
  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const seg = (w: number, color: string) =>
    w <= 0 ? null : <div className={cn("h-full", color)} style={{ width: `${clamp(w)}%` }} />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 min-w-[185px] cursor-help">
          <div
            className={cn(
              "relative h-2.5 min-w-[110px] flex-1 rounded-full bg-muted overflow-hidden",
              incompleta && "opacity-60",
            )}
          >
            <div className="absolute inset-0 flex">
              {seg(t1, "bg-emerald-500")}
              {seg(t2, "bg-amber-500")}
              {seg(t3, "bg-amber-300")}
            </div>

            {[t1, t1 + t2].map((m, i) =>
              m > 0 && m < 100 ? (
                <div
                  key={i}
                  className="absolute top-0 h-full w-px bg-background/80"
                  style={{ left: `${clamp(m)}%` }}
                />
              ) : null,
            )}
          </div>
          <div className="text-[11px] font-medium tabular-nums whitespace-nowrap">
            {pctCol(total)} <span className="text-muted-foreground">· {int(u1 + u2 + u3)} uds</span>
          </div>
        </div>
      </TooltipTrigger>

      <TooltipContent side="left" className="text-xs space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 0–90 d: {int(u1)} uds · {pct(t1)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> 90–120 d: {int(u2)} uds · {pct(t2)}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-300" /> 120–150 d: {int(u3)} uds · {pct(t3)}
        </div>
        <div className="pt-1 border-t border-border/50">
          Total 150 d: {int(u1 + u2 + u3)} uds · {pct(total)} prom.
        </div>
        <div className="text-muted-foreground">
          {totalProd > 0 && (
            <>
              {int(maduros)} de {int(totalProd)} productos con 150+ días (
              {(totalProd > 0 ? (maduros / totalProd) * 100 : 0).toFixed(1).replace(".", ",")}%)
            </>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const NoData = () => <span className="text-muted-foreground">—</span>;

const GENERO_BADGE: Record<string, { label: string; className: string }> = {
  HOMBRE: { label: "HOMBRE", className: "border-sky-500/50 bg-sky-500/10 text-sky-700" },
  MUJER: { label: "MUJER", className: "border-pink-500/50 bg-pink-500/10 text-pink-700" },
  UNISEX: { label: "UNISEX", className: "border-violet-500/50 bg-violet-500/10 text-violet-700" },
};


function GeneroCell({ r, enDetalle }: { r: Row; enDetalle: boolean }) {
  if (enDetalle) {
    const g = (r.genero ?? "").toUpperCase();
    const conf = GENERO_BADGE[g] ?? {
      label: g ? g : "SIN GÉNERO",
      className: "border-border bg-muted/40 text-muted-foreground",
    };
    return (
      <span className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap",
        conf.className,
      )}>
        {conf.label}
      </span>
    );
  }

  const h = Math.max(0, Number(r.und_hombre ?? 0));
  const m = Math.max(0, Number(r.und_mujer ?? 0));
  const u = Math.max(0, Number(r.und_unisex ?? 0));
  const base = Math.max(Number(r.und_vendidas ?? 0), h + m + u);
  if (base === 0) return <NoData />;
  const p = (n: number) => (n / base) * 100;

  const items = [
    { key: "HOMBRE", uds: h, className: "text-sky-700" },
    { key: "MUJER", uds: m, className: "text-pink-700" },
    { key: "UNISEX", uds: u, className: "text-violet-700" },
  ]
    .filter((i) => i.uds > 0)
    .sort((a, b) => b.uds - a.uds);

  const dominant = items[0];
  const visible = p(dominant.uds) > 95 ? [dominant] : items;

  return (
    <div className="flex flex-col gap-0.5 text-xs font-medium w-full min-w-[84px]">
      {visible.map((i) => (
        <div key={i.key} className="flex items-center justify-between">
          <span className={cn(i.className)}>{i.key}</span>
          <span className="tabular-nums">{Math.round(p(i.uds))}%</span>
        </div>
      ))}
    </div>
  );
}


function CalidadVentaCell({ r }: { r: Row }) {
  const total = Number(r.und_vendidas ?? 0);
  if (total === 0) return <NoData />;
  const items = [
    { label: "Full", val: Math.max(0, Number(r.und_full ?? 0)), className: "text-emerald-600" },
    { label: "Rebajas", val: Math.max(0, Number(r.und_rebajas ?? 0)), className: "text-destructive" },
    { label: "Promo", val: Math.max(0, Number(r.und_promo ?? 0)), className: "text-amber-600" },
  ]
    .filter((i) => i.val > 0)
    .sort((a, b) => b.val - a.val);
  return (
    <div className="flex flex-col gap-0.5 text-xs font-medium w-full min-w-[84px]">
      {items.map((i) => (
        <div key={i.label} className="flex items-center justify-between">
          <span className={cn(i.className)}>{i.label}</span>
          <span className="tabular-nums text-foreground">
            {int(i.val)}
            <span className="text-muted-foreground font-normal ml-1">
              {Math.round((i.val / total) * 100)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricCells({ r, enDetalle = false }: { r: Row; enDetalle?: boolean }) {
  const sinVentas = Number(r.und_vendidas ?? 0) === 0;
  const precioProm = r.precio_promedio == null ? null : Number(r.precio_promedio);
  const dtoProm = r.pct_descuento_prom == null ? null : Number(r.pct_descuento_prom);
  const pvp = r.pvp_mediana == null ? null : Number(r.pvp_mediana);
  const pvpMin = r.pvp_min == null ? null : Number(r.pvp_min);
  const pvpMax = r.pvp_max == null ? null : Number(r.pvp_max);
  const descuentoClass =
    dtoProm != null && dtoProm > 50
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : dtoProm != null && dtoProm > 30
        ? "border-amber-500/60 bg-amber-500/10 text-amber-700"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <>
      {/* Precios: venta principal, lista secundaria y descuento destacado */}
      <TableCell className="text-right whitespace-nowrap tabular-nums py-2">
        {precioProm == null ? (
          <NoData />
        ) : (
          <div className="text-sm font-bold text-foreground">{money(precioProm)}</div>
        )}
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {enDetalle
            ? pvp == null ? "— lista" : `${money(pvp)} lista`
            : pvpMin == null || pvpMax == null
              ? "— lista"
              : `${money(pvpMin)} – ${money(pvpMax)} lista`}
        </div>
        {dtoProm == null ? (
          <div className="mt-1 text-[10px] text-muted-foreground">—</div>
        ) : (
          <span className={cn(
            "mt-1 inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-semibold",
            descuentoClass,
          )}>
            −{pctCol(Math.abs(dtoProm))}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right"><UnidadesCell r={r} /></TableCell>
      <TableCell><GeneroCell r={r} enDetalle={enDetalle} /></TableCell>
      <TableCell className="text-right"><StockCell r={r} /></TableCell>
      <TableCell><CalidadVentaCell r={r} /></TableCell>
      <TableCell className="text-right text-sm">
        {sinVentas || r.rdv_semanal == null ? <NoData /> : Number(r.rdv_semanal).toFixed(1)}
      </TableCell>
      <TableCell><EvacuacionCell r={r} /></TableCell>
      {/* Rotación: sell-through arriba, WOS debajo */}
      <TableCell className="text-right whitespace-nowrap">
        <div className="text-sm font-semibold tabular-nums">
          {sinVentas || r.sell_through_pct == null ? <NoData /> : pct(r.sell_through_pct)}
        </div>
        <div className={cn("text-[10px] font-medium tabular-nums", wosColor(Number(r.wos ?? 0)))}>
          {Number(r.wos ?? 0) >= 999 ? "∞" : `${Number(r.wos ?? 0).toFixed(1)}w`} WOS
        </div>
      </TableCell>
    </>
  );
}

function HeadMetrics({ canal }: { canal: string }) {
  return (
    <>
      <TableHead className="text-right">
        Precios
        <span className="block text-[9px] font-normal normal-case text-muted-foreground">
          venta · lista · dto.
        </span>
      </TableHead>
      <TableHead className="text-right min-w-[100px]">Unidades Vendidas</TableHead>
      <TableHead className="min-w-[100px]">Género</TableHead>
      <TableHead className="text-right">Stock</TableHead>
      <TableHead className="min-w-[110px]">Calidad de Venta</TableHead>
      <TableHead className="text-right">
        RDV
        <span className="block text-[9px] font-normal normal-case text-muted-foreground">
          {canal === "Online" ? "uds/semana" : "uds/tienda/semana"}
        </span>
      </TableHead>
      <TableHead className="min-w-[200px]">Evacuación</TableHead>
      <TableHead className="text-right">
        Rotación
        <span className="block text-[9px] font-normal normal-case text-muted-foreground">
          sell-through · WOS
        </span>
      </TableHead>
    </>
  );
}


function Convenciones() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground border border-border rounded-lg px-3 py-2">
      <span className="font-semibold text-foreground">Convenciones:</span>
      <span className="inline-flex items-center gap-1"><Store className="h-3 w-3" /> Tiendas</span>
      <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Online</span>
      <span className="inline-flex items-center gap-1"><Tag className="h-3 w-3" /> Outlet (ventas)</span>
      <span className="inline-flex items-center gap-1"><Pause className="h-3 w-3" /> Bodega / stand by (stock)</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-emerald-500" /> Evacuación 0–90 días</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-amber-500" /> 90–120 días</span>
      <span className="inline-flex items-center gap-1"><span className="h-2 w-4 rounded-sm bg-amber-300" /> 120–150 días</span>
      <span>Barra atenuada = menos de la mitad de los productos con 150+ días cumplidos.</span>
    </div>
  );
}

function ResumenCards({ rows }: { rows: Row[] }) {
  const s = (k: keyof Row) => rows.reduce((a, r) => a + Number((r[k] as number) ?? 0), 0);
  const undTotal = s("und_vendidas");
  const stockTotal = s("stock_total");
  const full = s("und_full"), reb = s("und_rebajas"), promo = s("und_promo");
  const calTotal = full + reb + promo;
  const share = (n: number, t: number) => (t > 0 ? `${((n / t) * 100).toFixed(1)}%` : "—");

  const Item = ({ icon, label, value, extra }: { icon?: React.ReactNode; label: string; value: number; extra?: string }) => (
    <div className="flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
      <span className="tabular-nums font-medium">
        {int(value)}
        {extra ? <span className="text-muted-foreground font-normal ml-1.5">{extra}</span> : null}
      </span>
    </div>
  );

  const Card = ({ title, total, children }: { title: string; total: number; children: React.ReactNode }) => (
    <div className="rounded-lg border border-border p-3 space-y-2 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
        <span className="text-lg font-semibold tabular-nums">{int(total)}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Card title="Unidades vendidas por canal" total={undTotal}>
        <Item icon={<Store className="h-3 w-3" />} label="Tiendas" value={s("und_tiendas")} extra={share(s("und_tiendas"), undTotal)} />
        <Item icon={<Globe className="h-3 w-3" />} label="Online" value={s("und_online")} extra={share(s("und_online"), undTotal)} />
        <Item icon={<Tag className="h-3 w-3" />} label="Outlet" value={s("und_outlet")} extra={share(s("und_outlet"), undTotal)} />
      </Card>
      <Card title="Inventario por ubicación" total={stockTotal}>
        <Item icon={<Store className="h-3 w-3" />} label="Tiendas" value={s("stock_tiendas")} extra={share(s("stock_tiendas"), stockTotal)} />
        <Item icon={<Globe className="h-3 w-3" />} label="Online" value={s("stock_online")} extra={share(s("stock_online"), stockTotal)} />
        <Item icon={<Pause className="h-3 w-3" />} label="Bodega" value={s("stock_bodega")} extra={share(s("stock_bodega"), stockTotal)} />
      </Card>
      <Card title="Calidad de venta" total={calTotal}>
        <Item icon={<span className="h-2 w-2 rounded-full bg-emerald-500" />} label="Full price" value={full} extra={share(full, calTotal)} />
        <Item icon={<span className="h-2 w-2 rounded-full bg-amber-500" />} label="Rebajas" value={reb} extra={share(reb, calTotal)} />
        <Item icon={<span className="h-2 w-2 rounded-full bg-sky-500" />} label="Promo" value={promo} extra={share(promo, calTotal)} />
      </Card>
    </div>
  );
}

const normalizar = (s: string) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function AnalisisLinea360Page() {

  const [searchParams, setSearchParams] = useSearchParams();

  const [days, setDays] = useState<number>(() => Number(searchParams.get("dias") ?? 90) || 90);
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [coleccion, setColeccion] = useState(() => searchParams.get("coleccion") ?? "all");
  const [canal, setCanal] = useState(() => searchParams.get("canal") ?? "all");
  const [genero, setGenero] = useState(() => searchParams.get("genero") ?? "all");
  const [soloSinVentas, setSoloSinVentas] = useState(() => searchParams.get("sinventas") === "1");
  const [lineasSel, setLineasSel] = useState<string[]>(() => {
    const raw = searchParams.get("lineas");
    return raw ? raw.split("|").filter(Boolean) : [];
  });
  const [lineaOptions, setLineaOptions] = useState<string[]>([]);


  const [colOptions, setColOptions] = useState<string[]>([]);
  const colOptionsLoaded = useRef(false);

  const [detail, setDetail] = useState<{ coleccion: string | null; linea: string } | null>(null);

  // Filtros propios del drawer
  const [detColeccion, setDetColeccion] = useState<string>("all");
  const [detBusqueda, setDetBusqueda] = useState("");
  const [detStockOp, setDetStockOp] = useState<"gt" | "lt">("gt");
  const [detStockVal, setDetStockVal] = useState("");

  const dias = resolveDays(days);
  const canalParam = canal === "all" ? null : canal;
  const generoParam = genero === "all" ? null : genero;

  // Sincronizar filtros con la URL para que sobrevivan y se puedan compartir.
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("dias", String(days));
    if (coleccion !== "all") next.set("coleccion", coleccion);
    if (canal !== "all") next.set("canal", canal);
    if (genero !== "all") next.set("genero", genero);
    if (soloSinVentas) next.set("sinventas", "1");
    if (lineasSel.length) next.set("lineas", lineasSel.join("|"));
    setSearchParams(next, { replace: true });
  }, [days, coleccion, canal, genero, soloSinVentas, lineasSel, setSearchParams]);


  const handleDaysChange = (d: number) => {
    setCustomFrom(undefined);
    setCustomTo(undefined);
    setDays(d);
  };
  const handleCustomRangeChange = (from: Date, to: Date) => {
    setCustomFrom(from);
    setCustomTo(to);
    setDays(Math.max(differenceInCalendarDays(to, from), 0));
  };


  useEffect(() => {
    if (colOptionsLoaded.current) return;
    colOptionsLoaded.current = true;
    (async () => {
      const { data } = await supabase
        .from("product_catalog")
        .select("collection_season")
        .not("collection_season", "is", null);
      setColOptions(
        [...new Set((data ?? []).map((r: any) => r.collection_season).filter(Boolean))].sort() as string[],
      );
      const { data: mapRows } = await supabase.from("categoria_padre_map").select("categoria_padre");
      const lineas = [...new Set(((mapRows ?? []) as { categoria_padre: string }[])
        .map((r) => r.categoria_padre).filter(Boolean))].sort();
      if (lineas.length) setLineaOptions((prev) => (prev.length ? prev : lineas));
    })();
  }, []);

  const mainQ = useQuery({
    queryKey: ["linea360", dias, coleccion, canalParam, generoParam, lineasSel.join("|")],
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_analisis_linea_coleccion", {
        p_dias: dias,
        p_coleccion: coleccion === "all" ? undefined : coleccion,
        p_linea: undefined,
        p_canal: canalParam ?? undefined,
        p_lineas: lineasSel.length ? lineasSel : undefined,
        p_genero: generoParam ?? undefined,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => mainQ.data ?? [], [mainQ.data]);
  const loading = mainQ.isLoading;
  const error = mainQ.error ? (mainQ.error as Error).message : null;

  useEffect(() => {
    if (!mainQ.data || lineasSel.length) return;
    setLineaOptions([...new Set(mainQ.data.map((r) => r.linea).filter(Boolean))].sort());
  }, [mainQ.data, lineasSel.length]);

  // Fecha y hora de la última conciliación NetSuite (para el indicador de frescura)
  const conciliacionQ = useQuery({
    queryKey: ["conciliacion-ultima-ejecucion"],
    staleTime: 30 * 1000,
    refetchOnMount: true,
    queryFn: async () => {
      const { data } = await supabase
        .from("proceso_ejecucion_log")
        .select("ultima_ejecucion")
        .eq("proceso", "aplicar_conciliacion_netsuite")
        .maybeSingle();
      return (data?.ultima_ejecucion as string | null) ?? null;
    },
  });

  const detailQ = useQuery({
    queryKey: ["linea360-detalle", detail?.linea ?? null, dias, detColeccion, canalParam, generoParam],
    enabled: !!detail,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reporte_analisis_linea_coleccion", {
        p_dias: dias,
        p_coleccion: detColeccion === "all" ? undefined : detColeccion,
        p_linea: detail!.linea,
        p_canal: canalParam ?? undefined,
        p_genero: generoParam ?? undefined,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const detailRows = useMemo(() => detailQ.data ?? [], [detailQ.data]);
  const detailLoading = detailQ.isLoading && !!detail;
  const detailError = detailQ.error ? (detailQ.error as Error).message : null;


  const lineas = useMemo(
    () =>
      [...rows]
        .filter((r) => (soloSinVentas ? Number(r.und_vendidas ?? 0) === 0 : true))
        .sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0)),
    [rows, soloSinVentas],
  );

  const detalleBase = useMemo(
    () =>
      [...detailRows]
        .filter((r) => (soloSinVentas ? Number(r.und_vendidas ?? 0) === 0 : true))
        .sort((a, b) => Number(b.und_vendidas ?? 0) - Number(a.und_vendidas ?? 0)),
    [detailRows, soloSinVentas],
  );

  const detalle = useMemo(() => {
    const q = normalizar(detBusqueda);
    const umbral = detStockVal.trim() === "" ? null : Number(detStockVal);
    return detalleBase.filter((r) => {
      if (q && !normalizar(r.producto ?? "").includes(q)) return false;
      if (umbral !== null && Number.isFinite(umbral)) {
        const stock = Number(r.stock_total ?? 0);
        if (detStockOp === "gt" ? !(stock > umbral) : !(stock < umbral)) return false;
      }
      return true;
    });
  }, [detalleBase, detBusqueda, detStockOp, detStockVal]);


  return (
    <TooltipProvider delayDuration={100}>
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border px-4 gap-2">
            <SidebarTrigger />
            <h1 className="text-sm font-semibold text-foreground">Análisis por Línea 360</h1>
          </header>

          <main className="flex-1 p-4 md:p-6 space-y-4 min-w-0">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Período
                </label>
                <TimeFilter
                  value={days}
                  onChange={handleDaysChange}
                  customFrom={customFrom}
                  customTo={customTo}
                  onCustomRangeChange={handleCustomRangeChange}
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Colección
                </label>
                <Select value={coleccion} onValueChange={setColeccion}>
                  <SelectTrigger className="h-9 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {colOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Canal
                </label>
                <Select value={canal} onValueChange={setCanal}>
                  <SelectTrigger className="h-9 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                 </Select>
               </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Género
                </label>
                <Select value={genero} onValueChange={setGenero}>
                  <SelectTrigger className="h-9 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERO_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
               <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Línea
                </label>
                <MultiSelectFilter
                  label="Línea"
                  options={lineaOptions}
                  selected={lineasSel}
                  onChange={(v) => setLineasSel(v.length === lineaOptions.length ? [] : v)}
                  className="[&>button]:h-9"
                />
              </div>

              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Filtro rápido
                </label>
                <button
                  type="button"
                  onClick={() => setSoloSinVentas((v) => !v)}
                  className={cn(
                    "h-9 px-3 rounded-md border text-xs font-medium transition-colors",
                    soloSinVentas
                      ? "bg-destructive/10 border-destructive/40 text-destructive"
                      : "bg-background border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  Sin ventas en el período
                </button>
              </div>
              <div className="ml-auto flex items-end pb-1.5">
                <FrescuraBadge conciliadoEn={conciliacionQ.data} />
              </div>
            </div>


            {/* Tabla */}
            {loading ? (
              <TableSkeleton rows={8} cols={8} />
            ) : error ? (
              <EmptyState message={`Error: ${error}`} />
            ) : !lineas.length ? (
              <EmptyState message="Sin datos para los filtros seleccionados." />
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[980px]">
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[160px] sticky left-0 z-20 bg-background">Línea</TableHead>
                        <HeadMetrics canal={canal} />
                        <TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineas.map((r) => (
                        <TableRow
                          key={r.linea}
                          className="cursor-pointer hover:bg-primary/5"
                          onClick={() => {
                            setDetColeccion(coleccion);
                            setDetBusqueda("");
                            setDetStockVal("");
                            setDetStockOp("gt");
                            setDetail({ coleccion: coleccion === "all" ? null : coleccion, linea: r.linea });
                          }}
                        >
                          <TableCell className="text-sm font-medium whitespace-nowrap sticky left-0 z-10 bg-background">{r.linea}</TableCell>
                          <MetricCells r={r} />
                          <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <Convenciones />
            <p className="text-[11px] text-muted-foreground">{NOTA_PIE}</p>
          </main>
        </div>
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <SheetContent className="!max-w-full w-full overflow-y-auto p-0" side="right">
          <SheetHeader className="p-6 pb-4 border-b border-border">
            <SheetTitle className="text-base font-semibold">
              {detail?.linea}{detColeccion !== "all" ? ` · ${detColeccion}` : ""}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">Detalle por producto</p>
          </SheetHeader>
          <div className="p-6 space-y-4">
            {/* Filtros del detalle */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Colección
                </label>
                <Select value={detColeccion} onValueChange={setDetColeccion}>
                  <SelectTrigger className="h-9 w-[200px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las colecciones</SelectItem>
                    {colOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Buscar producto
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={detBusqueda}
                    onChange={(e) => setDetBusqueda(e.target.value)}
                    placeholder="Nombre del producto..."
                    className="h-9 w-[240px] text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {detalle.length} de {detalleBase.length} productos
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  Stock
                </label>
                <div className="flex items-center gap-2">
                  <Select value={detStockOp} onValueChange={(v) => setDetStockOp(v as "gt" | "lt")}>
                    <SelectTrigger className="h-9 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">mayor que</SelectItem>
                      <SelectItem value="lt">menor que</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={detStockVal}
                    onChange={(e) => setDetStockVal(e.target.value)}
                    placeholder="—"
                    className="h-9 w-[100px] text-xs"
                  />
                </div>
              </div>
            </div>

            {detailLoading ? (
              <TableSkeleton rows={6} cols={8} />
            ) : detailError ? (
              <EmptyState message={`Error: ${detailError}`} />
            ) : !detalle.length ? (
              <EmptyState message="Sin productos con datos." />
            ) : (
              <>
              <ResumenCards rows={detalle} />
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="overflow-auto max-h-[65vh]">

                  <Table className="min-w-[1100px]">
                    <TableHeader className="sticky top-0 z-20 bg-background">
                      <TableRow className="bg-muted/30">
                        <TableHead className="min-w-[200px] sticky left-0 z-30 bg-background">Producto</TableHead>
                        <HeadMetrics canal={canal} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalle.map((r) => (
                          <TableRow key={r.producto_id ?? r.producto ?? Math.random()}>
                            <TableCell className="sticky left-0 z-10 bg-background">

                              <div className="flex items-center gap-2">
                                {r.foto ? (
                                  <img src={r.foto} alt={r.producto ?? ""} className="h-9 w-9 rounded object-cover border border-border shrink-0" />
                                ) : (
                                  <div className="h-9 w-9 rounded bg-muted/50 shrink-0" />
                                )}
                                <span className="text-sm font-medium line-clamp-2">{r.producto ?? "—"}</span>
                              </div>
                            </TableCell>
                            <MetricCells r={r} enDetalle />
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              </>
            )}

            <Convenciones />
            <p className="text-[11px] text-muted-foreground">{NOTA_PIE}</p>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
    </TooltipProvider>
  );
}
