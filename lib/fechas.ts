/**
 * Días del calendario escritos como `aaaa-mm-dd`, que es como los mandan los
 * `<input type="date">` y como viajan en la URL de los filtros.
 *
 * Comprobar la **forma** no alcanza, y esa fue una regresión real: la bitácora
 * validaba con `/^\d{4}-\d{2}-\d{2}$/` y `?desde=9999-99-99` pasaba el filtro,
 * daba `Invalid Date` y hacía saltar un `RangeError` dentro de
 * `Intl.DateTimeFormat` — en un Server Component, o sea un 500 en la pantalla
 * de auditoría por un enlace mal editado.
 *
 * El otro caso es más silencioso todavía: `2026-02-30` sí construye una fecha,
 * pero es el 2 de marzo. Sin esta comprobación el sistema filtra por un rango
 * que nadie pidió mientras la pantalla sigue mostrando el 30 de febrero.
 */

import { z } from 'zod';
import { comoDia } from './bitacora/rango-fechas';

const FORMATO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `true` solo si el texto es un día que existe de verdad.
 *
 * Se comprueba reconstruyendo la fecha en UTC y mirando si los tres números
 * sobrevivieron: si `Date` tuvo que correr el día —el 30 de febrero pasa a ser
 * el 2 de marzo—, no era ese día.
 */
export function esDia(texto: string): boolean {
  if (!FORMATO.test(texto)) return false;

  const partes = texto.split('-');
  const anio = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);

  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/** El día que se validó, o `undefined` si no era un día. Para filtros de URL. */
export function diaOmitido(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' && esDia(valor) ? valor : undefined;
}

/**
 * Esquema Zod de un día, para los `acciones.ts`.
 *
 * El mensaje está escrito para quien digita: la fecha de un documento decide
 * con qué tipo de cambio se congela (`fn_documento_tipo_cambio`), así que un
 * error aquí no es cosmético.
 */
export const esquemaDia = z
  .string()
  .trim()
  .refine(esDia, 'La fecha no es válida: se escribe aaaa-mm-dd y tiene que existir');

/**
 * El día de hoy en Chile, como `aaaa-mm-dd`.
 *
 * No vale `new Date().toISOString().slice(0, 10)`: eso da el día en UTC, y
 * desde las 21:00 de Chile ya es el día siguiente allá. Un formulario abierto
 * de noche vendría con la fecha de mañana.
 */
export function hoy(): string {
  return comoDia(new Date());
}
