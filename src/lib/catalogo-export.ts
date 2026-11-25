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

/** "Generado el 25 nov 2026 · 3:13 p. m." en hora de Colombia. */
export function textoGenerado(d = new Date()): string {
  const tz = "America/Bogota";
  const parts = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).formatToParts(d);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  const fecha = `${g("day")} ${g("month").replace(".", "")} ${g("year")}`;
  const hora = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d).replace(/\u00a0/g, " ");
  return `Generado el ${fecha} · ${hora}`;
}

// Medidas del mosaico (px a 1080 de ancho). k escala los textos (ficha individual).
const PAD = 28, GAP = 20, HEAD = 128, FOOT = 60;
const infoAlto = (k: number) => Math.round(215 * k);

function tarjetaHtml(p: CatalogoProducto, img: string | undefined, cw: number, k: number) {
  const pct = Math.round(Number(p.pct_descuento) || 0);
  const antes = p.precio_antes && Number(p.precio_antes) > Number(p.precio) ? formatCOP(p.precio_antes) : null;
  const tallas = tallasConStock(p);
  const fh = Math.round((cw * 5) / 4);
  const r = 16;
  return `<div style="width:${cw}px;display:flex;flex-direction:column;border:1px solid #e5e5e5;border-radius:${r}px;overflow:hidden;background:#fff;flex:none">
    <div style="width:${cw}px;height:${fh}px;position:relative;overflow:hidden;border-radius:${r}px ${r}px 0 0;background:#f5f5f5">
      ${img ? `<img src="${esc(img)}" style="width:100%;height:100%;object-fit:cover;object-position:center;display:block" />` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:28px;letter-spacing:6px">MONASTERY</div>`}
      ${antes && pct > 0 ? `<span style="position:absolute;top:${14 * k}px;left:${14 * k}px;background:#dc2626;color:#fff;font-weight:800;font-size:${26 * k}px;padding:${4 * k}px ${12 * k}px;border-radius:${8 * k}px">-${pct}%</span>` : ""}
      ${tieneUltimas(p) ? `<span style="position:absolute;bottom:${14 * k}px;left:${14 * k}px;background:#f59e0b;color:#111;font-weight:800;font-size:${22 * k}px;padding:${6 * k}px ${14 * k}px;border-radius:${8 * k}px">¡Últimas unidades!</span>` : ""}
    </div>
    <div style="height:${infoAlto(k)}px;box-sizing:border-box;padding:${14 * k}px ${18 * k}px;overflow:hidden">
      <div style="font-size:${30 * k}px;font-weight:800;text-transform:uppercase;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.nombre)}</div>
      <div style="font-size:${20 * k}px;color:#666;line-height:1.3;height:${26 * k}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.color ?? "")}</div>
      <div style="display:flex;align-items:baseline;gap:${12 * k}px;margin-top:${6 * k}px;white-space:nowrap">
        <span style="font-size:${52 * k}px;font-weight:900;line-height:1.05">${formatCOP(p.precio)}</span>
        ${antes ? `<span style="font-size:${26 * k}px;color:#888;text-decoration:line-through">${antes}</span>` : ""}
      </div>
      ${tallas.length ? `<div style="display:flex;align-items:center;flex-wrap:wrap;gap:${8 * k}px;margin-top:${12 * k}px">
        <span style="font-size:${22 * k}px;font-weight:700;color:#333">Tallas:</span>
        ${tallas.map((t) => `<span style="font-size:${20 * k}px;font-weight:700;border:2px solid #111;border-radius:${6 * k}px;padding:${2 * k}px ${10 * k}px;min-width:${24 * k}px;text-align:center">${esc(t.talla)}</span>`).join("")}
      </div>` : ""}
    </div>
  </div>`;
}

export type MosaicoOpt = { cols: number; k?: number; titulo: string; generado: string; pagina?: number; total?: number; etiqueta?: string };

/** Mosaico de ancho 1080 y alto según las filas reales. Devuelve html y alto. */
export function mosaicoHtml(ps: CatalogoProducto[], imgs: Map<string, string>, opt: MosaicoOpt): { html: string; h: number } {
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

export { precargar };

export async function renderPagina(html: string, imgPx: { pixelRatio: number }) {
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
  const generado = textoGenerado();
  try {
    if (formato === "pdf") {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < paginas.length; i++) {
        onProgress(i + 1, paginas.length);
        const { html, h } = mosaicoHtml(paginas[i], imgs, { cols: 2, titulo, generado, pagina: i + 1, total: paginas.length, etiqueta: "Página" });
        const url = await renderPagina(html, { pixelRatio: 1.5 });
        if (i > 0) doc.addPage();
        let w = 210, hh = (210 * h) / 1080;
        if (hh > 297) { w = (297 * 1080) / h; hh = 297; }
        doc.addImage(url, "JPEG", (210 - w) / 2, 0, w, hh);
      }
      return { tipo: "pdf", blob: doc.output("blob"), nombre: `Catalogo-Monastery-${slug}-${fecha}.pdf` };
    }
    const files: File[] = [];
    for (let i = 0; i < paginas.length; i++) {
      onProgress(i + 1, paginas.length);
      const { html } = mosaicoHtml(paginas[i], imgs, { cols: 2, titulo, generado, pagina: i + 1, total: paginas.length, etiqueta: "Imagen" });
      const url = await renderPagina(html, { pixelRatio: 1 });
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
