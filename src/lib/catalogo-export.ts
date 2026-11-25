import { toJpeg } from "html-to-image";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, tallasConStock, tieneUltimas, type CatalogoProducto } from "./catalogo";

export const MAX_EXPORT = 300;
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
        <span style="font-size:${17 * s}px;font-weight:900">${formatCOP(p.precio)}</span>
        ${antes ? `<span style="font-size:${10 * s}px;color:#888;text-decoration:line-through">${antes}</span>` : ""}
      </div>
      ${tallas ? `<div style="font-size:${9 * s}px;color:#333;margin-top:${2 * s}px"><b>Tallas:</b> ${tallas}</div>` : ""}
    </div>
  </div>`;
}

function paginaHtml(ps: CatalogoProducto[], imgs: Map<string, string>, opt: { w: number; h: number; cols: number; rows: number; s: number; titulo: string; fecha: string; pagina: number; total: number }) {
  const { w, h, cols, rows, s } = opt;
  return `<div style="width:${w}px;height:${h}px;background:#fff;font-family:Helvetica,Arial,sans-serif;color:#111;display:flex;flex-direction:column;padding:${14 * s}px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:${2 * s}px solid #111;padding-bottom:${6 * s}px;margin-bottom:${10 * s}px">
      <span style="font-size:${16 * s}px;font-weight:900;letter-spacing:${4 * s}px">MONASTERY</span>
      <span style="font-size:${9 * s}px;color:#555">${esc(opt.titulo)} · ${esc(opt.fecha)}</span>
    </div>
    <div style="flex:1;min-height:0;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},minmax(0,1fr));gap:${10 * s}px">
      ${ps.map((p) => tarjetaHtml(p, p.imagen ? imgs.get(p.imagen) : undefined, s)).join("")}
    </div>
    <div style="text-align:center;font-size:${8 * s}px;color:#777;margin-top:${6 * s}px">Página ${opt.pagina} de ${opt.total}</div>
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

export type ExportResult = { tipo: "pdf"; blob: Blob; nombre: string } | { tipo: "imagenes"; files: File[]; nombreZip: string };

export async function generarCatalogo(
  productos: CatalogoProducto[], formato: "pdf" | "imagenes", titulo: string, fecha: string,
  onProgress: (actual: number, total: number) => void,
): Promise<ExportResult> {
  const imgs = await precargar(productos.map((p) => p.imagen ?? ""));
  const porPag = formato === "pdf" ? 6 : 4;
  const paginas: CatalogoProducto[][] = [];
  for (let i = 0; i < productos.length; i += porPag) paginas.push(productos.slice(i, i + porPag));
  const slug = titulo.replace(/[\\/:*?"<>|·]+/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 60) || "Todos";
  try {
    if (formato === "pdf") {
      // A4 a 96dpi: 794x1123
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < paginas.length; i++) {
        onProgress(i + 1, paginas.length);
        const url = await renderPagina(paginaHtml(paginas[i], imgs, { w: 794, h: 1123, cols: 2, rows: 3, s: 1.4, titulo, fecha, pagina: i + 1, total: paginas.length }), { pixelRatio: 2 });
        if (i > 0) doc.addPage();
        doc.addImage(url, "JPEG", 0, 0, 210, 297);
      }
      return { tipo: "pdf", blob: doc.output("blob"), nombre: `Catalogo-Monastery-${slug}-${fecha}.pdf` };
    }
    const files: File[] = [];
    for (let i = 0; i < paginas.length; i++) {
      onProgress(i + 1, paginas.length);
      const url = await renderPagina(paginaHtml(paginas[i], imgs, { w: 1080, h: 1350, cols: 2, rows: 2, s: 2, titulo, fecha, pagina: i + 1, total: paginas.length }), { pixelRatio: 1 });
      const blob = await (await fetch(url)).blob();
      files.push(new File([blob], `${String(i + 1).padStart(2, "0")}-Catalogo-Monastery.jpg`, { type: "image/jpeg" }));
    }
    return { tipo: "imagenes", files, nombreZip: `Catalogo-Monastery-${slug}-${fecha}.zip` };
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

/** Debe llamarse directo desde un clic. En celular comparte los JPG; en computador descarga ZIP. */
export async function entregarCatalogo(r: ExportResult): Promise<void> {
  if (r.tipo === "pdf") return downloadBlob(r.blob, r.nombre);
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: r.files })) {
    try { await navigator.share({ files: r.files }); return; }
    catch (e) { if ((e as DOMException).name === "AbortError") return; }
  }
  const zip = new JSZip();
  r.files.forEach((f) => zip.file(f.name, f));
  downloadBlob(await zip.generateAsync({ type: "blob", compression: "STORE" }), r.nombreZip);
}
