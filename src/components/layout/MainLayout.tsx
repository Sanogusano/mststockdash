import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BannerFrescuraInventario } from "@/components/dashboard/BannerFrescuraInventario";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full min-w-0 overflow-x-hidden bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col overflow-x-hidden">
          <BannerFrescuraInventario />
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
