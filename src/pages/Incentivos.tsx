import { useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { IncentivosTable } from "@/components/dashboard/IncentivosTable";
import { IncentivosWizard } from "@/components/dashboard/IncentivosWizard";

export default function IncentivosPage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Gestión de Incentivos</h1>
                <p className="text-sm text-muted-foreground">
                  Configura campañas de incentivos para tiendas y asesores
                </p>
              </div>
              <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Crear Incentivo
              </Button>
            </div>

            <IncentivosTable refreshKey={refreshKey} />

            <IncentivosWizard
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              onCreated={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
