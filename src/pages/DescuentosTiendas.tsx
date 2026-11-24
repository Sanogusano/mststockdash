import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { DescuentosTiendasReport } from "@/components/dashboard/DescuentosTiendasReport";

export default function DescuentosTiendasPage() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex items-center gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Descuentos en Tiendas</h2>
          </header>
          <div className="p-4 sm:p-6 min-w-0">
            <DescuentosTiendasReport />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
