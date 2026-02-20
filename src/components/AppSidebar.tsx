import { BarChart3, TrendingUp, ArrowLeftRight, Package } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";

const navItems = [
  {
    title: "Resumen Ejecutivo",
    url: "/",
    icon: TrendingUp,
    description: "Desempeño comercial",
  },
  {
    title: "Inventarios & Salud",
    url: "/inventarios",
    icon: BarChart3,
    description: "WOS por tienda",
  },
  {
    title: "Logística & Traslados",
    url: "/logistica",
    icon: ArrowLeftRight,
    description: "Allocation & movimientos",
  },
  {
    title: "Gestión de Insumos",
    url: "/insumos",
    icon: Package,
    description: "CEDI & reorden",
  },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="px-6 py-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-xl font-bold text-primary tracking-wide">
            MONASTERY
          </h1>
          <p className="text-xs text-muted-foreground font-light tracking-widest uppercase">
            Intelligence Hub
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium tracking-widest uppercase text-muted-foreground/60 px-3 mb-2">
            Análisis
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link
                        to={item.url}
                        className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group ${
                          isActive
                            ? "bg-primary/10 border-l-2 border-primary text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <item.icon
                          className={`h-4 w-4 shrink-0 ${
                            isActive
                              ? "text-primary"
                              : "text-muted-foreground group-hover:text-foreground"
                          }`}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className={`text-sm font-medium leading-tight ${isActive ? "text-primary" : ""}`}>
                            {item.title}
                          </span>
                          <span className="text-xs text-muted-foreground/70 truncate">
                            {item.description}
                          </span>
                        </div>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="mt-auto px-6 py-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground/50 text-center">
          Monastery BI © 2025
        </p>
      </div>
    </Sidebar>
  );
}
