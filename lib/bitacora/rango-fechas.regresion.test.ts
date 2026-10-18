/**
 * GUARDIAS · rango de fechas de la bitácora.
 *
 * Cada `it` corresponde a un hallazgo de la revisión crítica, ya corregido: el
 * test queda para que no vuelva. Identificadores según REVISION_CRITICA.md.
 */

import { describe, expect, it } from 'vitest';
import { desfase, limites } from './rango-fechas';

describe('F-01 · una fecha imposible tumba la página de bitácora', () => {
  /*
   * `app/(app)/bitacora/page.tsx` valida `desde` y `hasta` con
   * `/^\d{4}-\d{2}-\d{2}$/`. La forma pasa, la fecha no existe: `9999-99-99` y
   * `0000-00-00` dan `Invalid Date`, y `Intl.DateTimeFormat.formatToParts`
   * lanza `RangeError: Invalid time value` sobre una fecha inválida.
   *
   * Como eso ocurre en un Server Component, no hay `try` que lo recoja: la
   * respuesta es un 500. Es decir, un enlace copiado y mal editado deja la
   * pantalla de auditoría fuera de servicio. El comentario de la página promete
   * lo contrario: «un parámetro inválido no rompe la página».
   */
  it('F-01a: `desfase` no lanza con una fecha con la forma correcta pero imposible', () => {
    expect(() => desfase('9999-99-99')).not.toThrow();
  });

  it('F-01b: `limites` no lanza con una fecha imposible', () => {
    expect(() => limites('0000-00-00', '2026-09-03')).not.toThrow();
  });

  it('F-01c: `limites` no lanza cuando el día final es imposible', () => {
    expect(() => limites('2026-09-01', '2026-13-01')).not.toThrow();
  });
});

describe('F-02 · un día que no existe se corre al mes siguiente', () => {
  /*
   * `2026-02-30` sí pasa el `new Date`: se interpreta como el 2 de marzo. El
   * filtro se aplica sobre un rango que el usuario no pidió y la pantalla
   * sigue mostrando «30-02-2026» en el campo. Rechazarlo es preferible a
   * corregirlo por dentro sin decirlo.
   */
  it('F-02: el 30 de febrero no se convierte en el 2 de marzo en silencio', () => {
    expect(limites('2026-02-30', '2026-02-30').inicio).not.toContain('2026-03-02');
  });
});
