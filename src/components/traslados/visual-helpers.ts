// Helpers visuales: colores y descripciones por tipo de origen, tier y prioridad.
import type { OrigenTipo } from "@/lib/traslados-api";

export function colorOrigen(tipo: OrigenTipo): string {
  switch (tipo) {
    case "cedi_principal":
      return "bg-blue-700 text-white";
    case "cedi_guayabal":
      return "bg-purple-600 text-white";
    case "cedi_otro":
      return "bg-blue-400 text-white";
    case "consolidacion_lateral":
      return "bg-orange-600 text-white";
    default:
      return "bg-muted text-foreground";
  }
}

export function colorTier(tier: string): string {
  switch ((tier || "").toLowerCase()) {
    case "cedi":
      return "bg-slate-700 text-white";
    case "flagship":
      return "bg-purple-600 text-white";
    case "regular":
      return "bg-blue-600 text-white";
    case "pequena":
    case "pequeña":
      return "bg-green-600 text-white";
    case "outlet":
      return "bg-orange-500 text-white";
    default:
      return "bg-muted text-foreground";
  }
}

export function colorPrioridad(p: number): string {
  if (p >= 80) return "bg-red-600 text-white";
  if (p >= 50) return "bg-red-500 text-white";
  if (p >= 30) return "bg-orange-500 text-white";
  if (p >= 15) return "bg-yellow-500 text-black";
  return "bg-green-600 text-white";
}

export function nombreOrigen(tipo: OrigenTipo): string {
  switch (tipo) {
    case "cedi_principal":
      return "CEDI Principal";
    case "cedi_guayabal":
      return "CEDI Guayabal";
    case "cedi_otro":
      return "CEDI Otro";
    case "consolidacion_lateral":
      return "Consolidación";
  }
}

// Descripción textual para tooltips de tier
export function descripcionTier(tier: string): string {
  switch ((tier || "").toLowerCase()) {
    case "cedi":
      return "Centro de distribución: colchón de red 4 sem";
    case "flagship":
      return "Tienda tipo A: WOS objetivo 6 sem, MOD 4 und";
    case "regular":
      return "Tienda tipo B: WOS objetivo 4 sem, MOD 2 und";
    case "pequena":
    case "pequeña":
      return "Tienda tipo C: WOS objetivo 3 sem, MOD 1 und";
    case "outlet":
      return "Tienda outlet: WOS objetivo 2 sem, solo recibe";
    default:
      return "Tier no clasificado";
  }
}

// Descripción textual para tooltips de tipo de origen
export function descripcionOrigen(tipo: OrigenTipo): string {
  switch (tipo) {
    case "cedi_principal":
      return "Centro de distribución principal";
    case "cedi_guayabal":
      return "CEDI que vende e-commerce";
    case "cedi_otro":
      return "Centro de distribución secundario";
    case "consolidacion_lateral":
      return "Tienda con sobrestock del SKU que cede unidades";
  }
}
