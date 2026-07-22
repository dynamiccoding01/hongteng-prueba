/**
 * Planificador de la migración de BODEGA.xls (ADM-04) — opción A del cliente:
 * manda la existencia total (实存).
 *
 *  - Si la anotación de zonas parsea y CUADRA con la existencia, se carga tal
 *    cual, repartida por zona.
 *  - Si no parsea o no cuadra (las 67 filas del diagnóstico), la existencia
 *    total se carga en la zona POR-CONFIRMAR y la anotación original queda en
 *    el motivo del movimiento, como referencia para la toma de inventario.
 *
 * Este módulo es puro (no toca base de datos ni archivos) para poder probarlo
 * sin la planilla real.
 */

import type { FilaPlanilla, HojaDetalle } from './leer-planilla';
import { parseZona } from './parse-zona';

/** Zona de referencia para existencias cuya ubicación hay que confirmar. */
export const ZONA_POR_CONFIRMAR = 'POR-CONFIRMAR';

export const CATEGORIA_POR_HOJA: Record<HojaDetalle, string> = {
  nino: 'NINO',
  juvenli: 'JUVENIL',
  adulto: 'ADULTO',
  ropa: 'ROPA',
};

export interface ProductoPlan {
  codigo: string;
  categoria: string;
  rangoTallas: string;
  unidadesPorCaja: number;
}

export interface MovimientoPlan {
  codigo: string;
  unidadesPorCaja: number;
  zona: string;
  cajas: number;
  motivo: string;
}

export interface ExcepcionPlan {
  hoja: HojaDetalle;
  fila: number;
  codigo: string;
  motivo: string;
}

export interface PlanMigracion {
  productos: ProductoPlan[];
  zonas: string[];
  movimientos: MovimientoPlan[];
  /** Filas cargadas en POR-CONFIRMAR o descartadas, con su porqué. */
  excepciones: ExcepcionPlan[];
  /** Total de cajas planificado por hoja, para conciliar contra la planilla. */
  totalPorHoja: Record<HojaDetalle, number>;
}

export function planificarMigracion(filas: FilaPlanilla[]): PlanMigracion {
  const productos = new Map<string, ProductoPlan>();
  const zonas = new Set<string>();
  const movimientos: MovimientoPlan[] = [];
  const excepciones: ExcepcionPlan[] = [];
  const totalPorHoja = { nino: 0, juvenli: 0, adulto: 0, ropa: 0 } as Record<HojaDetalle, number>;

  for (const fila of filas) {
    const referencia = `BODEGA.xls ${fila.hoja} fila ${fila.fila}`;

    if (fila.unidadesPorCaja <= 0) {
      excepciones.push({
        hoja: fila.hoja,
        fila: fila.fila,
        codigo: fila.codigo,
        motivo: `unidades por caja inválidas (${fila.unidadesPorCaja}): fila descartada`,
      });
      continue;
    }

    // Un mismo código puede aparecer con otro empaque: es otra variante del
    // mismo producto. La clave del catálogo es código + factor.
    const clave = `${fila.codigo}|${fila.unidadesPorCaja}`;
    if (!productos.has(clave)) {
      productos.set(clave, {
        codigo: fila.codigo,
        categoria: CATEGORIA_POR_HOJA[fila.hoja],
        rangoTallas: fila.rangoTallas,
        unidadesPorCaja: fila.unidadesPorCaja,
      });
    }

    if (fila.existencia <= 0) continue; // catálogo sin stock: nada que mover

    const resultado = parseZona(fila.zonaCruda, fila.existencia);
    const cuadra = resultado.ok && resultado.reconcilia;

    if (cuadra) {
      for (const asignacion of resultado.asignaciones) {
        if (asignacion.cajas <= 0) continue;
        zonas.add(asignacion.zona);
        movimientos.push({
          codigo: fila.codigo,
          unidadesPorCaja: fila.unidadesPorCaja,
          zona: asignacion.zona,
          cajas: asignacion.cajas,
          motivo: `Migración ${referencia}`,
        });
      }
    } else {
      // Opción A: manda 实存. Todo a POR-CONFIRMAR con la anotación original.
      const detalle = resultado.ok
        ? `anotación de zonas no cuadra con la existencia (diferencia ${resultado.diferencia})`
        : resultado.motivo;
      zonas.add(ZONA_POR_CONFIRMAR);
      movimientos.push({
        codigo: fila.codigo,
        unidadesPorCaja: fila.unidadesPorCaja,
        zona: ZONA_POR_CONFIRMAR,
        cajas: fila.existencia,
        motivo: `Migración ${referencia} · zona anotada: '${fila.zonaCruda}' · ${detalle}`,
      });
      excepciones.push({ hoja: fila.hoja, fila: fila.fila, codigo: fila.codigo, motivo: detalle });
    }

    totalPorHoja[fila.hoja] += fila.existencia;
  }

  return {
    productos: [...productos.values()],
    zonas: [...zonas].sort(),
    movimientos,
    excepciones,
    totalPorHoja,
  };
}
