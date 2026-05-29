import { useState, useMemo } from "react";
import { BarChart3, TrendingUp, ArrowLeftRight, Package, Tag, Layers, Target, Zap, Trophy, Archive, Users, Calculator, UserCog, Briefcase, ChevronDown, Settings, MapPin, Upload, LogOut, Truck, Shield, Store, Banknote, LayoutDashboard, CreditCard, MessageCircle, AlertTriangle } from "lucide-react";
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

// Items principales en orden solicitado
const resumenItem: NavItem = { title: "Resumen Ejecutivo", url: "/", icon: TrendingUp, description: "Desempeño comercial", module: "dashboards.resumen_ejecutivo", action: "view" };
const presupuestoItem: NavItem = { title: "Presupuesto", url: "/presupuestos", icon: Target, description: "Metas de venta", module: "dashboards.presupuestos", action: "view" };
const centroAccionItem: NavItem = { title: "Centro de Acciones", url: "/centro-accion", icon: Zap, description: "Alertas comerciales", module: "dashboards.centro_accion", action: "view" };
const rendimientoTiendasItem: NavItem = { title: "Rendimiento Tiendas", url: "/rendimiento-red", icon: Store, description: "Same-store, maduración y eficiencia", module: "dashboards.rendimiento_red", action: "view" };
const saludProductoItem: NavItem = { title: "Salud de Producto", url: "/producto", icon: Tag, description: "Sell-through & WOS", module: "dashboards.salud_producto", action: "view" };
const desempenoLineaItem: NavItem = { title: "Desempeño por Línea", url: "/lineas", icon: Layers, description: "Categorías & canales", module: "dashboards.desempeno_linea", action: "view" };
const cierreColeccionItem: NavItem = { title: "Cierre de Colecciones", url: "/cierre-coleccion", icon: Archive, description: "Desempeño por colección & remanentes", module: "dashboards.cierre_colecciones", action: "view" };

// Items adicionales (no listados explícitamente, se mantienen visibles al final del bloque de análisis)
const inventariosItem: NavItem = { title: "Inventarios & Salud", url: "/inventarios", icon: BarChart3, description: "WOS por tienda", module: "dashboards.inventario_salud", action: "view" };
const bajaRotacionItem: NavItem = { title: "Baja Rotación", url: "/baja-rotacion", icon: AlertTriangle, description: "Sell-through bajo & antigüedad", module: "dashboards.inventario_salud", action: "view" };
const insumosItem: NavItem = { title: "Gestión de Insumos", url: "/insumos", icon: Package, description: "CEDI & reorden", module: "dashboards.gestion_insumos", action: "view" };

