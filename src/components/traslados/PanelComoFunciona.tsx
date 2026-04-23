// Panel colapsable explicativo del módulo de traslados.
// Persistencia de estado abierto/cerrado en localStorage.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BookOpen } from "lucide-react";

const STORAGE_KEY = "traslados_panel_como_funciona_abierto";

export function PanelComoFunciona() {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // Si nunca se ha guardado, abrir por defecto la primera vez
      if (raw === null) {
        setAbierto(true);
      } else {
        setAbierto(raw === "true");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = () => {
    const next = !abierto;
    setAbierto(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <Card className="overflow-hidden border-primary/20">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            ¿Cómo funciona este módulo?
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            — Lee esto si es tu primera vez
          </span>
        </div>
        {abierto ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {abierto && (
        <div className="px-4 sm:px-6 py-4 border-t border-border bg-muted/10 space-y-5 text-sm">
          <div>
            <p className="text-foreground leading-relaxed">
              Este módulo sugiere <strong>traslados de inventario</strong> entre CEDIs y tiendas
              para que cada ubicación tenga el stock correcto sin excesos. Compara el stock actual
              (NetSuite) con las ventas recientes (Shopify) para calcular dónde falta producto y
              quién puede cederlo.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-2">El proceso en 4 pasos</h4>
            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
              <li>
                <strong className="text-foreground">Corres el motor</strong> con los parámetros que
                quieras (o con los defaults).
              </li>
              <li>
                <strong className="text-foreground">El motor analiza</strong> cada SKU en cada
                tienda: ¿se vende?, ¿cuánto stock hay vs cuánto debería haber?, ¿dónde sobra y
                dónde falta?
              </li>
              <li>
                <strong className="text-foreground">Revisas las sugerencias</strong>, las apruebas
                o ajustas manualmente.
              </li>
              <li>
                <strong className="text-foreground">Exportas archivos Excel</strong> listos para
                subir a NetSuite.
              </li>
            </ol>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-2">Conceptos clave</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-medium text-foreground">Ritmo de venta semanal:</span>{" "}
                <span className="text-muted-foreground">
                  promedio de unidades vendidas por semana.
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">WOS (Weeks of Stock):</span>{" "}
                <span className="text-muted-foreground">
                  cuántas semanas aguanta el stock actual al ritmo actual. Si vendes 2/semana y
                  tienes 8 unidades, tu WOS = 4 semanas.
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">WOS objetivo:</span>{" "}
                <span className="text-muted-foreground">
                  el WOS que queremos tener en cada tipo de tienda (flagship: 6 sem, regular: 4
                  sem, pequeña: 3 sem, outlet: 2 sem).
                </span>
              </li>
              <li>
                <span className="font-medium text-foreground">MOD (Mínimo de Exhibición):</span>{" "}
                <span className="text-muted-foreground">
                  unidades mínimas que siempre debe haber para que el producto esté presentable
                  (flagship: 4 und, regular: 2 und, pequeña: 1 und).
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-foreground mb-2">Cómo interpretar las prioridades</h4>
            <ul className="space-y-1 text-sm">
              <li className="flex items-start gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Prioridad &gt; 50:</strong>{" "}
                  <span className="text-muted-foreground">
                    urgente, hay destinos sin stock de productos que sí rotan.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-orange-500 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Prioridad 20-50:</strong>{" "}
                  <span className="text-muted-foreground">
                    importante, destinos cerca de quedarse sin stock.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                <span>
                  <strong className="text-foreground">Prioridad &lt; 20:</strong>{" "}
                  <span className="text-muted-foreground">
                    puede esperar, pero conviene revisar.
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <Button variant="ghost" size="sm" onClick={toggle} className="text-xs">
              Cerrar panel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
