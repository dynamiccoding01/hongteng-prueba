// ARCHIVO GENERADO — no editar a mano.
// Regenerar con: npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      _migracion_aplicada: {
        Row: {
          aplicada_en: string;
          nombre: string;
        };
        Insert: {
          aplicada_en?: string;
          nombre: string;
        };
        Update: {
          aplicada_en?: string;
          nombre?: string;
        };
        Relationships: [];
      };
      bitacora: {
        Row: {
          accion: string;
          campos_modificados: string[] | null;
          created_at: string;
          datos_antes: Json | null;
          datos_despues: Json | null;
          descripcion: string | null;
          id: number;
          ip: unknown;
          modulo: string | null;
          registro_id: string | null;
          tabla: string | null;
          user_agent: string | null;
          usuario_email: string;
          usuario_id: string | null;
        };
        Insert: {
          accion: string;
          campos_modificados?: string[] | null;
          created_at?: string;
          datos_antes?: Json | null;
          datos_despues?: Json | null;
          descripcion?: string | null;
          id?: never;
          ip?: unknown;
          modulo?: string | null;
          registro_id?: string | null;
          tabla?: string | null;
          user_agent?: string | null;
          usuario_email?: string;
          usuario_id?: string | null;
        };
        Update: {
          accion?: string;
          campos_modificados?: string[] | null;
          created_at?: string;
          datos_antes?: Json | null;
          datos_despues?: Json | null;
          descripcion?: string | null;
          id?: never;
          ip?: unknown;
          modulo?: string | null;
          registro_id?: string | null;
          tabla?: string | null;
          user_agent?: string | null;
          usuario_email?: string;
          usuario_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bitacora_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
        ];
      };
      bodega: {
        Row: {
          activo: boolean;
          codigo: string;
          created_at: string;
          direccion: string | null;
          id: number;
          nombre: string;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          codigo: string;
          created_at?: string;
          direccion?: string | null;
          id?: never;
          nombre: string;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          codigo?: string;
          created_at?: string;
          direccion?: string | null;
          id?: never;
          nombre?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categoria: {
        Row: {
          activo: boolean;
          codigo: string;
          created_at: string;
          id: number;
          nombre_es: string;
          nombre_zh: string | null;
          unidad_medida_default: Database['public']['Enums']['unidad_medida'];
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          codigo: string;
          created_at?: string;
          id?: never;
          nombre_es: string;
          nombre_zh?: string | null;
          unidad_medida_default?: Database['public']['Enums']['unidad_medida'];
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          codigo?: string;
          created_at?: string;
          id?: never;
          nombre_es?: string;
          nombre_zh?: string | null;
          unidad_medida_default?: Database['public']['Enums']['unidad_medida'];
          updated_at?: string;
        };
        Relationships: [];
      };
      cliente: {
        Row: {
          activo: boolean;
          ciudad: string | null;
          codigo: string;
          contacto: string | null;
          created_at: string;
          direccion: string | null;
          email: string | null;
          id: number;
          lista_precio_id: number | null;
          nombre: string;
          notas: string | null;
          pais: string;
          rut: string | null;
          telefono: string | null;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          ciudad?: string | null;
          codigo: string;
          contacto?: string | null;
          created_at?: string;
          direccion?: string | null;
          email?: string | null;
          id?: never;
          lista_precio_id?: number | null;
          nombre: string;
          notas?: string | null;
          pais?: string;
          rut?: string | null;
          telefono?: string | null;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          ciudad?: string | null;
          codigo?: string;
          contacto?: string | null;
          created_at?: string;
          direccion?: string | null;
          email?: string | null;
          id?: never;
          lista_precio_id?: number | null;
          nombre?: string;
          notas?: string | null;
          pais?: string;
          rut?: string | null;
          telefono?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cliente_lista_precio_id_fkey';
            columns: ['lista_precio_id'];
            isOneToOne: false;
            referencedRelation: 'lista_precio';
            referencedColumns: ['id'];
          },
        ];
      };
      correlativo: {
        Row: {
          anio: number;
          id: number;
          tipo_documento: string;
          ultimo_numero: number;
        };
        Insert: {
          anio: number;
          id?: never;
          tipo_documento: string;
          ultimo_numero?: number;
        };
        Update: {
          anio?: number;
          id?: never;
          tipo_documento?: string;
          ultimo_numero?: number;
        };
        Relationships: [];
      };
      documento_traspaso: {
        Row: {
          adquiriente_nombre: string;
          adquiriente_rut: string | null;
          anulado_en: string | null;
          anulado_por: string | null;
          created_at: string;
          destino: string | null;
          emitido_por: string | null;
          estado: string;
          fecha: string;
          folio: string;
          id: number;
          observaciones: string | null;
          procedencia: string;
          venta_id: number;
        };
        Insert: {
          adquiriente_nombre: string;
          adquiriente_rut?: string | null;
          anulado_en?: string | null;
          anulado_por?: string | null;
          created_at?: string;
          destino?: string | null;
          emitido_por?: string | null;
          estado?: string;
          fecha?: string;
          folio: string;
          id?: never;
          observaciones?: string | null;
          procedencia?: string;
          venta_id: number;
        };
        Update: {
          adquiriente_nombre?: string;
          adquiriente_rut?: string | null;
          anulado_en?: string | null;
          anulado_por?: string | null;
          created_at?: string;
          destino?: string | null;
          emitido_por?: string | null;
          estado?: string;
          fecha?: string;
          folio?: string;
          id?: never;
          observaciones?: string | null;
          procedencia?: string;
          venta_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'documento_traspaso_anulado_por_fkey';
            columns: ['anulado_por'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documento_traspaso_emitido_por_fkey';
            columns: ['emitido_por'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documento_traspaso_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: true;
            referencedRelation: 'v_comisiones';
            referencedColumns: ['venta_id'];
          },
          {
            foreignKeyName: 'documento_traspaso_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: true;
            referencedRelation: 'v_ventas_detalle';
            referencedColumns: ['venta_id'];
          },
          {
            foreignKeyName: 'documento_traspaso_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: true;
            referencedRelation: 'venta';
            referencedColumns: ['id'];
          },
        ];
      };
      empresa: {
        Row: {
          ciudad: string | null;
          direccion: string | null;
          email: string | null;
          giro: string | null;
          id: number;
          razon_social: string;
          rut: string | null;
          telefono: string | null;
          updated_at: string;
        };
        Insert: {
          ciudad?: string | null;
          direccion?: string | null;
          email?: string | null;
          giro?: string | null;
          id?: number;
          razon_social: string;
          rut?: string | null;
          telefono?: string | null;
          updated_at?: string;
        };
        Update: {
          ciudad?: string | null;
          direccion?: string | null;
          email?: string | null;
          giro?: string | null;
          id?: number;
          razon_social?: string;
          rut?: string | null;
          telefono?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      importacion: {
        Row: {
          confirmada_en: string | null;
          confirmada_por: string | null;
          created_at: string;
          documento_aduana: string | null;
          estado: string;
          fecha: string;
          id: number;
          moneda_id: number;
          notas: string | null;
          proveedor_id: number;
          tipo_cambio: number | null;
          updated_at: string;
        };
        Insert: {
          confirmada_en?: string | null;
          confirmada_por?: string | null;
          created_at?: string;
          documento_aduana?: string | null;
          estado?: string;
          fecha?: string;
          id?: never;
          moneda_id: number;
          notas?: string | null;
          proveedor_id: number;
          tipo_cambio?: number | null;
          updated_at?: string;
        };
        Update: {
          confirmada_en?: string | null;
          confirmada_por?: string | null;
          created_at?: string;
          documento_aduana?: string | null;
          estado?: string;
          fecha?: string;
          id?: never;
          moneda_id?: number;
          notas?: string | null;
          proveedor_id?: number;
          tipo_cambio?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'importacion_confirmada_por_fkey';
            columns: ['confirmada_por'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'importacion_moneda_id_fkey';
            columns: ['moneda_id'];
            isOneToOne: false;
            referencedRelation: 'moneda';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'importacion_proveedor_id_fkey';
            columns: ['proveedor_id'];
            isOneToOne: false;
            referencedRelation: 'proveedor';
            referencedColumns: ['id'];
          },
        ];
      };
      importacion_detalle: {
        Row: {
          cajas: number;
          costo_caja: number | null;
          created_at: string;
          id: number;
          importacion_id: number;
          variante_id: number;
          zona_id: number;
        };
        Insert: {
          cajas: number;
          costo_caja?: number | null;
          created_at?: string;
          id?: never;
          importacion_id: number;
          variante_id: number;
          zona_id: number;
        };
        Update: {
          cajas?: number;
          costo_caja?: number | null;
          created_at?: string;
          id?: never;
          importacion_id?: number;
          variante_id?: number;
          zona_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'importacion_detalle_importacion_id_fkey';
            columns: ['importacion_id'];
            isOneToOne: false;
            referencedRelation: 'importacion';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'importacion_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'importacion_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'importacion_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'importacion_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'importacion_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'importacion_detalle_zona_id_fkey';
            columns: ['zona_id'];
            isOneToOne: false;
            referencedRelation: 'zona';
            referencedColumns: ['id'];
          },
        ];
      };
      lista_precio: {
        Row: {
          activo: boolean;
          created_at: string;
          id: number;
          moneda_id: number;
          nombre: string;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          created_at?: string;
          id?: never;
          moneda_id: number;
          nombre: string;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          created_at?: string;
          id?: never;
          moneda_id?: number;
          nombre?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lista_precio_moneda_id_fkey';
            columns: ['moneda_id'];
            isOneToOne: false;
            referencedRelation: 'moneda';
            referencedColumns: ['id'];
          },
        ];
      };
      lista_precio_item: {
        Row: {
          created_at: string;
          id: number;
          lista_id: number;
          precio_caja: number;
          updated_at: string;
          variante_id: number;
        };
        Insert: {
          created_at?: string;
          id?: never;
          lista_id: number;
          precio_caja: number;
          updated_at?: string;
          variante_id: number;
        };
        Update: {
          created_at?: string;
          id?: never;
          lista_id?: number;
          precio_caja?: number;
          updated_at?: string;
          variante_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'lista_precio_item_lista_id_fkey';
            columns: ['lista_id'];
            isOneToOne: false;
            referencedRelation: 'lista_precio';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lista_precio_item_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lista_precio_item_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'lista_precio_item_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'lista_precio_item_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'lista_precio_item_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
        ];
      };
      moneda: {
        Row: {
          activo: boolean;
          codigo: string;
          decimales: number;
          id: number;
          nombre: string;
          simbolo: string | null;
        };
        Insert: {
          activo?: boolean;
          codigo: string;
          decimales?: number;
          id?: never;
          nombre: string;
          simbolo?: string | null;
        };
        Update: {
          activo?: boolean;
          codigo?: string;
          decimales?: number;
          id?: never;
          nombre?: string;
          simbolo?: string | null;
        };
        Relationships: [];
      };
      movimiento: {
        Row: {
          anulado_por: number | null;
          cajas: number;
          created_at: string;
          documento_id: number | null;
          documento_tipo: string | null;
          fecha: string;
          id: number;
          motivo: string | null;
          saldo_cajas: number;
          tipo: Database['public']['Enums']['tipo_movimiento'];
          unidades: number;
          usuario_id: string | null;
          variante_id: number;
          zona_id: number;
        };
        Insert: {
          anulado_por?: number | null;
          cajas: number;
          created_at?: string;
          documento_id?: number | null;
          documento_tipo?: string | null;
          fecha?: string;
          id?: never;
          motivo?: string | null;
          saldo_cajas?: number;
          tipo: Database['public']['Enums']['tipo_movimiento'];
          unidades?: number;
          usuario_id?: string | null;
          variante_id: number;
          zona_id: number;
        };
        Update: {
          anulado_por?: number | null;
          cajas?: number;
          created_at?: string;
          documento_id?: number | null;
          documento_tipo?: string | null;
          fecha?: string;
          id?: never;
          motivo?: string | null;
          saldo_cajas?: number;
          tipo?: Database['public']['Enums']['tipo_movimiento'];
          unidades?: number;
          usuario_id?: string | null;
          variante_id?: number;
          zona_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'movimiento_anulado_por_fkey';
            columns: ['anulado_por'];
            isOneToOne: false;
            referencedRelation: 'movimiento';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'movimiento_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'movimiento_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'movimiento_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'movimiento_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'movimiento_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'movimiento_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'movimiento_zona_id_fkey';
            columns: ['zona_id'];
            isOneToOne: false;
            referencedRelation: 'zona';
            referencedColumns: ['id'];
          },
        ];
      };
      permiso: {
        Row: {
          codigo: string;
          created_at: string;
          descripcion: string;
          id: number;
          modulo: string;
        };
        Insert: {
          codigo: string;
          created_at?: string;
          descripcion: string;
          id?: never;
          modulo: string;
        };
        Update: {
          codigo?: string;
          created_at?: string;
          descripcion?: string;
          id?: never;
          modulo?: string;
        };
        Relationships: [];
      };
      producto: {
        Row: {
          activo: boolean;
          categoria_id: number;
          codigo: string;
          created_at: string;
          created_by: string | null;
          descripcion_es: string | null;
          descripcion_zh: string | null;
          genero: string | null;
          id: number;
          imagen_url: string | null;
          marca: string | null;
          observacion: string | null;
          proveedor_id: number | null;
          rango_tallas: string | null;
          talla_desde: string | null;
          talla_hasta: string | null;
          temporada: string | null;
          unidad_medida: Database['public']['Enums']['unidad_medida'];
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          activo?: boolean;
          categoria_id: number;
          codigo: string;
          created_at?: string;
          created_by?: string | null;
          descripcion_es?: string | null;
          descripcion_zh?: string | null;
          genero?: string | null;
          id?: never;
          imagen_url?: string | null;
          marca?: string | null;
          observacion?: string | null;
          proveedor_id?: number | null;
          rango_tallas?: string | null;
          talla_desde?: string | null;
          talla_hasta?: string | null;
          temporada?: string | null;
          unidad_medida?: Database['public']['Enums']['unidad_medida'];
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          activo?: boolean;
          categoria_id?: number;
          codigo?: string;
          created_at?: string;
          created_by?: string | null;
          descripcion_es?: string | null;
          descripcion_zh?: string | null;
          genero?: string | null;
          id?: never;
          imagen_url?: string | null;
          marca?: string | null;
          observacion?: string | null;
          proveedor_id?: number | null;
          rango_tallas?: string | null;
          talla_desde?: string | null;
          talla_hasta?: string | null;
          temporada?: string | null;
          unidad_medida?: Database['public']['Enums']['unidad_medida'];
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'producto_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categoria';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producto_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'v_resumen_categoria';
            referencedColumns: ['categoria_id'];
          },
          {
            foreignKeyName: 'producto_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producto_proveedor_id_fkey';
            columns: ['proveedor_id'];
            isOneToOne: false;
            referencedRelation: 'proveedor';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producto_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
        ];
      };
      producto_variante: {
        Row: {
          activo: boolean;
          codigo_barras: string | null;
          created_at: string;
          id: number;
          producto_id: number;
          sku_interno: string | null;
          stock_minimo: number;
          unidades_por_caja: number;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          codigo_barras?: string | null;
          created_at?: string;
          id?: never;
          producto_id: number;
          sku_interno?: string | null;
          stock_minimo?: number;
          unidades_por_caja: number;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          codigo_barras?: string | null;
          created_at?: string;
          id?: never;
          producto_id?: number;
          sku_interno?: string | null;
          stock_minimo?: number;
          unidades_por_caja?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'producto_variante_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'producto';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'producto_variante_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['producto_id'];
          },
        ];
      };
      proveedor: {
        Row: {
          activo: boolean;
          codigo: string;
          contacto: string | null;
          created_at: string;
          direccion: string | null;
          email: string | null;
          id: number;
          nombre: string;
          nombre_zh: string | null;
          pais: string;
          telefono: string | null;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          codigo: string;
          contacto?: string | null;
          created_at?: string;
          direccion?: string | null;
          email?: string | null;
          id?: never;
          nombre: string;
          nombre_zh?: string | null;
          pais?: string;
          telefono?: string | null;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          codigo?: string;
          contacto?: string | null;
          created_at?: string;
          direccion?: string | null;
          email?: string | null;
          id?: never;
          nombre?: string;
          nombre_zh?: string | null;
          pais?: string;
          telefono?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rol: {
        Row: {
          activo: boolean;
          created_at: string;
          descripcion: string | null;
          id: number;
          nombre: string;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          created_at?: string;
          descripcion?: string | null;
          id?: never;
          nombre: string;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          created_at?: string;
          descripcion?: string | null;
          id?: never;
          nombre?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rol_permiso: {
        Row: {
          created_at: string;
          permiso_id: number;
          rol_id: number;
        };
        Insert: {
          created_at?: string;
          permiso_id: number;
          rol_id: number;
        };
        Update: {
          created_at?: string;
          permiso_id?: number;
          rol_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rol_permiso_permiso_id_fkey';
            columns: ['permiso_id'];
            isOneToOne: false;
            referencedRelation: 'permiso';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rol_permiso_rol_id_fkey';
            columns: ['rol_id'];
            isOneToOne: false;
            referencedRelation: 'rol';
            referencedColumns: ['id'];
          },
        ];
      };
      stock: {
        Row: {
          cajas: number;
          id: number;
          unidades: number;
          updated_at: string;
          variante_id: number;
          zona_id: number;
        };
        Insert: {
          cajas?: number;
          id?: never;
          unidades?: number;
          updated_at?: string;
          variante_id: number;
          zona_id: number;
        };
        Update: {
          cajas?: number;
          id?: never;
          unidades?: number;
          updated_at?: string;
          variante_id?: number;
          zona_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'stock_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'stock_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'stock_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'stock_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'stock_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'stock_zona_id_fkey';
            columns: ['zona_id'];
            isOneToOne: false;
            referencedRelation: 'zona';
            referencedColumns: ['id'];
          },
        ];
      };
      tipo_cambio: {
        Row: {
          created_at: string;
          fecha: string;
          fuente: string | null;
          id: number;
          moneda_id: number;
          valor: number;
        };
        Insert: {
          created_at?: string;
          fecha: string;
          fuente?: string | null;
          id?: never;
          moneda_id: number;
          valor: number;
        };
        Update: {
          created_at?: string;
          fecha?: string;
          fuente?: string | null;
          id?: never;
          moneda_id?: number;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tipo_cambio_moneda_id_fkey';
            columns: ['moneda_id'];
            isOneToOne: false;
            referencedRelation: 'moneda';
            referencedColumns: ['id'];
          },
        ];
      };
      toma_inventario: {
        Row: {
          aplicada_en: string | null;
          aplicada_por: string | null;
          bodega_id: number;
          created_at: string;
          estado: string;
          fecha: string;
          id: number;
          notas: string | null;
          updated_at: string;
        };
        Insert: {
          aplicada_en?: string | null;
          aplicada_por?: string | null;
          bodega_id: number;
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: never;
          notas?: string | null;
          updated_at?: string;
        };
        Update: {
          aplicada_en?: string | null;
          aplicada_por?: string | null;
          bodega_id?: number;
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: never;
          notas?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'toma_inventario_aplicada_por_fkey';
            columns: ['aplicada_por'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'toma_inventario_bodega_id_fkey';
            columns: ['bodega_id'];
            isOneToOne: false;
            referencedRelation: 'bodega';
            referencedColumns: ['id'];
          },
        ];
      };
      toma_inventario_detalle: {
        Row: {
          cajas_contadas: number;
          created_at: string;
          id: number;
          toma_id: number;
          variante_id: number;
          zona_id: number;
        };
        Insert: {
          cajas_contadas: number;
          created_at?: string;
          id?: never;
          toma_id: number;
          variante_id: number;
          zona_id: number;
        };
        Update: {
          cajas_contadas?: number;
          created_at?: string;
          id?: never;
          toma_id?: number;
          variante_id?: number;
          zona_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'toma_inventario_detalle_toma_id_fkey';
            columns: ['toma_id'];
            isOneToOne: false;
            referencedRelation: 'toma_inventario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'toma_inventario_detalle_zona_id_fkey';
            columns: ['zona_id'];
            isOneToOne: false;
            referencedRelation: 'zona';
            referencedColumns: ['id'];
          },
        ];
      };
      ubicacion_zeta: {
        Row: {
          activo: boolean;
          codigo: string;
          descripcion: string | null;
          id: number;
        };
        Insert: {
          activo?: boolean;
          codigo: string;
          descripcion?: string | null;
          id?: never;
        };
        Update: {
          activo?: boolean;
          codigo?: string;
          descripcion?: string | null;
          id?: never;
        };
        Relationships: [];
      };
      usuario: {
        Row: {
          activo: boolean;
          created_at: string;
          email: string;
          id: string;
          nombre: string;
          rol_id: number;
          ultimo_acceso: string | null;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          created_at?: string;
          email: string;
          id: string;
          nombre: string;
          rol_id: number;
          ultimo_acceso?: string | null;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          created_at?: string;
          email?: string;
          id?: string;
          nombre?: string;
          rol_id?: number;
          ultimo_acceso?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'usuario_rol_id_fkey';
            columns: ['rol_id'];
            isOneToOne: false;
            referencedRelation: 'rol';
            referencedColumns: ['id'];
          },
        ];
      };
      vendedor: {
        Row: {
          activo: boolean;
          created_at: string;
          id: number;
          porcentaje_comision: number;
          updated_at: string;
          usuario_id: string;
        };
        Insert: {
          activo?: boolean;
          created_at?: string;
          id?: never;
          porcentaje_comision?: number;
          updated_at?: string;
          usuario_id: string;
        };
        Update: {
          activo?: boolean;
          created_at?: string;
          id?: never;
          porcentaje_comision?: number;
          updated_at?: string;
          usuario_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendedor_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: true;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
        ];
      };
      venta: {
        Row: {
          cliente_id: number;
          comision_clp: number | null;
          comision_porcentaje: number | null;
          confirmada_en: string | null;
          confirmada_por: string | null;
          created_at: string;
          estado: string;
          fecha: string;
          id: number;
          moneda_id: number;
          notas: string | null;
          tipo_cambio: number | null;
          updated_at: string;
          vendedor_id: number | null;
        };
        Insert: {
          cliente_id: number;
          comision_clp?: number | null;
          comision_porcentaje?: number | null;
          confirmada_en?: string | null;
          confirmada_por?: string | null;
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: never;
          moneda_id: number;
          notas?: string | null;
          tipo_cambio?: number | null;
          updated_at?: string;
          vendedor_id?: number | null;
        };
        Update: {
          cliente_id?: number;
          comision_clp?: number | null;
          comision_porcentaje?: number | null;
          confirmada_en?: string | null;
          confirmada_por?: string | null;
          created_at?: string;
          estado?: string;
          fecha?: string;
          id?: never;
          moneda_id?: number;
          notas?: string | null;
          tipo_cambio?: number | null;
          updated_at?: string;
          vendedor_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'venta_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'cliente';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venta_cliente_id_fkey';
            columns: ['cliente_id'];
            isOneToOne: false;
            referencedRelation: 'v_ventas_detalle';
            referencedColumns: ['cliente_id'];
          },
          {
            foreignKeyName: 'venta_confirmada_por_fkey';
            columns: ['confirmada_por'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venta_moneda_id_fkey';
            columns: ['moneda_id'];
            isOneToOne: false;
            referencedRelation: 'moneda';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venta_vendedor_id_fkey';
            columns: ['vendedor_id'];
            isOneToOne: false;
            referencedRelation: 'v_comisiones';
            referencedColumns: ['vendedor_id'];
          },
          {
            foreignKeyName: 'venta_vendedor_id_fkey';
            columns: ['vendedor_id'];
            isOneToOne: false;
            referencedRelation: 'vendedor';
            referencedColumns: ['id'];
          },
        ];
      };
      venta_detalle: {
        Row: {
          cajas: number;
          created_at: string;
          id: number;
          precio_caja: number | null;
          variante_id: number;
          venta_id: number;
          zona_id: number;
        };
        Insert: {
          cajas: number;
          created_at?: string;
          id?: never;
          precio_caja?: number | null;
          variante_id: number;
          venta_id: number;
          zona_id: number;
        };
        Update: {
          cajas?: number;
          created_at?: string;
          id?: never;
          precio_caja?: number | null;
          variante_id?: number;
          venta_id?: number;
          zona_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'venta_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'producto_variante';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venta_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_alertas_stock';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'venta_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_salidas_mensuales';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'venta_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_stock_variante';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'venta_detalle_variante_id_fkey';
            columns: ['variante_id'];
            isOneToOne: false;
            referencedRelation: 'v_valorizacion';
            referencedColumns: ['variante_id'];
          },
          {
            foreignKeyName: 'venta_detalle_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: false;
            referencedRelation: 'v_comisiones';
            referencedColumns: ['venta_id'];
          },
          {
            foreignKeyName: 'venta_detalle_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: false;
            referencedRelation: 'v_ventas_detalle';
            referencedColumns: ['venta_id'];
          },
          {
            foreignKeyName: 'venta_detalle_venta_id_fkey';
            columns: ['venta_id'];
            isOneToOne: false;
            referencedRelation: 'venta';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'venta_detalle_zona_id_fkey';
            columns: ['zona_id'];
            isOneToOne: false;
            referencedRelation: 'zona';
            referencedColumns: ['id'];
          },
        ];
      };
      zona: {
        Row: {
          activo: boolean;
          bodega_id: number;
          codigo: string;
          created_at: string;
          descripcion: string | null;
          id: number;
          updated_at: string;
        };
        Insert: {
          activo?: boolean;
          bodega_id: number;
          codigo: string;
          created_at?: string;
          descripcion?: string | null;
          id?: never;
          updated_at?: string;
        };
        Update: {
          activo?: boolean;
          bodega_id?: number;
          codigo?: string;
          created_at?: string;
          descripcion?: string | null;
          id?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'zona_bodega_id_fkey';
            columns: ['bodega_id'];
            isOneToOne: false;
            referencedRelation: 'bodega';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_alertas_stock: {
        Row: {
          cajas: number | null;
          categoria: string | null;
          codigo: string | null;
          stock_minimo: number | null;
          unidades_por_caja: number | null;
          variante_id: number | null;
        };
        Relationships: [];
      };
      v_bitacora: {
        Row: {
          accion: string | null;
          campos_modificados: string[] | null;
          created_at: string | null;
          descripcion: string | null;
          id: number | null;
          modulo: string | null;
          registro_id: string | null;
          rol: string | null;
          tabla: string | null;
          usuario_email: string | null;
          usuario_id: string | null;
          usuario_nombre: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bitacora_usuario_id_fkey';
            columns: ['usuario_id'];
            isOneToOne: false;
            referencedRelation: 'usuario';
            referencedColumns: ['id'];
          },
        ];
      };
      v_comisiones: {
        Row: {
          cliente: string | null;
          comision_clp: number | null;
          comision_porcentaje: number | null;
          fecha: string | null;
          vendedor: string | null;
          vendedor_id: number | null;
          venta_id: number | null;
        };
        Relationships: [];
      };
      v_resumen_categoria: {
        Row: {
          articulos: number | null;
          cajas: number | null;
          categoria: string | null;
          categoria_id: number | null;
          nombre_zh: string | null;
          unidades: number | null;
        };
        Relationships: [];
      };
      v_salidas_mensuales: {
        Row: {
          cajas: number | null;
          categoria: string | null;
          codigo: string | null;
          mes: string | null;
          unidades: number | null;
          unidades_por_caja: number | null;
          variante_id: number | null;
        };
        Relationships: [];
      };
      v_stock_variante: {
        Row: {
          cajas: number | null;
          categoria: string | null;
          codigo: string | null;
          producto_id: number | null;
          rango_tallas: string | null;
          unidad_medida: Database['public']['Enums']['unidad_medida'] | null;
          unidades: number | null;
          unidades_por_caja: number | null;
          variante_id: number | null;
          zonas: string | null;
        };
        Relationships: [];
      };
      v_valorizacion: {
        Row: {
          cajas: number | null;
          categoria: string | null;
          codigo: string | null;
          costo_caja: number | null;
          moneda: string | null;
          tipo_cambio: number | null;
          unidades_por_caja: number | null;
          valor_clp: number | null;
          variante_id: number | null;
        };
        Relationships: [];
      };
      v_ventas_detalle: {
        Row: {
          cajas: number | null;
          cliente: string | null;
          cliente_codigo: string | null;
          cliente_id: number | null;
          detalle_id: number | null;
          fecha: string | null;
          moneda: string | null;
          monto_clp: number | null;
          precio_caja: number | null;
          producto: string | null;
          tipo_cambio: number | null;
          unidades_por_caja: number | null;
          venta_id: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_anular_documento_traspaso: {
        Args: { p_documento_id: number; p_motivo: string };
        Returns: undefined;
      };
      fn_anular_movimiento: {
        Args: { p_motivo: string; p_movimiento_id: number };
        Returns: number;
      };
      fn_aplicar_toma_inventario: {
        Args: { p_toma_id: number };
        Returns: undefined;
      };
      fn_confirmar_importacion: {
        Args: { p_importacion_id: number };
        Returns: undefined;
      };
      fn_confirmar_venta: { Args: { p_venta_id: number }; Returns: undefined };
      fn_emitir_documento_traspaso: {
        Args: {
          p_adquiriente_nombre: string;
          p_adquiriente_rut?: string;
          p_destino?: string;
          p_observaciones?: string;
          p_venta_id: number;
        };
        Returns: number;
      };
      fn_siguiente_correlativo: {
        Args: { p_tipo_documento: string };
        Returns: string;
      };
      fn_traspasar: {
        Args: {
          p_cajas: number;
          p_motivo?: string;
          p_variante_id: number;
          p_zona_destino: number;
          p_zona_origen: number;
        };
        Returns: undefined;
      };
      mis_permisos: { Args: never; Returns: string[] };
      registrar_en_bitacora: {
        Args: {
          p_accion: string;
          p_descripcion?: string;
          p_modulo?: string;
          p_registro_id?: string;
          p_tabla?: string;
        };
        Returns: number;
      };
      tiene_permiso: { Args: { p_codigo: string }; Returns: boolean };
    };
    Enums: {
      tipo_movimiento:
        | 'ENTRADA'
        | 'SALIDA'
        | 'AJUSTE_POSITIVO'
        | 'AJUSTE_NEGATIVO'
        | 'TRASPASO_SALIDA'
        | 'TRASPASO_ENTRADA';
      unidad_medida: 'PAR' | 'PIEZA' | 'JUEGO';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      tipo_movimiento: [
        'ENTRADA',
        'SALIDA',
        'AJUSTE_POSITIVO',
        'AJUSTE_NEGATIVO',
        'TRASPASO_SALIDA',
        'TRASPASO_ENTRADA',
      ],
      unidad_medida: ['PAR', 'PIEZA', 'JUEGO'],
    },
  },
} as const;
