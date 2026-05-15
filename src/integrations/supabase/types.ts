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
        ]
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
          tipo_pago: string
          tope_maximo: number | null
          tope_minimo: number | null
          valor: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          incentivo_id: string
          tipo_pago: string
          tope_maximo?: number | null
          tope_minimo?: number | null
          valor: number
        }
        Update: {
          created_at?: string | null
          id?: string
          incentivo_id?: string
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
          id: string
          location_name: string
          stamped_at: string
        }
        Insert: {
          active?: boolean
          id?: string
          location_name: string
          stamped_at?: string
        }
        Update: {
          active?: boolean
          id?: string
          location_name?: string
          stamped_at?: string
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
      cruzar_addi_con_shopify: { Args: never; Returns: undefined }
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
      obtener_siguiente_consecutivo: {
        Args: { p_origen_netsuite_id: number }
        Returns: number
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
      reporte_comportamiento_producto:
        | {
            Args: {
              dias_atras: number
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
        | {
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
      reporte_composicion_coleccion:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_location_id?: string
              p_zona?: string
            }
            Returns: {
              coleccion: string
              unidades: number
            }[]
          }
        | {
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
      reporte_composicion_coleccion_linea:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_location_id?: string
              p_zona?: string
            }
            Returns: {
              categoria: string
              coleccion: string
              unidades: number
            }[]
          }
        | {
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
      reporte_cumplimiento_whatsapp: {
        Args: { p_fecha?: string }
        Returns: Json
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
      reporte_curva_traslados:
        | {
            Args: { dias_atras?: number; p_destino?: string; p_origen?: string }
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
        | {
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
      reporte_desempeño_comercial:
        | {
            Args: { dias_atras: number }
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
        | {
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
      reporte_desempeño_por_canal:
        | {
            Args: { dias_atras: number }
            Returns: {
              canal: string
              total_pedidos: number
              ventas_totales: number
            }[]
          }
        | {
            Args: { dias_atras: number; p_hasta?: string }
            Returns: {
              canal: string
              total_pedidos: number
              ventas_totales: number
            }[]
          }
      reporte_desempeno_por_linea:
        | {
            Args: { dias_atras: number; p_canal?: string; p_categoria?: string }
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
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_categoria?: string
              p_hasta?: string
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
      reporte_detalle_producto_tiendas:
        | {
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
        | {
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
      reporte_detalle_skus_producto:
        | {
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
              talla: string
              unidades_vendidas: number
              wos: number
            }[]
          }
        | {
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
      reporte_ejecutivo_kpis:
        | {
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
        | {
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
      reporte_ejecutivo_productos:
        | {
            Args: {
              canal_filtro?: string
              dias_atras: number
              limite?: number
              location_filtro?: string
              orden?: string
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
        | {
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
      reporte_kpis_comerciales:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
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
        | {
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
      reporte_kpis_periodo_anterior:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
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
        | {
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
      reporte_metricas_tienda_individual:
        | {
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
        | {
            Args: {
              dias_atras: number
              p_hasta?: string
              p_location_id: string
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
      reporte_metricas_zona:
        | {
            Args: { dias_atras: number; p_canal?: string; p_zona?: string }
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
        | {
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
      reporte_pareto_categorias:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_location_id?: string
            }
            Returns: {
              categoria: string
              ingresos: number
              pct_participacion: number
              unidades: number
            }[]
          }
        | {
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
      reporte_pct_ventas_por_tipo:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
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
        | {
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
      reporte_pedidos_por_tipo_venta:
        | {
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
        | {
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
      reporte_productos_por_categoria:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_categoria?: string
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
        | {
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
      reporte_ranking_tiendas:
        | {
            Args: { dias_atras: number; p_canal?: string }
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
        | {
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
      reporte_ranking_tiendas_anterior:
        | {
            Args: { dias_atras: number; p_canal?: string }
            Returns: {
              pct_venta_full_price: number
              ticket_promedio: number
              tienda: string
              unidades_vendidas: number
              upt: number
              ventas_totales: number
            }[]
          }
        | {
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
      reporte_salud_inventario:
        | {
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
        | {
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
      reporte_sugerencias_traslado:
        | {
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
        | {
            Args: { dias_atras: number; p_hasta?: string }
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
      reporte_tipos_venta:
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_location_id?: string
            }
            Returns: {
              pct_unidades: number
              tipo_venta: string
              unidades: number
            }[]
          }
        | {
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
      reporte_top_bottom_digital:
        | {
            Args: { dias_atras: number }
            Returns: {
              producto: string
              unidades: number
              ventas_totales: number
            }[]
          }
        | {
            Args: { dias_atras: number; p_hasta?: string }
            Returns: {
              producto: string
              unidades: number
              ventas_totales: number
            }[]
          }
      reporte_top_bottom_tiendas:
        | {
            Args: { dias_atras: number }
            Returns: {
              tienda: string
              unidades: number
              ventas_totales: number
            }[]
          }
        | {
            Args: { dias_atras: number; p_hasta?: string }
            Returns: {
              tienda: string
              unidades: number
              ventas_totales: number
            }[]
          }
      reporte_top_productos_global:
        | {
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
              coleccion: string
              foto: string
              pct_descuento: number
              pct_full_price: number
              pct_rebajas: number
              producto: string
              sku: string
              stock_venta_directa: number
              und_digital: number
              und_outlets: number
              und_tiendas: number
              und_total: number
            }[]
          }
        | {
            Args: {
              dias_atras: number
              p_canal?: string
              p_categoria?: string
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
              stock_venta_directa: number
              und_digital: number
              und_outlets: number
              und_tiendas: number
              und_total: number
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
      reporte_wos_categoria_global:
        | {
            Args: { dias_atras: number; p_location_ids?: string[] }
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
        | {
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
      reporte_wos_categoria_tienda:
        | {
            Args: { dias_atras: number; p_location_id: string }
            Returns: {
              categoria: string
              estado_salud: string
              inventario_total: number
              semanas_inventario: number
              venta_promedio_semanal: number
            }[]
          }
        | {
            Args: {
              dias_atras: number
              p_hasta?: string
              p_location_id: string
            }
            Returns: {
              categoria: string
              estado_salud: string
              inventario_total: number
              semanas_inventario: number
              venta_promedio_semanal: number
            }[]
          }
      sincronizar_params_desde_tipo_tienda: { Args: never; Returns: number }
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
      top5_articulos_hoy: { Args: { p_fecha?: string }; Returns: Json }
      upsert_product_catalog_safe: {
        Args: { products_json: Json }
        Returns: undefined
      }
      user_has_permission: {
        Args: { p_action_key: string; p_module_key: string; p_user_id: string }
        Returns: boolean
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
