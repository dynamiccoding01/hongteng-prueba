/**
 * GUARDIAS · traducción de errores de PostgREST.
 *
 * `mensajeError` es el único filtro entre PostgreSQL y la persona que está en
 * bodega. Lo que no traduce sale en crudo y en inglés. Estos tests fijan los
 * códigos que el sistema provoca de verdad y que una vez se escaparon sin
 * traducir.
 *
 * Identificadores según REVISION_CRITICA.md.
 */

import { describe, expect, it } from 'vitest';
import type { PostgrestError } from '@supabase/supabase-js';
import { mensajeError } from './errores';

/** Un error de PostgREST tal como llega, con el código que interesa. */
function error(code: string, message: string): PostgrestError {
  return { code, message, details: '', hint: '' } as PostgrestError;
}

/** Sale del filtro sin traducir, es decir: el usuario ve jerga en inglés. */
function sinTraducir(e: PostgrestError): boolean {
  return mensajeError(e, 'venta') === e.message;
}

describe('E-01 · códigos que el sistema produce y nadie traduce', () => {
  it('E-01a: 23502 (not null) — pasa al crear una venta con `tipo_cambio` vacío', () => {
    // Alcanzable: `fn_tipo_cambio_vigente` devuelve null si la tabla
    // `tipo_cambio` está vacía, y la columna es `not null` desde 0025.
    expect(
      sinTraducir(
        error('23502', 'null value in column "tipo_cambio" violates not-null constraint'),
      ),
    ).toBe(false);
  });

  it('E-01b: 22003 (numeric overflow) — pasa al escribir una cantidad enorme', () => {
    // `cajas` es numeric(14,2): el formulario no tiene tope máximo.
    expect(sinTraducir(error('22003', 'numeric field overflow'))).toBe(false);
  });

  it('E-01c: 22P02 (sintaxis) — pasa con un ?desde=hola en el reporte', () => {
    expect(sinTraducir(error('22P02', 'invalid input syntax for type date: "hola"'))).toBe(false);
  });
});

describe('E-02 · 23514 traduce todos los CHECK a la misma frase', () => {
  /*
   * «Alguno de los valores está fuera del rango permitido» no dice cuál ni por
   * qué. Con `venta_detalle_descuento_ck` (0029) el usuario ve eso justo
   * después de escribir un subtotal: el mensaje no le permite corregirlo.
   * Los CHECK del sistema llevan nombre; el nombre viene en el error.
   */
  it('E-02: el mensaje de un CHECK nombra la regla que se incumplió', () => {
    const traducido = mensajeError(
      error(
        '23514',
        'new row for relation "venta_detalle" violates check constraint "venta_detalle_descuento_ck"',
      ),
      'detalle',
    );
    expect(traducido).toMatch(/descuento/i);
  });
});
