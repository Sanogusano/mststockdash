import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, tallasConStock, tieneUltimas, type CatalogoProducto } from "./catalogo";

export const MAX_EXPORT = 240;
export type FormatoCatalogo = "pdf" | "img6" | "img8";
export const porPagina = (f: FormatoCatalogo) => (f === "img8" ? 8 : 6);
const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Trae todos los productos del filtro (vista vendedor), en bloques de 200. */
export async function fetchCatalogoCompleto(params: Record<string, unknown>, max = MAX_EXPORT): Promise<CatalogoProducto[]> {
  const out: CatalogoProducto[] = [];
  for (let offset = 0; offset < max; offset += 200) {
    const { data, error } = await supabase.rpc("catalogo_productos" as any, { ...params, p_vista: "vendedor", p_limite: 200, p_offset: offset } as any);
    if (error) throw error;
    const d: any = data ?? {};
    const ps = (d.productos ?? []) as CatalogoProducto[];
    out.push(...ps);
    if (ps.length < 200 || out.length >= Number(d.total || 0)) break;
  }
  return out.slice(0, max);
}

async function precargar(urls: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  await Promise.all([...new Set(urls.filter(Boolean))].map(async (u) => {
    try {
      const r = await fetch(u, { mode: "cors" });
      if (!r.ok) throw new Error();
      m.set(u, URL.createObjectURL(await r.blob()));
    } catch { m.set(u, u); }
  }));
  return m;
}

function tarjetaHtml(p: CatalogoProducto, img: string | undefined, s: number) {
  const pct = Math.round(Number(p.pct_descuento) || 0);
  const antes = p.precio_antes && Number(p.precio_antes) > Number(p.precio) ? formatCOP(p.precio_antes) : null;
  const tallas = tallasConStock(p).map((t) => esc(t.talla)).join("&nbsp;&nbsp;");
  return `<div style="display:flex;flex-direction:column;border:1px solid #e5e5e5;border-radius:${10 * s}px;overflow:hidden;background:#fff;min-height:0">
    <div style="flex:1;min-height:0;background:#f5f5f5;position:relative;display:flex;align-items:center;justify-content:center;padding:${6 * s}px">
      ${img ? `<img src="${esc(img)}" style="max-width:100%;max-height:100%;object-fit:contain" />` : `<span style="color:#aaa;font-size:${12 * s}px;letter-spacing:3px">MONASTERY</span>`}
      ${antes && pct > 0 ? `<span style="position:absolute;top:${6 * s}px;left:${6 * s}px;background:#dc2626;color:#fff;font-weight:800;font-size:${12 * s}px;padding:${2 * s}px ${6 * s}px;border-radius:${4 * s}px">-${pct}%</span>` : ""}
      ${tieneUltimas(p) ? `<span style="position:absolute;bottom:${6 * s}px;left:${6 * s}px;background:#f59e0b;color:#111;font-weight:800;font-size:${10 * s}px;padding:${3 * s}px ${7 * s}px;border-radius:${4 * s}px">¡Últimas unidades!</span>` : ""}
    </div>
    <div style="padding:${6 * s}px ${8 * s}px ${8 * s}px">
      <div style="font-size:${11 * s}px;font-weight:800;text-transform:uppercase;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.nombre)}</div>
      ${p.color ? `<div style="font-size:${9 * s}px;color:#666">${esc(p.color)}</div>` : ""}
      <div style="display:flex;align-items:baseline;gap:${6 * s}px;margin-top:${3 * s}px">
        <span style="font-size:${Math.max(17 * s, s >= 2 ? 40 : 0)}px;font-weight:900;line-height:1">${formatCOP(p.precio)}</span>
        ${antes ? `<span style="font-size:${10 * s}px;color:#888;text-decoration:line-through">${antes}</span>` : ""}
      </div>
      ${tallas ? `<div style="font-size:${9 * s}px;color:#333;margin-top:${2 * s}px"><b>Tallas:</b> ${tallas}</div>` : ""}
    </div>
  </div>`;
}

