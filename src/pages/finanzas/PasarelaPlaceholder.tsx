import { FinanzasLayout } from "./FinanzasLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Construction } from "lucide-react";

export function PasarelaPlaceholder({ nombre }: { nombre: string }) {
  return (
    <FinanzasLayout title={`Conciliación ${nombre}`}>
      <Card>
        <CardContent className="p-10 text-center space-y-4">
          <Construction className="h-10 w-10 text-amber-600 mx-auto" />
          <h2 className="text-lg font-semibold">Próximamente</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Carga el archivo de {nombre} para activar este módulo. La conciliación cruzará automáticamente con órdenes de Shopify y facturas de NetSuite.
          </p>
          <Button variant="outline" disabled className="gap-2">
            <Upload className="h-4 w-4" /> Cargar archivo (próximamente)
          </Button>
        </CardContent>
      </Card>
    </FinanzasLayout>
  );
}

export const WompiPage = () => <PasarelaPlaceholder nombre="Wompi" />;
export const MercadoPagoPage = () => <PasarelaPlaceholder nombre="Mercado Pago" />;
export const SistecreditoPage = () => <PasarelaPlaceholder nombre="Sistecredito" />;
