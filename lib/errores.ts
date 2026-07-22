import type { PostgrestError } from '@supabase/supabase-js';

export interface EstadoFormulario {
  error?: string;
  ok?: string;
}

/**
 * Traduce un error de PostgREST a un mensaje que le sirva al usuario.
 * Sin esto, la interfaz muestra jerga de PostgreSQL que nadie en bodega
 * puede interpretar.
 */
export function mensajeError(error: PostgrestError, entidad = 'registro'): string {
  switch (error.code) {
    case '23505':
      return `Ya existe un ${entidad} con ese código`;
    case '23503':
      return `No se puede completar: el ${entidad} está referenciado por otros datos`;
    case '23514':
      return 'Alguno de los valores está fuera del rango permitido';
    case '42501':
      return 'Su rol no tiene permiso para esta operación';
    case 'PGRST116':
      return 'No se encontró el registro';
    default:
      return error.message;
  }
}
