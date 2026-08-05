'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Boxes, Menu, X } from 'lucide-react';

/**
 * Carcasa responsive de las páginas privadas. En escritorio (lg+) el menú
 * lateral queda fijo a la izquierda, igual que siempre. En móvil se esconde
 * fuera de pantalla y aparece una barra superior con un botón de menú que lo
 * despliega sobre un fondo oscurecido.
 *
 * El contenido del menú (`navegacion`) se calcula en el servidor —con el
 * filtrado por permisos— y se pasa aquí ya renderizado; este componente solo
 * gobierna abrir/cerrar y la posición, sin conocer la lógica de permisos.
 */
export function Marco({
  navegacion,
  children,
}: {
  navegacion: React.ReactNode;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  // Al navegar a otra página, el menú móvil se cierra solo.
  useEffect(() => setAbierto(false), [ruta]);

  // Con el menú abierto en móvil: Escape lo cierra.
  useEffect(() => {
    if (!abierto) return;
    function alTecla(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('keydown', alTecla);
    return () => document.removeEventListener('keydown', alTecla);
  }, [abierto]);

  return (
    <div className="flex min-h-screen">
      {abierto ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 [animation:aparecer_.2s_ease-out] lg:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-borde bg-menu transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          abierto ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={() => setAbierto(false)}
          aria-label="Cerrar menú"
          className="absolute top-2 right-2 rounded-md p-1.5 text-tenue hover:bg-black/5 lg:hidden dark:hover:bg-white/10"
        >
          <X className="size-5" />
        </button>
        {navegacion}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-borde bg-menu px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir menú"
            className="rounded-md p-1.5 text-tenue hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex size-6 items-center justify-center rounded-md bg-acento text-white">
            <Boxes className="size-3.5" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold">Hong Teng</span>
        </header>

        <main className="flex-1 overflow-x-auto px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
