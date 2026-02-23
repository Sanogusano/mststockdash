import { BarChart3, TrendingUp, ArrowLeftRight, Package } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import monasteryLogo from "@/assets/Logo_Web_Monastery.svg";
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
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="px-6 py-5">
        <div className="flex items-center gap-3">
          <img src={monasteryLogo} alt="Monastery" className="h-7" />
          <div>
            <h1 className="text-sm font-bold text-foreground tracking-wide uppercase">
              Monastery
            </h1>
            <p className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase">
              Intelligence
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60 px-3 mb-2">
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
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
                          isActive
                            ? "bg-primary/8 text-primary font-medium"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm leading-tight">{item.title}</span>
                          <span className="text-[10px] text-muted-foreground/60 truncate">{item.description}</span>
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
        <p className="text-[10px] text-muted-foreground/40 text-center tracking-wide">
          Monastery BI © 2025
        </p>
      </div>
    </Sidebar>
  );
}
