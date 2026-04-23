import { useState } from "react";
import { BarChart3, TrendingUp, ArrowLeftRight, Package, Tag, Layers, Target, Zap, Trophy, Archive, Users, Calculator, UserCog, Briefcase, ChevronDown, Settings, MapPin, Upload, LogOut } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  SidebarFooter,
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
  { title: "Traslados (NetSuite)", url: "/logistica-traslados", icon: ArrowLeftRight, description: "Allocation v2 & exportación" },
  { title: "Gestión de Insumos", url: "/insumos", icon: Package, description: "CEDI & reorden" },
  { title: "Cierre de Colecciones", url: "/cierre-coleccion", icon: Archive, description: "Desempeño por colección & remanentes" },
  { title: "Presupuestos", url: "/presupuestos", icon: Target, description: "Metas de venta" },
  { title: "Centro de Acción", url: "/centro-accion", icon: Zap, description: "Alertas comerciales" },
];

const gestionComercialItems: NavItem[] = [
  { title: "Gestión de Incentivos", url: "/incentivos", icon: Trophy, description: "Campañas & liquidaciones" },
  { title: "Rendimiento Equipo", url: "/rendimiento-vendedores", icon: Users, description: "Desempeño por vendedor" },
  { title: "Liquidación Comisiones", url: "/comisiones", icon: Calculator, description: "Cálculo y aprobación" },
  { title: "Equipo Comercial", url: "/vendedores", icon: UserCog, description: "Gestión de vendedores" },
];

const configuracionItems: NavItem[] = [
  { title: "Ubicaciones", url: "/configuracion/ubicaciones", icon: MapPin, description: "Tiendas, CEDIs y outlets" },
  { title: "Inventario NetSuite", url: "/configuracion/netsuite-upload", icon: Upload, description: "Subir snapshot de inventario" },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { signOut, session } = useAuth();
  const isGestionActive = gestionComercialItems.some((i) => location.pathname === i.url);
  const isConfigActive = configuracionItems.some((i) => location.pathname === i.url);
  const [gestionOpen, setGestionOpen] = useState(isGestionActive);
  const [configOpen, setConfigOpen] = useState(isConfigActive);

  const userEmail = session?.user?.email || "";
  const userInitial = userEmail.charAt(0).toUpperCase() || "U";

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Sesión cerrada");
      navigate("/login");
    } catch (e) {
      toast.error("Error al cerrar sesión");
    }
  };

  const renderItem = (item: NavItem, indent = false) => {
    const isActive = location.pathname === item.url;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <Link
            to={item.url}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
              indent ? "ml-3" : ""
            } ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
            }`}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            <span className="text-sm leading-tight truncate">{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="px-6 py-6 border-b border-sidebar-border/40">
        <img src={monasteryLogoWhite} alt="Monastery Logo" className="w-36 h-auto" />
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-widest uppercase text-sidebar-foreground/40 px-3 mb-2">
            Análisis
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => renderItem(item))}

              {/* Gestión Comercial — submenú colapsable */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={() => setGestionOpen((v) => !v)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                      isGestionActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                    }`}
                  >
                    <Briefcase className="h-[18px] w-[18px] shrink-0" />
                    <span className="text-sm leading-tight flex-1 text-left truncate">Gestión Comercial</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 shrink-0 transition-transform ${gestionOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {gestionOpen && gestionComercialItems.map((item) => renderItem(item, true))}

              {/* Configuración — solo admin */}
              {isAdmin && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => setConfigOpen((v) => !v)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                          isConfigActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Settings className="h-[18px] w-[18px] shrink-0" />
                        <span className="text-sm leading-tight flex-1 text-left truncate">Configuración</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${configOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {configOpen && configuracionItems.map((item) => renderItem(item, true))}
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border/40 gap-2">
        {userEmail && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-accent-foreground text-xs font-semibold shrink-0">
              {userInitial}
            </div>
            <span className="text-xs text-sidebar-foreground/70 truncate flex-1">{userEmail}</span>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all duration-150 text-sm font-medium"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>Cerrar sesión</span>
        </button>
        <p className="text-[10px] text-sidebar-foreground/30 text-center tracking-wide pt-1">
          Monastery BI © 2025
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
