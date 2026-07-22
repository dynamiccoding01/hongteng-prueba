import { describe, expect, it } from 'vitest';
import type { FilaPlanilla } from './leer-planilla';
import { planificarMigracion, ZONA_POR_CONFIRMAR } from './planificar-migracion';

function fila(parcial: Partial<FilaPlanilla>): FilaPlanilla {
  return {
    hoja: 'nino',
    fila: 2,
    codigo: 'B100',
    unidadesPorCaja: 12,
    rangoTallas: '30-35',
    entradas: 0,
    salidas: 0,
    existencia: 0,
    zonaCruda: '',
    ...parcial,
  };
}

describe('planificarMigracion (opción A: manda la existencia)', () => {
  it('una zona simple recibe toda la existencia', () => {
    const plan = planificarMigracion([fila({ existencia: 7, zonaCruda: '1-4' })]);

    expect(plan.movimientos).toEqual([
      expect.objectContaining({ codigo: 'B100', zona: '1-4', cajas: 7 }),
    ]);
    expect(plan.excepciones).toHaveLength(0);
    expect(plan.totalPorHoja.nino).toBe(7);
  });

  it('una anotación compuesta que cuadra se reparte por zona', () => {
    const plan = planificarMigracion([fila({ existencia: 3, zonaCruda: '1-3 (2)M3(1)' })]);

    expect(plan.movimientos).toEqual([
      expect.objectContaining({ zona: '1-3', cajas: 2 }),
      expect.objectContaining({ zona: 'M3', cajas: 1 }),
    ]);
    expect(plan.zonas).toEqual(['1-3', 'M3']);
    expect(plan.excepciones).toHaveLength(0);
  });

  it('una anotación que NO cuadra va completa a POR-CONFIRMAR (opción A)', () => {
    // El caso real del diagnóstico: anotado 3, existencia 7.
    const plan = planificarMigracion([fila({ existencia: 7, zonaCruda: '1-3 (2)M3(1)' })]);

    expect(plan.movimientos).toEqual([
      expect.objectContaining({ zona: ZONA_POR_CONFIRMAR, cajas: 7 }),
    ]);
    expect(plan.movimientos[0]!.motivo).toContain("'1-3 (2)M3(1)'");
    expect(plan.excepciones).toHaveLength(1);
    expect(plan.totalPorHoja.nino).toBe(7);
  });

  it('una zona que no parsea va completa a POR-CONFIRMAR', () => {
    const plan = planificarMigracion([fila({ existencia: 4, zonaCruda: '???' })]);

    expect(plan.movimientos).toEqual([
      expect.objectContaining({ zona: ZONA_POR_CONFIRMAR, cajas: 4 }),
    ]);
    expect(plan.excepciones).toHaveLength(1);
  });

  it('sin existencia se cataloga el producto pero no se mueve stock', () => {
    const plan = planificarMigracion([fila({ existencia: 0, zonaCruda: '1-4' })]);

    expect(plan.productos).toHaveLength(1);
    expect(plan.movimientos).toHaveLength(0);
    expect(plan.totalPorHoja.nino).toBe(0);
  });

  it('unidades por caja inválidas descartan la fila con excepción', () => {
    const plan = planificarMigracion([fila({ unidadesPorCaja: 0, existencia: 5 })]);

    expect(plan.productos).toHaveLength(0);
    expect(plan.movimientos).toHaveLength(0);
    expect(plan.excepciones).toHaveLength(1);
  });

  it('el mismo código con otro empaque es otra variante del mismo producto', () => {
    const plan = planificarMigracion([
      fila({ existencia: 2, zonaCruda: '1-4', unidadesPorCaja: 12 }),
      fila({ fila: 3, existencia: 3, zonaCruda: '1-5', unidadesPorCaja: 24 }),
    ]);

    expect(plan.productos).toHaveLength(2);
    expect(plan.productos.map((p) => p.unidadesPorCaja).sort((a, b) => a - b)).toEqual([12, 24]);
    expect(plan.movimientos).toHaveLength(2);
  });

  it('el total planificado por hoja concilia con la suma de existencias', () => {
    const plan = planificarMigracion([
      fila({ existencia: 7, zonaCruda: '1-4' }),
      fila({ fila: 3, existencia: 5, zonaCruda: '???' }),
      fila({ fila: 4, hoja: 'ropa', existencia: 2, zonaCruda: 'M2' }),
    ]);

    const cajasPlanificadas = plan.movimientos.reduce((s, m) => s + m.cajas, 0);
    expect(cajasPlanificadas).toBe(14);
    expect(plan.totalPorHoja.nino).toBe(12);
    expect(plan.totalPorHoja.ropa).toBe(2);
  });
});
