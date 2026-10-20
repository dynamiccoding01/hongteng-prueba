/**
 * El nombre del envase en las frases de la interfaz.
 *
 * Importa más de lo que parece: de estas dos funciones salen «10 docenas × 8
 * unidades» y «A2050 — docena de 8 unidades», que es lo que lee quien vende.
 */

import { describe, expect, it } from 'vitest';
import { etiquetaArticulo, nombreEnvase, piezas, type ArticuloEncontrado } from './articulo';

describe('nombreEnvase', () => {
  it('en singular devuelve la unidad tal cual, en minúscula', () => {
    expect(nombreEnvase('Caja')).toBe('caja');
    expect(nombreEnvase('docena')).toBe('docena');
    expect(nombreEnvase('PAR')).toBe('par');
  });

  it('pluraliza con «s» lo que acaba en vocal', () => {
    expect(nombreEnvase('caja', 10)).toBe('cajas');
    expect(nombreEnvase('docena', 10)).toBe('docenas');
    expect(nombreEnvase('Juego', 2)).toBe('juegos');
  });

  it('pluraliza con «es» lo que acaba en consonante', () => {
    expect(nombreEnvase('par', 10)).toBe('pares');
    expect(nombreEnvase('bulto', 3)).toBe('bultos');
    expect(nombreEnvase('fardo', 3)).toBe('fardos');
  });

  it('respeta las excepciones prestadas del inglés', () => {
    // La regla daría «packes» y «setes», que nadie escribe.
    expect(nombreEnvase('pack', 4)).toBe('packs');
    expect(nombreEnvase('set', 4)).toBe('sets');
    expect(nombreEnvase('display', 2)).toBe('displays');
  });

  it('sin unidad dice «empaque», que es la palabra genérica del sistema', () => {
    expect(nombreEnvase(null)).toBe('empaque');
    expect(nombreEnvase('', 5)).toBe('empaques');
    expect(nombreEnvase('   ', 1)).toBe('empaque');
  });

  /*
   * Una cantidad fraccionaria es legítima: media caja se vende suelta. En
   * español «0,5 cajas» va en plural, y solo el 1 exacto va en singular.
   */
  it('solo el uno exacto va en singular', () => {
    expect(nombreEnvase('caja', 1)).toBe('caja');
    expect(nombreEnvase('caja', 0.5)).toBe('cajas');
    expect(nombreEnvase('caja', 1.5)).toBe('cajas');
  });
});

describe('piezas', () => {
  it('concuerda con la cantidad', () => {
    expect(piezas(1)).toBe('unidad');
    expect(piezas(8)).toBe('unidades');
    expect(piezas(0)).toBe('unidades');
  });
});

describe('etiquetaArticulo', () => {
  const base: ArticuloEncontrado = {
    id: 1,
    codigo: 'A2050',
    descripcion: 'ZAPATILLAS PARA NIÑOS',
    unidadesPorCaja: 8,
    unidad: 'docena',
    existencias: [],
  };

  it('nombra el envase y dice cuántas piezas trae', () => {
    expect(etiquetaArticulo(base)).toBe('A2050 — docena de 8 unidades');
  });

  it('un envase de una sola pieza no dice «1 unidades»', () => {
    expect(etiquetaArticulo({ ...base, unidad: 'par', unidadesPorCaja: 1 })).toBe(
      'A2050 — par de 1 unidad',
    );
  });
});
