import { describe, expect, it } from 'vitest';
import { convertirAPesos, type PrecioConvertido } from './conversion';

/**
 * Atajo: `convertirAPesos` devuelve `null` cuando no hay conversión posible
 * (tipo de cambio que no es positivo), y en estos casos siempre la hay.
 */
function pesos(precioUsd: number, tipoCambio: number): PrecioConvertido {
  const r = convertirAPesos(precioUsd, tipoCambio);
  if (r === null) throw new Error(`no se pudo convertir ${precioUsd} a ${tipoCambio}`);
  return r;
}

describe('conversión de dólares a pesos', () => {
  it('sube a la centena el caso de la lista de hoy', () => {
    // ZN-6103: 38 USD en la lista «Mayorista USD», dólar a 947,30.
    const { exacto, redondeado } = pesos(38, 947.3);
    expect(exacto).toBe(35997.4);
    expect(redondeado).toBe(36000);
  });

  it('redondea hacia arriba y nunca hacia abajo', () => {
    // 11.841,25 al más cercano daría 11.800: se vendería bajo el precio en
    // dólares. Hacia arriba da 11.900.
    expect(pesos(12.5, 947.3).redondeado).toBe(11900);
    // Apenas por encima de la centena: sube igual, no se recorta.
    expect(pesos(1.0011, 100).redondeado).toBe(200);
  });

  it('deja quieto lo que ya es múltiplo de cien', () => {
    expect(pesos(100, 947).redondeado).toBe(94700);
    expect(pesos(2, 1000).redondeado).toBe(2000);
  });

  it('no sube una centena por la basura de la coma flotante', () => {
    // 1,2 × 1000 da 1200.0000000000002 en coma flotante. Sin el saneo
    // devolvería 1.300.
    expect(pesos(1.2, 1000).redondeado).toBe(1200);
    expect(pesos(0.29, 100).redondeado).toBe(100);
  });

  it('el exacto queda al centavo, para poder mostrar la cuenta', () => {
    expect(pesos(12.5, 947.3).exacto).toBe(11841.25);
  });
});
