import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConsumoInsumosMatriz from "./ConsumoInsumosMatriz";
import ProyeccionInsumos from "./ProyeccionInsumos";

export function SuppliesManagement() {
  return (
    <Tabs defaultValue="consumo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="consumo">Consumo por tienda</TabsTrigger>
        <TabsTrigger value="proyeccion">Proyección de demanda</TabsTrigger>
      </TabsList>
      <TabsContent value="consumo">
        <ConsumoInsumosMatriz />
      </TabsContent>
      <TabsContent value="proyeccion">
        <ProyeccionInsumos />
      </TabsContent>
    </Tabs>
  );
}
