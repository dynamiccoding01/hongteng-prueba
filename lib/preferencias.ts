import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import type { Idioma } from './i18n';

export type Tema = 'claro' | 'oscuro' | 'sistema';

const COOKIE_TEMA = 'tema';
const COOKIE_IDIOMA = 'idioma';

/** Preferencia de tema guardada en cookie. Nunca en base de datos: es de la sesión del navegador. */
export const obtenerTema = cache(async (): Promise<Tema> => {
  const almacen = await cookies();
  const valor = almacen.get(COOKIE_TEMA)?.value;
  return valor === 'claro' || valor === 'oscuro' ? valor : 'sistema';
});

/** Idioma de la interfaz fija (menú y botones comunes). El contenido de cada página sigue en español. */
export const obtenerIdioma = cache(async (): Promise<Idioma> => {
  const almacen = await cookies();
  const valor = almacen.get(COOKIE_IDIOMA)?.value;
  return valor === 'zh' ? 'zh' : 'es';
});

export { COOKIE_TEMA, COOKIE_IDIOMA };
