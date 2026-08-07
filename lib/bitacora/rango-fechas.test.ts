import { describe, expect, it } from 'vitest';
import { comoDia, desfase, diaSiguiente, diasAtras, inicioDelDia, limites } from './rango-fechas';

describe('rango de fechas de la bitácora', () => {
  it('lee el día en hora de Chile, no en UTC', () => {
    // 2026-08-07 01:30 UTC son las 21:30 del 6 de agosto en Chile (UTC-4).
    expect(comoDia(new Date('2026-08-07T01:30:00Z'))).toBe('2026-08-06');
  });

  it('usa el desfase que corresponde a cada época del año', () => {
    // Invierno austral: UTC-4. Verano (horario de verano): UTC-3.
    expect(desfase('2026-08-06')).toBe('-04:00');
    expect(desfase('2026-01-15')).toBe('-03:00');
  });

  it('el inicio del día es medianoche chilena, no UTC', () => {
    expect(inicioDelDia('2026-08-06')).toBe('2026-08-06T00:00:00-04:00');
    expect(new Date(inicioDelDia('2026-08-06')).toISOString()).toBe('2026-08-06T04:00:00.000Z');
  });

  it('avanza un día del calendario', () => {
    expect(diaSiguiente('2026-08-06')).toBe('2026-08-07');
    expect(diaSiguiente('2026-08-31')).toBe('2026-09-01');
    expect(diaSiguiente('2026-12-31')).toBe('2027-01-01');
  });

  it('cuenta días hacia atrás', () => {
    expect(diasAtras(new Date('2026-08-06T15:00:00Z'), 30)).toBe('2026-07-07');
  });

  it('incluye el día final completo', () => {
    const { inicio, fin } = limites('2026-08-01', '2026-08-06');
    expect(inicio).toBe('2026-08-01T00:00:00-04:00');
    // El corte es al empezar el 7, así que las 23:59 del 6 quedan dentro.
    expect(fin).toBe('2026-08-07T00:00:00-04:00');
    expect(new Date('2026-08-06T23:59:59-04:00') < new Date(fin)).toBe(true);
  });

  it('un rango de un solo día cubre ese día entero', () => {
    const { inicio, fin } = limites('2026-08-06', '2026-08-06');
    const finDeTarde = new Date('2026-08-06T21:30:00-04:00');
    expect(new Date(inicio) <= finDeTarde).toBe(true);
    expect(finDeTarde < new Date(fin)).toBe(true);
  });

  it('atraviesa el cambio de hora sin perder ni duplicar el día', () => {
    // Chile cambia de hora en septiembre; el día siguiente sigue siendo el
    // siguiente aunque el desfase cambie de -04:00 a -03:00.
    expect(diaSiguiente('2026-09-05')).toBe('2026-09-06');
    expect(diaSiguiente('2026-09-06')).toBe('2026-09-07');
  });
});
