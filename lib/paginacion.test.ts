import { describe, expect, it } from 'vitest';
import { FILAS_POR_DEFECTO, leerPaginacion, totalPaginas } from './paginacion';

describe('paginación de listados', () => {
  it('sin parámetros arranca en la primera página con el tamaño por defecto', () => {
    expect(leerPaginacion({})).toEqual({
      pagina: 1,
      porPagina: FILAS_POR_DEFECTO,
      desde: 0,
      hasta: FILAS_POR_DEFECTO - 1,
    });
  });

  it('calcula el rango de la página pedida', () => {
    expect(leerPaginacion({ pagina: '3', filas: '10' })).toEqual({
      pagina: 3,
      porPagina: 10,
      desde: 20,
      hasta: 29,
    });
  });

  it('acepta solo los tamaños ofrecidos', () => {
    expect(leerPaginacion({ filas: '10' }).porPagina).toBe(10);
    expect(leerPaginacion({ filas: '15' }).porPagina).toBe(15);
    expect(leerPaginacion({ filas: '20' }).porPagina).toBe(20);
    // Un tamaño inventado a mano en la URL no debe traer 5.000 filas.
    expect(leerPaginacion({ filas: '5000' }).porPagina).toBe(FILAS_POR_DEFECTO);
  });

  it('ignora valores disparatados en vez de romper', () => {
    for (const basura of ['0', '-2', 'abc', '1.5', '']) {
      expect(leerPaginacion({ pagina: basura }).pagina).toBe(1);
      expect(leerPaginacion({ filas: basura }).porPagina).toBe(FILAS_POR_DEFECTO);
    }
  });

  it('ignora un parámetro repetido en la URL', () => {
    expect(leerPaginacion({ pagina: ['2', '9'] }).pagina).toBe(1);
  });

  it('cuenta las páginas necesarias', () => {
    expect(totalPaginas(0, 15)).toBe(1);
    expect(totalPaginas(15, 15)).toBe(1);
    expect(totalPaginas(16, 15)).toBe(2);
    expect(totalPaginas(2877, 20)).toBe(144);
  });
});
