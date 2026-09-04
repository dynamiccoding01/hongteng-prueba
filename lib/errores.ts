import type { PostgrestError } from '@supabase/supabase-js';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

/**
 * Reglas de la base cuyo nombre sí se puede explicar en una frase.
 *
 * PostgreSQL manda el nombre del CHECK dentro del mensaje, y traducir todos los
 * CHECK a «alguno de los valores está fuera del rango permitido» deja a quien
 * digita sin saber qué corregir: es el mensaje que salía justo después de
 * escribir un subtotal, sin decir que el problema era el descuento.
 */
const REGLAS: Record<string, string> = {
  venta_detalle_descuento_ck:
    'El descuento no puede ser negativo ni pasarse del importe de la línea, y una línea sin precio va sin descuento',
  importacion_detalle_margen_ck: 'El precio de venta no puede ser menor que el costo',
  stock_cantidad_check: 'No hay existencia suficiente: la operación dejaría el stock en negativo',
  stock_total_unidades_check:
    'No hay existencia suficiente: la operación dejaría el stock en negativo',
  venta_detalle_cajas_check: 'La cantidad tiene que ser mayor que cero',
  importacion_detalle_cajas_check: 'La cantidad tiene que ser mayor que cero',
  movimiento_cajas_check: 'La cantidad del movimiento tiene que ser mayor que cero',
  venta_detalle_precio_caja_check: 'El precio por caja no puede ser negativo',
  importacion_detalle_costo_caja_check: 'El costo por caja no puede ser negativo',
  lista_precio_item_precio_caja_check: 'El precio de la lista no puede ser negativo',
  venta_tipo_cambio_check: 'El tipo de cambio de la venta tiene que ser mayor que cero',
  importacion_tipo_cambio_check: 'El tipo de cambio de la importación tiene que ser mayor que cero',
  bodega_color_ck: 'Ese color no está en la paleta del sistema',
};

/** El nombre del constraint que viene dentro del mensaje de PostgreSQL. */
function reglaIncumplida(mensaje: string): string | null {
  const encontrado = /constraint "([^"]+)"/.exec(mensaje);
  return encontrado?.[1] ?? null;
}

/** La columna que viene dentro de un error de valor nulo. */
function columnaNula(mensaje: string): string | null {
  const encontrado = /column "([^"]+)"/.exec(mensaje);
  return encontrado?.[1] ?? null;
}

/**
 * Traduce un error de PostgREST a un mensaje que le sirva al usuario.
 * Sin esto, la interfaz muestra jerga de PostgreSQL que nadie en bodega
 * puede interpretar.
 *
 * Los códigos que faltaban salían en inglés y crudos, y no eran hipotéticos:
 * `23502` es la primera venta de una instalación en la que todavía no se cargó
 * el tipo de cambio, `22003` es una cantidad que no cabe en `numeric(14,2)` y
 * `22P02` es un `?desde=hola` en la URL de un reporte.
 */
export function mensajeError(error: PostgrestError, entidad = 'registro'): string {
  switch (error.code) {
    case '23505':
      return `Ya existe un ${entidad} con ese código`;
    case '23502': {
      const columna = columnaNula(error.message);
      return columna
        ? `Falta un dato obligatorio del ${entidad}: ${columna}`
        : `Falta un dato obligatorio del ${entidad}`;
    }
    case '23503':
      return `No se puede completar: el ${entidad} está referenciado por otros datos`;
    case '23514': {
      const regla = reglaIncumplida(error.message);
      const explicacion = regla === null ? undefined : REGLAS[regla];
      if (explicacion) return explicacion;
      return regla
        ? `Alguno de los valores está fuera del rango permitido (regla ${regla})`
        : 'Alguno de los valores está fuera del rango permitido';
    }
    case '22003':
      return `Alguna cifra del ${entidad} es demasiado grande para el sistema`;
    case '22P02':
      return 'Alguno de los datos no tiene el formato esperado (revise fechas y números)';
    case '42501':
      return 'Su rol no tiene permiso para esta operación';
    case 'PGRST116':
      return 'No se encontró el registro';
    default:
      return error.message;
  }
}
