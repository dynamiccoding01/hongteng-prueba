/**
 * Guardias W-01 … W-03 (REVISION_CRITICA.md): los tres fallos que se repetían
 * en casi todos los `acciones.ts` y que ahora resuelve `lib/validacion.ts`.
 */

import { describe, expect, it } from 'vitest';
import { decimalesValidos, esquemaCajas, esquemaImporte, leerId, sinFilas } from './validacion';

describe('W-02: el id de un formulario de edición', () => {
  it('W-02: ausente o vacío es un alta', () => {
    expect(leerId(null)).toEqual({ id: null });
    expect(leerId('')).toEqual({ id: null });
  });

  it('W-02: un entero positivo es una edición', () => {
    expect(leerId('42')).toEqual({ id: 42 });
  });

  it.each(['abc', '1.5', '-3', '0', 'NaN'])('W-02: «%s» no es un id', (valor) => {
    expect(leerId(valor)).toHaveProperty('error');
  });
});

describe('W-03: lo que no cabe en la columna se rechaza, no se redondea', () => {
  it('W-03: acepta lo que cabe en la columna', () => {
    expect(decimalesValidos(1.01, 2)).toBe(true);
    expect(decimalesValidos(12.35, 2)).toBe(true); // 1234,9999999999998 en coma flotante
    expect(decimalesValidos(20.001, 4)).toBe(true);
    expect(decimalesValidos(7, 2)).toBe(true);
  });

  it('W-03: rechaza lo que la base redondearía', () => {
    expect(decimalesValidos(1.005, 2)).toBe(false);
    expect(decimalesValidos(0.00001, 4)).toBe(false);
  });

  it('W-03: rechaza lo que no es un número', () => {
    expect(decimalesValidos(Number.NaN, 2)).toBe(false);
    expect(decimalesValidos(Number.POSITIVE_INFINITY, 2)).toBe(false);
  });
});

describe('W-03: cantidades de cajas', () => {
  const cajas = esquemaCajas('Indique las cajas');
  const conteo = esquemaCajas('Indique las cajas', true);

  it('W-03: acepta una cantidad normal y la convierte', () => {
    expect(cajas.safeParse('3.5')).toEqual({ success: true, data: 3.5 });
  });

  it('W-03: rechaza cero salvo en un conteo', () => {
    expect(cajas.safeParse('0').success).toBe(false);
    expect(conteo.safeParse('0').success).toBe(true);
  });

  it('W-03: rechaza el tercer decimal en vez de dejarlo redondear', () => {
    expect(cajas.safeParse('1.005').success).toBe(false);
  });

  it('W-03: rechaza Infinity', () => {
    expect(cajas.safeParse('Infinity').success).toBe(false);
  });
});

describe('W-03: importes', () => {
  const importe = esquemaImporte('Precio no válido');

  it('W-03: admite cero y cuatro decimales', () => {
    expect(importe.safeParse('0').success).toBe(true);
    expect(importe.safeParse('20.0010').success).toBe(true);
  });

  it('W-03: rechaza negativos y el quinto decimal', () => {
    expect(importe.safeParse('-1').success).toBe(false);
    expect(importe.safeParse('1.00001').success).toBe(false);
  });
});

describe('W-01: una escritura sin filas no es un éxito', () => {
  it('W-01: una escritura sin filas es un fallo silencioso de PostgREST', () => {
    expect(sinFilas(null)).toBe(true);
    expect(sinFilas([])).toBe(true);
    expect(sinFilas([{ id: 1 }])).toBe(false);
  });
});
