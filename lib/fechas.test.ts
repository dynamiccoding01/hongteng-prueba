import { describe, expect, it } from 'vitest';
import { diaOmitido, esDia, esquemaDia } from './fechas';

describe('esDia: la forma no alcanza, el día tiene que existir', () => {
  it('acepta un día normal', () => {
    expect(esDia('2026-09-03')).toBe(true);
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(esDia('2028-02-29')).toBe(true);
  });

  it('rechaza el 29 de febrero de uno que no lo es', () => {
    expect(esDia('2026-02-29')).toBe(false);
  });

  it('rechaza el 30 de febrero, que `Date` corría al 2 de marzo', () => {
    expect(esDia('2026-02-30')).toBe(false);
  });

  it('rechaza las fechas con la forma correcta pero imposibles', () => {
    // Pasaban el `/^\d{4}-\d{2}-\d{2}$/` de la bitácora y hacían saltar un
    // RangeError dentro de Intl, o sea un 500 en la pantalla de auditoría.
    expect(esDia('9999-99-99')).toBe(false);
    expect(esDia('0000-00-00')).toBe(false);
    expect(esDia('2026-13-01')).toBe(false);
  });

  it('rechaza lo que ni siquiera tiene la forma', () => {
    expect(esDia('hola')).toBe(false);
    expect(esDia('3-9-2026')).toBe(false);
    expect(esDia('2026-9-3')).toBe(false);
    expect(esDia('')).toBe(false);
  });
});

describe('diaOmitido: lo que llega de la URL', () => {
  it('deja pasar un día válido', () => {
    expect(diaOmitido('2026-09-03')).toBe('2026-09-03');
  });

  it('omite lo que no es un día en vez de mandarlo a PostgreSQL', () => {
    expect(diaOmitido('hola')).toBeUndefined();
    expect(diaOmitido('9999-99-99')).toBeUndefined();
  });

  it('omite un parámetro repetido, que llega como arreglo', () => {
    expect(diaOmitido(['2026-09-03', '2026-09-04'])).toBeUndefined();
  });

  it('omite el ausente', () => {
    expect(diaOmitido(undefined)).toBeUndefined();
  });
});

describe('esquemaDia: la validación de los acciones.ts', () => {
  it('acepta un día', () => {
    expect(esquemaDia.safeParse('2026-09-03').success).toBe(true);
  });

  it('rechaza «mañana», que llegaba a PostgreSQL y volvía en inglés', () => {
    const r = esquemaDia.safeParse('mañana');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toContain('aaaa-mm-dd');
  });
});
