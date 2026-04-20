import { useState } from "react";
import { BarChart3, TrendingUp, ArrowLeftRight, Package, Tag, Layers, Target, Zap, Trophy, Archive, Users, Calculator, UserCog, Briefcase, ChevronDown } from "lucide-react";
import { useLocation, Link } from "react-router-dom";
import monasteryLogoWhite from "@/assets/monastery-logo-white.jpg";
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

type NavItem = {
  title: string;
  url: string;
  icon: any;
  description: string;
};

const navItems: NavItem[] = [
  { title: "Resumen Ejecutivo", url: "/", icon: TrendingUp, description: "Desempeño comercial" },
  { title: "Inventarios & Salud", url: "/inventarios", icon: BarChart3, description: "WOS por tienda" },
  { title: "Salud de Producto", url: "/producto", icon: Tag, description: "Sell-through & WOS" },
  { title: "Desempeño por Línea", url: "/lineas", icon: Layers, description: "Categorías & canales" },
  { title: "Logística & Traslados", url: "/logistica", icon: ArrowLeftRight, description: "Allocation & movimientos" },
  { title: "Gestión de Insumos", url: "/insumos", icon: Package, description: "CEDI & reorden" },
  { title: "Presupuestos", url: "/presupuestos", icon: Target, description: "Metas de venta" },
  { title: "Centro de Acción", url: "/centro-accion", icon: Zap, description: "Alertas comerciales" },
  { title: "Cierre de Colecciones", url: "/cierre-coleccion", icon: Archive, description: "Desempeño por colección & remanentes" },
];

const gestionComercialItems: NavItem[] = [
  { title: "Gestión de Incentivos", url: "/incentivos", icon: Trophy, description: "Campañas & liquidaciones" },
  { title: "Rendimiento Equipo", url: "/rendimiento-vendedores", icon: Users, description: "Desempeño por vendedor" },
  { title: "Liquidación Comisiones", url: "/comisiones", icon: Calculator, description: "Cálculo y aprobación" },
  { title: "Equipo Comercial", url: "/vendedores", icon: UserCog, description: "Gestión de vendedores" },
];

export function AppSidebar() {
  const location = useLocation();
  const isGestionActive = gestionComercialItems.some((i) => location.pathname === i.url);
  const [gestionOpen, setGestionOpen] = useState(isGestionActive);

  const renderItem = (item: NavItem, indent = false) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <Link
            to={item.url}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group ${
              indent ? "ml-3" : ""
            } ${
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
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="px-6 py-5">
        <img src={monasteryLogoWhite} alt="Monastery Logo" className="w-40 h-auto" />
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground/60 px-3 mb-2">
            Análisis
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => renderItem(item))}

              {/* Gestión Comercial — submenú colapsable */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={() => setGestionOpen((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                      isGestionActive
                        ? "bg-primary/8 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Briefcase className={`h-4 w-4 shrink-0 ${isGestionActive ? "text-primary" : ""}`} />
                    <div className="flex flex-col min-w-0 flex-1 text-left">
                      <span className="text-sm leading-tight">Gestión Comercial</span>
                      <span className="text-[10px] text-muted-foreground/60 truncate">Incentivos, vendedores & comisiones</span>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${gestionOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {gestionOpen && gestionComercialItems.map((item) => renderItem(item, true))}
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
