'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

/**
 * Buscador que sincroniza el texto con la URL, para que una búsqueda se pueda
 * compartir o recargar sin perderla.
 */
export function Buscador({ marcador = 'Buscar…' }: { marcador?: string }) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [texto, setTexto] = useState(parametros.get('q') ?? '');
  const [pendiente, iniciarTransicion] = useTransition();

  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const nuevos = new URLSearchParams(parametros.toString());
    if (texto.trim()) nuevos.set('q', texto.trim());
    else nuevos.delete('q');
    nuevos.delete('pagina');
    iniciarTransicion(() => router.push(`?${nuevos.toString()}`));
  }

  return (
    <form onSubmit={buscar} className="flex gap-2">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={marcador}
        className="w-64 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700"
      >
        {pendiente ? 'Buscando…' : 'Buscar'}
      </button>
    </form>
  );
}
