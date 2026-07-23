'use client';

import { useTransition } from 'react';
import { fijarIdioma } from '@/lib/acciones-preferencias';
import { t, type Idioma } from '@/lib/i18n';

const OPCIONES: { valor: Idioma; clave: 'ajustesIdiomaEs' | 'ajustesIdiomaZh' }[] = [
  { valor: 'es', clave: 'ajustesIdiomaEs' },
  { valor: 'zh', clave: 'ajustesIdiomaZh' },
];

export function SelectorIdioma({ idioma }: { idioma: Idioma }) {
  const [pendiente, iniciarTransicion] = useTransition();

  return (
    <div className="flex gap-1">
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          disabled={pendiente}
          onClick={() => iniciarTransicion(() => fijarIdioma(o.valor))}
          className={`rounded-md px-3 py-1.5 text-sm transition disabled:opacity-60 ${
            o.valor === idioma
              ? 'bg-acento text-white'
              : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
          }`}
        >
          {t(idioma, o.clave)}
        </button>
      ))}
    </div>
  );
}
