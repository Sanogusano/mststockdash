import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import InventariosPage from "./pages/Inventarios";
import LogisticaPage from "./pages/Logistica";
import InsumosPage from "./pages/Insumos";
import ComportamientoProductoPage from "./pages/ComportamientoProducto";
import LoginPage from "./pages/Login";
import ResetPasswordPage from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import TiendaDetailPage from "./pages/TiendaDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
          <Route path="/inventarios" element={<ProtectedRoute><InventariosPage /></ProtectedRoute>} />
          <Route path="/tienda/:id" element={<ProtectedRoute><TiendaDetailPage /></ProtectedRoute>} />
          <Route path="/logistica" element={<ProtectedRoute><LogisticaPage /></ProtectedRoute>} />
          <Route path="/producto" element={<ProtectedRoute><ComportamientoProductoPage /></ProtectedRoute>} />
          <Route path="/insumos" element={<ProtectedRoute><InsumosPage /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
