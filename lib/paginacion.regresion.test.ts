/**
 * GUARDIAS · paginación y reportes.
 *
 * Cada `it` corresponde a un hallazgo de la revisión crítica, ya corregido: el
 * test queda para que no vuelva. Identificadores según REVISION_CRITICA.md.
 */

import { describe, expect, it } from 'vitest';
import { leerPaginacion } from './paginacion';

describe('P-01 · el número de página no tiene tope', () => {
  /*
   * `aEntero` solo exige entero positivo, así que `?pagina=1e15` es válido y
   * `desde` sale 15.000.000.000.000.000. Ese número viaja como `OFFSET` a
   * PostgreSQL en TODAS las pantallas del sistema —el circuito de paginación es
   * uno solo— y el `count: 'exact'` que lo acompaña obliga igualmente a contar
   * la tabla entera. Es un parámetro que escribe cualquiera desde la barra de
   * direcciones.
   *
   * `Number.MAX_SAFE_INTEGER` va más lejos: `desde` deja de ser representable
   * con exactitud y el `range()` que se envía ya ni siquiera es el que se pidió.
   */
  it('P-01a: una página absurda se acota en vez de viajar a la base', () => {
    const { desde } = leerPaginacion({ pagina: '1e15' });
    expect(desde).toBeLessThan(1_000_000);
  });

  it('P-01b: el índice calculado siempre es un entero seguro', () => {
    const { desde } = leerPaginacion({ pagina: String(Number.MAX_SAFE_INTEGER) });
    expect(Number.isSafeInteger(desde)).toBe(true);
  });
});

describe('P-02 · guardias de la paginación (hoy en verde)', () => {
  it('P-02a: `filas` fuera de 10/15/20 cae en el valor por defecto', () => {
    expect(leerPaginacion({ filas: '1000' }).porPagina).toBe(15);
  });

  it('P-02b: `pagina` no numérica cae en la primera', () => {
    expect(leerPaginacion({ pagina: 'hola' }).pagina).toBe(1);
  });
});
