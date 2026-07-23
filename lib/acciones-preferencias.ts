'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { Idioma } from './i18n';
import { COOKIE_IDIOMA, COOKIE_TEMA, type Tema } from './preferencias';

const UN_ANIO = 60 * 60 * 24 * 365;

/** Cambia el tema (claro/oscuro/sistema). Guardado en cookie: nunca en base de datos. */
export async function fijarTema(tema: Tema): Promise<void> {
  if (tema !== 'claro' && tema !== 'oscuro' && tema !== 'sistema') return;
  const almacen = await cookies();
  almacen.set(COOKIE_TEMA, tema, { maxAge: UN_ANIO, path: '/', sameSite: 'lax', httpOnly: true });
  // Revalida todo el árbol: el atributo data-theme lo estampa el layout raíz.
  revalidatePath('/', 'layout');
}

/** Cambia el idioma de la interfaz fija (menú y botones comunes). */
export async function fijarIdioma(idioma: Idioma): Promise<void> {
  if (idioma !== 'es' && idioma !== 'zh') return;
  const almacen = await cookies();
  almacen.set(COOKIE_IDIOMA, idioma, {
    maxAge: UN_ANIO,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  });
  revalidatePath('/', 'layout');
}
