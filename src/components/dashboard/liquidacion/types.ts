export interface CampanaResumen {
  incentivo_id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  alcance: string;
  tipo_regla: string;
  parametros: Record<string, any>;
  valor_objetivo: number;
  recompensa?: {
    tipo_pago: string;
    valor: number;
    tope_minimo: number | null;
    tope_maximo: number | null;
  };
  totalParticipantes: number;
  cumplenMeta: number;
  totalGanado: number;
  // Para semanal:
  totalSemanas?: number;
  semanasCumplidas?: number;
}

export interface LiquidacionRow {
  id: string;
  incentivo_id: string;
  location_id: string | null;
  vendedor_id: string | null;
  progreso_actual: Record<string, any> | null;
  cumple_meta: boolean | null;
  monto_ganado: number | null;
}
