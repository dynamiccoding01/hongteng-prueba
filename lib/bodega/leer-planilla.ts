/**
 * Lectura de BODEGA.xls (ADM-04).
 *
 * Detalles del archivo real que obligan a leerlo asi:
 *  - Las columnas NO estan en la misma posicion en cada hoja: 出库 esta en la
 *    columna 36 en 'nino' y 'ropa', pero en la 37 en 'adulto'. Se detectan por
 *    encabezado, nunca por indice fijo.
 *  - Al pie de cada hoja hay una fila de totales (入库总数 / 实存总数). Si se lee
 *    como producto, los totales salen exactamente al doble.
 *  - El calzado se cuenta en pares (双数) y la ropa en piezas (件数).
 *  - Hay codigos numericos ('80013', '308') que deben quedar como texto.
 */

import * as XLSX from 'xlsx';

export const HOJAS_DETALLE = ['nino', 'juvenli', 'adulto', 'ropa'] as const;
export type HojaDetalle = (typeof HOJAS_DETALLE)[number];

/** Encabezados originales en chino de la planilla. */
const COL = {
  codigo: '货号',
  paresPorCaja: '双数',
  piezasPorCaja: '件数',
  rangoTallas: '码段',
  entradas: '入库',
  salidas: '出库',
  existencia: '实存',
  zona: '区域',
} as const;

/** Texto de la fila de totales al pie de cada hoja: debe descartarse. */
const MARCAS_TOTAL = ['入库总数', '实存总数', '合计'];

export interface FilaPlanilla {
  hoja: HojaDetalle;
  fila: number;
  codigo: string;
  unidadesPorCaja: number;
  rangoTallas: string;
  entradas: number;
  salidas: number;
  existencia: number;
  zonaCruda: string;
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  // Los codigos numericos llegan como number: '80013' no debe quedar como '80013.0'.
  if (typeof valor === 'number') return Number.isInteger(valor) ? String(valor) : String(valor);
  return String(valor).trim();
}

function numero(valor: unknown): number {
  if (typeof valor === 'number') return valor;
  const n = Number(String(valor ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

/** Ubica la fila de encabezados y devuelve el indice de cada columna. */
function mapearColumnas(filas: unknown[][]): {
  filaEncabezado: number;
  indices: Map<string, number>;
} {
  for (let f = 0; f < Math.min(6, filas.length); f++) {
    const fila = filas[f] ?? [];
    const indices = new Map<string, number>();

    fila.forEach((celda, i) => {
      const nombre = texto(celda);
      if (Object.values(COL).includes(nombre as (typeof COL)[keyof typeof COL])) {
        if (!indices.has(nombre)) indices.set(nombre, i);
      }
    });

    if (indices.has(COL.codigo) && indices.has(COL.existencia)) {
      return { filaEncabezado: f, indices };
    }
  }
  throw new Error('No se encontro la fila de encabezados (货号 / 实存) en la hoja');
}

export function leerHoja(libro: XLSX.WorkBook, hoja: HojaDetalle): FilaPlanilla[] {
  const sheet = libro.Sheets[hoja];
  if (!sheet) throw new Error(`La hoja '${hoja}' no existe en el archivo`);

  const filas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const { filaEncabezado, indices } = mapearColumnas(filas);

  const iCodigo = indices.get(COL.codigo)!;
  const iUnidades = indices.get(COL.paresPorCaja) ?? indices.get(COL.piezasPorCaja);
  const iTallas = indices.get(COL.rangoTallas);
  const iEntradas = indices.get(COL.entradas);
  const iSalidas = indices.get(COL.salidas);
  const iExistencia = indices.get(COL.existencia)!;
  const iZona = indices.get(COL.zona);

  const resultado: FilaPlanilla[] = [];

  for (let f = filaEncabezado + 1; f < filas.length; f++) {
    const fila = filas[f] ?? [];
    const codigo = texto(fila[iCodigo]);

    if (codigo === '') continue;
    // Descarta la fila de totales del pie.
    if (MARCAS_TOTAL.some((marca) => codigo.includes(marca))) continue;

    resultado.push({
      hoja,
      fila: f + 1, // 1-based, para poder citarlo en el reporte de excepciones
      codigo,
      unidadesPorCaja: iUnidades === undefined ? 0 : numero(fila[iUnidades]),
      rangoTallas: iTallas === undefined ? '' : texto(fila[iTallas]),
      entradas: iEntradas === undefined ? 0 : numero(fila[iEntradas]),
      salidas: iSalidas === undefined ? 0 : numero(fila[iSalidas]),
      existencia: numero(fila[iExistencia]),
      zonaCruda: iZona === undefined ? '' : texto(fila[iZona]),
    });
  }

  return resultado;
}

export function leerPlanilla(ruta: string): Map<HojaDetalle, FilaPlanilla[]> {
  const libro = XLSX.readFile(ruta, { cellDates: false });
  const porHoja = new Map<HojaDetalle, FilaPlanilla[]>();
  for (const hoja of HOJAS_DETALLE) {
    porHoja.set(hoja, leerHoja(libro, hoja));
  }
  return porHoja;
}

/** Totales declarados por el cliente en la hoja de resumen 汇总. */
export const TOTALES_ESPERADOS = {
  nino: { entradas: 6771, existencia: 3889 },
  juvenli: { entradas: 12561, existencia: 6649 },
  adulto: { entradas: 14528, existencia: 8002 },
  ropa: { entradas: 1182, existencia: 627 },
} as const satisfies Record<HojaDetalle, { entradas: number; existencia: number }>;
