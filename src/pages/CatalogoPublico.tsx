import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCOP, catalogoPublicoUrl } from "@/lib/catalogo";
import { imagenReducida } from "@/lib/catalogo-export";
import logo from "@/assets/monastery-logo-white.png";

type Talla = { sku: string; talla: string; disponible: number; ultimas: boolean };
type Prod = {
  product_id: string; nombre: string; color: string | null; imagen: string | null; precio: number; precio_antes: number | null;
  pct_descuento: number | null; disponible: number; agotado: boolean; ultimas_unidades: boolean; vendidas_24h: number; vendidas_7d: number; tallas: Talla[];
};
type Resp = { estado: "activo" | "vencido" | "no_existe"; titulo?: string; expira_en?: string; whatsapp?: string; productos?: Prod[]; total?: number; agotados?: number };

const WEB = "https://monasterycouture.com";
const waUrl = (num: string | undefined, txt: string) => `https://wa.me/${(num ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(txt)}`;

export function restante(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <FranjaLogo />
      <div className="mx-auto max-w-xl px-3 pb-10">{children}
        <p className="mt-8 text-center text-xs text-muted-foreground">Precios y disponibilidad sujetos a cambio</p>
      </div>
    </div>
  );
}
/** Franja negra superior con el logo oficial blanco, centrado. */
const FranjaLogo = () => (
  <div className="bg-black py-3.5">
    <div className="flex justify-center"><img src={logo} alt="MONASTERY" className="h-7 object-contain sm:h-8" /></div>
  </div>
);

export default function CatalogoPublicoPage() {
  const { slug = "" } = useParams();
  const [d, setD] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    document.title = "Catálogo Monastery";
    supabase.rpc("catalogo_publico", { p_slug: slug }).then(({ data, error }) => {
      if (error) setErr(error.message); else setD(data as unknown as Resp);
    });
  }, [slug]);
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t); }, []);

  const productos = useMemo(() => {
    const ps = d?.productos ?? [];
    return [...ps.filter((p) => !p.agotado), ...ps.filter((p) => p.agotado)];
  }, [d]);

  if (err) return <Shell><p className="text-center text-sm text-destructive">{err}</p></Shell>;
  if (!d) return <Shell><p className="text-center text-sm text-muted-foreground">Cargando catálogo…</p></Shell>;

  if (d.estado === "no_existe") return (
    <Shell>
      <div className="mt-16 space-y-4 text-center">
        <h1 className="text-xl font-semibold">Este catálogo no existe</h1>
        <Button asChild variant="outline"><a href={WEB}>Ir a monasterycouture.com</a></Button>
      </div>
    </Shell>
  );
  const vencidoPorReloj = d.expira_en ? new Date(d.expira_en).getTime() <= ahora : false;
  if (d.estado === "vencido" || vencidoPorReloj) return (
    <Shell>
      <div className="mt-16 space-y-4 text-center">
        <h1 className="text-lg font-semibold">Este catálogo ya venció. Muchos de estos productos ya no están disponibles o cambiaron de precio.</h1>
        <div className="flex flex-col gap-2">
          <Button asChild className="bg-success text-success-foreground hover:bg-success/90">
            <a href={waUrl(d.whatsapp, "Hola, abrí un catálogo vencido y quiero ver qué hay disponible")} target="_blank" rel="noreferrer">Escríbenos por WhatsApp</a>
          </Button>
          <Button asChild variant="outline"><a href={WEB}>Ir a monasterycouture.com</a></Button>
        </div>
      </div>
    </Shell>
  );

  const ms = new Date(d.expira_en!).getTime() - ahora;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <FranjaLogo />
      <div className={cn("sticky top-0 z-10 px-3 py-2 text-center text-sm font-medium", ms < 6 * 3600e3 ? "bg-destructive text-destructive-foreground" : "bg-foreground text-background")}>
        Este catálogo vence en {restante(ms)}
      </div>
      <div className="mx-auto max-w-xl px-3 pb-10">
        {d.titulo && <h1 className="mb-3 text-center text-base font-semibold">{d.titulo}</h1>}
        {(d.agotados ?? 0) > 0 && (
          <p className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            {d.agotados} productos de este catálogo ya se agotaron.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {productos.map((p) => <Tarjeta key={p.product_id} p={p} slug={slug} whatsapp={d.whatsapp} />)}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">Precios y disponibilidad sujetos a cambio</p>
      </div>
    </div>
  );
}

function Tarjeta({ p, slug, whatsapp }: { p: Prod; slug: string; whatsapp?: string }) {
  const [talla, setTalla] = useState<Talla | null>(null);
  const pct = Math.round(Number(p.pct_descuento) || 0);
  const antes = p.precio_antes && Number(p.precio_antes) > Number(p.precio) ? p.precio_antes : null;
  const pedir = () => {
    if (!talla) return;
    supabase.rpc("catalogo_publico_clic", { p_slug: slug }).then(() => undefined, () => undefined);
    const txt = `Hola! Vi el catálogo Monastery y quiero:\n• ${p.nombre}${p.color ? ` ${p.color}` : ""}\n• Talla: ${talla.talla}\n• Precio: ${formatCOP(p.precio)}\n• Ref: ${talla.sku}\nCatálogo: ${catalogoPublicoUrl(slug)}`;
    window.open(waUrl(whatsapp, txt), "_blank");
  };
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border border-border bg-card", p.agotado && "opacity-60 grayscale")}>
      <div className="relative aspect-[4/5] bg-muted">
        {p.imagen && <img src={imagenReducida(p.imagen)} alt={p.nombre} loading="lazy" className="h-full w-full object-cover" />}
        {pct > 0 && !p.agotado && <span className="absolute left-2 top-2 rounded bg-destructive px-1.5 py-0.5 text-xs font-bold text-destructive-foreground">-{pct}%</span>}
        {p.agotado && <span className="absolute inset-0 m-auto h-fit w-fit -rotate-12 rounded border-2 border-foreground px-3 py-1 text-sm font-bold tracking-widest text-foreground bg-background/80">AGOTADO</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <p className="text-sm font-semibold leading-tight">{p.nombre}</p>
        {p.color && <p className="text-xs text-muted-foreground">{p.color}</p>}
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold">{formatCOP(p.precio)}</span>
          {antes && <span className="text-xs text-muted-foreground line-through">{formatCOP(antes)}</span>}
        </div>
        {!p.agotado && p.vendidas_24h > 0 && <p className="text-[11px] font-medium text-destructive">🔥 {p.vendidas_24h} vendidas en las últimas 24 h</p>}
        {!p.agotado && p.ultimas_unidades && <p className="text-[11px] font-medium text-warning-foreground">¡Últimas {p.disponible} unidades!</p>}
        {!p.agotado && (
          <>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.tallas.map((t) => {
                const off = !(t.disponible > 0);
                return (
                  <button key={t.sku} disabled={off} onClick={() => setTalla(t)}
                    className={cn("rounded border px-1.5 py-0.5 text-xs",
                      off ? "border-border text-muted-foreground line-through" : talla?.sku === t.sku ? "border-foreground bg-foreground text-background" : "border-border")}>
                    {t.talla}{!off && t.ultimas ? <span className="ml-1 text-[10px]">quedan {t.disponible}</span> : null}
                  </button>
                );
              })}
            </div>
            <Button size="sm" disabled={!talla} onClick={pedir} className="mt-auto bg-success text-success-foreground hover:bg-success/90">
              {talla ? "Lo quiero por WhatsApp" : "Elige tu talla"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