const manejoStockItems: NavItem[] = [
  saludProductoItem,
  desempenoLineaItem,
  inventariosItem,
  bajaRotacionItem,
  insumosItem,
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

const finanzasItems: NavItem[] = [
  { title: "Dashboard Financiero", url: "/finanzas", icon: LayoutDashboard, description: "Vista general", module: "finanzas.view", action: "view" },
  { title: "Composición Ingresos", url: "/finanzas/composicion-ingresos", icon: BarChart3, description: "Ingresos por canal y método", module: "finanzas.view", action: "view" },
  { title: "Conciliación Addi", url: "/finanzas/addi", icon: CreditCard, description: "Addi", module: "finanzas.addi", action: "view" },
  { title: "Conciliación Wompi", url: "/finanzas/wompi", icon: CreditCard, description: "Wompi", module: "finanzas.wompi", action: "view" },
  { title: "Conciliación Mercado Pago", url: "/finanzas/mercadopago", icon: CreditCard, description: "MP", module: "finanzas.mercadopago", action: "view" },
  { title: "Conciliación Sistecredito", url: "/finanzas/sistecredito", icon: CreditCard, description: "Sistecredito", module: "finanzas.sistecredito", action: "view" },
];

const configuracionItems: NavItem[] = [
  { title: "Ubicaciones", url: "/configuracion/ubicaciones", icon: MapPin, description: "Tiendas, CEDIs y outlets", module: "config.ubicaciones", action: "view" },
  { title: "Inventario NetSuite", url: "/configuracion/netsuite-upload", icon: Upload, description: "Subir snapshot de inventario", module: "inventario_netsuite", action: "view" },
  { title: "Usuarios", url: "/configuracion/usuarios", icon: Users, description: "Gestión de usuarios y accesos", module: "config.usuarios", action: "view" },
  { title: "Roles y Permisos", url: "/configuracion/roles", icon: Shield, description: "Matriz de permisos por rol", module: "config.roles", action: "view" },
  { title: "Alertas WhatsApp", url: "/configuracion/notificaciones", icon: MessageCircle, description: "Destinatarios y reportes WhatsApp", module: "config.notificaciones", action: "view" },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, role } = useUserRole();
  const { signOut, session } = useAuth();
  const { data: permissions } = useUserPermissions();

  const can = (module: string, action: string) => {
    if (isAdmin) return true;
    return (permissions ?? []).some(
      (p) => p.module_key === module && p.action_key === action && p.granted === true,
    );
  };

  const visibleGestion = useMemo(() => gestionComercialItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleLogistica = useMemo(() => logisticaItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleConfig = useMemo(() => configuracionItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleFinanzas = useMemo(() => finanzasItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);
  const visibleStock = useMemo(() => manejoStockItems.filter((i) => can(i.module, i.action)), [permissions, isAdmin]);

  const canPresupuesto = can(presupuestoItem.module, presupuestoItem.action);
  const canCentroAccion = can(centroAccionItem.module, centroAccionItem.action);

  const isGestionActive = visibleGestion.some((i) => location.pathname === i.url);
  const isConfigActive = visibleConfig.some((i) => location.pathname === i.url);
  const isLogisticaActive = visibleLogistica.some((i) => location.pathname === i.url);
  const isFinanzasActive = visibleFinanzas.some((i) => location.pathname === i.url);
  const isPresupuestoActive = [presupuestoItem.url, centroAccionItem.url].includes(location.pathname);
  const isStockActive = visibleStock.some((i) => location.pathname === i.url);

  const [gestionOpen, setGestionOpen] = useState(isGestionActive);
  const [configOpen, setConfigOpen] = useState(isConfigActive);
  const [logisticaOpen, setLogisticaOpen] = useState(isLogisticaActive);
  const [finanzasOpen, setFinanzasOpen] = useState(isFinanzasActive);
  const [presupuestoOpen, setPresupuestoOpen] = useState(isPresupuestoActive);
  const [stockOpen, setStockOpen] = useState(isStockActive);

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
              {/* 1 - Resumen Ejecutivo */}
              {can(resumenItem.module, resumenItem.action) && renderItem(resumenItem)}

              {/* 2 - Presupuesto (con sub-item Centro de Acciones) */}
              {canPresupuesto && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => setPresupuestoOpen((v) => !v)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                          isPresupuestoActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Target className="h-[18px] w-[18px] shrink-0" />
                        <span className="text-sm leading-tight flex-1 text-left truncate">Presupuesto</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${presupuestoOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {presupuestoOpen && (
                    <>
                      {renderItem(presupuestoItem, true)}
                      {canCentroAccion && renderItem(centroAccionItem, true)}
                    </>
                  )}
                </>
              )}

              {/* 3 - Gestión Comercial */}
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

              {/* 4 - Rendimiento Tiendas */}
              {can(rendimientoTiendasItem.module, rendimientoTiendasItem.action) && renderItem(rendimientoTiendasItem)}

              {/* 5 - Cierre de Colecciones */}
              {can(cierreColeccionItem.module, cierreColeccionItem.action) && renderItem(cierreColeccionItem)}

              {/* 6 - Manejo de Stock */}
              {visibleStock.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => setStockOpen((v) => !v)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                          isStockActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Package className="h-[18px] w-[18px] shrink-0" />
                        <span className="text-sm leading-tight flex-1 text-left truncate">Manejo de Stock</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${stockOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {stockOpen && visibleStock.map((item) => renderItem(item, true))}
                </>
              )}

              {/* 7 - Logística & Traslados */}
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

              {/* Finanzas */}
              {visibleFinanzas.length > 0 && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <button
                        onClick={() => setFinanzasOpen((v) => !v)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 ${
                          isFinanzasActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
                        }`}
                      >
                        <Banknote className="h-[18px] w-[18px] shrink-0" />
                        <span className="text-sm leading-tight flex-1 text-left truncate">Finanzas</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 transition-transform ${finanzasOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  {finanzasOpen && visibleFinanzas.map((item) => renderItem(item, true))}
                </>
              )}

              {/* 9 - Configuración */}
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
