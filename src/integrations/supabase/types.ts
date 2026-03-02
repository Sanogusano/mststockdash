export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      inventory_snapshot: {
        Row: {
          available: number | null
          created_at: string | null
          id: string
          location_id: string | null
          sku: string | null
          snapshot_date: string | null
          variant_id: string | null
        }
        Insert: {
          available?: number | null
          created_at?: string | null
          id?: string
          location_id?: string | null
          sku?: string | null
          snapshot_date?: string | null
          variant_id?: string | null
        }
        Update: {
          available?: number | null
          created_at?: string | null
          id?: string
          location_id?: string | null
          sku?: string | null
          snapshot_date?: string | null
          variant_id?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string | null
          dimension_m2: number | null
          is_active: boolean | null
          location_id: string
          name: string
          tipo_tienda: string | null
          zona: string | null
        }
        Insert: {
          created_at?: string | null
          dimension_m2?: number | null
          is_active?: boolean | null
          location_id: string
          name: string
          tipo_tienda?: string | null
          zona?: string | null
        }
        Update: {
          created_at?: string | null
          dimension_m2?: number | null
          is_active?: boolean | null
          location_id?: string
          name?: string
          tipo_tienda?: string | null
          zona?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          category: string | null
          compare_at_price: number | null
          id: string
          is_markdown: boolean | null
          location_id: string | null
          manual_discount_amount: number | null
          price: number
          quantity: number
          shopify_order_id: string | null
          sku: string | null
          variant_id: string | null
        }
        Insert: {
          category?: string | null
          compare_at_price?: number | null
          id?: string
          is_markdown?: boolean | null
          location_id?: string | null
          manual_discount_amount?: number | null
          price: number
          quantity: number
          shopify_order_id?: string | null
          sku?: string | null
          variant_id?: string | null
        }
        Update: {
          category?: string | null
          compare_at_price?: number | null
          id?: string
          is_markdown?: boolean | null
          location_id?: string | null
          manual_discount_amount?: number | null
          price?: number
          quantity?: number
          shopify_order_id?: string | null
          sku?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_shopify_order_id_fkey"
            columns: ["shopify_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["shopify_order_id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          location_id: string | null
          order_number: string
          shopify_order_id: string
          source_name: string | null
          total_price: number
        }
        Insert: {
          created_at: string
          location_id?: string | null
          order_number: string
          shopify_order_id: string
          source_name?: string | null
          total_price: number
        }
        Update: {
          created_at?: string
          location_id?: string | null
          order_number?: string
          shopify_order_id?: string
          source_name?: string | null
          total_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_order_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
        ]
      }
      product_catalog: {
        Row: {
          category: string | null
          collection_season: string | null
          color: string | null
          compare_at_price: number | null
          fecha_cargue_inventario: string | null
          fecha_creacion: string | null
          fecha_publicacion: string | null
          image_url: string | null
          price: number | null
          product_id: string | null
          sku: string
          target_gender: string | null
          title: string | null
          updated_at: string | null
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          category?: string | null
          collection_season?: string | null
          color?: string | null
          compare_at_price?: number | null
          fecha_cargue_inventario?: string | null
          fecha_creacion?: string | null
          fecha_publicacion?: string | null
          image_url?: string | null
          price?: number | null
          product_id?: string | null
          sku: string
          target_gender?: string | null
          title?: string | null
          updated_at?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          category?: string | null
          collection_season?: string | null
          color?: string | null
          compare_at_price?: number | null
          fecha_cargue_inventario?: string | null
          fecha_creacion?: string | null
          fecha_publicacion?: string | null
          image_url?: string | null
          price?: number | null
          product_id?: string | null
          sku?: string
          target_gender?: string | null
          title?: string | null
          updated_at?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: []
      }
      sales_fact: {
        Row: {
          created_at: string | null
          gross_sales: number | null
          id: string
          location_id: string | null
          order_date: string | null
          order_id: string | null
          quantity: number | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          gross_sales?: number | null
          id?: string
          location_id?: string | null
          order_date?: string | null
          order_id?: string | null
          quantity?: number | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          gross_sales?: number | null
          id?: string
          location_id?: string | null
          order_date?: string | null
          order_id?: string | null
          quantity?: number | null
          variant_id?: string | null
        }
        Relationships: []
      }
      shopify_orders: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          shopify_id: string | null
          total_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          shopify_id?: string | null
          total_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          shopify_id?: string | null
          total_price?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      allocation_suggestions: {
        Row: {
          sku: string | null
          source_coverage_days: number | null
          source_location: string | null
          source_stock: number | null
          suggested_transfer_qty: number | null
          target_coverage_days: number | null
          target_daily_rate: number | null
          target_location: string | null
          variant_id: string | null
        }
        Relationships: []
      }
      sales_rolling: {
        Row: {
          daily_rate: number | null
          location_id: string | null
          qty_30d: number | null
          variant_id: string | null
        }
        Relationships: []
      }
      sales_rolling_30d: {
        Row: {
          daily_rate: number | null
          location_id: string | null
          revenue_30d: number | null
          sku: string | null
          total_sold_30d: number | null
          variant_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      reporte_comportamiento_producto: {
        Args: {
          dias_atras: number
          p_location_id?: string
          p_sku_filter?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          estado_salud: string
          foto: string
          producto: string
          sell_through_pct: number
          sku: string
          stock_digital: number
          stock_tiendas: number
          und_full_price: number
          und_promo: number
          und_rebajas: number
          und_vendidas: number
          wos: number
        }[]
      }
      reporte_desempeño_comercial: {
        Args: { dias_atras: number }
        Returns: {
          foto: string
          pct_contribucion: number
          perfil_ejecutivo: string
          precio_prom_venta: number
          producto: string
          sku: string
          unidades_vendidas: number
        }[]
      }
      reporte_desempeño_por_canal: {
        Args: { dias_atras: number }
        Returns: {
          canal: string
          total_pedidos: number
          ventas_totales: number
        }[]
      }
      reporte_desempeno_por_linea: {
        Args: { dias_atras: number; p_canal?: string; p_categoria?: string }
        Returns: {
          categoria: string
          estado_salud: string
          pct_participacion: number
          sell_through_pct: number
          stock_digital: number
          stock_tiendas: number
          und_digital: number
          und_outlets: number
          und_tiendas: number
          und_total: number
          wos: number
        }[]
      }
      reporte_detalle_producto_tiendas: {
        Args: { dias_atras: number; p_producto: string }
        Returns: {
          estado_salud: string
          ingresos: number
          pct_descuento: number
          pct_full_price: number
          sell_through_pct: number
          stock_actual: number
          tienda: string
          und_vendidas: number
          wos: number
        }[]
      }
      reporte_detalle_skus_producto: {
        Args: {
          canal_filtro?: string
          dias_atras: number
          location_filtro?: string
          p_product_id: string
        }
        Returns: {
          clasificacion: string
          precio_prom_venta: number
          sell_through_pct: number
          sku: string
          stock_disponible: number
          unidades_vendidas: number
          wos: number
        }[]
      }
      reporte_ejecutivo_kpis: {
        Args: {
          canal_filtro?: string
          dias_atras: number
          location_filtro?: string
        }
        Returns: {
          ticket_promedio: number
          unidades_totales: number
          ventas_totales: number
        }[]
      }
      reporte_ejecutivo_productos: {
        Args: {
          canal_filtro?: string
          dias_atras: number
          limite?: number
          location_filtro?: string
          orden?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          foto: string
          precio_prom_venta: number
          producto: string
          sell_through_pct: number
          sku: string
          stock_disponible: number
          unidades_vendidas: number
          wos: number
        }[]
      }
      reporte_kpis_comerciales: {
        Args: { dias_atras: number; p_canal?: string; p_location_id?: string }
        Returns: {
          ingresos_netos: number
          pct_pedidos_con_descuento: number
          pct_pedidos_full_price: number
          pct_pedidos_rebajas: number
          ticket_promedio: number
          total_pedidos: number
          unidades_vendidas: number
          upt: number
        }[]
      }
      reporte_kpis_periodo_anterior: {
        Args: { dias_atras: number; p_canal?: string; p_location_id?: string }
        Returns: {
          ingresos_netos: number
          pct_pedidos_con_descuento: number
          pct_pedidos_full_price: number
          pct_pedidos_rebajas: number
          ticket_promedio: number
          total_pedidos: number
          unidades_vendidas: number
          upt: number
        }[]
      }
      reporte_metricas_tienda_individual: {
        Args: { dias_atras: number; p_location_id: string }
        Returns: {
          mejor_dia_semana: string
          pedidos_promedio_diario_actual: number
          pedidos_promedio_diario_anterior: number
          peor_dia_semana: string
          unidades_promedio_diario_actual: number
          unidades_promedio_diario_anterior: number
          venta_mejor_dia: number
          venta_peor_dia: number
          venta_promedio_diaria_actual: number
          venta_promedio_diaria_anterior: number
          venta_promedio_finde: number
          venta_promedio_semana: number
        }[]
      }
      reporte_pareto_categorias: {
        Args: { dias_atras: number; p_canal?: string; p_location_id?: string }
        Returns: {
          categoria: string
          ingresos: number
          pct_participacion: number
          unidades: number
        }[]
      }
      reporte_pct_ventas_por_tipo: {
        Args: { dias_atras: number; p_canal?: string; p_location_id?: string }
        Returns: {
          ingresos_desc_promo: number
          ingresos_full_price: number
          ingresos_rebajas: number
          ingresos_total: number
          pct_desc_promo: number
          pct_full_price: number
          pct_rebajas: number
        }[]
      }
      reporte_pedidos_por_tipo_venta: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_location_id?: string
          p_tipo?: string
        }
        Returns: {
          cantidad: number
          categoria: string
          compare_at_price: number
          descuento_otorgado: number
          fecha: string
          numero_pedido: string
          precio: number
          producto: string
          sku: string
          sucursal: string
          tipo_venta: string
        }[]
      }
      reporte_productos_trending: {
        Args: never
        Returns: {
          alerta_tendencia: string
          crecimiento_pct: number
          foto: string
          producto: string
          sku: string
          ventas_periodo_anterior: number
          ventas_semana_actual: number
        }[]
      }
      reporte_ranking_tiendas: {
        Args: { dias_atras: number; p_canal?: string }
        Returns: {
          inventario_valorado: number
          pct_venta_full_price: number
          ticket_promedio: number
          tienda: string
          unidades_vendidas: number
          upt: number
          ventas_totales: number
        }[]
      }
      reporte_reorden_insumos: {
        Args: never
        Returns: {
          consumo_diario_total: number
          dias_autonomia: number
          estado_gestion: string
          foto: string
          insumo: string
          sku: string
          stock_cedi: number
        }[]
      }
      reporte_salud_inventario: {
        Args: { dias_atras: number }
        Returns: {
          estado_salud: string
          inventario_total: number
          semanas_inventario: number
          tienda: string
          tipo: string
          venta_promedio_semanal: number
        }[]
      }
      reporte_sugerencias_traslado: {
        Args: { dias_atras: number }
        Returns: {
          accion: string
          foto: string
          producto: string
          ritmo_venta_destino: number
          sku: string
          stock_origen: number
          tienda_destino: string
          tienda_origen: string
          uds_sugeridas: number
        }[]
      }
      reporte_tipos_venta: {
        Args: { dias_atras: number; p_canal?: string; p_location_id?: string }
        Returns: {
          pct_unidades: number
          tipo_venta: string
          unidades: number
        }[]
      }
      reporte_top_bottom_digital: {
        Args: { dias_atras: number }
        Returns: {
          producto: string
          unidades: number
          ventas_totales: number
        }[]
      }
      reporte_top_bottom_tiendas: {
        Args: { dias_atras: number }
        Returns: {
          tienda: string
          unidades: number
          ventas_totales: number
        }[]
      }
      reporte_top_productos_global: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_categoria?: string
          p_limite?: number
          p_orden?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          foto: string
          pct_descuento: number
          pct_full_price: number
          pct_rebajas: number
          producto: string
          sku: string
          und_digital: number
          und_outlets: number
          und_tiendas: number
          und_total: number
        }[]
      }
      reporte_wos_categoria_global: {
        Args: { dias_atras: number; p_location_ids?: string[] }
        Returns: {
          categoria: string
          estado_salud: string
          inventario_total: number
          location_id: string
          pct_full_price: number
          pct_promo: number
          pct_rebajado: number
          semanas_inventario: number
          tienda: string
          venta_promedio_semanal: number
        }[]
      }
      reporte_wos_categoria_tienda: {
        Args: { dias_atras: number; p_location_id: string }
        Returns: {
          categoria: string
          estado_salud: string
          inventario_total: number
          semanas_inventario: number
          venta_promedio_semanal: number
        }[]
      }
      upsert_product_catalog_safe: {
        Args: { products_json: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
