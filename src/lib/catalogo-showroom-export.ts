import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "./catalogo";
import {
  mostrarPrecioFull, tallasShowroomConStock, tieneUltimasShowroom,
  type CatalogoShowroomProducto,
} from "./catalogo-showroom";

export const MAX_EXPORT_SHOWROOM = 240;
export type FormatoCatalogoShowroom = "pdf" | "img6" | "img8";
export const porPaginaShowroom = (f: FormatoCatalogoShowroom) => (f === "img8" ? 8 : 6);
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function fetchCatalogoShowroomCompleto(params: Record<string, unknown>, max = MAX_EXPORT_SHOWROOM): Promise<CatalogoShowroomProducto[]> {
  const out: CatalogoShowroomProducto[] = [];
  for (let offset = 0; offset < max; offset += 200) {
    const { data, error } = await supabase.rpc("catalogo_showroom_productos" as any, { ...params, p_limite: 200, p_offset: offset } as any);
    if (error) throw error;
    const d: any = data ?? {};
    const ps = (d.productos ?? []) as CatalogoShowroomProducto[];
    out.push(...ps);
    if (ps.length < 200 || out.length >= Number(d.total || 0)) break;
  }
  return out.slice(0, max);
}

export function imagenReducidaShowroom(u: string | null | undefined, ancho = 600): string {
  if (!u) return "";
  if (!/cdn\.shopify\.com/.test(u) || /[?&]width=/.test(u)) return u;
  return u + (u.includes("?") ? "&" : "?") + `width=${ancho}`;
}

async function precargarShowroom(urls: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  await Promise.all([...new Set(urls.filter(Boolean))].map(async (u) => {
    try {
      const r = await fetch(imagenReducidaShowroom(u), { mode: "cors" });
      if (!r.ok) throw new Error();
      m.set(u, URL.createObjectURL(await r.blob()));
    } catch { m.set(u, imagenReducidaShowroom(u)); }
  }));
  return m;
}

export function textoGeneradoShowroom(d = new Date()): string {
  const tz = "America/Bogota";
  const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).formatToParts(d);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const fecha = `${g("day")} ${g("month").replace(".", "")} ${g("year")}`;
  const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d).replace(/\u00a0/g, " ");
  return `Generado el ${fecha} · ${hora}`;
}

const PAD = 28, GAP = 20, HEAD = 128, FOOT = 60;
const infoAlto = (k: number) => Math.round(265 * k);

