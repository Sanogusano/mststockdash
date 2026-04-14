import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ArrowLeft, Download, FileText, AlertTriangle, X, ChevronDown, Store, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { exportToCSV } from "@/lib/csv-export";
import { exportToPDF } from "@/lib/pdf-export";
import { LoadingState } from "@/components/dashboard/LoadingState";
import { TimeFilter, resolveDays, getFilterEndDate } from "@/components/dashboard/TimeFilter";

interface OrderRow {
  numero_pedido: string;
  fecha: string;
  sucursal: string;
  producto: string;
  sku: string;
  cantidad: number;
  precio: number;
  descuento_otorgado: number;
  tipo_venta: string;
  compare_at_price: number;
  categoria: string;
}

interface Location {
  location_id: string;
  name: string;
}

const CEDI_ID = "71474315479";
const CEDI_DISPLAY = "Bodega Ecommerce";
const ALERT_CATEGORIES = ["SUNGLASSES", "FRAGANCE"];

export default function PedidosDetallePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const tipo = (searchParams.get("tipo") as "full_price" | "descuento" | "rebajas") || "descuento";
  const initialCanal = searchParams.get("canal") || "";
  const initialDays = parseInt(searchParams.get("days") || "30", 10);

  const [days, setDays] = useState(initialDays);
  const [selectedCanal, setSelectedCanal] = useState(initialCanal);
  const [data, setData] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showAlertDetail, setShowAlertDetail] = useState(false);

  const title = tipo === "full_price" ? "Pedidos a Full Price" : tipo === "rebajas" ? "Pedidos con Rebajas" : "Pedidos con Descuento";

  // Extract unique categories
  const categories = useMemo(() => {
    const cats = new Set(data.map(r => r.categoria));
    return Array.from(cats).sort();
  }, [data]);

  // Filtered data
  const filteredData = useMemo(() => {
    if (selectedCategories.length === 0) return data;
    return data.filter(r => selectedCategories.includes(r.categoria));
  }, [data, selectedCategories]);

  // Alert stats for control categories
  const alertStats = useMemo(() => {
    const stats: { cat: string; pedidos: number; unidades: number; byStore: Record<string, number> }[] = [];
    for (const cat of ALERT_CATEGORIES) {
      const rows = data.filter(r => r.categoria === cat);
      if (rows.length === 0) continue;
      const byStore: Record<string, number> = {};
      rows.forEach(r => {
        byStore[r.sucursal] = (byStore[r.sucursal] || 0) + r.cantidad;
      });
      stats.push({
        cat,
        pedidos: new Set(rows.map(r => r.numero_pedido)).size,
        unidades: rows.reduce((s, r) => s + r.cantidad, 0),
        byStore,
      });
    }
    return stats;
  }, [data]);

  const handleAlertClick = useCallback((cat?: string) => {
    if (cat) {
      setSelectedCategories([cat]);
    } else {
      setSelectedCategories(ALERT_CATEGORIES.filter(c => data.some(r => r.categoria === c)));
    }
    setShowAlertDetail(true);
  }, [data]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
    setShowAlertDetail(false);
  };

  const clearCategories = () => {
    setSelectedCategories([]);
    setShowAlertDetail(false);
  };

  // Load all locations
  useEffect(() => {
    supabase.from("locations").select("location_id, name").eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          setLocations(data.map(l => ({
            ...l,
            name: l.location_id === CEDI_ID ? CEDI_DISPLAY : l.name,
          })));
        }
      });
  }, []);

  // Filter locations based on selected canal
  const filteredLocations = useMemo(() => {
    if (selectedCanal === "digital") {
      return locations.filter(l => l.location_id === CEDI_ID);
    }
    if (selectedCanal === "tiendas" || selectedCanal === "outlets") {
      return locations.filter(l => l.location_id !== CEDI_ID);
    }
    return locations;
  }, [locations, selectedCanal]);

  // Reset location when canal changes and current selection is incompatible
  useEffect(() => {
    if (selectedLocation === "all") return;
    const isValid = filteredLocations.some(l => l.location_id === selectedLocation);
    if (!isValid) setSelectedLocation("all");
  }, [selectedCanal, filteredLocations, selectedLocation]);

  // Channel order stats
  const channelStats = useMemo(() => {
    const tiendasOrders = new Set(data.filter(r => r.sucursal !== CEDI_DISPLAY && r.sucursal !== "Shopify Online Store").map(r => r.numero_pedido));
    const digitalOrders = new Set(data.filter(r => r.sucursal === CEDI_DISPLAY || r.sucursal === "Shopify Online Store").map(r => r.numero_pedido));
    return { tiendas: tiendasOrders.size, digital: digitalOrders.size };
  }, [data]);

  // Load orders
  useEffect(() => {
    setLoading(true);
    const locParam = selectedLocation === "all" ? null : selectedLocation;
    const canalParam = selectedCanal || null;
    const effectiveDays = resolveDays(days);

    supabase.rpc("reporte_pedidos_por_tipo_venta", {
      dias_atras: effectiveDays,
      p_canal: canalParam,
      p_location_id: locParam,
      p_tipo: tipo,
    }).then(({ data: rows, error }) => {
      if (error) {
        console.error("Error fetching orders:", error);
        setData([]);
      } else if (rows) {
        setData(rows as unknown as OrderRow[]);
      }
      setLoading(false);
    });
  }, [days, selectedCanal, selectedLocation, tipo]);

  const calcDiscountPct = (row: OrderRow) => {
    if (row.tipo_venta === "Descuento de Producto" && row.compare_at_price > 0) {
      return Math.round(((row.compare_at_price - row.precio) / row.compare_at_price) * 100);
    }
    if (row.tipo_venta === "Descuento Promocional" && row.descuento_otorgado > 0) {
      const totalBeforeDiscount = row.precio * row.cantidad + row.descuento_otorgado;
      return Math.round((row.descuento_otorgado / totalBeforeDiscount) * 100);
    }
    return 0;
  };

  const calcDiscountValue = (row: OrderRow) => {
    if (row.tipo_venta === "Descuento de Producto" && row.compare_at_price > 0) {
      return (row.compare_at_price - row.precio) * row.cantidad;
    }
    return row.descuento_otorgado;
  };

  const isAlertCategory = (cat: string) => ALERT_CATEGORIES.includes(cat);

  const fmtCOP = (v: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 }).format(v);

  const exportData = filteredData.map(r => ({
    Pedido: r.numero_pedido,
    Fecha: new Date(r.fecha).toLocaleDateString("es-CO"),
    Sucursal: r.sucursal,
    Producto: r.producto,
    Categoría: r.categoria,
    SKU: r.sku,
    Cantidad: r.cantidad,
    Precio: r.precio,
    ...(tipo === "descuento" ? {
      "Descuento $": calcDiscountValue(r),
      "Descuento %": calcDiscountPct(r) + "%",
      "Tipo Descuento": r.tipo_venta === "Descuento de Producto" ? "Producto Rebajado" : "Descuento Promocional",
    } : {}),
  }));

  const categoryLabel = selectedCategories.length === 0
    ? "Todas"
    : selectedCategories.length <= 2
      ? selectedCategories.join(", ")
      : `${selectedCategories.length} seleccionadas`;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Header */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-foreground">{title}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Canal: {!selectedCanal ? "Todos" : selectedCanal === "digital" ? "Digital" : selectedCanal === "outlets" ? "Outlets" : "Tiendas"} · {resolveDays(days)} días
                </p>
              </div>
            </div>
            {filteredData.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => exportToCSV(exportData as any, `pedidos_${tipo}_${resolveDays(days)}d`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button
                  onClick={() => exportToPDF(exportData as any, `pedidos_${tipo}_${resolveDays(days)}d`, title)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            )}
          </header>

          {/* Alert Banner for control categories */}
          {tipo === "descuento" && alertStats.length > 0 && (
            <div className="px-4 sm:px-6 py-2 border-b border-border bg-destructive/5">
              <div className="flex flex-wrap items-center gap-3">
                {alertStats.map(stat => (
                  <button
                    key={stat.cat}
                    onClick={() => handleAlertClick(stat.cat)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 transition-colors text-destructive text-xs font-semibold"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>{stat.cat}: {stat.unidades} uds en {stat.pedidos} pedidos</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Store breakdown when alert clicked and no location filter */}
          {showAlertDetail && selectedLocation === "all" && (
            <div className="px-4 sm:px-6 py-3 border-b border-border bg-destructive/5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Desglose por tienda — {selectedCategories.join(", ")}
                </h4>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => setShowAlertDetail(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {(() => {
                  const merged: Record<string, number> = {};
                  alertStats
                    .filter(s => selectedCategories.includes(s.cat))
                    .forEach(s => {
                      Object.entries(s.byStore).forEach(([store, qty]) => {
                        merged[store] = (merged[store] || 0) + qty;
                      });
                    });
                  return Object.entries(merged)
                    .sort((a, b) => b[1] - a[1])
                    .map(([store, qty]) => (
                      <div key={store} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs">
                        <span className="truncate text-foreground">{store}</span>
                        <span className="font-bold text-destructive whitespace-nowrap">{qty} uds</span>
                      </div>
                    ));
                })()}
              </div>
            </div>
          )}

          {/* Filters: Canal → Sucursal → Categoría | TimeFilter */}
          <div className="px-4 sm:px-6 py-3 border-b border-border flex flex-wrap items-center gap-3">
            {/* Canal filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Canal:</span>
              <Select value={selectedCanal || "all"} onValueChange={(v) => setSelectedCanal(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[160px] h-8 text-xs bg-card">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="all">Todos los canales</SelectItem>
                  <SelectItem value="tiendas">Tiendas</SelectItem>
                  <SelectItem value="digital">Digital</SelectItem>
                  <SelectItem value="outlets">Outlets</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sucursal filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Sucursal:</span>
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-[200px] h-8 text-xs bg-card">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border shadow-lg z-50">
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {filteredLocations.map((loc) => (
                    <SelectItem key={loc.location_id} value={loc.location_id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Multi-select categories */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Categoría:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-[200px] justify-between">
                    <span className="truncate">{categoryLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2 max-h-[280px] overflow-y-auto" align="start">
                  {selectedCategories.length > 0 && (
                    <button
                      onClick={clearCategories}
                      className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm mb-1 transition-colors"
                    >
                      Limpiar selección
                    </button>
                  )}
                  {categories.map(cat => (
                    <label
                      key={cat}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded-sm cursor-pointer hover:bg-muted transition-colors text-sm",
                        isAlertCategory(cat) && "text-destructive"
                      )}
                    >
                      <Checkbox
                        checked={selectedCategories.includes(cat)}
                        onCheckedChange={() => toggleCategory(cat)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex items-center gap-1 text-xs">
                        {isAlertCategory(cat) && <AlertTriangle className="h-3 w-3" />}
                        {cat}
                      </span>
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>

            {/* Time filter */}
            <TimeFilter value={days} onChange={setDays} />

            <span className="ml-auto text-xs text-muted-foreground">{filteredData.length} registros</span>
          </div>

          {/* Channel summary cards */}
          {!selectedCanal && (
            <div className="px-4 sm:px-6 py-3 border-b border-border flex flex-wrap gap-3">
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Store className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Pedidos Tiendas</p>
                    <p className="text-lg font-bold text-foreground">{channelStats.tiendas.toLocaleString("es-CO")}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="flex-1 min-w-[140px]">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="rounded-lg bg-accent/50 p-2">
                    <Globe className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground font-medium">Pedidos Digital</p>
                    <p className="text-lg font-bold text-foreground">{channelStats.digital.toLocaleString("es-CO")}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 px-4 sm:px-6 py-4 overflow-auto">
            {loading ? (
              <LoadingState rows={8} />
            ) : filteredData.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Sin pedidos para mostrar.</div>
            ) : (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 sticky top-0">
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Pedido</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Fecha</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Sucursal</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Producto</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Categoría</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Cant</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Precio</th>
                        {tipo === "descuento" && (
                          <>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Dcto %</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Dcto $</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Tipo de Descuento</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map((row, i) => {
                        const alert = isAlertCategory(row.categoria);
                        return (
                          <tr key={i} className={cn(
                            "border-b border-border/50 hover:bg-muted/20 transition-colors",
                            alert && "bg-destructive/5"
                          )}>
                            <td className="px-4 py-2.5 font-mono text-xs">{row.numero_pedido}</td>
                            <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(row.fecha).toLocaleDateString("es-CO")}</td>
                            <td className="px-4 py-2.5">{row.sucursal}</td>
                            <td className="px-4 py-2.5 max-w-[220px] truncate">{row.producto}</td>
                            <td className="px-4 py-2.5 text-xs">
                              <span className={cn("inline-flex items-center gap-1", alert && "text-destructive font-semibold")}>
                                {alert && <AlertTriangle className="h-3.5 w-3.5" />}
                                {row.categoria}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">{row.cantidad}</td>
                            <td className="px-4 py-2.5 text-right">{fmtCOP(row.precio)}</td>
                            {tipo === "descuento" && (
                              <>
                                <td className="px-4 py-2.5 text-right text-destructive font-medium">{calcDiscountPct(row)}%</td>
                                <td className="px-4 py-2.5 text-right text-destructive font-medium">{fmtCOP(calcDiscountValue(row))}</td>
                                <td className="px-4 py-2.5">
                                  <span className={cn(
                                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                    row.tipo_venta === "Descuento de Producto"
                                      ? "bg-accent text-accent-foreground"
                                      : "bg-destructive/10 text-destructive"
                                  )}>
                                    {row.tipo_venta === "Descuento de Producto" ? "Producto Rebajado" : "Descuento Promocional"}
                                  </span>
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
