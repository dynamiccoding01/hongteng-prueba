'use client';

import { useTransition } from 'react';
import { Moon, Sun } from 'lucide-react';
import { fijarTema } from '@/lib/acciones-preferencias';
import type { Tema } from '@/lib/preferencias';
import { t, type Idioma } from '@/lib/i18n';

/**
 * Botón simple de tema claro/oscuro para el pie del menú. Alterna entre los
 * dos; si el tema actual es «sistema», el primer clic fija «oscuro». El
 * selector de tres opciones (incluye «sistema») sigue disponible en Ajustes.
 */
export function BotonTema({ temaActual, idioma }: { temaActual: Tema; idioma: Idioma }) {
  const [pendiente, iniciarTransicion] = useTransition();
  const esOscuro = temaActual === 'oscuro';
  const objetivo: Tema = esOscuro ? 'claro' : 'oscuro';

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => iniciarTransicion(() => fijarTema(objetivo))}
      title={t(idioma, 'ajustesTema')}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-200/60 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
    >
      {esOscuro ? <Sun className="size-4 shrink-0" /> : <Moon className="size-4 shrink-0" />}
      <span className="truncate">
        {t(idioma, esOscuro ? 'ajustesTemaClaro' : 'ajustesTemaOscuro')}
      </span>
    </button>
  );
}
