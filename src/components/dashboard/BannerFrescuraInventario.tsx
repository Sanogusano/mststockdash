import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, AlertTriangle } from "lucide-react";

const RUTAS_INVENTARIO = [
  "/inventarios",
  "/baja-rotacion",
  "/bundle-construction",
  "/logistica",
  "/logistica-traslados",
  "/insumos",
  "/proyeccion-demanda",
  "/cierre-coleccion",
  "/configuracion/netsuite-upload",
  "/configuracion/sync-inventario",
];

interface FrescuraRow {
  semaforo: string | null;
  snapshot_estado: string | null;
  snapshot_pct: number | null;
  conciliacion_estado: string | null;
  conciliacion_ejecutada_bog: string | null;
  mv_estado: string | null;
  mv_refrescada_bog: string | null;
  netsuite_dias_antiguedad: number | null;
}

function formatBogota(ts: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BannerFrescuraInventario() {
  const { pathname } = useLocation();
  const [row, setRow] = useState<FrescuraRow | null>(null);
  const [loading, setLoading] = useState(true);

  if (!RUTAS_INVENTARIO.includes(pathname)) return null;

  useEffect(() => {
    let cancelled = false;
    async function fetchFrescura() {
      try {
        const { data, error } = await supabase
          .from("estado_frescura_inventario")
          .select(
            "semaforo, snapshot_estado, snapshot_pct, conciliacion_estado, conciliacion_ejecutada_bog, mv_estado, mv_refrescada_bog, netsuite_dias_antiguedad"
          )
          .limit(1)
          .single();
        if (!cancelled) {
          if (error) {
            console.error("Error cargando estado_frescura_inventario:", error);
          } else {
            setRow(data as FrescuraRow);
          }
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFrescura();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !row) return null;
  if (row.semaforo === "VERDE") return null;

  const isRojo = row.semaforo === "ROJO";

  let message = "";
  if (isRojo) {
    if (row.snapshot_estado === "ausente") {
      message = "No hay snapshot de inventario de hoy";
    } else if (row.snapshot_estado === "incompleto") {
      const pct = row.snapshot_pct ?? 0;
      message = `El snapshot de hoy está al ${pct.toFixed(0)}%, faltan datos`;
    } else {
      message = "El snapshot de inventario presenta inconsistencias";
    }
  } else {
    const partes: string[] = [];
    if (row.conciliacion_estado && row.conciliacion_estado !== "ok") {
      const hora = formatBogota(row.conciliacion_ejecutada_bog);
      partes.push(
        `Conciliación NetSuite ${row.conciliacion_estado.replace(/_/g, " ")}${hora ? ` (última ${hora})` : ""}`
      );
    }
    if (row.mv_estado && row.mv_estado !== "ok") {
      const hora = formatBogota(row.mv_refrescada_bog);
      partes.push(
        `Vistas de datos ${row.mv_estado.replace(/_/g, " ")}${hora ? ` (última ${hora})` : ""}`
      );
    }
    if (row.netsuite_dias_antiguedad && row.netsuite_dias_antiguedad > 1) {
      partes.push(`Snapshot NetSuite tiene ${row.netsuite_dias_antiguedad} días de antigüedad`);
    }
    message = partes.length ? partes.join(" · ") : "Datos de inventario desactualizados";
  }

  return (
    <div
      className={`px-4 sm:px-6 py-2.5 text-sm font-medium flex items-center gap-2.5 shrink-0 ${
        isRojo
          ? "bg-destructive text-destructive-foreground"
          : "bg-warning/15 text-warning-foreground border-b border-warning/20"
      }`}
      role="alert"
    >
      {isRojo ? (
        <AlertCircle className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      <span className="leading-tight">{message}</span>
    </div>
  );
}
