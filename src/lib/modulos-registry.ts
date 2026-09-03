import {
  LayoutDashboard,
  Package,
  TrendingUp,
  Boxes,
  BarChart3,
  Microscope,
  Trophy,
  Map,
  GitBranch,
  LayoutGrid,
  BadgeCheck,
  TrendingDown,
  CalendarCheck,
  MapPin,
  Users,
  ShieldCheck,
  RefreshCw,
  Circle,
  Settings,
  type LucideIcon,
} from "lucide-react";

import Index from "@/pages/Index";
import ComportamientoProducto from "@/pages/ComportamientoProducto";
import DesempenoProductos from "@/pages/DesempenoProductos";
import Inventarios from "@/pages/Inventarios";
import LineasProducto from "@/pages/LineasProducto";
import Producto360 from "@/pages/Producto360";
import TopProductos from "@/pages/TopProductos";
import MapaProducto from "@/pages/MapaProducto";
import Linea360 from "@/pages/Linea360";
import DesempenoCategoria from "@/pages/DesempenoCategoria";
import SaludPublicacion from "@/pages/SaludPublicacion";
import BajaRotacion from "@/pages/BajaRotacion";
import CierreColeccion from "@/pages/CierreColeccion";
import ConfiguracionUbicaciones from "@/pages/ConfiguracionUbicaciones";
import ConfiguracionUsuarios from "@/pages/ConfiguracionUsuarios";
import ConfiguracionRoles from "@/pages/ConfiguracionRoles";
import ConfiguracionSyncInventario from "@/pages/ConfiguracionSyncInventario";

export interface ModuloEntry {
  component: React.ComponentType;
  icon: LucideIcon;
}

/**
 * Registro central de módulos. Las claves corresponden a la tabla
 * `modulos_app` (module_key) y mapean al componente de página y al
 * icono de lucide-react que lo representa.
 */
export const MODULOS_REGISTRY: Record<string, ModuloEntry> = {
  "dashboards.resumen_ejecutivo": { component: Index, icon: LayoutDashboard },
  "dashboards.salud_producto": { component: ComportamientoProducto, icon: Package },
  "dashboards.desempeno_productos": { component: DesempenoProductos, icon: TrendingUp },
  "dashboards.inventario_salud": { component: Inventarios, icon: Boxes },
  "dashboards.desempeno_linea": { component: LineasProducto, icon: BarChart3 },
  "zoom.analisis_producto": { component: Producto360, icon: Microscope },
  "zoom.top_productos": { component: TopProductos, icon: Trophy },
  "zoom.mapa_producto": { component: MapaProducto, icon: Map },
  "zoom.analisis_linea": { component: Linea360, icon: GitBranch },
  "zoom.desempeno_categoria": { component: DesempenoCategoria, icon: LayoutGrid },
  "zoom.salud_publicacion": { component: SaludPublicacion, icon: BadgeCheck },
  "dashboards.baja_rotacion": { component: BajaRotacion, icon: TrendingDown },
  "dashboards.cierre_colecciones": { component: CierreColeccion, icon: CalendarCheck },
  "config.ubicaciones": { component: ConfiguracionUbicaciones, icon: MapPin },
  "config.usuarios": { component: ConfiguracionUsuarios, icon: Users },
  "config.roles": { component: ConfiguracionRoles, icon: ShieldCheck },
  inventario_netsuite: { component: ConfiguracionSyncInventario, icon: RefreshCw },
};

/** Icono por defecto cuando un módulo no tiene icono asignado. */
export const ICONO_FALLBACK: LucideIcon = Circle;

/** Icono representativo de cada grupo del menú. */
export const ICONOS_GRUPO: Record<string, LucideIcon> = {
  "Resumen Ejecutivo": LayoutDashboard,
  "Productos y Stock": Package,
  "Zoom de Producto": Microscope,
  Colecciones: CalendarCheck,
  Configuración: Settings,
};
