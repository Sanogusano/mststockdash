import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, ArrowLeftRight, Package, Tag, Layers, Target, Zap, Trophy, Archive, Users, Calculator, UserCog, Briefcase, ChevronDown, Settings, MapPin, Upload, LogOut, Truck, Shield } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useUserPermissions } from "@/hooks/useUserPermissions";
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
  module: string;
  action: string;
};

const navItems: NavItem[] = [
  { title: "Resumen Ejecutivo", url: "/", icon: TrendingUp, description: "Desempeño comercial", module: "dashboards.resumen_ejecutivo", action: "view" },
  { title: "Inventarios & Salud", url: "/inventarios", icon: BarChart3, description: "WOS por tienda", module: "dashboards.inventario_salud", action: "view" },
  { title: "Salud de Producto", url: "/producto", icon: Tag, description: "Sell-through & WOS", module: "dashboards.salud_producto", action: "view" },
  { title: "Desempeño por Línea", url: "/lineas", icon: Layers, description: "Categorías & canales", module: "dashboards.desempeno_linea", action: "view" },

  { title: "Gestión de Insumos", url: "/insumos", icon: Package, description: "CEDI & reorden", module: "dashboards.gestion_insumos", action: "view" },
  { title: "Cierre de Colecciones", url: "/cierre-coleccion", icon: Archive, description: "Desempeño por colección & remanentes", module: "dashboards.cierre_colecciones", action: "view" },
  { title: "Presupuestos", url: "/presupuestos", icon: Target, description: "Metas de venta", module: "dashboards.presupuestos", action: "view" },
  { title: "Centro de Acción", url: "/centro-accion", icon: Zap, description: "Alertas comerciales", module: "dashboards.centro_accion", action: "view" },
  { title: "Rendimiento de Red", url: "/rendimiento-red", icon: TrendingUp, description: "Same-store, maduración y eficiencia", module: "dashboards.rendimiento_red", action: "view" },
];

const gestionComercialItems: NavItem[] = [
  { title: "Gestión de Incentivos", url: "/incentivos", icon: Trophy, description: "Campañas & liquidaciones", module: "incentivos", action: "view" },
  { title: "Rendimiento Equipo", url: "/rendimiento-vendedores", icon: Users, description: "Desempeño por vendedor", module: "dashboards.rendimiento_vendedores", action: "view" },
  { title: "Liquidación Comisiones", url: "/comisiones", icon: Calculator, description: "Cálculo y aprobación", module: "comisiones", action: "view" },
  { title: "Equipo Comercial", url: "/vendedores", icon: UserCog, description: "Gestión de vendedores", module: "vendedores", action: "view" },
];

const logisticaItems: NavItem[] = [
  { title: "Allocation & Movimientos", url: "/logistica", icon: ArrowLeftRight, description: "Allocation & movimientos", module: "dashboards.logistica_traslados", action: "view" },
  { title: "Traslados (NetSuite)", url: "/logistica-traslados", icon: Truck, description: "Allocation v2 & exportación", module: "dashboards.logistica_traslados", action: "view" },
];

const configuracionItems: NavItem[] = [
  { title: "Ubicaciones", url: "/configuracion/ubicaciones", icon: MapPin, description: "Tiendas, CEDIs y outlets", module: "config.ubicaciones", action: "view" },
  { title: "Inventario NetSuite", url: "/configuracion/netsuite-upload", icon: Upload, description: "Subir snapshot de inventario", module: "inventario_netsuite", action: "view" },
  { title: "Usuarios", url: "/configuracion/usuarios", icon: Users, description: "Gestión de usuarios y accesos", module: "config.usuarios", action: "view" },
  { title: "Roles y Permisos", url: "/configuracion/roles", icon: Shield, description: "Matriz de permisos por rol", module: "config.roles", action: "view" },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, role } = useUserRole();
  const { signOut, session } = useAuth();
  const { data: permissions } = useUserPermissions();

  // Filtro por permisos. Admin: failsafe → ve todo.
  const can = (module: string, action: string) => {
    if (isAdmin) return true;
    return (permissions ?? []).some(
      (p) => p.module_key === module && p.action_key === action && p.granted === true,
    );
  };

  const visibleNav = useMemo(() => navItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleGestion = useMemo(() => gestionComercialItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleLogistica = useMemo(() => logisticaItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleConfig = useMemo(() => configuracionItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);

  const isGestionActive = visibleGestion.some((i) => location.pathname === i.url);
  const isConfigActive = visibleConfig.some((i) => location.pathname === i.url);
  const isLogisticaActive = visibleLogistica.some((i) => location.pathname === i.url);
  const [gestionOpen, setGestionOpen] = useState(isGestionActive);
  const [configOpen, setConfigOpen] = useState(isConfigActive);
  const [logisticaOpen, setLogisticaOpen] = useState(isLogisticaActive);

  const userEmail = session?.user?.email || "";
  const userInitial = userEmail.charAt(0).toUpperCase() || "U";
  const roleLabel = role ? role.replace(/_/g, " ") : "sin rol";

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

  // Slice para mantener orden visual original (4 primeros, luego logística, luego resto, luego gestión)
  const visibleFirstFour = visibleNav.filter((i) =>
    ["/", "/inventarios", "/producto", "/lineas"].includes(i.url),
  );
  const visibleRest = visibleNav.filter(
    (i) => !["/", "/inventarios", "/producto", "/lineas"].includes(i.url),
  );

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
              {visibleFirstFour.map((item) => renderItem(item))}

              {/* Logística — solo si hay items visibles */}
              {visibleLogistica.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => setLogisticaOpen((v) => !v)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                          isLogisticaActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Truck className="h-[18px] w-[18px] shrink-0" />
                        <span className="text-sm leading-tight flex-1 text-left truncate">Logística & Traslados</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${logisticaOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {logisticaOpen && visibleLogistica.map((item) => renderItem(item, true))}
                </>
              )}

              {visibleRest.map((item) => renderItem(item))}

              {/* Gestión Comercial — solo si hay items visibles */}
              {visibleGestion.length > 0 && (
                <>
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
                  {gestionOpen && visibleGestion.map((item) => renderItem(item, true))}
                </>
              )}

              {/* Configuración — solo si hay items visibles */}
              {visibleConfig.length > 0 && (
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
                  {configOpen && visibleConfig.map((item) => renderItem(item, true))}
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
            <div className="min-w-0 flex-1">
              <p className="text-xs text-sidebar-foreground/80 truncate">{userEmail}</p>
              <p className="text-[10px] text-sidebar-foreground/50 capitalize truncate">
                {roleLabel}
              </p>
            </div>
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
