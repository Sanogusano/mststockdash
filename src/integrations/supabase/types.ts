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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      addi_liquidaciones: {
        Row: {
          created_at: string | null
          descuento_addi: number | null
          descuento_comercio: number | null
          email_vendedor: string | null
          estado_pago: string | null
          fecha_cancelacion: string | null
          fecha_pago: string | null
          fecha_venta: string | null
          id: string
          id_pedido: string | null
          id_reporte: string | null
          iva: number | null
          nombre_aliado: string | null
          nombre_tienda: string | null
          rete_fuente: number | null
          rete_ica: number | null
          rete_iva: number | null
          shopify_order_id: string | null
          tarifa_addi_shop: number | null
          tarifa_intermediacion: number | null
          tarifa_marketplace: number | null
          tipo_de_venta: string | null
          total_a_pagar: number | null
          total_cancelaciones: number | null
          total_impuestos: number | null
          total_tarifas: number | null
          total_ventas: number | null
          valor_neto: number | null
        }
        Insert: {
          created_at?: string | null
          descuento_addi?: number | null
          descuento_comercio?: number | null
          email_vendedor?: string | null
          estado_pago?: string | null
          fecha_cancelacion?: string | null
          fecha_pago?: string | null
          fecha_venta?: string | null
          id?: string
          id_pedido?: string | null
          id_reporte?: string | null
          iva?: number | null
          nombre_aliado?: string | null
          nombre_tienda?: string | null
          rete_fuente?: number | null
          rete_ica?: number | null
          rete_iva?: number | null
          shopify_order_id?: string | null
          tarifa_addi_shop?: number | null
          tarifa_intermediacion?: number | null
          tarifa_marketplace?: number | null
          tipo_de_venta?: string | null
          total_a_pagar?: number | null
          total_cancelaciones?: number | null
          total_impuestos?: number | null
          total_tarifas?: number | null
          total_ventas?: number | null
          valor_neto?: number | null
        }
        Update: {
          created_at?: string | null
          descuento_addi?: number | null
          descuento_comercio?: number | null
          email_vendedor?: string | null
          estado_pago?: string | null
          fecha_cancelacion?: string | null
          fecha_pago?: string | null
          fecha_venta?: string | null
          id?: string
          id_pedido?: string | null
          id_reporte?: string | null
          iva?: number | null
          nombre_aliado?: string | null
          nombre_tienda?: string | null
          rete_fuente?: number | null
          rete_ica?: number | null
          rete_iva?: number | null
          shopify_order_id?: string | null
          tarifa_addi_shop?: number | null
          tarifa_intermediacion?: number | null
          tarifa_marketplace?: number | null
          tipo_de_venta?: string | null
          total_a_pagar?: number | null
          total_cancelaciones?: number | null
          total_impuestos?: number | null
          total_tarifas?: number | null
          total_ventas?: number | null
          valor_neto?: number | null
        }
        Relationships: []
      }
      addi_transactions: {
        Row: {
          canal: string | null
          cc: string | null
          conciliado: boolean | null
          created_at: string | null
          email_vendedor: string | null
          estado: string | null
          fecha_creacion: string | null
          id: string
          id_credito: string | null
          id_orden: string | null
          id_transaccion: string | null
          monto: number | null
          nombre_cliente: string | null
          nombre_tienda: string | null
          shopify_order_id: string | null
          sub_estado: string | null
          tipo_de_venta: string | null
        }
        Insert: {
          canal?: string | null
          cc?: string | null
          conciliado?: boolean | null
          created_at?: string | null
          email_vendedor?: string | null
          estado?: string | null
          fecha_creacion?: string | null
          id?: string
          id_credito?: string | null
          id_orden?: string | null
          id_transaccion?: string | null
          monto?: number | null
          nombre_cliente?: string | null
          nombre_tienda?: string | null
          shopify_order_id?: string | null
          sub_estado?: string | null
          tipo_de_venta?: string | null
        }
        Update: {
          canal?: string | null
          cc?: string | null
          conciliado?: boolean | null
          created_at?: string | null
          email_vendedor?: string | null
          estado?: string | null
          fecha_creacion?: string | null
          id?: string
          id_credito?: string | null
          id_orden?: string | null
          id_transaccion?: string | null
          monto?: number | null
          nombre_cliente?: string | null
          nombre_tienda?: string | null
          shopify_order_id?: string | null
          sub_estado?: string | null
          tipo_de_venta?: string | null
        }
        Relationships: []
      }
      addi_upload_history: {
        Row: {
          cruzados: number
          detalle: Json | null
          errores: number
          id: string
          nombre_archivo: string
          sin_cruce: number
          tipo: string
          total_registros: number
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_email: string | null
        }
        Insert: {
          cruzados?: number
          detalle?: Json | null
          errores?: number
          id?: string
          nombre_archivo: string
          sin_cruce?: number
          tipo: string
          total_registros?: number
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Update: {
          cruzados?: number
          detalle?: Json | null
          errores?: number
          id?: string
          nombre_archivo?: string
          sin_cruce?: number
          tipo?: string
          total_registros?: number
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Relationships: []
      }
      allocation_reglas_origen: {
        Row: {
          location_id: string
          max_stock_cedible: number | null
          nota: string | null
          updated_at: string | null
        }
        Insert: {
          location_id: string
          max_stock_cedible?: number | null
          nota?: string | null
          updated_at?: string | null
        }
        Update: {
          location_id?: string
          max_stock_cedible?: number | null
          nota?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "allocation_reglas_origen_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_reglas_origen_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_reglas_origen_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      allocation_runs: {
        Row: {
          destino_location_id: string
          destino_netsuite_id: number | null
          empleado: string
          fecha_traslado: string
          generated_at: string
          generated_by: string | null
          generated_by_user_id: string | null
          id: string
          id_externo: string
          lineas_json: Json
          origen_location_id: string
          origen_netsuite_id: number | null
          snapshot_id: string | null
          status: string
          subsidiaria: number
          total_lineas: number
          total_unidades: number
        }
        Insert: {
          destino_location_id: string
          destino_netsuite_id?: number | null
          empleado: string
          fecha_traslado: string
          generated_at?: string
          generated_by?: string | null
          generated_by_user_id?: string | null
          id?: string
          id_externo: string
          lineas_json: Json
          origen_location_id: string
          origen_netsuite_id?: number | null
          snapshot_id?: string | null
          status?: string
          subsidiaria?: number
          total_lineas: number
          total_unidades: number
        }
        Update: {
          destino_location_id?: string
          destino_netsuite_id?: number | null
          empleado?: string
          fecha_traslado?: string
          generated_at?: string
          generated_by?: string | null
          generated_by_user_id?: string | null
          id?: string
          id_externo?: string
          lineas_json?: Json
          origen_location_id?: string
          origen_netsuite_id?: number | null
          snapshot_id?: string | null
          status?: string
          subsidiaria?: number
          total_lineas?: number
          total_unidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocation_runs_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "allocation_runs_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "allocation_runs_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "allocation_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "netsuite_inventory_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_runs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "v_inv_ejec_base"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      bkp_the_ten_20260730: {
        Row: {
          collection_season: string | null
          product_id: string | null
          sku: string | null
          variant_id: string | null
        }
        Insert: {
          collection_season?: string | null
          product_id?: string | null
          sku?: string | null
          variant_id?: string | null
        }
        Update: {
          collection_season?: string | null
          product_id?: string | null
          sku?: string | null
          variant_id?: string | null
        }
        Relationships: []
      }
      budget_expenses: {
        Row: {
          category: string
          created_at: string | null
          estimated_amount: number
          id: string
          location_id: string | null
          month_year: string
        }
        Insert: {
          category: string
          created_at?: string | null
          estimated_amount: number
          id?: string
          location_id?: string | null
          month_year: string
        }
        Update: {
          category?: string
          created_at?: string | null
          estimated_amount?: number
          id?: string
          location_id?: string | null
          month_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "budget_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "budget_expenses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      budget_goals: {
        Row: {
          created_at: string | null
          goal_amount: number
          id: string
          location_id: string | null
          month_year: string
        }
        Insert: {
          created_at?: string | null
          goal_amount: number
          id?: string
          location_id?: string | null
          month_year: string
        }
        Update: {
          created_at?: string | null
          goal_amount?: number
          id?: string
          location_id?: string | null
          month_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_goals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "budget_goals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "budget_goals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      categoria_padre_map: {
        Row: {
          categoria_padre: string
          category: string
          nota: string | null
        }
        Insert: {
          categoria_padre: string
          category: string
          nota?: string | null
        }
        Update: {
          categoria_padre?: string
          category?: string
          nota?: string | null
        }
        Relationships: []
      }
      category_mapping: {
        Row: {
          category_clean: string
          category_raw: string
        }
        Insert: {
          category_clean: string
          category_raw: string
        }
        Update: {
          category_clean?: string
          category_raw?: string
        }
        Relationships: []
      }
      collection_calendar: {
        Row: {
          anio: number | null
          coleccion: string
          confiable: boolean | null
          orden: number | null
          tipo: string | null
        }
        Insert: {
          anio?: number | null
          coleccion: string
          confiable?: boolean | null
          orden?: number | null
          tipo?: string | null
        }
        Update: {
          anio?: number | null
          coleccion?: string
          confiable?: boolean | null
          orden?: number | null
          tipo?: string | null
        }
        Relationships: []
      }
      color_mapping: {
        Row: {
          color_hex: string
          familia_color: string
        }
        Insert: {
          color_hex: string
          familia_color: string
        }
        Update: {
          color_hex?: string
          familia_color?: string
        }
        Relationships: []
      }
      commission_batches: {
        Row: {
          anio: number
          aprobado_at: string | null
          aprobado_por: string | null
          creado_por: string | null
          created_at: string | null
          estado: string | null
          id: string
          mes: number
          reglas: Json
          rol: string
        }
        Insert: {
          anio: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          mes: number
          reglas: Json
          rol: string
        }
        Update: {
          anio?: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          creado_por?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          mes?: number
          reglas?: Json
          rol?: string
        }
        Relationships: []
      }
      commission_scale_templates: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean | null
          nombre: string
          reglas: Json
          rol: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          nombre: string
          reglas: Json
          rol: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          nombre?: string
          reglas?: Json
          rol?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      commission_settlements: {
        Row: {
          anio: number
          aprobado_at: string | null
          aprobado_por: string | null
          batch_id: string | null
          created_at: string | null
          devoluciones: number | null
          estado: string | null
          id: string
          mes: number
          monto_comision: number | null
          pct_comision_aplicado: number | null
          pct_cumplimiento: number | null
          presupuesto: number | null
          staff_id: string
          updated_at: string | null
          venta_facturada: number | null
          venta_neta_comisionable: number | null
        }
        Insert: {
          anio: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          batch_id?: string | null
          created_at?: string | null
          devoluciones?: number | null
          estado?: string | null
          id?: string
          mes: number
          monto_comision?: number | null
          pct_comision_aplicado?: number | null
          pct_cumplimiento?: number | null
          presupuesto?: number | null
          staff_id: string
          updated_at?: string | null
          venta_facturada?: number | null
          venta_neta_comisionable?: number | null
        }
        Update: {
          anio?: number
          aprobado_at?: string | null
          aprobado_por?: string | null
          batch_id?: string | null
          created_at?: string | null
          devoluciones?: number | null
          estado?: string | null
          id?: string
          mes?: number
          monto_comision?: number | null
          pct_comision_aplicado?: number | null
          pct_cumplimiento?: number | null
          presupuesto?: number | null
          staff_id?: string
          updated_at?: string | null
          venta_facturada?: number | null
          venta_neta_comisionable?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "commission_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      conciliacion_netsuite_log: {
        Row: {
          aplicado: boolean
          ejecutado_en: string
          id: number
          location_id: string
          ns_snapshot_id: string | null
          qty_netsuite: number | null
          qty_shopify_antes: number | null
          sku: string | null
          snapshot_date: string
          tipo: string
          variant_id: string
        }
        Insert: {
          aplicado: boolean
          ejecutado_en?: string
          id?: never
          location_id: string
          ns_snapshot_id?: string | null
          qty_netsuite?: number | null
          qty_shopify_antes?: number | null
          sku?: string | null
          snapshot_date: string
          tipo: string
          variant_id: string
        }
        Update: {
          aplicado?: boolean
          ejecutado_en?: string
          id?: never
          location_id?: string
          ns_snapshot_id?: string | null
          qty_netsuite?: number | null
          qty_shopify_antes?: number | null
          sku?: string | null
          snapshot_date?: string
          tipo?: string
          variant_id?: string
        }
        Relationships: []
      }
      estrategias_aplicadas: {
        Row: {
          anio: number
          aplicada_at: string
          aplicada_por: string | null
          cerrada_at: string | null
          codigo_estrategia: string
          entidad: string
          estado: string
          id: string
          mes: number
          nota: string | null
          pct_cumpl_al_aplicar: number | null
          resultado: string | null
          ritmo_dia_al_aplicar: number | null
          ticket_al_aplicar: number | null
          upt_al_aplicar: number | null
          venta_al_aplicar: number | null
        }
        Insert: {
          anio: number
          aplicada_at?: string
          aplicada_por?: string | null
          cerrada_at?: string | null
          codigo_estrategia: string
          entidad: string
          estado?: string
          id?: string
          mes: number
          nota?: string | null
          pct_cumpl_al_aplicar?: number | null
          resultado?: string | null
          ritmo_dia_al_aplicar?: number | null
          ticket_al_aplicar?: number | null
          upt_al_aplicar?: number | null
          venta_al_aplicar?: number | null
        }
        Update: {
          anio?: number
          aplicada_at?: string
          aplicada_por?: string | null
          cerrada_at?: string | null
          codigo_estrategia?: string
          entidad?: string
          estado?: string
          id?: string
          mes?: number
          nota?: string | null
          pct_cumpl_al_aplicar?: number | null
          resultado?: string | null
          ritmo_dia_al_aplicar?: number | null
          ticket_al_aplicar?: number | null
          upt_al_aplicar?: number | null
          venta_al_aplicar?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estrategias_aplicadas_codigo_estrategia_fkey"
            columns: ["codigo_estrategia"]
            isOneToOne: false
            referencedRelation: "estrategias_comerciales"
            referencedColumns: ["codigo"]
          },
        ]
      }
      estrategias_comerciales: {
        Row: {
          acciones: string[]
          activa: boolean | null
          codigo: string
          descripcion: string
          esfuerzo: string
          horizonte_dias: number
          nombre: string
          orden: number
          palanca: string
          responsable: string
          riesgo_margen: number
        }
        Insert: {
          acciones: string[]
          activa?: boolean | null
          codigo: string
          descripcion: string
          esfuerzo: string
          horizonte_dias: number
          nombre: string
          orden: number
          palanca: string
          responsable: string
          riesgo_margen: number
        }
        Update: {
          acciones?: string[]
          activa?: boolean | null
          codigo?: string
          descripcion?: string
          esfuerzo?: string
          horizonte_dias?: number
          nombre?: string
          orden?: number
          palanca?: string
          responsable?: string
          riesgo_margen?: number
        }
        Relationships: []
      }
      fuente_de_verdad: {
        Row: {
          campo: string
          columna: string
          fuente: string
          motivo: string
          tabla: string
        }
        Insert: {
          campo: string
          columna: string
          fuente: string
          motivo: string
          tabla: string
        }
        Update: {
          campo?: string
          columna?: string
          fuente?: string
          motivo?: string
          tabla?: string
        }
        Relationships: []
      }
      incentivo_liquidaciones: {
        Row: {
          cumple_meta: boolean | null
          id: string
          incentivo_id: string
          location_id: string | null
          monto_ganado: number | null
          progreso_actual: Json | null
          ultima_actualizacion: string | null
          vendedor_id: string | null
        }
        Insert: {
          cumple_meta?: boolean | null
          id?: string
          incentivo_id: string
          location_id?: string | null
          monto_ganado?: number | null
          progreso_actual?: Json | null
          ultima_actualizacion?: string | null
          vendedor_id?: string | null
        }
        Update: {
          cumple_meta?: boolean | null
          id?: string
          incentivo_id?: string
          location_id?: string | null
          monto_ganado?: number | null
          progreso_actual?: Json | null
          ultima_actualizacion?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incentivo_liquidaciones_incentivo_id_fkey"
            columns: ["incentivo_id"]
            isOneToOne: false
            referencedRelation: "incentivos"
            referencedColumns: ["id"]
          },
        ]
      }
      incentivo_recompensas: {
        Row: {
          created_at: string | null
          id: string
          incentivo_id: string
          parametros_pago: Json
          tipo_pago: string
          tope_maximo: number | null
          tope_minimo: number | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          incentivo_id: string
          parametros_pago?: Json
          tipo_pago: string
          tope_maximo?: number | null
          tope_minimo?: number | null
          valor: number
        }
        Update: {
          created_at?: string | null
          id?: string
          incentivo_id?: string
          parametros_pago?: Json
          tipo_pago?: string
          tope_maximo?: number | null
          tope_minimo?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "incentivo_recompensas_incentivo_id_fkey"
            columns: ["incentivo_id"]
            isOneToOne: false
            referencedRelation: "incentivos"
            referencedColumns: ["id"]
          },
        ]
      }
      incentivo_reglas: {
        Row: {
          created_at: string | null
          id: string
          incentivo_id: string
          parametros: Json | null
          tipo_regla: string
          valor_objetivo: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          incentivo_id: string
          parametros?: Json | null
          tipo_regla: string
          valor_objetivo: number
        }
        Update: {
          created_at?: string | null
          id?: string
          incentivo_id?: string
          parametros?: Json | null
          tipo_regla?: string
          valor_objetivo?: number
        }
        Relationships: [
          {
            foreignKeyName: "incentivo_reglas_incentivo_id_fkey"
            columns: ["incentivo_id"]
            isOneToOne: false
            referencedRelation: "incentivos"
            referencedColumns: ["id"]
          },
        ]
      }
      incentivos: {
        Row: {
          alcance: string
          created_at: string | null
          estado: string | null
          fecha_fin: string
          fecha_inicio: string
          id: string
          nombre: string
        }
        Insert: {
          alcance: string
          created_at?: string | null
          estado?: string | null
          fecha_fin: string
          fecha_inicio: string
          id?: string
          nombre: string
        }
        Update: {
          alcance?: string
          created_at?: string | null
          estado?: string | null
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
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
      inventory_sync_state: {
        Row: {
          current_page: number | null
          cursor: string | null
          id: number
          last_completed_at: string | null
          last_started_at: string | null
          status: string | null
          total_inserted: number | null
        }
        Insert: {
          current_page?: number | null
          cursor?: string | null
          id?: number
          last_completed_at?: string | null
          last_started_at?: string | null
          status?: string | null
          total_inserted?: number | null
        }
        Update: {
          current_page?: number | null
          cursor?: string | null
          id?: number
          last_completed_at?: string | null
          last_started_at?: string | null
          status?: string | null
          total_inserted?: number | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          ciudad: string | null
          ciudad_principal: boolean | null
          created_at: string | null
          dimension_m2: number | null
          es_punto_venta: boolean | null
          is_active: boolean | null
          location_id: string
          name: string
          tipo_tienda: string | null
          zona: string | null
        }
        Insert: {
          ciudad?: string | null
          ciudad_principal?: boolean | null
          created_at?: string | null
          dimension_m2?: number | null
          es_punto_venta?: boolean | null
          is_active?: boolean | null
          location_id: string
          name: string
          tipo_tienda?: string | null
          zona?: string | null
        }
        Update: {
          ciudad?: string | null
          ciudad_principal?: boolean | null
          created_at?: string | null
          dimension_m2?: number | null
          es_punto_venta?: boolean | null
          is_active?: boolean | null
          location_id?: string
          name?: string
          tipo_tienda?: string | null
          zona?: string | null
        }
        Relationships: []
      }
      netsuite_facturas: {
        Row: {
          base_gravable: number | null
          canal: string | null
          cliente_documento: string | null
          cliente_nit: string | null
          cliente_nombre: string | null
          creado_por: string | null
          created_at: string | null
          cufe: string | null
          discrepancia: number | null
          estado_factura: string | null
          fecha_factura: string | null
          fecha_vencimiento: string | null
          id: string
          iva_facturado: number | null
          location_id: string | null
          netsuite_transaction_id: string | null
          numero_factura: string | null
          numero_pos: string | null
          origen: string
          shopify_order_id: string | null
          shopify_order_number: string | null
          tipo_discrepancia: string | null
          ubicacion_netsuite: string | null
          updated_at: string | null
          valor_facturado: number | null
          valor_shopify: number | null
          vendedor: string | null
        }
        Insert: {
          base_gravable?: number | null
          canal?: string | null
          cliente_documento?: string | null
          cliente_nit?: string | null
          cliente_nombre?: string | null
          creado_por?: string | null
          created_at?: string | null
          cufe?: string | null
          discrepancia?: number | null
          estado_factura?: string | null
          fecha_factura?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva_facturado?: number | null
          location_id?: string | null
          netsuite_transaction_id?: string | null
          numero_factura?: string | null
          numero_pos?: string | null
          origen?: string
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          tipo_discrepancia?: string | null
          ubicacion_netsuite?: string | null
          updated_at?: string | null
          valor_facturado?: number | null
          valor_shopify?: number | null
          vendedor?: string | null
        }
        Update: {
          base_gravable?: number | null
          canal?: string | null
          cliente_documento?: string | null
          cliente_nit?: string | null
          cliente_nombre?: string | null
          creado_por?: string | null
          created_at?: string | null
          cufe?: string | null
          discrepancia?: number | null
          estado_factura?: string | null
          fecha_factura?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva_facturado?: number | null
          location_id?: string | null
          netsuite_transaction_id?: string | null
          numero_factura?: string | null
          numero_pos?: string | null
          origen?: string
          shopify_order_id?: string | null
          shopify_order_number?: string | null
          tipo_discrepancia?: string | null
          ubicacion_netsuite?: string | null
          updated_at?: string | null
          valor_facturado?: number | null
          valor_shopify?: number | null
          vendedor?: string | null
        }
        Relationships: []
      }
      netsuite_inventory_lines: {
        Row: {
          coleccion: string | null
          coleccion_sku: string | null
          color: string | null
          costo: number | null
          created_at: string
          genero: string | null
          id: string
          internal_location_id: string | null
          linea: string | null
          netsuite_location_name: string
          nombre: string | null
          quantity: number
          sku: string
          snapshot_id: string
          sub_tipo: string | null
          talla: string | null
        }
        Insert: {
          coleccion?: string | null
          coleccion_sku?: string | null
          color?: string | null
          costo?: number | null
          created_at?: string
          genero?: string | null
          id?: string
          internal_location_id?: string | null
          linea?: string | null
          netsuite_location_name: string
          nombre?: string | null
          quantity?: number
          sku: string
          snapshot_id: string
          sub_tipo?: string | null
          talla?: string | null
        }
        Update: {
          coleccion?: string | null
          coleccion_sku?: string | null
          color?: string | null
          costo?: number | null
          created_at?: string
          genero?: string | null
          id?: string
          internal_location_id?: string | null
          linea?: string | null
          netsuite_location_name?: string
          nombre?: string | null
          quantity?: number
          sku?: string
          snapshot_id?: string
          sub_tipo?: string | null
          talla?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "netsuite_inventory_lines_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "netsuite_inventory_lines_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "netsuite_inventory_lines_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "netsuite_inventory_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "netsuite_inventory_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "netsuite_inventory_lines_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "v_inv_ejec_base"
            referencedColumns: ["snapshot_id"]
          },
        ]
      }
      netsuite_inventory_snapshots: {
        Row: {
          created_at: string
          error_message: string | null
          file_name: string
          id: string
          is_active: boolean
          snapshot_date: string
          status: string
          total_locations: number | null
          total_skus: number | null
          total_units: number | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          file_name: string
          id?: string
          is_active?: boolean
          snapshot_date?: string
          status?: string
          total_locations?: number | null
          total_skus?: number | null
          total_units?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          file_name?: string
          id?: string
          is_active?: boolean
          snapshot_date?: string
          status?: string
          total_locations?: number | null
          total_skus?: number | null
          total_units?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "netsuite_inventory_snapshots_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
        ]
      }
      netsuite_items: {
        Row: {
          coleccion: string | null
          coleccion_sku: string | null
          coleccion_temporada: string | null
          color: string | null
          composicion: string | null
          costo: number | null
          costo_promedio: number | null
          creado_en_ns: string | null
          es_inactivo: boolean | null
          fecha_ingreso: string | null
          genero: string | null
          item_id: string
          item_type: string | null
          linea: string | null
          modificado_en_ns: string | null
          nombre: string | null
          nombre_mostrar: string | null
          parent_id: string | null
          proveedor: string | null
          referencia: string | null
          sincronizado_en: string
          sku: string | null
          sku_raw: string | null
          sub_tipo: string | null
          talla: string | null
          talla_mx: string | null
          tipo: string | null
          ultimo_precio_compra: number | null
          upc: string | null
        }
        Insert: {
          coleccion?: string | null
          coleccion_sku?: string | null
          coleccion_temporada?: string | null
          color?: string | null
          composicion?: string | null
          costo?: number | null
          costo_promedio?: number | null
          creado_en_ns?: string | null
          es_inactivo?: boolean | null
          fecha_ingreso?: string | null
          genero?: string | null
          item_id: string
          item_type?: string | null
          linea?: string | null
          modificado_en_ns?: string | null
          nombre?: string | null
          nombre_mostrar?: string | null
          parent_id?: string | null
          proveedor?: string | null
          referencia?: string | null
          sincronizado_en?: string
          sku?: string | null
          sku_raw?: string | null
          sub_tipo?: string | null
          talla?: string | null
          talla_mx?: string | null
          tipo?: string | null
          ultimo_precio_compra?: number | null
          upc?: string | null
        }
        Update: {
          coleccion?: string | null
          coleccion_sku?: string | null
          coleccion_temporada?: string | null
          color?: string | null
          composicion?: string | null
          costo?: number | null
          costo_promedio?: number | null
          creado_en_ns?: string | null
          es_inactivo?: boolean | null
          fecha_ingreso?: string | null
          genero?: string | null
          item_id?: string
          item_type?: string | null
          linea?: string | null
          modificado_en_ns?: string | null
          nombre?: string | null
          nombre_mostrar?: string | null
          parent_id?: string | null
          proveedor?: string | null
          referencia?: string | null
          sincronizado_en?: string
          sku?: string | null
          sku_raw?: string | null
          sub_tipo?: string | null
          talla?: string | null
          talla_mx?: string | null
          tipo?: string | null
          ultimo_precio_compra?: number | null
          upc?: string | null
        }
        Relationships: []
      }
      netsuite_location_mapping: {
        Row: {
          created_at: string
          id: string
          internal_location_id: string | null
          netsuite_location_id: number | null
          netsuite_location_name: string
          notas: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_location_id?: string | null
          netsuite_location_id?: number | null
          netsuite_location_name: string
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_location_id?: string | null
          netsuite_location_id?: number | null
          netsuite_location_name?: string
          notas?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "netsuite_location_mapping_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "netsuite_location_mapping_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "netsuite_location_mapping_internal_location_id_fkey"
            columns: ["internal_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      netsuite_sku_mapping: {
        Row: {
          created_at: string
          id: string
          last_synced_at: string
          netsuite_internal_id: number
          sku: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_synced_at?: string
          netsuite_internal_id: number
          sku: string
        }
        Update: {
          created_at?: string
          id?: string
          last_synced_at?: string
          netsuite_internal_id?: number
          sku?: string
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
          refund_amount: number | null
          shopify_order_id: string | null
          sku: string | null
          variant_id: string | null
          variant_id_inferido: boolean
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
          refund_amount?: number | null
          shopify_order_id?: string | null
          sku?: string | null
          variant_id?: string | null
          variant_id_inferido?: boolean
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
          refund_amount?: number | null
          shopify_order_id?: string | null
          sku?: string | null
          variant_id?: string | null
          variant_id_inferido?: boolean
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
          checkout_id: string | null
          checkout_token: string | null
          created_at: string
          financial_status: string | null
          is_facturado: boolean | null
          location_id: string | null
          order_number: string
          payment_authorization: string | null
          payment_gateway: string | null
          payment_token: string | null
          shopify_order_id: string
          source_name: string | null
          total_discount: number | null
          total_price: number
          transaction_status: string | null
          user_id: string | null
        }
        Insert: {
          checkout_id?: string | null
          checkout_token?: string | null
          created_at: string
          financial_status?: string | null
          is_facturado?: boolean | null
          location_id?: string | null
          order_number: string
          payment_authorization?: string | null
          payment_gateway?: string | null
          payment_token?: string | null
          shopify_order_id: string
          source_name?: string | null
          total_discount?: number | null
          total_price: number
          transaction_status?: string | null
          user_id?: string | null
        }
        Update: {
          checkout_id?: string | null
          checkout_token?: string | null
          created_at?: string
          financial_status?: string | null
          is_facturado?: boolean | null
          location_id?: string | null
          order_number?: string
          payment_authorization?: string | null
          payment_gateway?: string | null
          payment_token?: string | null
          shopify_order_id?: string
          source_name?: string | null
          total_discount?: number | null
          total_price?: number
          transaction_status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_order_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "fk_order_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "fk_order_location"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      permission_catalog: {
        Row: {
          action_key: string
          action_name: string
          action_order: number
          description: string | null
          id: string
          module_group: string | null
          module_key: string
          module_name: string
          module_order: number
        }
        Insert: {
          action_key: string
          action_name: string
          action_order?: number
          description?: string | null
          id?: string
          module_group?: string | null
          module_key: string
          module_name: string
          module_order?: number
        }
        Update: {
          action_key?: string
          action_name?: string
          action_order?: number
          description?: string | null
          id?: string
          module_group?: string | null
          module_key?: string
          module_name?: string
          module_order?: number
        }
        Relationships: []
      }
      presupuestos_config: {
        Row: {
          anio: number
          created_at: string | null
          id: string
          mes: number
          monto: number
          nombre_identificador: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          anio: number
          created_at?: string | null
          id?: string
          mes: number
          monto?: number
          nombre_identificador: string
          tipo: string
          updated_at?: string | null
        }
        Update: {
          anio?: number
          created_at?: string | null
          id?: string
          mes?: number
          monto?: number
          nombre_identificador?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      proceso_ejecucion_log: {
        Row: {
          detalle: Json | null
          duracion_ms: number | null
          proceso: string
          ultima_ejecucion: string
        }
        Insert: {
          detalle?: Json | null
          duracion_ms?: number | null
          proceso: string
          ultima_ejecucion?: string
        }
        Update: {
          detalle?: Json | null
          duracion_ms?: number | null
          proceso?: string
          ultima_ejecucion?: string
        }
        Relationships: []
      }
      product_catalog: {
        Row: {
          categoria_padre: string | null
          category: string | null
          collection_season: string | null
          color: string | null
          compare_at_price: number | null
          fecha_cargue_inventario: string | null
          fecha_creacion: string | null
          fecha_publicacion: string | null
          genero_norm: string | null
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
          categoria_padre?: string | null
          category?: string | null
          collection_season?: string | null
          color?: string | null
          compare_at_price?: number | null
          fecha_cargue_inventario?: string | null
          fecha_creacion?: string | null
          fecha_publicacion?: string | null
          genero_norm?: string | null
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
          categoria_padre?: string | null
          category?: string | null
          collection_season?: string | null
          color?: string | null
          compare_at_price?: number | null
          fecha_cargue_inventario?: string | null
          fecha_creacion?: string | null
          fecha_publicacion?: string | null
          genero_norm?: string | null
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
      product_catalog_backup_20260723: {
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
          sku: string | null
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
          sku?: string | null
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
          sku?: string | null
          target_gender?: string | null
          title?: string | null
          updated_at?: string | null
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          analysis_eligible: boolean
          created_at: string
          height: number | null
          id: string
          image_role: string | null
          image_url: string
          is_featured: boolean
          is_variant_image: boolean
          media_status: string | null
          media_type: string | null
          position: number | null
          product_id: string
          shopify_image_id: string | null
          shopify_media_id: string | null
          source_updated_at: string | null
          synced_at: string
          updated_at: string
          variant_id: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          analysis_eligible?: boolean
          created_at?: string
          height?: number | null
          id?: string
          image_role?: string | null
          image_url: string
          is_featured?: boolean
          is_variant_image?: boolean
          media_status?: string | null
          media_type?: string | null
          position?: number | null
          product_id: string
          shopify_image_id?: string | null
          shopify_media_id?: string | null
          source_updated_at?: string | null
          synced_at?: string
          updated_at?: string
          variant_id?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          analysis_eligible?: boolean
          created_at?: string
          height?: number | null
          id?: string
          image_role?: string | null
          image_url?: string
          is_featured?: boolean
          is_variant_image?: boolean
          media_status?: string | null
          media_type?: string | null
          position?: number | null
          product_id?: string
          shopify_image_id?: string | null
          shopify_media_id?: string | null
          source_updated_at?: string | null
          synced_at?: string
          updated_at?: string
          variant_id?: string | null
          width?: number | null
        }
        Relationships: []
      }
      proyecciones_snapshot: {
        Row: {
          anio: number
          cierre_conservador: number | null
          cierre_optimista: number | null
          cierre_probable: number | null
          created_at: string
          dias_mes: number | null
          dias_transcurridos: number | null
          fecha_snapshot: string
          id: number
          mes: number
          nombre: string
          pct_cumplimiento_fecha: number | null
          pct_cumplimiento_general: number | null
          presupuesto_mes: number | null
          tipo: string | null
          venta_actual: number | null
          zona: string | null
        }
        Insert: {
          anio: number
          cierre_conservador?: number | null
          cierre_optimista?: number | null
          cierre_probable?: number | null
          created_at?: string
          dias_mes?: number | null
          dias_transcurridos?: number | null
          fecha_snapshot: string
          id?: never
          mes: number
          nombre: string
          pct_cumplimiento_fecha?: number | null
          pct_cumplimiento_general?: number | null
          presupuesto_mes?: number | null
          tipo?: string | null
          venta_actual?: number | null
          zona?: string | null
        }
        Update: {
          anio?: number
          cierre_conservador?: number | null
          cierre_optimista?: number | null
          cierre_probable?: number | null
          created_at?: string
          dias_mes?: number | null
          dias_transcurridos?: number | null
          fecha_snapshot?: string
          id?: never
          mes?: number
          nombre?: string
          pct_cumplimiento_fecha?: number | null
          pct_cumplimiento_general?: number | null
          presupuesto_mes?: number | null
          tipo?: string | null
          venta_actual?: number | null
          zona?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action_key: string
          granted: boolean
          id: string
          module_key: string
          role_id: string
        }
        Insert: {
          action_key: string
          granted?: boolean
          id?: string
          module_key: string
          role_id: string
        }
        Update: {
          action_key?: string
          granted?: boolean
          id?: string
          module_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_role: boolean
          key: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          key: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_role?: boolean
          key?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rpc_defs_backup_20260723: {
        Row: {
          definicion: string | null
          firma: string | null
          proname: unknown
          respaldado_en: string | null
        }
        Insert: {
          definicion?: string | null
          firma?: string | null
          proname?: unknown
          respaldado_en?: string | null
        }
        Update: {
          definicion?: string | null
          firma?: string | null
          proname?: unknown
          respaldado_en?: string | null
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
      staff_members: {
        Row: {
          canal: string | null
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          location_id: string | null
          nombre: string
          rol: string
          shopify_user_id: string
          tipo_contrato: string | null
          updated_at: string | null
          zona: string | null
        }
        Insert: {
          canal?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          nombre: string
          rol?: string
          shopify_user_id: string
          tipo_contrato?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Update: {
          canal?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          nombre?: string
          rol?: string
          shopify_user_id?: string
          tipo_contrato?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "staff_members_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      store_action_stamps: {
        Row: {
          active: boolean
          anio: number | null
          cerrado_at: string | null
          id: string
          location_name: string
          mes: number | null
          nota: string | null
          pct_al_marcar: number | null
          stamped_at: string
          venta_al_marcar: number | null
        }
        Insert: {
          active?: boolean
          anio?: number | null
          cerrado_at?: string | null
          id?: string
          location_name: string
          mes?: number | null
          nota?: string | null
          pct_al_marcar?: number | null
          stamped_at?: string
          venta_al_marcar?: number | null
        }
        Update: {
          active?: boolean
          anio?: number | null
          cerrado_at?: string | null
          id?: string
          location_name?: string
          mes?: number | null
          nota?: string | null
          pct_al_marcar?: number | null
          stamped_at?: string
          venta_al_marcar?: number | null
        }
        Relationships: []
      }
      store_allocation_params: {
        Row: {
          activa: boolean
          capacidad_maxima_unidades: number | null
          colchon_cedi_semanas: number
          created_at: string
          es_cedi: boolean
          es_outlet: boolean
          id: string
          location_id: string
          mod_default: number
          mod_por_categoria: Json | null
          puede_ser_destino: boolean
          puede_ser_origen: boolean
          tier: string
          updated_at: string
          wos_objetivo_por_categoria: Json | null
          wos_objetivo_semanas: number
        }
        Insert: {
          activa?: boolean
          capacidad_maxima_unidades?: number | null
          colchon_cedi_semanas?: number
          created_at?: string
          es_cedi?: boolean
          es_outlet?: boolean
          id?: string
          location_id: string
          mod_default?: number
          mod_por_categoria?: Json | null
          puede_ser_destino?: boolean
          puede_ser_origen?: boolean
          tier: string
          updated_at?: string
          wos_objetivo_por_categoria?: Json | null
          wos_objetivo_semanas?: number
        }
        Update: {
          activa?: boolean
          capacidad_maxima_unidades?: number | null
          colchon_cedi_semanas?: number
          created_at?: string
          es_cedi?: boolean
          es_outlet?: boolean
          id?: string
          location_id?: string
          mod_default?: number
          mod_por_categoria?: Json | null
          puede_ser_destino?: boolean
          puede_ser_origen?: boolean
          tier?: string
          updated_at?: string
          wos_objetivo_por_categoria?: Json | null
          wos_objetivo_semanas?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_allocation_params_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "store_allocation_params_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "store_allocation_params_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: true
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      store_traffic: {
        Row: {
          created_at: string
          entradas: number
          fecha: string
          fuente: string
          hora_inicio: string
          id: number
          location_id: string
          minutos: number
          salidas: number
        }
        Insert: {
          created_at?: string
          entradas?: number
          fecha: string
          fuente?: string
          hora_inicio: string
          id?: never
          location_id: string
          minutos?: number
          salidas?: number
        }
        Update: {
          created_at?: string
          entradas?: number
          fecha?: string
          fuente?: string
          hora_inicio?: string
          id?: never
          location_id?: string
          minutos?: number
          salidas?: number
        }
        Relationships: []
      }
      traffic_ingest_config: {
        Row: {
          created_at: string
          id: number
          token: string
        }
        Insert: {
          created_at?: string
          id?: number
          token?: string
        }
        Update: {
          created_at?: string
          id?: number
          token?: string
        }
        Relationships: []
      }
      transfer_cost_matrix: {
        Row: {
          costo_por_unidad_cop: number
          created_at: string
          destino_location_id: string
          id: string
          lead_time_dias: number
          origen_location_id: string
          prioridad: number
          updated_at: string
          zona_destino: string | null
          zona_origen: string | null
        }
        Insert: {
          costo_por_unidad_cop?: number
          created_at?: string
          destino_location_id: string
          id?: string
          lead_time_dias?: number
          origen_location_id: string
          prioridad?: number
          updated_at?: string
          zona_destino?: string | null
          zona_origen?: string | null
        }
        Update: {
          costo_por_unidad_cop?: number
          created_at?: string
          destino_location_id?: string
          id?: string
          lead_time_dias?: number
          origen_location_id?: string
          prioridad?: number
          updated_at?: string
          zona_destino?: string | null
          zona_origen?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_cost_matrix_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "transfer_cost_matrix_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "transfer_cost_matrix_destino_location_id_fkey"
            columns: ["destino_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "transfer_cost_matrix_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "transfer_cost_matrix_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "v_locations_allocation_config"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "transfer_cost_matrix_origen_location_id_fkey"
            columns: ["origen_location_id"]
            isOneToOne: false
            referencedRelation: "v_ubicaciones_gestion"
            referencedColumns: ["location_id"]
          },
        ]
      }
      user_permission_overrides: {
        Row: {
          action_key: string
          created_at: string
          created_by: string | null
          granted: boolean
          id: string
          module_key: string
          reason: string | null
          user_id: string
        }
        Insert: {
          action_key: string
          created_at?: string
          created_by?: string | null
          granted: boolean
          id?: string
          module_key: string
          reason?: string | null
          user_id: string
        }
        Update: {
          action_key?: string
          created_at?: string
          created_by?: string | null
          granted?: boolean
          id?: string
          module_key?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_permission_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          full_name: string | null
          invited_at: string | null
          invited_by: string | null
          is_active: boolean
          last_login_at: string | null
          role_id: string | null
          scope_location_ids: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          role_id?: string | null
          scope_location_ids?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          role_id?: string | null
          scope_location_ids?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "v_usuarios_gestion"
            referencedColumns: ["user_id"]
          },
        ]
      }
      whatsapp_consultas: {
        Row: {
          comando: string | null
          created_at: string | null
          error: string | null
          id: string
          nombre: string | null
          numero: string
          respondido: boolean | null
          texto_recibido: string | null
        }
        Insert: {
          comando?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          nombre?: string | null
          numero: string
          respondido?: boolean | null
          texto_recibido?: string | null
        }
        Update: {
          comando?: string | null
          created_at?: string | null
          error?: string | null
          id?: string
          nombre?: string | null
          numero?: string
          respondido?: boolean | null
          texto_recibido?: string | null
        }
        Relationships: []
      }
      whatsapp_destinatarios: {
        Row: {
          activo: boolean | null
          created_at: string | null
          id: string
          nombre: string
          numero: string
          reportes: Json | null
          tipo_reporte: string | null
        }
        Insert: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre: string
          numero: string
          reportes?: Json | null
          tipo_reporte?: string | null
        }
        Update: {
          activo?: boolean | null
          created_at?: string | null
          id?: string
          nombre?: string
          numero?: string
          reportes?: Json | null
          tipo_reporte?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      alertas_distribucion: {
        Row: {
          alerta: string | null
          canal: string | null
          ciudad: string | null
          color: string | null
          image_url: string | null
          linea: string | null
          location_id: string | null
          producto: string | null
          ritmo_linea_tienda: number | null
          ritmo_red: number | null
          ritmo_semanal: number | null
          severidad: number | null
          sku: string | null
          stock: number | null
          stock_red_cedible: number | null
          talla: string | null
          tienda: string | null
          tiendas_vendiendo: number | null
          tiene_solucion: boolean | null
          tier: string | null
          uds_28d: number | null
          venta_perdida_semanal: number | null
          wos: number | null
          wos_objetivo: number | null
          zona: string | null
        }
        Relationships: []
      }
      alertas_por_tienda: {
        Row: {
          agotados: number | null
          agotados_con_stock: number | null
          canal: string | null
          ciudad: string | null
          impulsar: number | null
          location_id: string | null
          prioridad: number | null
          quiebres: number | null
          sobrestock: number | null
          tienda: string | null
          tier: string | null
          total_alertas: number | null
          uds_impulsar: number | null
          uds_perdidas_semana: number | null
          uds_sobrestock: number | null
          zona: string | null
        }
        Relationships: []
      }
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
      categoria_desempeno: {
        Row: {
          bajo: number | null
          bueno: number | null
          categoria: string | null
          categoria_padre: string | null
          cobertura_ajustada: number | null
          cobertura_critica: number | null
          destallados: number | null
          excelente: number | null
          genero_norm: string | null
          mix_online_pct: number | null
          pct_full_prom: number | null
          productos: number | null
          regular: number | null
          revisar_online: number | null
          ros_full_mediano: number | null
          ros_mediano: number | null
          ros_online_mediano: number | null
          ros_rebajado_mediano: number | null
          ros_tienda_mediano: number | null
          sell_through_mediano: number | null
          semanas_prom: number | null
          st_online_mediano: number | null
          st_tienda_mediano: number | null
          stock_actual: number | null
          stock_en_riesgo: number | null
          stock_online: number | null
          stock_tienda: number | null
          uds_activacion: number | null
          uds_full: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_rebaja: number | null
          uds_rebajada: number | null
          uds_tienda: number | null
          uds_vendidas: number | null
          wos_mediano: number | null
        }
        Relationships: []
      }
      coleccion_cobertura_red: {
        Row: {
          cobertura_min: number | null
          cobertura_ponderada: number | null
          cobertura_prom: number | null
          coleccion: string | null
          con_ventana: number | null
          indice_meta_prom: number | null
          pct_perdido_sobre_vendido: number | null
          perdida_en_buenos: number | null
          prod_baja_cobertura: number | null
          productos: number | null
          vendido: number | null
          venta_perdida_est: number | null
        }
        Relationships: []
      }
      diagnostico_variantes_huerfanas: {
        Row: {
          diagnostico: string | null
          linea: string | null
          lineas: number | null
          primera_venta: string | null
          producto: string | null
          sku: string | null
          ultima_venta: string | null
          unidades: number | null
          variant_id: string | null
          variant_id_actual: string | null
          venta_neta: number | null
        }
        Relationships: []
      }
      estado_frescura_inventario: {
        Row: {
          conciliacion_ejecutada_bog: string | null
          conciliacion_estado: string | null
          conciliacion_fecha: string | null
          fecha_hoy: string | null
          mv_estado: string | null
          mv_refrescada_bog: string | null
          netsuite_dias_antiguedad: number | null
          netsuite_fecha: string | null
          semaforo: string | null
          snapshot_estado: string | null
          snapshot_fecha: string | null
          snapshot_filas: number | null
          snapshot_filas_tipicas: number | null
          snapshot_pct: number | null
          snapshot_ubic_tipicas: number | null
          snapshot_ubicaciones: number | null
          snapshot_variantes: number | null
        }
        Relationships: []
      }
      linea_360: {
        Row: {
          bod_exportaciones: number | null
          bod_principal: number | null
          bod_reserva: number | null
          bod_tiendas: number | null
          categoria_padre: string | null
          desc_activacion_pct: number | null
          fecha_snapshot_bodega: string | null
          genero_norm: string | null
          indice_meta: number | null
          indice_total: number | null
          mix_online_pct: number | null
          n_cobertura_ajustada: number | null
          n_cobertura_critica: number | null
          n_colecciones: number | null
          n_con_ventana: number | null
          n_en_curso: number | null
          n_productos: number | null
          n_repetir: number | null
          n_revisar_cantidad: number | null
          n_revisar_concepto: number | null
          n_revisar_precio: number | null
          objetivo_unidades: number | null
          pct_activacion: number | null
          pct_evacuado_120d: number | null
          pct_rebaja: number | null
          pct_venta_full: number | null
          pct_venta_sana: number | null
          producido: number | null
          semanas_prom: number | null
          sin_evacuar: number | null
          st_disponibilizado: number | null
          st_total: number | null
          stock_detenido: number | null
          stock_disponibilizado: number | null
          stock_online: number | null
          stock_tiendas: number | null
          stock_total: number | null
          uds_online: number | null
          uds_revisar_cantidad: number | null
          uds_revisar_concepto: number | null
          uds_tienda: number | null
          unidades_activacion: number | null
          unidades_full: number | null
          unidades_rebaja: number | null
          vendido: number | null
          vendido_120d: number | null
          wos_prom: number | null
        }
        Relationships: []
      }
      linea_curva_tallas: {
        Row: {
          aplica_curva: boolean | null
          cargadas: number | null
          categoria_padre: string | null
          desvio_pts: number | null
          genero_norm: string | null
          n_productos: number | null
          n_tallas: number | null
          pct_cargado: number | null
          pct_demanda: number | null
          pct_online: number | null
          productos: number | null
          rank_mas_quedada: number | null
          rank_mas_rapida: number | null
          sell_through: number | null
          stock: number | null
          talla: string | null
          uds_vendidas_linea: number | null
          variantes_agotadas: number | null
          vendidas: number | null
        }
        Relationships: []
      }
      mv_producto_clasificacion: {
        Row: {
          anio: number | null
          base_cohorte: string | null
          calculado_en: string | null
          categoria_padre: string | null
          category: string | null
          cobertura: string | null
          coleccion: string | null
          desempeno: string | null
          dias_en_venta: number | null
          estado_online: string | null
          estado_tallas: string | null
          estuvo_en_online: boolean | null
          estuvo_en_tienda: boolean | null
          fecha_inicio: string | null
          fuera_de_ventana: boolean | null
          genero: string | null
          genero_norm: string | null
          image_url: string | null
          indice_full: number | null
          indice_online: number | null
          indice_rebajado: number | null
          indice_tienda: number | null
          indice_total: number | null
          integridad_tallas: number | null
          med_pctfull_cohorte: number | null
          med_st_cohorte: number | null
          mix_online_cat: number | null
          mix_online_pct: number | null
          n_cohorte: number | null
          pct_activacion: number | null
          pct_onl_full: number | null
          pct_rebaja: number | null
          pct_tie_full: number | null
          pct_venta_full: number | null
          perfil_canal: string | null
          product_id: string | null
          profundidad_desc_pct: number | null
          ratio_cobertura: number | null
          ros_full: number | null
          ros_online: number | null
          ros_rebajado: number | null
          ros_tienda: number | null
          ros_total: number | null
          sell_through_pct: number | null
          semanas_en_venta: number | null
          semanas_full: number | null
          semanas_objetivo: number | null
          semanas_rebajada: number | null
          st_online_pct: number | null
          st_tienda_pct: number | null
          stock_actual: number | null
          stock_online: number | null
          stock_outlet: number | null
          stock_tienda: number | null
          tallas_con_stock: number | null
          tallas_totales: number | null
          tiendas_con_stock: number | null
          tiendas_con_venta: number | null
          tipo: string | null
          title: string | null
          uds_onl_activacion: number | null
          uds_onl_full: number | null
          uds_onl_rebaja: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_tie_activacion: number | null
          uds_tie_full: number | null
          uds_tie_rebaja: number | null
          uds_tienda: number | null
          unidades_activacion: number | null
          unidades_full: number | null
          unidades_rebaja: number | null
          unidades_rebajada: number | null
          unidades_vendidas: number | null
          vendio_full: boolean | null
          vendio_rebajada: boolean | null
          wos: number | null
        }
        Relationships: []
      }
      producto_360: {
        Row: {
          anio: number | null
          asignado_online: number | null
          asignado_tienda: number | null
          base_cohorte: string | null
          bod_exportaciones: number | null
          bod_principal: number | null
          bod_reserva: number | null
          bod_tiendas: number | null
          calculado_en: string | null
          categoria_padre: string | null
          category: string | null
          cobertura: string | null
          coleccion: string | null
          desc_activacion_online_pct: number | null
          desc_activacion_pct: number | null
          desc_activacion_tienda_pct: number | null
          desempeno: string | null
          diagnostico: string | null
          dias_en_venta: number | null
          dias_medidos: number | null
          estado_online: string | null
          estado_tallas: string | null
          fecha_inicio: string | null
          fecha_snapshot_bodega: string | null
          fuera_de_ventana: boolean | null
          genero_norm: string | null
          image_url: string | null
          indice_full: number | null
          indice_meta: number | null
          indice_online: number | null
          indice_rebajado: number | null
          indice_tienda: number | null
          indice_total: number | null
          integridad_tallas: number | null
          med_pctfull_cohorte: number | null
          med_st_cohorte: number | null
          meta_st: number | null
          mix_online_cat: number | null
          mix_online_pct: number | null
          n_cohorte: number | null
          objetivo_dia: number | null
          objetivo_dia_online: number | null
          objetivo_dia_tienda: number | null
          objetivo_online_semana: number | null
          objetivo_tienda_semana: number | null
          objetivo_unidades: number | null
          pct_activacion: number | null
          pct_activacion_online: number | null
          pct_activacion_tienda: number | null
          pct_evacuado_120d: number | null
          pct_proyectado_120d: number | null
          pct_rebaja: number | null
          pct_venta_full: number | null
          pct_venta_sana: number | null
          percentil_catalogo: number | null
          perfil_canal: string | null
          peso_online: number | null
          producido: number | null
          product_id: string | null
          profundidad_desc_pct: number | null
          ratio_cobertura: number | null
          ritmo_dia: number | null
          ritmo_dia_online: number | null
          ritmo_dia_tienda: number | null
          ros_full: number | null
          ros_online: number | null
          ros_rebajado: number | null
          ros_tienda: number | null
          ros_total: number | null
          sell_through_pct: number | null
          semanas_en_venta: number | null
          semanas_objetivo: number | null
          semanas_restantes: number | null
          sin_evacuar: number | null
          st_disponibilizado: number | null
          st_online_pct: number | null
          st_tienda_pct: number | null
          st_total: number | null
          stock_actual: number | null
          stock_bodegas: number | null
          stock_detenido: number | null
          stock_disponibilizado: number | null
          stock_online: number | null
          stock_outlet: number | null
          stock_tienda: number | null
          stock_tiendas: number | null
          stock_total: number | null
          tallas_con_stock: number | null
          tallas_totales: number | null
          tiendas_con_stock: number | null
          tiendas_con_venta: number | null
          title: string | null
          uds_120d: number | null
          uds_onl_activacion: number | null
          uds_onl_full: number | null
          uds_onl_rebaja: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_semana_total: number | null
          uds_tie_activacion: number | null
          uds_tie_full: number | null
          uds_tie_rebaja: number | null
          uds_tienda: number | null
          unidades_activacion: number | null
          unidades_full: number | null
          unidades_rebaja: number | null
          unidades_sanas: number | null
          unidades_vendidas: number | null
          velocidad_meta: string | null
          ventana_completa: boolean | null
          wos: number | null
        }
        Relationships: []
      }
      producto_base: {
        Row: {
          anio: number | null
          apto_curva: boolean | null
          categoria_padre: string | null
          category: string | null
          coleccion: string | null
          coleccion_confiable: boolean | null
          dias_en_venta: number | null
          estado_online: string | null
          estado_tallas: string | null
          estuvo_en_online: boolean | null
          estuvo_en_tienda: boolean | null
          fecha_inicio: string | null
          genero: string | null
          genero_norm: string | null
          image_url: string | null
          integridad_tallas: number | null
          pct_activacion: number | null
          pct_onl_full: number | null
          pct_rebaja: number | null
          pct_tie_full: number | null
          pct_venta_full: number | null
          product_id: string | null
          profundidad_desc_pct: number | null
          sell_through_pct: number | null
          semanas_en_venta: number | null
          semanas_full: number | null
          semanas_online: number | null
          semanas_rebajada: number | null
          semanas_tienda: number | null
          st_online_pct: number | null
          st_tienda_pct: number | null
          stock_actual: number | null
          stock_online: number | null
          stock_outlet: number | null
          stock_tienda: number | null
          tallas_con_stock: number | null
          tallas_totales: number | null
          tiendas_con_stock: number | null
          tiendas_con_venta: number | null
          tipo: string | null
          title: string | null
          uds_onl_activacion: number | null
          uds_onl_full: number | null
          uds_onl_rebaja: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_tie_activacion: number | null
          uds_tie_full: number | null
          uds_tie_rebaja: number | null
          uds_tienda: number | null
          unidades_activacion: number | null
          unidades_full: number | null
          unidades_rebaja: number | null
          unidades_rebajada: number | null
          unidades_vendidas: number | null
          vendio_full: boolean | null
          vendio_rebajada: boolean | null
        }
        Relationships: []
      }
      producto_clasificacion: {
        Row: {
          anio: number | null
          base_cohorte: string | null
          categoria_padre: string | null
          category: string | null
          cobertura: string | null
          coleccion: string | null
          desempeno: string | null
          dias_en_venta: number | null
          estado_online: string | null
          estado_tallas: string | null
          estuvo_en_online: boolean | null
          estuvo_en_tienda: boolean | null
          fecha_inicio: string | null
          fuera_de_ventana: boolean | null
          genero: string | null
          genero_norm: string | null
          image_url: string | null
          indice_full: number | null
          indice_online: number | null
          indice_rebajado: number | null
          indice_tienda: number | null
          indice_total: number | null
          integridad_tallas: number | null
          med_pctfull_cohorte: number | null
          med_st_cohorte: number | null
          mix_online_cat: number | null
          mix_online_pct: number | null
          n_cohorte: number | null
          pct_activacion: number | null
          pct_onl_full: number | null
          pct_rebaja: number | null
          pct_tie_full: number | null
          pct_venta_full: number | null
          perfil_canal: string | null
          product_id: string | null
          profundidad_desc_pct: number | null
          ratio_cobertura: number | null
          ros_full: number | null
          ros_online: number | null
          ros_rebajado: number | null
          ros_tienda: number | null
          ros_total: number | null
          sell_through_pct: number | null
          semanas_en_venta: number | null
          semanas_full: number | null
          semanas_objetivo: number | null
          semanas_rebajada: number | null
          st_online_pct: number | null
          st_tienda_pct: number | null
          stock_actual: number | null
          stock_online: number | null
          stock_outlet: number | null
          stock_tienda: number | null
          tallas_con_stock: number | null
          tallas_totales: number | null
          tiendas_con_stock: number | null
          tiendas_con_venta: number | null
          tipo: string | null
          title: string | null
          uds_onl_activacion: number | null
          uds_onl_full: number | null
          uds_onl_rebaja: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_tie_activacion: number | null
          uds_tie_full: number | null
          uds_tie_rebaja: number | null
          uds_tienda: number | null
          unidades_activacion: number | null
          unidades_full: number | null
          unidades_rebaja: number | null
          unidades_rebajada: number | null
          unidades_vendidas: number | null
          vendio_full: boolean | null
          vendio_rebajada: boolean | null
          wos: number | null
        }
        Relationships: []
      }
      producto_cobertura_red: {
        Row: {
          categoria_padre: string | null
          coleccion: string | null
          diagnostico: string | null
          fecha_inicio: string | null
          genero_norm: string | null
          image_url: string | null
          indice_meta: number | null
          indice_total: number | null
          pct_cobertura: number | null
          pct_cobertura_ponderada: number | null
          pct_venta_sana: number | null
          producido: number | null
          product_id: string | null
          semanas_en_venta: number | null
          stock_detenido: number | null
          stock_disponibilizado: number | null
          tiendas_con_presencia: number | null
          tiendas_elegibles: number | null
          tiendas_sin_producto: number | null
          title: string | null
          unidades_vendidas: number | null
          venta_perdida_est: number | null
          venta_por_factor_semana: number | null
          ventana_completa: boolean | null
        }
        Relationships: []
      }
      producto_curva_tallas: {
        Row: {
          agotada: boolean | null
          aplica_curva: boolean | null
          cargadas: number | null
          categoria_padre: string | null
          coleccion: string | null
          desvio_pts: number | null
          genero_norm: string | null
          n_prod_linea: number | null
          n_tallas_linea: number | null
          n_tallas_producto: number | null
          pct_cargado: number | null
          pct_demanda_linea: number | null
          pct_vendido: number | null
          product_id: string | null
          sell_through_talla: number | null
          stock_bodega: number | null
          stock_disp: number | null
          stock_online: number | null
          stock_tienda: number | null
          talla: string | null
          title: string | null
          total_producto: number | null
          uds_linea: number | null
          uds_sobrantes: number | null
          vend_online: number | null
          vend_tienda: number | null
          vendidas: number | null
        }
        Relationships: []
      }
      producto_descuento_activacion: {
        Row: {
          desc_activacion_online_pct: number | null
          desc_activacion_pct: number | null
          desc_activacion_tienda_pct: number | null
          product_id: string | null
          uds_con_activacion: number | null
        }
        Relationships: []
      }
      producto_edad: {
        Row: {
          anio: number | null
          apto_analisis: boolean | null
          category: string | null
          coleccion: string | null
          coleccion_confiable: boolean | null
          dias_hasta_primera_venta: number | null
          fecha_publicacion: string | null
          genero: string | null
          primera_venta: string | null
          product_id: string | null
          semanas_en_venta: number | null
          tipo: string | null
          title: string | null
        }
        Relationships: []
      }
      producto_rotacion: {
        Row: {
          asignado_online: number | null
          asignado_tienda: number | null
          categoria_padre: string | null
          category: string | null
          cobertura: string | null
          coleccion: string | null
          desempeno: string | null
          dias_medidos: number | null
          fecha_inicio: string | null
          genero_norm: string | null
          image_url: string | null
          indice_meta: number | null
          indice_total: number | null
          meta_st: number | null
          n_tiendas: number | null
          objetivo_dia: number | null
          objetivo_dia_online: number | null
          objetivo_dia_tienda: number | null
          objetivo_online_semana: number | null
          objetivo_tienda_semana: number | null
          pct_evacuado_120d: number | null
          pct_evacuado_total: number | null
          pct_proyectado_120d: number | null
          percentil_catalogo: number | null
          peso_online: number | null
          producido: number | null
          product_id: string | null
          ritmo_dia: number | null
          ritmo_dia_online: number | null
          ritmo_dia_tienda: number | null
          semanas_en_venta: number | null
          stock_actual: number | null
          stock_bodegas: number | null
          stock_online: number | null
          stock_tiendas: number | null
          title: string | null
          uds_120d: number | null
          uds_120d_online: number | null
          uds_120d_tienda: number | null
          uds_online: number | null
          uds_outlet: number | null
          uds_tienda: number | null
          unidades_vendidas: number | null
          velocidad_meta: string | null
          ventana_completa: boolean | null
        }
        Relationships: []
      }
      productos_sin_coleccion: {
        Row: {
          categoria: string | null
          fecha_publicacion: string | null
          genero: string | null
          image_url: string | null
          linea: string | null
          primera_venta: string | null
          prioridad: string | null
          product_id: string | null
          producto: string | null
          stock_bodega: number | null
          stock_disponible: number | null
          stock_total: number | null
          ultima_venta: string | null
          variantes: number | null
          vendido_90d: number | null
          vendido_total: number | null
          venta_neta: number | null
        }
        Relationships: []
      }
      reporte_cumplimiento_presupuesto: {
        Row: {
          diferencia_faltante: number | null
          meta_venta: number | null
          periodo: string | null
          porc_cumplimiento: number | null
          sucursal: string | null
          venta_actual: number | null
        }
        Relationships: []
      }
      resumen_inventario_linea: {
        Row: {
          linea: string | null
          uds_detenido: number | null
          uds_online: number | null
          uds_tiendas: number | null
          uds_total: number | null
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
      stock_bodega_por_producto: {
        Row: {
          bod_exportaciones: number | null
          bod_principal: number | null
          bod_reserva: number | null
          bod_tiendas: number | null
          fecha_snapshot: string | null
          product_id: string | null
          stock_detenido: number | null
        }
        Relationships: []
      }
      v_inv_ejec_base: {
        Row: {
          bodega: string | null
          bodega_raw: string | null
          coleccion_sku: string | null
          color: string | null
          costo: number | null
          costo_unitario: number | null
          en_traslados: boolean | null
          genero: string | null
          id: string | null
          linea_origen: string | null
          nombre: string | null
          sku: string | null
          snapshot_date: string | null
          snapshot_id: string | null
          sub_tipo: string | null
          talla: string | null
          tipo_bodega: string | null
          tipo_mapping: string | null
          unidades: number | null
        }
        Relationships: []
      }
      v_inv_ejec_sku_dim: {
        Row: {
          coleccion_sku: string | null
          linea: string | null
          nombre: string | null
          sku: string | null
          sub_tipo: string | null
        }
        Relationships: []
      }
      v_locations_allocation_config: {
        Row: {
          activa: boolean | null
          capacidad_maxima_unidades: number | null
          colchon_cedi_semanas: number | null
          es_cedi: boolean | null
          es_outlet: boolean | null
          location_id: string | null
          location_name: string | null
          mapeo_tipo: string | null
          mod_default: number | null
          netsuite_location_id: number | null
          netsuite_location_name: string | null
          puede_ser_destino: boolean | null
          puede_ser_origen: boolean | null
          tier: string | null
          wos_objetivo_semanas: number | null
        }
        Relationships: []
      }
      v_ubicaciones_gestion: {
        Row: {
          allocation_activa: boolean | null
          capacidad_maxima_unidades: number | null
          codigo_oracle: number | null
          colchon_cedi_semanas: number | null
          dimension_m2: number | null
          es_cedi: boolean | null
          es_outlet: boolean | null
          estado_config: string | null
          location_activa: boolean | null
          location_id: string | null
          mapeo_notas: string | null
          mapeo_tipo: string | null
          mod_default: number | null
          mod_por_categoria: Json | null
          netsuite_location_name: string | null
          nombre: string | null
          params_updated_at: string | null
          puede_ser_destino: boolean | null
          puede_ser_origen: boolean | null
          tier: string | null
          tipo_tienda: string | null
          wos_objetivo_por_categoria: Json | null
          wos_objetivo_semanas: number | null
          zona: string | null
        }
        Relationships: []
      }
      v_usuarios_gestion: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          invited_at: string | null
          is_active: boolean | null
          last_login_at: string | null
          last_sign_in_at: string | null
          overrides_count: number | null
          role_key: string | null
          role_name: string | null
          scope_descripcion: string | null
          scope_location_ids: string[] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _col_date_boundary: {
        Args: { dias: number; p_referencia?: string }
        Returns: string
      }
      _col_upper_boundary: { Args: { p_hasta?: string }; Returns: string }
      _latest_valid_snapshot_date: {
        Args: { min_variants?: number }
        Returns: string
      }
      accionables_serie: {
        Args: { p_anio?: number; p_mes?: number }
        Returns: {
          acumulado: number
          dia: string
          entidad: string
          meta_dia: number
          venta: number
        }[]
      }
      actualizar_params_ubicacion: {
        Args: {
          p_activa?: boolean
          p_capacidad?: number
          p_colchon_cedi?: number
          p_location_id: string
          p_mod_default?: number
          p_mod_por_categoria?: Json
          p_wos_objetivo?: number
          p_wos_por_categoria?: Json
        }
        Returns: undefined
      }
      actualizar_progreso_incentivo: {
        Args: { p_incentivo_id: string }
        Returns: undefined
      }
      actualizar_ubicacion: {
        Args: {
          p_allocation_activa?: boolean
          p_capacidad_max?: number
          p_codigo_oracle?: number
          p_colchon_cedi?: number
          p_dimension_m2?: number
          p_es_cedi?: boolean
          p_es_outlet?: boolean
          p_is_active?: boolean
          p_location_id: string
          p_mapeo_notas?: string
          p_mapeo_tipo?: string
          p_mod_default?: number
          p_mod_por_categoria?: Json
          p_netsuite_name?: string
          p_nombre?: string
          p_puede_destino?: boolean
          p_puede_origen?: boolean
          p_tier?: string
          p_tipo_tienda?: string
          p_wos_objetivo?: number
          p_wos_objetivo_por_categoria?: Json
          p_zona?: string
        }
        Returns: Json
      }
      aplicar_conciliacion_netsuite: {
        Args: never
        Returns: {
          actualizados: number
          discrepancias: number
          insertados: number
          omitidos: number
        }[]
      }
      asignar_codigo_netsuite: {
        Args: { p_location_id: string; p_netsuite_code: number }
        Returns: undefined
      }
      bulk_update_payment_tokens: { Args: { records: Json }; Returns: number }
      calcular_comisiones_periodo: {
        Args: { p_anio: number; p_mes: number; p_reglas?: Json; p_rol?: string }
        Returns: {
          monto_comision: number
          nombre: string
          pct_comision: number
          pct_cumplimiento: number
          presupuesto: number
          rol: string
          shopify_user_id: string
          staff_id: string
          tienda: string
          tramo_aplicado: string
          venta_facturada: number
        }[]
      }
      calcular_proyecciones_y_cumplimiento: {
        Args: { p_anio: number; p_mes: number }
        Returns: {
          cierre_conservador: number
          cierre_optimista: number
          cierre_probable: number
          dias_mes: number
          dias_transcurridos: number
          nombre: string
          pct_cumplimiento_fecha: number
          pct_cumplimiento_general: number
          presupuesto_mes: number
          tipo: string
          venta_actual: number
          zona: string
        }[]
      }
      calidad_venta_entidad: {
        Args: { p_anio?: number; p_mes?: number }
        Returns: {
          desc_promedio_promo: number
          nombre: string
          pct_full: number
          pct_promo: number
          pct_rebaja: number
          uds: number
          venta_full: number
        }[]
      }
      categorias_disponibles: {
        Args: { p_dias?: number }
        Returns: {
          categoria: string
          categoria_padre: string
          productos: number
          tiene_venta: boolean
          uds_periodo: number
        }[]
      }
      crear_ubicacion_completa: {
        Args: {
          p_capacidad?: number
          p_location_id: string
          p_netsuite_code?: number
          p_netsuite_name?: string
          p_nombre: string
          p_tipo_tienda: string
          p_zona?: string
        }
        Returns: string
      }
      crecimiento_mom: {
        Args: { p_anio?: number; p_mes?: number }
        Returns: {
          nombre: string
          var_pct: number
          venta_actual: number
          venta_mes_anterior: number
        }[]
      }
      crisis_room_entidades: {
        Args: never
        Returns: {
          ciudad: string
          clave: string
          nombre: string
          tipo: string
          zona: string
        }[]
      }
      crisis_room_palancas: {
        Args: { p_clave: string; p_fecha?: string; p_umbral?: number }
        Returns: {
          dias: number
          entidad: string
          lectura: string
          palanca_principal: string
          ticket: number
          ticket_grupo: number
          ticket_umbral: number
          tiendas_en_grupo: number
          tipo_tienda: string
          transacciones: number
          tx_dia: number
          tx_dia_grupo: number
          tx_dia_umbral: number
          upt: number
          upt_grupo: number
          upt_umbral: number
          valor_ticket: number
          valor_trafico: number
          valor_upt: number
        }[]
      }
      crisis_room_productos: {
        Args: { p_clave: string; p_limite?: number }
        Returns: {
          accion: string
          donde_hay: string
          image_url: string
          linea: string
          potencial_semanal: number
          producto: string
          ritmo_red: number
          stock_bodega: number
          stock_local: number
          stock_otras_tiendas: number
          tiendas_vendiendo: number
        }[]
      }
      crisis_room_tienda: {
        Args: { p_clave: string; p_fecha?: string }
        Returns: {
          base_comparacion: string
          brecha_fecha: number
          cierre_probable: number
          ciudad: string
          dias_mes: number
          dias_restantes: number
          dias_transcurridos: number
          entidad: string
          falta_para_meta: number
          gap_por_ticket: number
          gap_por_trafico: number
          gap_por_upt: number
          pct_cierre: number
          pct_cumpl: number
          pct_descuento: number
          presupuesto_fecha: number
          presupuesto_mes: number
          ritmo_actual_dia: number
          ritmo_necesario_dia: number
          salto_requerido_pct: number
          tendencia_7d: number
          ticket: number
          ticket_red: number
          tipo: string
          transacciones: number
          tx_dia: number
          tx_dia_red: number
          unidades: number
          upt: number
          upt_red: number
          var_ano_anterior: number
          venta_ano_anterior: number
          venta_mtd: number
          zona: string
        }[]
      }
      cruzar_addi_con_shopify: { Args: never; Returns: undefined }
      equipo_tienda: {
        Args: { p_clave: string; p_fecha?: string }
        Returns: {
          desempeno: string
          dias_con_venta: number
          palanca_a_trabajar: string
          participacion_venta: number
          pct_descuento: number
          rol: string
          shopify_user_id: string
          ticket: number
          ticket_tienda: number
          transacciones: number
          unidades: number
          upt: number
          upt_tienda: number
          var_ticket_pct: number
          var_upt_pct: number
          vendedor: string
          venta: number
        }[]
      }
      estrategia_aplicar: {
        Args: {
          p_clave: string
          p_codigo: string
          p_nota?: string
          p_por?: string
        }
        Returns: string
      }
      estrategias_seguimiento: {
        Args: { p_anio?: number; p_mes?: number }
        Returns: {
          aplicada_at: string
          avance: number
          codigo: string
          dias_desde: number
          entidad: string
          estado: string
          estrategia: string
          horizonte_dias: number
          id: string
          palanca: string
          ritmo_al_aplicar: number
          ritmo_hoy: number
          var_ritmo_pct: number
          venta_al_aplicar: number
          venta_hoy: number
          ya_deberia_verse: boolean
        }[]
      }
      estrategias_sugeridas: {
        Args: { p_clave: string; p_fecha?: string }
        Returns: {
          acciones: string[]
          codigo: string
          descripcion: string
          esfuerzo: string
          horizonte_dias: number
          motivo: string
          nombre: string
          palanca: string
          relevancia: number
          responsable: string
          riesgo_margen: number
        }[]
      }
      fecha_bogota: { Args: { p_offset_dias?: number }; Returns: string }
      generar_archivo_shopify_inventario: {
        Args: never
        Returns: {
          disponible_netsuite: number
          disponible_shopify_antes: number
          producto: string
          sku: string
          ubicacion_shopify: string
          variant_id: string
        }[]
      }
      generar_export_netsuite: {
        Args: {
          p_empleado: string
          p_fecha: string
          p_id_externo: string
          p_lineas: Json
          p_subsidiaria?: number
        }
        Returns: {
          cantidad: number
          empleado: string
          fecha: string
          id_externo: string
          id_interno_art: number
          sku: string
          subsidiaria: number
          ubicacion_destino: number
          ubicacion_origen: number
          warning: string
        }[]
      }
      gestion_comercial: {
        Args: { p_anio?: number; p_mes?: number }
        Returns: {
          accionable: string
          avance_desde_marca: number
          brecha: number
          cierre_probable: number
          clave: string
          crecimiento_yoy: number
          dias_mes: number
          dias_restantes: number
          dias_transcurridos: number
          esfuerzo_requerido: number
          marcada: boolean
          marcada_at: string
          nombre: string
          pct_cierre: number
          pct_cumpl: number
          pct_descuento: number
          presupuesto: number
          presupuesto_fecha: number
          ritmo_actual_dia: number
          ritmo_necesario_dia: number
          tendencia_7d: number
          ticket: number
          ticket_red: number
          tier: string
          tipo: string
          transacciones: number
          unidades: number
          upt: number
          upt_red: number
          venta_al_marcar: number
          venta_mtd: number
          zona: string
        }[]
      }
      gestion_comercial_marcar: {
        Args: { p_marcar?: boolean; p_nombre: string; p_nota?: string }
        Returns: boolean
      }
      get_addi_conciliacion_kpis: {
        Args: {
          p_canal?: string
          p_discrepancia?: string
          p_estado?: string
          p_mes: string
          p_tipo?: string
        }
        Returns: {
          con_discrepancia: number
          conciliadas: number
          monto_discrepancia: number
          sin_cruce: number
          sin_factura_ns: number
          total: number
        }[]
      }
      get_alertas_comerciales: {
        Args: { p_anio: number; p_mes: number }
        Returns: {
          es_digital: boolean
          nombre: string
          pct_descuento: number
          pct_proyeccion: number
          pct_recompra: number
          presupuesto: number
          tendencia_transacciones: number
          ticket_promedio_local: number
          ticket_promedio_nacional: number
          tipo: string
          upt_local: number
          upt_nacional: number
          venta_mtd: number
        }[]
      }
      get_baja_rotacion: {
        Args: {
          p_incluir_rebajas?: boolean
          p_location_id?: string
          p_sell_through_max?: number
          p_semanas_minimas?: number
        }
        Returns: {
          accion: string
          category: string
          cobertura_curva: number
          collection_season: string
          color: string
          descuento_actual: number
          descuento_sugerido: number
          dias_en_tienda: number
          es_rebaja: boolean
          inventario_inicial: number
          nivel: string
          precio_actual: number
          precio_original: number
          primera_venta: string
          product_id: string
          sell_through: number
          semanas_en_tienda: number
          stock_actual: number
          stock_digital: number
          stock_outlets: number
          stock_tiendas_linea: number
          tallas_con_stock: number
          tallas_disponibles: Json
          tallas_totales: number
          titulo: string
          unidades_vendidas: number
          velocidad_8sem: number
          velocidad_semanal: number
          wos_actual: number
        }[]
      }
      get_centro_accion_comercial: {
        Args: { p_anio: number; p_mes: number }
        Returns: {
          crecimiento_mom: number
          crecimiento_yoy: number
          es_digital: boolean
          esfuerzo_requerido: number
          nombre: string
          pct_descuento: number
          presupuesto: number
          proyeccion_conservadora: number
          stamp_variacion: number
          stamped_at: string
          ticket_promedio: number
          tiene_stamp: boolean
          tipo: string
          tipo_tienda: string
          upt: number
          venta_mtd: number
        }[]
      }
      get_curva_tallas: {
        Args: { p_canal?: string; p_crecimiento?: number; p_trimestre: number }
        Returns: {
          categoria: string
          familia_color: string
          pct_talla_en_color: number
          proyeccion_2027: number
          talla: string
          unidades_2025: number
          unidades_2026: number
        }[]
      }
      get_proyeccion_demanda: {
        Args: { p_canal?: string; p_crecimiento?: number; p_trimestre: number }
        Returns: {
          categoria: string
          coleccion_proyectada: string
          familia_color: string
          pct_categoria: number
          pct_color_en_categoria: number
          pct_full_price: number
          precio_promedio: number
          promedio_ponderado: number
          proyeccion_2027: number
          unidades_2025: number
          unidades_2026: number
          unidades_full_price: number
          unidades_promo: number
          venta_full_price: number
          venta_promo: number
          venta_proyectada: number
        }[]
      }
      get_user_permissions: {
        Args: { p_user_id?: string }
        Returns: {
          action_key: string
          granted: boolean
          module_key: string
          source: string
        }[]
      }
      get_user_scope: { Args: { p_user_id?: string }; Returns: string[] }
      incentivo_detalle: {
        Args: {
          p_incentivo_id: string
          p_location_id?: string
          p_vendedor_id?: string
        }
        Returns: {
          categoria: string
          cuenta: boolean
          descuento: number
          fecha: string
          monto: number
          pedido: string
          precio: number
          producto: string
          sku: string
          tienda: string
          tipo_venta: string
          unidades: number
          vendedor: string
          venta_neta: number
        }[]
      }
      lineas_tienda: {
        Args: { p_clave: string; p_dias?: number }
        Returns: {
          candidata_estancada: boolean
          cobertura_semanas: number
          estado: string
          linea: string
          participacion: number
          productos_en_stock: number
          sin_ventas: boolean
          stock_tienda: number
          uds_por_semana: number
          unidades: number
          venta: number
        }[]
      }
      mejor_dia_semana: {
        Args: { p_clave: string; p_dias?: number }
        Returns: {
          dia_semana: string
          dow: number
          es_mejor: boolean
          transacciones: number
          venta: number
          venta_promedio_dia: number
        }[]
      }
      normalizar_lote_nombres: {
        Args: { p_nombres: string[] }
        Returns: string[]
      }
      normalizar_nombre: { Args: { p_nombre: string }; Returns: string }
      obtener_siguiente_consecutivo: {
        Args: { p_origen_netsuite_id: number }
        Returns: number
      }
      preview_conciliacion_netsuite: {
        Args: never
        Returns: {
          combinaciones: number
          tipo: string
          uds_netsuite: number
          uds_shopify: number
        }[]
      }
      productos_combinar: {
        Args: { p_clave: string; p_limite?: number }
        Returns: {
          accion: string
          combina_con: string
          de_cada_10: number
          frase: string
          fuerza: string
          image_url: string
          imagen_combina: string
          linea: string
          producto: string
          stock_local: number
          stock_red: number
          veces_juntos: number
        }[]
      }
      proyeccion_pagos_addi: {
        Args: { p_fecha_desde: string; p_fecha_hasta: string }
        Returns: {
          esta_recibido: boolean
          fecha_pago_estimada: string
          monto_bruto: number
          monto_neto_estimado: number
          recibido_real: number
          tarifas_estimadas: number
          tipo_venta: string
          transacciones: number
        }[]
      }
      refresh_producto_clasificacion: { Args: never; Returns: undefined }
      registrar_trafico: {
        Args: { p_location_id: string; p_registros: Json; p_token: string }
        Returns: number
      }
      reporte_addi_conciliacion: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          addi_id: string
          canal: string
          email_vendedor: string
          estado: string
          estado_final: string
          fecha_creacion: string
          fecha_pedido: string
          id_orden: string
          location_id: string
          monto: number
          monto_shopify: number
          nombre_tienda: string
          ns_base: number
          ns_discrepancia: number
          ns_factura: string
          ns_tipo_discrepancia: string
          ns_valor: number
          order_number: string
          payment_token: string
          shopify_order_id: string
          source_name: string
          tipo_de_venta: string
          user_id: string
        }[]
      }
      reporte_baja_rotacion_outlet: {
        Args: {
          p_sell_through_umbral?: number
          p_snapshot_id?: string
          p_ventana_semanas?: number
          p_wos_umbral?: number
        }
        Returns: {
          r_accion_sugerida: string
          r_color: string
          r_destino_sugerido_id: string
          r_destino_sugerido_nombre: string
          r_justificacion: string
          r_linea: string
          r_location_id: string
          r_location_nombre: string
          r_nombre: string
          r_ritmo_ajustado: number
          r_sell_through: number
          r_sku: string
          r_stock_actual: number
          r_talla: string
          r_unidades_a_mover: number
          r_ventas_ventana: number
          r_wos_actual: number
        }[]
      }
      reporte_calidad_venta_coleccion: {
        Args: { p_agrupar_por?: string; p_canal?: string; p_coleccion?: string }
        Returns: {
          cerrada_120: number
          cerrada_150: number
          cerrada_90: number
          grupo: string
          pct_120: number
          pct_150: number
          pct_90: number
          pct_total: number
          producido: number
          productos: number
          vendido_120: number
          vendido_150: number
          vendido_90: number
          vendido_total: number
        }[]
      }
      reporte_cierre_coleccion_categoria_coleccion: {
        Args: {
          p_canal?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          categoria: string
          coleccion: string
          unidades: number
        }[]
      }
      reporte_cierre_coleccion_curva_tallas: {
        Args: {
          p_canal?: string
          p_categoria?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          stock_disponible: number
          talla: string
          und_vendidas: number
        }[]
      }
      reporte_cierre_coleccion_kpis: {
        Args: {
          p_canal?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          calidad_venta_pct: number
          ingreso_total: number
          sell_through_pct: number
          stock_remanente: number
        }[]
      }
      reporte_cierre_coleccion_pareto_categoria: {
        Args: {
          p_canal?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          categoria: string
          pct_participacion: number
          unidades: number
        }[]
      }
      reporte_cierre_coleccion_remanentes: {
        Args: {
          p_canal?: string
          p_coleccion?: string
          p_genero?: string
          p_limite?: number
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          categoria: string
          foto: string
          genero: string
          precio_prom_venta: number
          producto: string
          sell_through_pct: number
          sku: string
          stock_actual: number
          und_vendidas: number
        }[]
      }
      reporte_cierre_coleccion_top_colores: {
        Args: {
          p_canal?: string
          p_categoria?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          color: string
          color_name: string
          unidades: number
        }[]
      }
      reporte_cierre_coleccion_treemap_colores: {
        Args: {
          dias_atras?: number
          p_canal?: string
          p_categoria?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          color: string
          color_name: string
          pct_inventario: number
          pct_venta: number
          stock_disponible: number
          und_vendidas: number
        }[]
      }
      reporte_cierre_coleccion_ventas_coleccion: {
        Args: {
          p_canal?: string
          p_coleccion?: string
          p_genero?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          coleccion: string
          stock_disponible: number
          und_vendidas: number
        }[]
      }
      reporte_comportamiento_producto: {
        Args: {
          dias_atras: number
          p_hasta?: string
          p_location_id?: string
          p_sku_filter?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          coleccion: string
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
      reporte_composicion_coleccion: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          coleccion: string
          unidades: number
        }[]
      }
      reporte_composicion_coleccion_linea: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          categoria: string
          coleccion: string
          unidades: number
        }[]
      }
      reporte_composicion_ingresos: {
        Args: {
          p_canal?: string
          p_desde?: string
          p_hasta?: string
          p_location_id?: string
          p_metodo_pago?: string
        }
        Returns: {
          r_canal: string
          r_dias_liquidacion: number
          r_location_id: string
          r_metodo_grupo: string
          r_metodo_pago: string
          r_ordenes: number
          r_tienda: string
          r_ventas_brutas: number
          r_ventas_sin_iva: number
        }[]
      }
      reporte_composicion_inventario_coleccion: {
        Args: { p_location_id?: string }
        Returns: {
          coleccion: string
          pct: number
          unidades: number
        }[]
      }
      reporte_conciliacion_addi: {
        Args: never
        Returns: {
          cobertura: string
          creditos: number
          impuestos: number
          liq_sin_transaccion: number
          liq_sin_transaccion_neto: number
          liquidado_bruto: number
          liquidado_neto: number
          liquidados: number
          mes: string
          pendiente_bruto: number
          pendientes: number
          tarifas: number
          vendido: number
        }[]
      }
      reporte_conciliacion_addi_contable: {
        Args: never
        Returns: {
          cruzado: boolean
          descuento_addi: number
          descuento_comercio: number
          mes_pago: string
          pedidos: number
          total_a_pagar: number
          total_cancelaciones: number
          total_impuestos: number
          total_tarifas: number
          total_ventas: number
        }[]
      }
      reporte_conciliacion_addi_pendientes: {
        Args: never
        Returns: {
          dias_espera: number
          fecha: string
          id_credito: string
          monto: number
          nombre_cliente: string
          nombre_tienda: string
        }[]
      }
      reporte_conciliacion_addi_totales: {
        Args: never
        Returns: {
          meses_sin_cargar: string
          no_cruzado_neto: number
          no_cruzado_pedidos: number
          primer_pago: string
          total_impuestos: number
          total_liquidado_neto: number
          total_tarifas: number
          ultimo_pago: string
        }[]
      }
      reporte_conciliacion_log: {
        Args: { p_tipo?: string }
        Returns: {
          color: string
          id: number
          location_id: string
          producto: string
          qty_netsuite: number
          qty_shopify_antes: number
          sku: string
          talla: string
          tipo: string
          ubicacion: string
        }[]
      }
      reporte_consumo_insumos_tienda: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          insumo: string
          insumos_x_pedido: number
          location_id: string
          pedidos_tienda: number
          sku: string
          tienda: string
          tipo_tienda: string
          uds_producto: number
          unidades: number
        }[]
      }
      reporte_conversion_trafico: {
        Args: { dias_atras: number; p_hasta?: string; p_location_id?: string }
        Returns: {
          conversion_pct: number
          entradas: number
          fecha: string
          location_id: string
          pedidos: number
          tienda: string
        }[]
      }
      reporte_cumplimiento_anual: {
        Args: { p_anio: number }
        Returns: {
          fecha_ultima_proy: string
          fotos_disponibles: number
          mes: number
          pct_cumplimiento: number
          presupuesto: number
          proy_corte_dia10: number
          proy_corte_dia20: number
          proy_ultima: number
          venta_real: number
        }[]
      }
      reporte_cumplimiento_ejecutivo: {
        Args: {
          p_canal?: string
          p_desde?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          dias_periodo: number
          diferencia: number
          meses_incluidos: string
          pct_cumplimiento: number
          presupuesto: number
          venta: number
        }[]
      }
      reporte_cumplimiento_whatsapp: {
        Args: { p_fecha?: string }
        Returns: Json
      }
      reporte_curva_evacuacion_coleccion: {
        Args: {
          p_canal?: string
          p_coleccion: string
          p_linea?: string
          p_semanas?: number
        }
        Returns: {
          dia_desde: number
          pct_acumulado: number
          producido_total: number
          productos_activos: number
          semana: number
          uds_acumuladas: number
          uds_semana: number
        }[]
      }
      reporte_curva_linea: {
        Args: {
          p_coleccion?: string
          p_genero?: string
          p_min_prod?: number
          p_semanas?: number
        }
        Returns: {
          genero: string
          linea: string
          pct_acumulado: number
          pct_semana: number
          productos: number
          sem_vida: number
          uds_prom: number
        }[]
      }
      reporte_curva_maduracion: {
        Args: never
        Returns: {
          r_cohorte: string
          r_location_id: string
          r_mes_de_vida: number
          r_mes_fecha: string
          r_nombre: string
          r_ordenes: number
          r_ticket: number
          r_tipo_tienda: string
          r_ventas: number
          r_vpm: number
        }[]
      }
      reporte_curva_producto: {
        Args: { p_modo?: string; p_product_id: string }
        Returns: {
          acumulado: number
          eje: number
          pct_acumulado: number
          pct_cohorte: number
          pct_semana: number
          semana: string
          uds: number
          uds_full: number
          uds_online: number
          uds_rebajada: number
          uds_tienda: number
        }[]
      }
      reporte_curva_traslados: {
        Args: {
          dias_atras?: number
          p_destino?: string
          p_hasta?: string
          p_origen?: string
        }
        Returns: {
          color: string
          foto: string
          prioridad: number
          product_id: string
          producto: string
          ritmo_venta: number
          sku: string
          stock_destino: number
          stock_origen: number
          talla: string
          tienda_destino: string
          tienda_origen: string
          uds_sugeridas: number
        }[]
      }
      reporte_curva_traslados_v2: {
        Args: {
          p_consolidacion_wos_trigger?: number
          p_destino_filter?: string[]
          p_linea_filter?: string[]
          p_minimo_unidades_por_linea?: number
          p_minimo_ventas_sobrestock?: number
          p_snapshot_id?: string
          p_ventana_productos_activos_dias?: number
          p_ventana_semanas?: number
        }
        Returns: {
          r_color: string
          r_destino_location_id: string
          r_destino_nombre: string
          r_destino_tier: string
          r_dias_con_stock_destino: number
          r_justificacion: string
          r_lead_time_dias: number
          r_linea: string
          r_nombre: string
          r_origen_location_id: string
          r_origen_nombre: string
          r_origen_tipo: string
          r_prioridad: number
          r_ritmo_ajustado_destino: number
          r_ritmo_semanal_destino: number
          r_sku: string
          r_stock_destino: number
          r_stock_origen: number
          r_talla: string
          r_unidades_sugeridas: number
          r_wos_actual_destino: number
          r_wos_objetivo_destino: number
        }[]
      }
      reporte_demanda_insumos: {
        Args: { p_dias_cobertura?: number }
        Returns: {
          a_reponer: number
          consumo_dia: number
          demanda_periodo: number
          dias_autonomia: number
          dias_base: number
          estado: string
          insumo: string
          location_id: string
          sku: string
          stock_actual: number
          tienda: string
          tipo_tienda: string
        }[]
      }
      reporte_desempeño_comercial: {
        Args: { dias_atras: number; p_hasta?: string }
        Returns: {
          coleccion: string
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
        Args: { dias_atras?: number; p_desde?: string; p_hasta?: string }
        Returns: {
          canal: string
          canal_key: string
          total_pedidos: number
          ventas_totales: number
        }[]
      }
      reporte_desempeno_por_linea: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_categoria?: string
          p_hasta?: string
          p_location_id?: string
        }
        Returns: {
          categoria: string
          estado_salud: string
          pct_participacion: number
          sell_through_pct: number
          stock_digital: number
          stock_tiendas: number
          und_digital: number
          und_full_price: number
          und_outlets: number
          und_promo: number
          und_rebajas: number
          und_tiendas: number
          und_total: number
          wos: number
        }[]
      }
      reporte_detalle_producto_tiendas: {
        Args: { dias_atras: number; p_hasta?: string; p_producto: string }
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
          p_hasta?: string
          p_product_id: string
        }
        Returns: {
          clasificacion: string
          precio_prom_venta: number
          sell_through_pct: number
          sku: string
          stock_disponible: number
          talla: string
          unidades_vendidas: number
          wos: number
        }[]
      }
      reporte_eficiencia_actual: {
        Args: { p_dias?: number }
        Returns: {
          r_dimension_m2: number
          r_location_id: string
          r_meses_activa: number
          r_nombre: string
          r_ordenes: number
          r_ticket: number
          r_tipo_tienda: string
          r_ventas: number
          r_vpm: number
          r_vpm_vs_red: number
          r_zona: string
        }[]
      }
      reporte_ejecutivo_kpis: {
        Args: {
          canal_filtro?: string
          dias_atras: number
          location_filtro?: string
          p_hasta?: string
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
          p_hasta?: string
          zona_filtro?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          coleccion: string
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
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
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
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
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
      reporte_kpis_por_rango: {
        Args: {
          p_canal?: string
          p_desde: string
          p_hasta: string
          p_location_id?: string
          p_zona?: string
        }
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
        Args: { dias_atras: number; p_hasta?: string; p_location_id: string }
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
      reporte_metricas_zona: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_zona?: string
        }
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
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
        }
        Returns: {
          categoria: string
          ingresos: number
          pct_participacion: number
          unidades: number
        }[]
      }
      reporte_participacion_genero: {
        Args: { p_canal?: string; p_dias?: number }
        Returns: {
          brecha_pp: number
          genero: string
          pct_stock: number
          pct_venta_uds: number
          pct_venta_valor: number
          sell_through: number
          stock: number
          uds_vendidas: number
          venta_neta: number
        }[]
      }
      reporte_pct_ventas_por_tipo: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
          p_zona?: string
        }
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
          p_hasta?: string
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
      reporte_presupuesto_por_canal: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          canal: string
          pct_cumplimiento: number
          presupuesto: number
          venta: number
        }[]
      }
      reporte_presupuesto_por_tienda: {
        Args: { p_desde?: string; p_hasta?: string }
        Returns: {
          presupuesto: number
          tienda: string
        }[]
      }
      reporte_productos_por_categoria: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_categoria?: string
          p_hasta?: string
          p_location_id?: string
        }
        Returns: {
          clasificacion: string
          coleccion: string
          estado_salud: string
          foto: string
          product_id: string
          producto: string
          stock_total: number
          und_full_price: number
          und_promo: number
          und_rebajas: number
          und_total: number
          venta_prom_semanal: number
          wos: number
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
      reporte_proyeccion_insumos: {
        Args: {
          p_crecimiento?: number
          p_desde?: string
          p_dias?: number
          p_hasta?: string
        }
        Returns: {
          a_comprar: number
          consumo_dia: number
          demanda: number
          dias_base: number
          insumo: string
          location_id: string
          sku: string
          stock_actual: number
          tienda: string
          tipo_tienda: string
          unidades_base: number
        }[]
      }
      reporte_ranking_tiendas: {
        Args: { dias_atras: number; p_canal?: string; p_hasta?: string }
        Returns: {
          inventario_valorado: number
          pct_venta_full_price: number
          ticket_promedio: number
          tienda: string
          unidades_vendidas: number
          upt: number
          ventas_totales: number
          zona: string
        }[]
      }
      reporte_ranking_tiendas_anterior: {
        Args: { dias_atras: number; p_canal?: string; p_hasta?: string }
        Returns: {
          pct_venta_full_price: number
          ticket_promedio: number
          tienda: string
          unidades_vendidas: number
          upt: number
          ventas_totales: number
        }[]
      }
      reporte_rendimiento_red: {
        Args: {
          p_fecha_desde_actual?: string
          p_fecha_desde_base?: string
          p_fecha_hasta_actual?: string
          p_fecha_hasta_base?: string
        }
        Returns: {
          r_crecimiento_ventas: number
          r_crecimiento_vpm: number
          r_dimension_m2: number
          r_es_nueva: boolean
          r_es_same_store: boolean
          r_location_id: string
          r_nombre: string
          r_ordenes_actual: number
          r_ordenes_base: number
          r_semaforo: string
          r_ticket_actual: number
          r_ticket_base: number
          r_tipo_tienda: string
          r_ventas_actual: number
          r_ventas_base: number
          r_vpm_actual: number
          r_vpm_base: number
          r_zona: string
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
        Args: { dias_atras: number; p_hasta?: string }
        Returns: {
          estado_salud: string
          inventario_total: number
          semanas_inventario: number
          tienda: string
          tipo: string
          venta_promedio_semanal: number
        }[]
      }
      reporte_same_store: {
        Args: {
          p_fecha_desde_actual?: string
          p_fecha_desde_base?: string
          p_fecha_hasta_actual?: string
          p_fecha_hasta_base?: string
        }
        Returns: {
          r_crecimiento_ventas: number
          r_crecimiento_vpm: number
          r_dimension_m2: number
          r_location_id: string
          r_nombre: string
          r_ordenes_actual: number
          r_ordenes_base: number
          r_semaforo: string
          r_ticket_actual: number
          r_ticket_base: number
          r_tipo_tienda: string
          r_ventas_actual: number
          r_ventas_base: number
          r_vpm_actual: number
          r_vpm_base: number
          r_zona: string
        }[]
      }
      reporte_tipos_venta: {
        Args: {
          dias_atras: number
          p_canal?: string
          p_hasta?: string
          p_location_id?: string
        }
        Returns: {
          pct_unidades: number
          tipo_venta: string
          unidades: number
        }[]
      }
      reporte_top_bottom_digital: {
        Args: { dias_atras: number; p_hasta?: string }
        Returns: {
          producto: string
          unidades: number
          ventas_totales: number
        }[]
      }
      reporte_top_bottom_tiendas: {
        Args: { dias_atras: number; p_hasta?: string }
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
          p_desde?: string
          p_hasta?: string
          p_limite?: number
          p_orden?: string
        }
        Returns: {
          categoria: string
          clasificacion: string
          coleccion: string
          foto: string
          pct_descuento: number
          pct_full_price: number
          pct_rebajas: number
          producto: string
          sku: string
          stock_online: number
          stock_standby: number
          stock_tiendas: number
          stock_venta_directa: number
          tiendas: number
          und_digital: number
          und_outlets: number
          und_tiendas: number
          und_total: number
          venta_neta: number
        }[]
      }
      reporte_ventas_diarias: {
        Args: {
          p_canal?: string
          p_desde: string
          p_hasta: string
          p_location_id?: string
          p_zona?: string
        }
        Returns: {
          dia: string
          ingresos_netos: number
          ordenes: number
          unidades: number
        }[]
      }
      reporte_ventas_por_canal: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          canal: string
          ingresos_netos: number
          ordenes: number
          unidades: number
        }[]
      }
      reporte_ventas_por_vendedor: {
        Args: {
          p_anio: number
          p_location_id?: string
          p_mes: number
          p_zona?: string
        }
        Returns: {
          nombre_vendedor: string
          pct_activaciones: number
          pct_cumplimiento: number
          pct_full_price: number
          pct_rebajas: number
          presupuesto: number
          rol: string
          shopify_user_id: string
          ticket_promedio: number
          tienda: string
          tipo_contrato: string
          total_pedidos: number
          unidades_vendidas: number
          upt: number
          venta_bruta: number
          venta_neta: number
        }[]
      }
      reporte_wos_categoria_global: {
        Args: {
          dias_atras: number
          p_hasta?: string
          p_location_ids?: string[]
        }
        Returns: {
          categoria: string
          estado_salud: string
          inventario_total: number
          location_id: string
          pct_full_price: number
          pct_rebajado: number
          semanas_inventario: number
          tienda: string
          venta_promedio_semanal: number
        }[]
      }
      reporte_wos_categoria_tienda: {
        Args: { dias_atras: number; p_hasta?: string; p_location_id: string }
        Returns: {
          categoria: string
          estado_salud: string
          inventario_total: number
          semanas_inventario: number
          venta_promedio_semanal: number
        }[]
      }
      rpc_inv_ejec_alertas: {
        Args: { p_fecha?: string }
        Returns: {
          codigo: string
          detalle: string
          severidad: string
          valor: number
        }[]
      }
      rpc_inv_ejec_fechas: {
        Args: never
        Returns: {
          filas: number
          snapshot_anterior: string
          snapshot_date: string
          tiene_costo: boolean
        }[]
      }
      rpc_inv_ejec_kpis: {
        Args: { p_fecha?: string; p_sub_tipos?: string[] }
        Returns: {
          bodegas: number
          costo_actual: number
          costo_anterior: number
          costo_unit_prom: number
          fecha: string
          fecha_anterior: string
          lineas: number
          skus: number
          uds_actual: number
          uds_anterior: number
          var_costo: number
          var_uds: number
        }[]
      }
      rpc_inv_ejec_linea_detalle: {
        Args: { p_fecha?: string; p_linea: string }
        Returns: {
          bodega: string
          costo_actual: number
          tipo_bodega: string
          uds_actual: number
          uds_anterior: number
          var_pct: number
        }[]
      }
      rpc_inv_ejec_por_bodega: {
        Args: { p_fecha?: string; p_sub_tipos?: string[]; p_tipos?: string[] }
        Returns: {
          bodega: string
          costo_actual: number
          costo_anterior: number
          costo_unit_prom: number
          en_traslados: boolean
          part_costo: number
          part_uds: number
          tipo_bodega: string
          uds_actual: number
          uds_anterior: number
          var_costo: number
          var_uds: number
        }[]
      }
      rpc_inv_ejec_por_linea: {
        Args: { p_fecha?: string; p_min_uds?: number; p_sub_tipos?: string[] }
        Returns: {
          costo_actual: number
          costo_unit_prom: number
          delta_uds: number
          fuente_ingreso: string
          ingreso_prov_costo: number
          ingreso_prov_uds: number
          linea: string
          part_costo: number
          salida_neta_uds: number
          sub_tipo: string
          uds_actual: number
          uds_anterior: number
          var_pct: number
        }[]
      }
      sincronizar_params_desde_tipo_tienda: { Args: never; Returns: number }
      snapshot_proyecciones_diario: { Args: never; Returns: number }
      stock_general_por_producto: {
        Args: never
        Returns: {
          product_id: string
          stock_total: number
        }[]
      }
      stock_insumos_agregado: {
        Args: never
        Returns: {
          sku: string
          stock_total: number
          titulo: string
        }[]
      }
      top_productos_tienda: {
        Args: { p_clave: string; p_dias?: number; p_limite?: number }
        Returns: {
          image_url: string
          linea: string
          pct_full: number
          producto: string
          unidades: number
          venta: number
        }[]
      }
      top5_articulos_hoy: { Args: { p_fecha?: string }; Returns: Json }
      upsert_product_catalog_safe: {
        Args: { products_json: Json }
        Returns: undefined
      }
      user_has_permission: {
        Args: { p_action_key: string; p_module_key: string; p_user_id: string }
        Returns: boolean
      }
      whatsapp_acumulado_digital: {
        Args: { p_fecha?: string }
        Returns: {
          pct_cumpl: number
          presupuesto: number
          sub_canal: string
          venta: number
        }[]
      }
      whatsapp_acumulado_tiendas: {
        Args: { p_fecha?: string }
        Returns: {
          ciudad: string
          es_outlet: boolean
          pct_cumpl: number
          presupuesto: number
          tienda: string
          venta: number
          zona: string
        }[]
      }
      whatsapp_cumplimiento_mes: {
        Args: { p_fecha?: string; p_zona?: string }
        Returns: {
          cierre_conservador: number
          cierre_optimista: number
          cierre_probable: number
          dias_mes: number
          dias_transcurridos: number
          nombre: string
          pct_cumpl: number
          presupuesto_fecha: number
          presupuesto_mes: number
          ticket: number
          tipo: string
          transacciones: number
          unidades: number
          venta: number
          zona: string
        }[]
      }
      whatsapp_detalle_tienda: {
        Args: { p_busqueda: string; p_fecha?: string; p_limite?: number }
        Returns: {
          linea: string
          pct_full: number
          producto: string
          tienda: string
          transacciones: number
          unidades: number
          venta: number
        }[]
      }
      whatsapp_mover_ya: {
        Args: { p_limite?: number }
        Returns: {
          disponible: number
          image_url: string
          linea: string
          producto: string
          ritmo_semanal: number
          semanas_cobertura: number
          stand_by: number
          tiendas_agotadas: number
          tiendas_vendiendo: number
        }[]
      }
      whatsapp_proyeccion_accionable: {
        Args: { p_fecha?: string }
        Returns: {
          accionable: string
          brecha: number
          cierre_conservador: number
          cierre_optimista: number
          cierre_probable: number
          dias_mes: number
          dias_transcurridos: number
          nombre: string
          pct_cierre: number
          pct_descuento: number
          presupuesto: number
          tendencia: number
          ticket: number
          ticket_nal: number
          tipo: string
          upt: number
          upt_nal: number
          venta: number
          zona: string
        }[]
      }
      whatsapp_resumen_traslados: {
        Args: never
        Returns: {
          agotadas: number
          ciudad: string
          dias: number
          lineas: number
          tienda: string
          unidades: number
        }[]
      }
      whatsapp_totales_dia: {
        Args: { p_fecha?: string }
        Returns: {
          dias_mes: number
          dias_transcurridos: number
          fecha: string
          pct_acum: number
          pct_dia: number
          presupuesto_acum: number
          presupuesto_dia: number
          venta_acum: number
          venta_dia: number
        }[]
      }
      whatsapp_ventas_zona: {
        Args: { p_fecha?: string }
        Returns: {
          ciudad: string
          neta: number
          pct_cumpl: number
          presupuesto_dia: number
          tienda: string
          uds: number
          zona: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
