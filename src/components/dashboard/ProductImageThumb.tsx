import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  src: string;
  alt?: string;
  className?: string;
  /** SKU de la fila (se usa para resolver el product_id si no viene) */
  sku?: string | null;
  /** product_id de Shopify si ya está disponible */
  productId?: string | null;
  title?: string | null;
  loading?: "lazy" | "eager";
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * Miniatura de producto. Al hacer click abre un visor ampliado con slider
 * de todas las fotos disponibles del producto (una por variante/color).
 * El click NO se propaga a la fila para no disparar el drill-down.
 */
export function ProductImageThumb({
  src, alt, className, sku, productId, title, loading = "lazy", onError,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt ?? ""}
        loading={loading}
        className={`${className ?? ""} cursor-zoom-in`}
        onError={onError}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
      />
      {open && (
        <ProductImageLightbox
          initialSrc={src}
          sku={sku}
          productId={productId}
          title={title ?? alt ?? ""}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ProductImageLightbox({
  initialSrc, sku, productId, title, onClose,
}: {
  initialSrc: string;
  sku?: string | null;
  productId?: string | null;
  title?: string | null;
  onClose: () => void;
}) {
  const [images, setImages] = useState<string[]>([initialSrc]);
  const [index, setIndex] = useState(0);
  const [loadingImgs, setLoadingImgs] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let pid = productId ?? null;
        if (!pid && sku) {
          const { data } = await supabase
            .from("product_catalog")
            .select("product_id")
            .eq("sku", sku)
            .limit(1)
            .maybeSingle();
          pid = (data as { product_id: string | null } | null)?.product_id ?? null;
        }
        if (!pid) { if (!cancelled) setLoadingImgs(false); return; }

        const { data: rows } = await supabase
          .from("product_catalog")
          .select("image_url,color,variant_name")
          .eq("product_id", pid)
          .not("image_url", "is", null);

        if (cancelled) return;
        const urls = Array.from(
          new Set([
            initialSrc,
            ...((rows ?? []) as { image_url: string | null }[])
              .map((r) => r.image_url)
              .filter((u): u is string => !!u),
          ])
        );
        setImages(urls);
      } finally {
        if (!cancelled) setLoadingImgs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [initialSrc, sku, productId]);

  const prev = useCallback(() => setIndex((i) => (i - 1 + images.length) % images.length), [images.length]);
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm p-4"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <button
        className="absolute top-4 right-4 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Cerrar"
      >
        <X className="h-5 w-5" />
      </button>

      {title && (
        <div className="mb-4 max-w-[80vw] text-center text-sm font-medium text-foreground line-clamp-2">
          {title}
        </div>
      )}

      <div className="relative flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (
          <button
            className="rounded-full border border-border bg-card p-2 text-foreground hover:bg-muted"
            onClick={prev}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div className="relative flex h-[70vh] w-[70vw] max-w-[720px] items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
          <img
            src={images[index]}
            alt={title ?? ""}
            className="max-h-full max-w-full object-contain"
          />
          {loadingImgs && (
            <div className="absolute bottom-3 right-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>

        {images.length > 1 && (
          <button
            className="rounded-full border border-border bg-card p-2 text-foreground hover:bg-muted"
            onClick={next}
            aria-label="Siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex max-w-[80vw] gap-2 overflow-x-auto" onClick={(e) => e.stopPropagation()}>
          {images.map((u, i) => (
            <button
              key={u}
              onClick={() => setIndex(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === index ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={u} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {images.length > 1 ? `${index + 1} / ${images.length}` : "1 foto disponible"}
      </div>
    </div>,
    document.body
  );
}
