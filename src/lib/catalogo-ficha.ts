import { nombreArchivo, type CatalogoProducto } from "./catalogo";
import { mosaicoHtml, precargar, renderPagina, textoGenerado } from "./catalogo-export";

/** Ficha individual: mismo diseño del mosaico, una columna, foto 4:5 y alto adaptativo. */
export async function generarFichaBlob(p: CatalogoProducto): Promise<Blob> {
  const imgs = await precargar(p.imagen ? [p.imagen] : []);
  try {
    const { html } = mosaicoHtml([p], imgs, { cols: 1, k: 1.5, titulo: [p.categoria, p.coleccion].filter(Boolean).join(" · ") || "Catálogo", generado: textoGenerado() });
    const url = await renderPagina(html, { pixelRatio: 1 });
    return await (await fetch(url)).blob();
  } finally {
    imgs.forEach((v, k) => v !== k && URL.revokeObjectURL(v));
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
