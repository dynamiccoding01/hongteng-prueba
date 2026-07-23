'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Campo pensado para un lector de código de barras/QR USB o Bluetooth: estos
 * dispositivos escriben el código y presionan Enter solos, igual que un
 * teclado. El campo se mantiene enfocado y se limpia después de cada lectura
 * para encadenar varios escaneos sin tocar el mouse.
 */
export function BuscadorCodigo() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [texto, setTexto] = useState('');
  const referencia = useRef<HTMLInputElement>(null);

  useEffect(() => {
    referencia.current?.focus();
  }, []);

  function buscar(evento: React.FormEvent) {
    evento.preventDefault();
    const valor = texto.trim();
    if (!valor) return;
    const nuevos = new URLSearchParams(parametros.toString());
    nuevos.set('codigo', valor);
    router.push(`?${nuevos.toString()}`);
    setTexto('');
    referencia.current?.focus();
  }

  return (
    <form onSubmit={buscar} className="flex gap-2">
      <input
        ref={referencia}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escanee o escriba el código…"
        autoComplete="off"
        className="w-72 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      />
      <button
        type="submit"
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
      >
        Buscar
      </button>
    </form>
  );
}
