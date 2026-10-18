/**
 * GUARDIAS · conversión USD → CLP.
 *
 * Cada `it` corresponde a un hallazgo de la revisión crítica, ya corregido: el
 * test queda para que no vuelva. Identificadores según REVISION_CRITICA.md.
 */

import { describe, expect, it } from 'vitest';
import { convertirAPesos } from './conversion';

describe('C-02 · un tipo de cambio imposible no puede producir un precio', () => {
  /*
   * Defensa en profundidad, no un agujero alcanzable hoy: `venta.tipo_cambio`
   * es `not null` y lleva `check (tipo_cambio > 0)`. Pero `precio-lista.ts`
   * hace `Number(venta.tipo_cambio)` sin comprobar nada, y `Number(null)` es 0:
   * el día que la columna vuelva a admitir nulos —o que alguien llame a esta
   * función desde otro sitio— el resultado es un precio de venta de 0 pesos, y
   * nada en el camino lo detiene.
   *
   * Que la función proteste es más barato que rastrear después por qué una nota
   * salió en cero.
   */
  it('C-02a: con tipo de cambio 0 no hay conversión, no un precio de 0', () => {
    expect(convertirAPesos(38, 0)).toBeNull();
  });

  it('C-02b: con tipo de cambio NaN no hay conversión', () => {
    expect(convertirAPesos(38, Number.NaN)).toBeNull();
  });

  it('C-02c: con tipo de cambio negativo no hay conversión', () => {
    // `Math.ceil` sobre un negativo redondea HACIA CERO: -4500 se quedaba en
    // -4500 y el signo se colaba hasta `venta_detalle.precio_caja`, que solo
    // exige `>= 0` y rechazaría el insert con jerga de PostgreSQL.
    expect(convertirAPesos(38, -900)).toBeNull();
  });

  it('C-02d: un precio de lista imposible tampoco se convierte', () => {
    expect(convertirAPesos(-5, 900)).toBeNull();
    expect(convertirAPesos(Number.NaN, 900)).toBeNull();
  });
});

describe('C-03 · guardias del redondeo a la centena (hoy en verde)', () => {
  it('C-03: un exacto ya múltiplo de la centena no sube una centena entera', () => {
    // Guardia de la regresión que documenta el `toFixed(6)`: no debe volver.
    expect(convertirAPesos(100, 1)?.redondeado).toBe(100);
    expect(convertirAPesos(2, 100)?.redondeado).toBe(200);
    expect(convertirAPesos(1.2, 100)?.redondeado).toBe(200); // 120 sube a 200.
  });
});
