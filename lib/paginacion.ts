/**
 * Paginación de listados.
 *
 * Regla del proyecto: ninguna pantalla trae la tabla entera. El corte se hace
 * en la base de datos con `.range()`, no en TypeScript — si se filtra en el
 * servidor de Next, las filas ya cruzaron la red y el problema sigue ahí.
 *
 * El estado vive en la URL (`?pagina=2&filas=15`) para que una vista concreta
 * se pueda compartir, recargar o guardar en favoritos.
 */

/** Las únicas opciones que se le ofrecen al usuario. */
export const FILAS_POR_PAGINA = [10, 15, 20] as const;

export const FILAS_POR_DEFECTO = 15;

export interface Paginacion {
  pagina: number;
  porPagina: number;
  /** Índices para `.range(desde, hasta)`, ambos inclusive. */
  desde: number;
  hasta: number;
}

function aEntero(valor: string | string[] | undefined): number | null {
  if (typeof valor !== 'string') return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Nombres de los parámetros en la URL. El prefijo permite dos listados
 * independientes en la misma pantalla (bodegas y zonas, por ejemplo) sin que
 * uno mueva la página del otro.
 */
export function clavesPaginacion(prefijo?: string): { pagina: string; filas: string } {
  return prefijo
    ? { pagina: `${prefijo}_pagina`, filas: `${prefijo}_filas` }
    : { pagina: 'pagina', filas: 'filas' };
}

/**
 * Lee `pagina` y `filas` de los parámetros de la URL.
 * Un valor ausente o disparatado cae en el valor por defecto en vez de romper
 * la página: estos parámetros los puede escribir cualquiera a mano.
 */
export function leerPaginacion(
  parametros: Record<string, string | string[] | undefined>,
  prefijo?: string,
): Paginacion {
  const claves = clavesPaginacion(prefijo);

  const filas = aEntero(parametros[claves.filas]);
  const porPagina =
    filas !== null && (FILAS_POR_PAGINA as readonly number[]).includes(filas)
      ? filas
      : FILAS_POR_DEFECTO;

  const pagina = aEntero(parametros[claves.pagina]) ?? 1;
  const desde = (pagina - 1) * porPagina;

  return { pagina, porPagina, desde, hasta: desde + porPagina - 1 };
}

/** Cantidad de páginas para un total dado. Siempre al menos 1. */
export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}
