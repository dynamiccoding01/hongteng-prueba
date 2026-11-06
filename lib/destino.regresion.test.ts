/**
 * Guardia L-01 (REVISION_CRITICA.md): la redirección después del login no
 * puede sacar a nadie del sistema.
 */

import { describe, expect, it } from 'vitest';
import { destinoSeguro } from './destino';

describe('L-01: destino del login', () => {
  it.each(['/', '/ventas/notas', '/reportes/ventas?desde=2026-01-01&pagina=2'])(
    'conserva la ruta interna %s',
    (ruta) => {
      expect(destinoSeguro(ruta)).toBe(ruta);
    },
  );

  it.each([
    'https://sitio-falso.cl/login',
    '//sitio-falso.cl',
    '/\\sitio-falso.cl',
    'javascript:alert(1)',
    'sitio-falso.cl',
    '/\t/sitio-falso.cl',
  ])('rechaza %s y vuelve al inicio', (destino) => {
    expect(destinoSeguro(destino)).toBe('/');
  });

  it('no devuelve al login', () => {
    expect(destinoSeguro('/login')).toBe('/');
    expect(destinoSeguro('/login?expirada=1')).toBe('/');
  });

  it('sin destino, al inicio', () => {
    expect(destinoSeguro(null)).toBe('/');
    expect(destinoSeguro(undefined)).toBe('/');
    expect(destinoSeguro('')).toBe('/');
  });
});
