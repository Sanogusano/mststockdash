import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequirePermission } from "@/components/RequirePermission";
import Index from "./pages/Index";
import InventariosPage from "./pages/Inventarios";
import BajaRotacionPage from "./pages/BajaRotacion";
import BundleConstructionPage from "./pages/BundleConstruction";
import DesempenoCategoriaPage from "./pages/DesempenoCategoria";
import Producto360Page from "./pages/Producto360";
import SaludPublicacionPage from "./pages/SaludPublicacion";
import TopProductosPage from "./pages/TopProductos";
import LogisticaPage from "./pages/Logistica";
import LogisticaTrasladosPage from "./pages/LogisticaTraslados";
import InsumosPage from "./pages/Insumos";
import ComportamientoProductoPage from "./pages/ComportamientoProducto";
import LineasProductoPage from "./pages/LineasProducto";
import DesempenoProductosPage from "./pages/DesempenoProductos";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PedidosDetallePage from "./pages/PedidosDetalle";
import TiendaDetailPage from "./pages/TiendaDetail";
import VentaM2Page from "./pages/VentaM2";
import PresupuestosPage from "./pages/Presupuestos";
import CentroAccionPage from "./pages/CentroAccion";
import IncentivosPage from "./pages/Incentivos";
import CierreColeccionPage from "./pages/CierreColeccion";
import ProyeccionDemandaPage from "./pages/ProyeccionDemanda";
import RendimientoVendedoresPage from "./pages/RendimientoVendedores";
import ComisionesPage from "./pages/Comisiones";
import VendedoresPage from "./pages/Vendedores";
import ConfiguracionUbicacionesPage from "./pages/ConfiguracionUbicaciones";
import NetsuiteUploadPage from "./pages/NetsuiteUpload";
import ConfiguracionUsuariosPage from "./pages/ConfiguracionUsuarios";
import ConfiguracionRolesPage from "./pages/ConfiguracionRoles";
import ConfiguracionNotificacionesPage from "./pages/ConfiguracionNotificaciones";
import ConfiguracionSyncInventarioPage from "./pages/ConfiguracionSyncInventario";
import RendimientoRedPage from "./pages/RendimientoRed";
import FinanzasDashboardPage from "./pages/finanzas/FinanzasDashboard";
import AddiPage from "./pages/finanzas/AddiPage";
import ComposicionIngresosPage from "./pages/finanzas/ComposicionIngresosPage";
import { WompiPage, MercadoPagoPage, SistecreditoPage } from "./pages/finanzas/PasarelaPlaceholder";


const queryClient = new QueryClient();

