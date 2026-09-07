import { describe, expect, it } from 'vitest';
import { INACTIVIDAD_MAXIMA_MS, sesionExpirada } from './sesion';

const AHORA = Date.parse('2026-09-06T12:00:00Z');
const hace = (ms: number) => String(AHORA - ms);

describe('sesionExpirada', () => {
  it('mantiene viva una sesión con actividad reciente', () => {
    expect(sesionExpirada(hace(0), AHORA)).toBe(false);
    expect(sesionExpirada(hace(60_000), AHORA)).toBe(false);
  });

  it('mantiene viva la sesión justo en el límite', () => {
    // El plazo es «más de 15 minutos», no «15 o más»: a los 15 exactos aún entra.
    expect(sesionExpirada(hace(INACTIVIDAD_MAXIMA_MS), AHORA)).toBe(false);
  });

  it('cierra la sesión pasado el plazo', () => {
    expect(sesionExpirada(hace(INACTIVIDAD_MAXIMA_MS + 1), AHORA)).toBe(true);
    expect(sesionExpirada(hace(24 * 60 * 60 * 1000), AHORA)).toBe(true);
  });

  it('cierra la sesión cuando la cookie no llegó', () => {
    // El caso de «volví al día siguiente»: la cookie ya caducó por maxAge y lo
    // que llega es la ausencia. Tratarla como válida dejaría entrar justo al
    // que se quiere echar.
    expect(sesionExpirada(null, AHORA)).toBe(true);
    expect(sesionExpirada(undefined, AHORA)).toBe(true);
    expect(sesionExpirada('', AHORA)).toBe(true);
  });

  it('cierra la sesión si la cookie viene manipulada', () => {
    expect(sesionExpirada('mañana', AHORA)).toBe(true);
    expect(sesionExpirada('NaN', AHORA)).toBe(true);
    expect(sesionExpirada('Infinity', AHORA)).toBe(true);
  });

  it('no castiga a un reloj adelantado', () => {
    expect(sesionExpirada(String(AHORA + 60_000), AHORA)).toBe(false);
  });
});
