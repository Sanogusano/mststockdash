import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useChequeoIntegridad, CHEQUEOS_CRITICOS } from "@/hooks/useChequeoIntegridad";

const KEY = "alerta_critica_oculta";

export function AlertaCriticaBanner() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const enabled = !!session && pathname !== "/login" && pathname !== "/reset-password";
  const { data } = useChequeoIntegridad(enabled);
  const [oculta, setOculta] = useState<string | null>(() => sessionStorage.getItem(KEY));

  if (!enabled) return null;
  const criticas = (data ?? []).filter((r) => CHEQUEOS_CRITICOS.includes(r.chequeo));
  if (!criticas.length) return null;
  const firma = criticas.map((r) => `${r.chequeo}:${r.valor}`).join("|");
  if (oculta === firma) return null;

  return (
    <div role="alert" className="sticky top-0 z-50 flex flex-wrap items-center gap-3 bg-destructive px-4 py-2.5 text-sm text-destructive-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1 font-medium">⚠️ Alerta crítica: {criticas.map((r) => r.detalle).join(" · ")}</span>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate(`/finanzas/reporte-facturacion?estado=${encodeURIComponent("SIN ORDEN DE VENTA EN NETSUITE")}`)}>Ver pedidos</Button>
      <Button size="sm" variant="secondary" className="h-7" onClick={() => navigate("/configuracion/estado-sistema")}>Estado del sistema</Button>
      <button aria-label="Ocultar alerta" className="rounded p-1 hover:bg-destructive-foreground/20" onClick={() => { sessionStorage.setItem(KEY, firma); setOculta(firma); }}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
