import { nombreArchivoShowroom, type CatalogoShowroomProducto } from "./catalogo-showroom";
import { mosaicoShowroomHtml, precargarShowroom, renderPaginaShowroom, textoGeneradoShowroom } from "./catalogo-showroom-export";

export async function generarFichaShowroomBlob(p: CatalogoShowroomProducto): Promise<Blob> {
  const imgs = await precargarShowroom(p.imagen ? [p.imagen] : []);
  try {
    const { html } = mosaicoShowroomHtml([p], imgs, { cols: 1, k: 1.5, titulo: [p.categoria, p.coleccion].filter(Boolean).join(" · ") || "Catálogo Showroom", generado: textoGeneradoShowroom() });
    const url = await renderPaginaShowroom(html, { pixelRatio: 1 });
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

export async function descargarFichaShowroom(p: CatalogoShowroomProducto) {
  descargarBlob(await generarFichaShowroomBlob(p), nombreArchivoShowroom(p));
}

export async function descargarFichasShowroom(ps: CatalogoShowroomProducto[], onProgress?: (i: number) => void) {
  const files: File[] = [];
  for (let i = 0; i < ps.length; i++) {
    onProgress?.(i + 1);
    const blob = await generarFichaShowroomBlob(ps[i]);
    files.push(new File([blob], nombreArchivoShowroom(ps[i]), { type: "image/jpeg" }));
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
