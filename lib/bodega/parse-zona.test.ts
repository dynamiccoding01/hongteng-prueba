import { describe, expect, it } from 'vitest';
import { normalizarCodigoZona, parseZona } from './parse-zona';

// Todos los valores usados aqui son reales: salen de la columna 区域 de BODEGA.xls.
describe('parseZona', () => {
  describe('zona simple', () => {
    it('asigna toda la existencia a la unica zona', () => {
      expect(parseZona('1-4', 34)).toEqual({
        ok: true,
        asignaciones: [{ zona: '1-4', cajas: 34 }],
        reconcilia: true,
        diferencia: 0,
      });
    });

    it('acepta zonas con prefijo de letra', () => {
      const r = parseZona('M2-2', 8);
      expect(r.ok && r.asignaciones).toEqual([{ zona: 'M2-2', cajas: 8 }]);
    });

    it('limpia el espacio final que traen algunas filas', () => {
      const r = parseZona('M2-4 ', 10);
      expect(r.ok && r.asignaciones).toEqual([{ zona: 'M2-4', cajas: 10 }]);
    });

    it('acepta codigos numericos con cero a la izquierda', () => {
      const r = parseZona('02', 3);
      expect(r.ok && r.asignaciones).toEqual([{ zona: '02', cajas: 3 }]);
    });
  });

  describe('zona compuesta', () => {
    it("reparte '1-3 (2)M3(1)' en dos zonas", () => {
      expect(parseZona('1-3 (2)M3(1)', 3)).toEqual({
        ok: true,
        asignaciones: [
          { zona: '1-3', cajas: 2 },
          { zona: 'M3', cajas: 1 },
        ],
        reconcilia: true,
        diferencia: 0,
      });
    });

    it("da el remanente a la zona sin cantidad en '1-5(11) 4-6'", () => {
      const r = parseZona('1-5(11) 4-6', 15);
      expect(r.ok && r.asignaciones).toEqual([
        { zona: '1-5', cajas: 11 },
        { zona: '4-6', cajas: 4 },
      ]);
      expect(r.ok && r.reconcilia).toBe(true);
    });

    it("maneja separadores de varios espacios: '1-7  M3-1(10)'", () => {
      const r = parseZona('1-7  M3-1(10)', 12);
      expect(r.ok && r.asignaciones).toEqual([
        { zona: '1-7', cajas: 2 },
        { zona: 'M3-1', cajas: 10 },
      ]);
    });

    it("acepta una sola zona con cantidad explicita: '1-5(3)'", () => {
      const r = parseZona('1-5(3)', 3);
      expect(r.ok && r.asignaciones).toEqual([{ zona: '1-5', cajas: 3 }]);
    });

    // La planilla se escribio con teclado chino: hay filas con parentesis de
    // ancho completo. Es el mismo dato, en otro punto de codigo Unicode.
    it("acepta parentesis de ancho completo: 'M3 1-2（3）'", () => {
      const r = parseZona('M3 1-2（3）', 5);
      expect(r.ok && r.asignaciones).toEqual([
        { zona: 'M3', cajas: 2 },
        { zona: '1-2', cajas: 3 },
      ]);
    });
  });

  // Hallazgo del analisis de la planilla real: en ~26% de las filas con zona
  // compuesta las cantidades anotadas no cuadran con 实存. Las anotaciones
  // quedaron desactualizadas. La fila se puede cargar, pero marcada.
  describe('anotaciones que no reconcilian con la existencia', () => {
    it('marca reconcilia=false cuando las cantidades suman de mas', () => {
      const r = parseZona('1-3 (2)M3(1)', 7);
      expect(r.ok).toBe(true);
      expect(r.ok && r.reconcilia).toBe(false);
      expect(r.ok && r.diferencia).toBe(-4);
    });

    it('marca reconcilia=false cuando las cantidades exceden la existencia', () => {
      const r = parseZona('1-5(11) 4-6', 4);
      expect(r.ok && r.reconcilia).toBe(false);
      expect(r.ok && r.diferencia).toBe(7);
      // La zona sin cantidad no recibe cajas negativas.
      expect(r.ok && r.asignaciones).toEqual([
        { zona: '1-5', cajas: 11 },
        { zona: '4-6', cajas: 0 },
      ]);
    });

    it('reporta la diferencia exacta para el informe de revision', () => {
      const r = parseZona('M3-3(25)', 11);
      expect(r.ok && r.diferencia).toBe(14);
    });
  });

  describe('valores que NO se deben adivinar', () => {
    it("rechaza codigos pegados sin separador: '1-63-6(1)'", () => {
      const r = parseZona('1-63-6(1)', 5);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('ambigua');
    });

    it("rechaza '2-14-2(1)' por el mismo motivo", () => {
      expect(parseZona('2-14-2(1)', 3).ok).toBe(false);
    });

    it('rechaza dos zonas sin cantidad: no hay forma de repartir', () => {
      const r = parseZona('1-3 1-8', 10);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.motivo).toContain('sin cantidad');
    });

    it('rechaza la zona vacia', () => {
      expect(parseZona('', 5).ok).toBe(false);
      expect(parseZona('   ', 5).ok).toBe(false);
      expect(parseZona(null, 5).ok).toBe(false);
    });

    it('rechaza texto que no es una zona', () => {
      expect(parseZona('POLERA', 5).ok).toBe(false);
    });

    it('rechaza una existencia negativa', () => {
      expect(parseZona('1-4', -1).ok).toBe(false);
    });
  });

  it('no arrastra estado entre llamadas (regex global)', () => {
    const primera = parseZona('1-3 (2)M3(1)', 3);
    const segunda = parseZona('1-3 (2)M3(1)', 3);
    expect(primera).toEqual(segunda);
  });
});

describe('normalizarCodigoZona', () => {
  it('quita espacios y pasa a mayusculas', () => {
    expect(normalizarCodigoZona(' m2-4 ')).toBe('M2-4');
  });
});
