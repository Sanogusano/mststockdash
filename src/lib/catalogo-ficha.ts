import { toJpeg } from "html-to-image";
import { formatCOP, nombreArchivo, tallasConStock, tieneUltimas, type CatalogoProducto } from "./catalogo";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function imagenSegura(url?: string | null): Promise<{ src: string; revoke?: () => void } | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { mode: "cors" });
    if (!r.ok) throw new Error(String(r.status));
    const obj = URL.createObjectURL(await r.blob());
    return { src: obj, revoke: () => URL.revokeObjectURL(obj) };
  } catch {
    return { src: url };
  }
}

function esperarImagen(img: HTMLImageElement) {
  return new Promise<void>((res) => {
    if (img.complete && img.naturalWidth > 0) return res();
    img.onload = () => res();
    img.onerror = () => res();
  });
}

/** Ficha 1080x1350 para WhatsApp/Instagram. Colores fijos: es una imagen exportada, no UI temática. */
export async function generarFichaBlob(p: CatalogoProducto): Promise<Blob> {
  const img = await imagenSegura(p.imagen);
  const pct = Math.round(Number(p.pct_descuento) || 0);
  const antes = p.precio_antes && Number(p.precio_antes) > Number(p.precio) ? formatCOP(p.precio_antes) : null;
  const tallas = tallasConStock(p);
  const ultimas = tieneUltimas(p);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;z-index:-1;";
  host.innerHTML = `
  <div id="ficha" style="width:1080px;height:1350px;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#111;display:flex;flex-direction:column;overflow:hidden;position:relative">
    <div style="height:878px;background:#f4f4f4;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden">
      ${img ? `<img crossorigin="anonymous" src="${esc(img.src)}" style="width:100%;height:100%;object-fit:cover" />` : `<div style="font-size:48px;color:#999;letter-spacing:8px">MONASTERY</div>`}
      ${ultimas ? `<div style="position:absolute;top:44px;right:-90px;transform:rotate(35deg);background:#f59e0b;color:#111;font-weight:800;font-size:34px;padding:14px 120px;box-shadow:0 4px 12px rgba(0,0,0,.2)">¡Últimas unidades!</div>` : ""}
    </div>
    <div style="flex:1;padding:36px 56px 0;display:flex;flex-direction:column;gap:14px">
      <div style="font-size:46px;font-weight:800;line-height:1.1;text-transform:uppercase">${esc(p.nombre)}</div>
      ${p.color ? `<div style="font-size:30px;color:#555;display:flex;align-items:center;gap:12px">${p.color_hex ? `<span style="width:26px;height:26px;border-radius:50%;background:${esc(p.color_hex)};border:2px solid #ddd;display:inline-block"></span>` : ""}${esc(p.color)}</div>` : ""}
      <div style="display:flex;align-items:center;gap:24px;margin-top:6px">
        <div style="font-size:84px;font-weight:900;line-height:1">${formatCOP(p.precio)}</div>
        ${antes ? `<div style="font-size:38px;color:#888;text-decoration:line-through">${antes}</div>` : ""}
        ${antes && pct > 0 ? `<div style="background:#dc2626;color:#fff;font-weight:800;font-size:36px;padding:8px 18px;border-radius:12px">-${pct}%</div>` : ""}
      </div>
      ${tallas.length ? `<div style="font-size:28px;color:#444;margin-top:8px">Tallas disponibles:</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px">${tallas.map((t) => `<div style="min-width:72px;padding:10px 18px;border:3px solid #111;border-radius:10px;font-size:30px;font-weight:700;text-align:center">${esc(t.talla)}</div>`).join("")}</div>` : ""}
    </div>
    <div style="height:74px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;letter-spacing:14px">MONASTERY</div>
  </div>`;
  document.body.appendChild(host);
  try {
    const el = host.querySelector("#ficha") as HTMLElement;
    const imgEl = el.querySelector("img");
    if (imgEl) await esperarImagen(imgEl);
    const dataUrl = await toJpeg(el, { quality: 0.92, pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: false });
    return await (await fetch(dataUrl)).blob();
  } finally {
    host.remove();
    img?.revoke?.();
  }
}

function descargarBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function descargarFicha(p: CatalogoProducto) {
  descargarBlob(await generarFichaBlob(p), nombreArchivo(p));
}

/** Varias fichas: en móvil intenta compartir (WhatsApp); si no, descarga una tras otra. */
export async function descargarFichas(ps: CatalogoProducto[], onProgress?: (i: number) => void) {
  const files: File[] = [];
  for (let i = 0; i < ps.length; i++) {
    onProgress?.(i + 1);
    const blob = await generarFichaBlob(ps[i]);
    files.push(new File([blob], nombreArchivo(ps[i]), { type: "image/jpeg" }));
  }
  const esMovil = window.matchMedia?.("(max-width: 768px)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (esMovil && nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files });
      return "compartido" as const;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "cancelado" as const;
    }
  }
  for (const f of files) {
    descargarBlob(f, f.name);
    await new Promise((r) => setTimeout(r, 350));
  }
  return "descargado" as const;
}
