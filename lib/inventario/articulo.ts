/**
 * Forma de un artículo devuelto por el buscador.
 *
 * Va en su propio archivo porque un módulo con `'use server'` solo puede
 * exportar funciones asíncronas: los tipos tienen que vivir aparte.
 */

/** Existencia de un empaque en una zona concreta. */
export interface ExistenciaZona {
  zonaId: number;
  zona: string;
  bodega: string;
  bodegaNombre: string | null;
  color: string;
  cantidad: number;
}

/**
 * Un empaque encontrado, con todo lo que los formularios necesitan saber sin
 * volver a consultar: cuánto trae la caja, en qué se cuenta y dónde hay.
 */
export interface ArticuloEncontrado {
  /** id de `producto_variante`: es a lo que apuntan stock y movimiento. */
  id: number;
  codigo: string;
  descripcion: string | null;
  unidadesPorCaja: number;
  unidad: string;
  existencias: ExistenciaZona[];
}

/** Total disponible del empaque, sumando todas sus zonas. */
export function totalDisponible(a: ArticuloEncontrado): number {
  return a.existencias.reduce((s, e) => s + e.cantidad, 0);
}

/** Cómo se muestra el artículo una vez elegido. */
export function etiquetaArticulo(a: ArticuloEncontrado): string {
  return `${a.codigo} — ${a.unidadesPorCaja} por caja`;
}

/**
 * La unidad de medida tal como se lee en la frase «N ___ por caja».
 *
 * Hoy los nueve artículos tienen «Caja» como unidad de medida, así que la frase
 * sale «5 caja por caja», que no dice nada. Eso es un dato mal cargado en el
 * maestro —la unidad debería ser par, pieza o juego, no caja— y se arregla en
 * /maestros/productos. Mientras tanto, aquí se dice «unidades»: es genérico
 * pero cierto, en vez de repetir la palabra caja dos veces.
 */
export function unidadLegible(unidad: string): string {
  return /caja/i.test(unidad) ? 'unidades' : unidad.toLowerCase();
}

/** La misma unidad en singular, para frases como «150 CLP / par». */
export function unidadSingular(unidad: string): string {
  return unidadLegible(unidad).replace(/e?s$/, '');
}
