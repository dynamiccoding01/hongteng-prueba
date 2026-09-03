import { describe, expect, it } from 'vitest';
import { descuentoParaSubtotal, subtotalBruto } from './descuento';

/** Atajo: el caso normal devuelve `{ descuento }` y aquí solo interesa el número. */
function descuento(cajas: number, precio: number | null, pedido: number | undefined): number {
  const r = descuentoParaSubtotal(cajas, precio, pedido);
  if ('error' in r) throw new Error(`se esperaba un descuento, no: ${r.error}`);
  return r.descuento;
}

describe('subtotal bruto de una línea', () => {
  it('multiplica cajas por precio', () => {
    expect(subtotalBruto(7, 850)).toBe(5950);
  });

  it('sin precio no hay subtotal: es «todavía no se sabe», no cero', () => {
    expect(subtotalBruto(7, null)).toBeNull();
  });

  it('limpia la basura de la coma flotante', () => {
    // 3 × 19,90 da 59,699999999999996 sin redondear.
    expect(subtotalBruto(3, 19.9)).toBe(59.7);
  });
});

describe('descuento por artículo (VEN-07)', () => {
  it('el caso que pidió el cliente: 5.950 «déjemelo en 5.900»', () => {
    expect(descuento(7, 850, 5900)).toBe(50);
  });

  it('sin tocar el campo no hay descuento', () => {
    expect(descuento(7, 850, undefined)).toBe(0);
  });

  it('escribir el mismo subtotal tampoco descuenta nada', () => {
    expect(descuento(7, 850, 5950)).toBe(0);
    // Y no deja una rebaja fantasma de 0,0000000001 por la coma flotante.
    expect(descuento(3, 19.9, 59.7)).toBe(0);
  });

  it('deja regalar la línea entera, pero no más', () => {
    expect(descuento(7, 850, 0)).toBe(5950);
  });

  it('rechaza un subtotal mayor que el de lista: eso es un recargo', () => {
    const r = descuentoParaSubtotal(7, 850, 6000);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toContain('no puede superar');
  });

  it('rechaza un subtotal negativo', () => {
    const r = descuentoParaSubtotal(7, 850, -1);
    expect('error' in r).toBe(true);
  });

  it('sin precio ignora lo que venga escrito: no hay nada que rebajar', () => {
    expect(descuento(7, null, 5900)).toBe(0);
  });

  it('funciona en dólares, con centavos', () => {
    // 3 cajas a 19,90 = 59,70; el cliente paga 55.
    expect(descuento(3, 19.9, 55)).toBe(4.7);
  });

  it('acepta cajas fraccionadas, que se venden sueltas', () => {
    expect(descuento(0.5, 850, 400)).toBe(25);
  });
});