function paginaHtml(ps: CatalogoProducto[], imgs: Map<string, string>, opt: { w: number; h: number; cols: number; rows: number; s: number; titulo: string; fecha: string; pagina: number; total: number; etiqueta: string }) {
  const { w, h, cols, rows, s } = opt;
  return `<div style="width:${w}px;height:${h}px;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#111;display:flex;flex-direction:column;padding:${14 * s}px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:${2 * s}px solid #111;padding-bottom:${6 * s}px;margin-bottom:${10 * s}px">
      <span style="font-size:${16 * s}px;font-weight:900;letter-spacing:${4 * s}px">MONASTERY</span>
      <span style="font-size:${9 * s}px;color:#555">${esc(opt.titulo)} · ${esc(opt.fecha)}</span>
    </div>
    <div style="flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},minmax(0,1fr));gap:${10 * s}px">
      ${ps.map((p) => tarjetaHtml(p, p.imagen ? imgs.get(p.imagen) : undefined, s)).join("")}
    </div>
    <div style="text-align:center;font-size:${8 * s}px;color:#777;margin-top:${6 * s}px">${opt.etiqueta} ${opt.pagina} de ${opt.total}</div>
  </div>`;
}

async function renderPagina(html: string, imgPx: { pixelRatio: number }) {
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

export type ExportResult = { tipo: "pdf"; blob: Blob; nombre: string } | { tipo: "imagenes"; files: File[] };

export async function generarCatalogo(
  productos: CatalogoProducto[], formato: FormatoCatalogo, titulo: string, fecha: string,
  onProgress: (actual: number, total: number) => void,
): Promise<ExportResult> {
  const imgs = await precargar(productos.map((p) => p.imagen ?? ""));
  const porPag = porPagina(formato);
  const paginas: CatalogoProducto[][] = [];
  for (let i = 0; i < productos.length; i += porPag) paginas.push(productos.slice(i, i + porPag));
  const slug = titulo.replace(/[\\/:*?"<>|·]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "Todos";
  try {
    if (formato === "pdf") {
      // A4 a 96dpi: 794x1123
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < paginas.length; i++) {
        onProgress(i + 1, paginas.length);
        const url = await renderPagina(paginaHtml(paginas[i], imgs, { w: 794, h: 1123, cols: 2, rows: 3, s: 1.4, titulo, fecha, pagina: i + 1, total: paginas.length, etiqueta: "Página" }), { pixelRatio: 2 });
        if (i > 0) doc.addPage();
        doc.addImage(url, "JPEG", 0, 0, 210, 297);
      }
      return { tipo: "pdf", blob: doc.output("blob"), nombre: `Catalogo-Monastery-${slug}-${fecha}.pdf` };
    }
    const files: File[] = [];
    for (let i = 0; i < paginas.length; i++) {
      onProgress(i + 1, paginas.length);
      const ocho = formato === "img8";
      const url = await renderPagina(paginaHtml(paginas[i], imgs, { w: 1080, h: ocho ? 1920 : 1350, cols: 2, rows: ocho ? 4 : 3, s: 2, titulo, fecha, pagina: i + 1, total: paginas.length, etiqueta: "Imagen" }), { pixelRatio: 1 });
      const blob = await (await fetch(url)).blob();
      files.push(new File([blob], `Monastery-${slug}-${String(i + 1).padStart(2, "0")}.jpg`, { type: "image/jpeg" }));
    }
    return { tipo: "imagenes", files };
  } finally {
    imgs.forEach((v, k) => v !== k && URL.revokeObjectURL(v));
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export const esTactil = () => matchMedia("(pointer: coarse)").matches;
export const puedeCompartir = (files: File[]) => !!navigator.canShare?.({ files });

/** Grupos para compartir: todos juntos si el navegador lo permite, si no de a 10. */
export function gruposParaCompartir(files: File[]): File[][] {
  if (puedeCompartir(files)) return [files];
  const g: File[][] = [];
  for (let i = 0; i < files.length; i += 10) g.push(files.slice(i, i + 10));
  return g;
}

/** Llamar directo desde un clic. Devuelve false si el usuario canceló. */
export async function compartirArchivos(files: File[]): Promise<boolean> {
  try { await navigator.share({ files }); return true; }
  catch (e) { if ((e as DOMException).name === "AbortError") return false; throw e; }
}

export async function descargarUnoPorUno(files: File[]) {
  for (const f of files) {
    downloadBlob(f, f.name);
    await new Promise((r) => setTimeout(r, 300));
  }
}