/** Atajo: Protected + RequirePermission. */
const Guard = ({
  module,
  action,
  requireScope,
  children,
}: {
  module: string;
  action: string;
  requireScope?: boolean;
  children: React.ReactNode;
}) => (
  <ProtectedRoute>
    <RequirePermission module={module} action={action} requireScope={requireScope}>
      {children}
    </RequirePermission>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* ===== Dashboards mapeados (13 originales + 9 nuevas) ===== */}
          <Route path="/" element={<Guard module="dashboards.resumen_ejecutivo" action="view"><Index /></Guard>} />
          <Route path="/pedidos" element={<Guard module="pedidos" action="view"><PedidosDetallePage /></Guard>} />
          <Route path="/inventarios" element={<Guard module="dashboards.inventario_salud" action="view"><InventariosPage /></Guard>} />
          <Route path="/baja-rotacion" element={<Guard module="dashboards.inventario_salud" action="view"><BajaRotacionPage /></Guard>} />
          <Route path="/bundle-construction" element={<Guard module="dashboards.inventario_salud" action="view"><BundleConstructionPage /></Guard>} />
          <Route path="/desempeno-categoria" element={<Guard module="dashboards.inventario_salud" action="view"><DesempenoCategoriaPage /></Guard>} /></Guard>} /></Guard>} />
          <Route path="/tienda/:id" element={<Guard module="dashboards.resumen_ejecutivo" action="view" requireScope><TiendaDetailPage /></Guard>} />
          <Route path="/logistica" element={<Guard module="dashboards.logistica_traslados" action="view"><LogisticaPage /></Guard>} />
          <Route path="/logistica-traslados" element={<Guard module="dashboards.logistica_traslados" action="view"><LogisticaTrasladosPage /></Guard>} />
          <Route path="/producto" element={<Guard module="dashboards.salud_producto" action="view"><ComportamientoProductoPage /></Guard>} />
          <Route path="/lineas" element={<Guard module="dashboards.desempeno_linea" action="view"><LineasProductoPage /></Guard>} />
          <Route path="/desempeno-productos" element={<Guard module="dashboards.desempeno_productos" action="view"><DesempenoProductosPage /></Guard>} /></Guard>} />
          <Route path="/salud-publicacion" element={<Guard module="dashboards.salud_producto" action="view"><SaludPublicacionPage /></Guard>} />
          <Route path="/analisis-producto" element={<Guard module="dashboards.salud_producto" action="view"><Producto360Page /></Guard>} />
          <Route path="/top-productos" element={<Guard module="dashboards.inventario_salud" action="view"><TopProductosPage /></Guard>} />
          <Route path="/venta-m2" element={<Guard module="dashboards.venta_m2" action="view"><VentaM2Page /></Guard>} />
          <Route path="/insumos" element={<Guard module="dashboards.gestion_insumos" action="view"><InsumosPage /></Guard>} />
          <Route path="/presupuestos" element={<Guard module="dashboards.presupuestos" action="view"><PresupuestosPage /></Guard>} />
          <Route path="/centro-accion" element={<Guard module="dashboards.centro_accion" action="view"><CentroAccionPage /></Guard>} />
          <Route path="/incentivos" element={<Guard module="incentivos" action="view"><IncentivosPage /></Guard>} />
          <Route path="/cierre-coleccion" element={<Guard module="dashboards.cierre_colecciones" action="view"><CierreColeccionPage /></Guard>} />
          <Route path="/proyeccion-demanda" element={<ProtectedRoute><ProyeccionDemandaPage /></ProtectedRoute>} />
          <Route path="/rendimiento-vendedores" element={<Guard module="dashboards.rendimiento_vendedores" action="view"><RendimientoVendedoresPage /></Guard>} />
          <Route path="/comisiones" element={<Guard module="comisiones" action="view"><ComisionesPage /></Guard>} />
          <Route path="/vendedores" element={<Guard module="vendedores" action="view"><VendedoresPage /></Guard>} />
          <Route path="/rendimiento-red" element={<Guard module="dashboards.rendimiento_red" action="view"><RendimientoRedPage /></Guard>} />

          {/* ===== Finanzas ===== */}
          <Route path="/finanzas" element={<Guard module="finanzas.view" action="view"><FinanzasDashboardPage /></Guard>} />
          
          <Route path="/finanzas/composicion-ingresos" element={<Guard module="finanzas.view" action="view"><ComposicionIngresosPage /></Guard>} />
          <Route path="/finanzas/addi" element={<Guard module="finanzas.addi" action="view"><AddiPage /></Guard>} />
          <Route path="/finanzas/wompi" element={<Guard module="finanzas.wompi" action="view"><WompiPage /></Guard>} />
          <Route path="/finanzas/mercadopago" element={<Guard module="finanzas.mercadopago" action="view"><MercadoPagoPage /></Guard>} />
          <Route path="/finanzas/sistecredito" element={<Guard module="finanzas.sistecredito" action="view"><SistecreditoPage /></Guard>} />

          {/* ===== Configuración (admin) ===== */}
          <Route path="/configuracion/ubicaciones" element={<Guard module="config.ubicaciones" action="view"><ConfiguracionUbicacionesPage /></Guard>} />
          <Route path="/configuracion/netsuite-upload" element={<Guard module="inventario_netsuite" action="view"><NetsuiteUploadPage /></Guard>} />
          <Route path="/configuracion/usuarios" element={<Guard module="config.usuarios" action="view"><ConfiguracionUsuariosPage /></Guard>} />
          <Route path="/configuracion/roles" element={<Guard module="config.roles" action="view"><ConfiguracionRolesPage /></Guard>} />
          <Route path="/configuracion/notificaciones" element={<ProtectedRoute><ConfiguracionNotificacionesPage /></ProtectedRoute>} />
          <Route path="/configuracion/sync-inventario" element={<Guard module="inventario_netsuite" action="view"><ConfiguracionSyncInventarioPage /></Guard>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
