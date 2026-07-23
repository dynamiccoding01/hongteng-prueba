'use client';

import { useTransition } from 'react';
import { fijarTema } from '@/lib/acciones-preferencias';
import type { Tema } from '@/lib/preferencias';
import { t, type Idioma } from '@/lib/i18n';

const OPCIONES: {
  valor: Tema;
  clave: 'ajustesTemaClaro' | 'ajustesTemaOscuro' | 'ajustesTemaSistema';
}[] = [
  { valor: 'claro', clave: 'ajustesTemaClaro' },
  { valor: 'oscuro', clave: 'ajustesTemaOscuro' },
  { valor: 'sistema', clave: 'ajustesTemaSistema' },
];

export function SelectorTema({ temaActual, idioma }: { temaActual: Tema; idioma: Idioma }) {
  const [pendiente, iniciarTransicion] = useTransition();

  return (
    <div className="flex gap-1">
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          disabled={pendiente}
          onClick={() => iniciarTransicion(() => fijarTema(o.valor))}
          className={`rounded-md px-2 py-1 text-xs transition disabled:opacity-60 ${
            o.valor === temaActual
              ? 'bg-acento text-white'
              : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
          }`}
        >
          {t(idioma, o.clave)}
        </button>
      ))}
    </div>
  );
}