function tarjetaHtml(p: CatalogoShowroomProducto, img: string | undefined, cw: number, k: number) {
  const pct = Math.round(Number(p.pct_descuento) || 0);
  const full = mostrarPrecioFull(p);
  const tallas = tallasShowroomConStock(p);
  const fh = Math.round((cw * 5) / 4);
  const r = 16;
  return `<div style="width:${cw}px;display:flex;flex-direction:column;border:1px solid #e5e5e5;border-radius:${r}px;overflow:hidden;background:#fff;flex:none">
    <div style="width:${cw}px;height:${fh}px;position:relative;overflow:hidden;border-radius:${r}px ${r}px 0 0;background:#f5f5f5">
      ${img ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block" />` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:28px;letter-spacing:6px">MONASTERY</div>`}
      ${pct > 0 ? `<span style="position:absolute;top:${14 * k}px;left:${14 * k}px;background:#dc2626;color:#fff;font-weight:800;font-size:${26 * k}px;padding:${4 * k}px ${12 * k}px;border-radius:${8 * k}px">-${pct}%</span>` : ""}
      ${tieneUltimasShowroom(p) ? `<span style="position:absolute;bottom:${14 * k}px;left:${14 * k}px;background:#f59e0b;color:#111;font-weight:800;font-size:${22 * k}px;padding:${6 * k}px ${14 * k}px;border-radius:${8 * k}px">¡Últimas unidades!</span>` : ""}
    </div>
    <div style="height:${infoAlto(k)}px;box-sizing:border-box;padding:${14 * k}px ${18 * k}px;overflow:hidden">
      <div style="font-size:${30 * k}px;font-weight:800;text-transform:uppercase;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.nombre)}</div>
      <div style="font-size:${20 * k}px;color:#666;line-height:1.3;height:${26 * k}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.color ?? "")}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;align-items:baseline;column-gap:${12 * k}px;row-gap:${4 * k}px;margin-top:${8 * k}px;white-space:nowrap">
        ${full ? `<span style="font-size:${20 * k}px;color:#666">Precio full</span><span style="font-size:${26 * k}px;color:#666;text-align:right">${formatCOP(p.precio_full)}</span>` : ""}
        <span style="font-size:${20 * k}px;font-weight:700;color:#333">Precio página</span><span style="font-size:${52 * k}px;font-weight:900;line-height:1.05;text-align:right">${formatCOP(p.precio_pagina)}</span>
      </div>
      ${tallas.length ? `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:${8 * k}px;margin-top:${12 * k}px">
        <span style="font-size:${22 * k}px;font-weight:700;color:#333">Tallas:</span>
        ${tallas.map((t) => `<span style="font-size:${20 * k}px;font-weight:700;border:2px solid #111;border-radius:${6 * k}px;padding:${2 * k}px ${10 * k}px;min-width:${24 * k}px;text-align:center">${esc(t.talla)}</span>`).join("")}
      </div>` : ""}
    </div>
  </div>`;
}

export type MosaicoShowroomOpt = { cols: number; k?: number; titulo: string; generado: string; pagina?: number; total?: number; etiqueta?: string };

export function mosaicoShowroomHtml(ps: CatalogoShowroomProducto[], imgs: Map<string, string>, opt: MosaicoShowroomOpt): { html: string; h: number } {
  const W = 1080, k = opt.k ?? 1, cols = opt.cols;
  const cw = Math.floor((W - PAD * 2 - GAP * (cols - 1)) / cols);
  const cell = Math.round((cw * 5) / 4) + infoAlto(k) + 2;
  const rows = Math.ceil(ps.length / cols);
  const h = PAD * 2 + HEAD + rows * cell + (rows - 1) * GAP + FOOT;
  const pie = [opt.pagina && opt.total ? `${opt.etiqueta ?? "Imagen"} ${opt.pagina} de ${opt.total}` : "", "Precios y disponibilidad sujetos a cambio"].filter(Boolean).join(" · ");
  const html = `<div style="width:${W}px;height:${h}px;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#111;padding:${PAD}px;box-sizing:border-box;display:flex;flex-direction:column">
    <div style="height:${HEAD - 20}px;margin-bottom:20px;border-bottom:3px solid #111;display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;box-sizing:border-box">
      <span style="font-size:40px;font-weight:900;letter-spacing:10px;line-height:1">MONASTERY</span>
      <div style="text-align:right;line-height:1.35">
        <div style="font-size:22px;font-weight:700;color:#333;max-width:560px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(opt.titulo)}</div>
        <div style="font-size:18px;color:#666">${esc(opt.generado)}</div>
      </div>
    </div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:${GAP}px;align-content:flex-start">
      ${ps.map((p) => tarjetaHtml(p, p.imagen ? imgs.get(p.imagen) : undefined, cw, k)).join("")}
    </div>
    <div style="margin-top:auto;height:${FOOT - 16}px;display:flex;align-items:flex-end;justify-content:center;font-size:18px;color:#777">${esc(pie)}</div>
  </div>`;
  return { html, h };
}

export { precargarShowroom };

export async function renderPaginaShowroom(html: string, imgPx: { pixelRatio: number }) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-30000px;top:0;z-index:-1;";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const el = host.firstElementChild as HTMLElement;
    await Promise.all([...el.querySelectorAll("img")].map((i) => i.decode().catch(() => undefined)));
    return await toJpeg(el, { quality: 0.9, pixelRatio: imgPx.pixelRatio, backgroundColor: "#ffffff" });
  } finally { host.remove(); }
}

async function renderEnBloques<T>(n: number, onProgress: (a: number, t: number) => void, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  let hechas = 0;
  for (let i = 0; i < n; i += 3) {
    const idx = Array.from({ length: Math.min(3, n - i) }, (_, k) => i + k);
    onProgress(Math.min(i + 1, n), n);
    const r = await Promise.all(idx.map((j) => fn(j).then((v) => { hechas++; onProgress(hechas, n); return v; })));
    out.push(...r);
  }
  return out;
}

export type ExportShowroomResult = { tipo: "pdf"; blob: Blob; nombre: string } | { tipo: "imagenes"; files: File[] };

export async function generarCatalogoShowroom(
  productos: CatalogoShowroomProducto[], formato: FormatoCatalogoShowroom, titulo: string, fecha: string,
  onProgress: (actual: number, total: number) => void,
): Promise<ExportShowroomResult> {
  const imgs = await precargarShowroom(productos.map((p) => p.imagen ?? ""));
  const porPag = porPaginaShowroom(formato);
  const paginas: CatalogoShowroomProducto[][] = [];
  for (let i = 0; i < productos.length; i += porPag) paginas.push(productos.slice(i, i + porPag));
  const slug = titulo.replace(/[\\/:*?"<>|·]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "Todos";
  const generado = textoGeneradoShowroom();
  try {
    if (formato === "pdf") {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const urls = await renderEnBloques(paginas.length, onProgress, (i) => {
        const { html, h } = mosaicoShowroomHtml(paginas[i], imgs, { cols: 2, titulo, generado, pagina: i + 1, total: paginas.length, etiqueta: "Página" });
        return renderPaginaShowroom(html, { pixelRatio: 1.5 }).then((url) => ({ url, h }));
      });
      urls.forEach(({ url, h }, i) => {
        if (i > 0) doc.addPage();
        let w = 210, hh = (210 * h) / 1080;
        if (hh > 297) { w = (297 * 1080) / h; hh = 297; }
        doc.addImage(url, "JPEG", (210 - w) / 2, 0, w, hh);
      });
      return { tipo: "pdf", blob: doc.output("blob"), nombre: `Catalogo-Showroom-Monastery-${slug}-${fecha}.pdf` };
    }
    const files = await renderEnBloques(paginas.length, onProgress, async (i) => {
      const { html } = mosaicoShowroomHtml(paginas[i], imgs, { cols: 2, titulo, generado, pagina: i + 1, total: paginas.length, etiqueta: "Imagen" });
      const url = await renderPaginaShowroom(html, { pixelRatio: 1 });
      const blob = await (await fetch(url)).blob();
      return new File([blob], `Showroom-Monastery-${slug}-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" });
    });
    return { tipo: "imagenes", files };
  } finally {
    imgs.forEach((v, k) => v !== k && URL.revokeObjectURL(v));
  }
}

export function downloadBlobShowroom(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const esTactilShowroom = () => matchMedia("(pointer: coarse)").matches;
export const puedeCompartirShowroom = (files: File[]) => !!navigator.canShare?.({ files });

export function gruposParaCompartirShowroom(files: File[]): File[][] {
  if (puedeCompartirShowroom(files)) return [files];
  const g: File[][] = [];
  for (let i = 0; i < files.length; i += 10) g.push(files.slice(i, i + 10));
  return g;
}

export async function compartirArchivosShowroom(files: File[]): Promise<boolean> {
  try { await navigator.share({ files }); return true; }
  catch (e) { if ((e as DOMException).name === "AbortError") return false; throw e; }
}

export async function descargarUnoPorUnoShowroom(files: File[]) {
  for (const f of files) {
    downloadBlobShowroom(f, f.name);
    await new Promise((r) => setTimeout(r, 300));
  }
}
