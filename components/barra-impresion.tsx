'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';

/** Una copia elegible, con el motivo por el que existe. */
export interface CopiaElegible {
  clave: string;
  titulo: string;
  para: string;
}

/**
 * Barra de la vista de impresión: qué copias salen y el botón de imprimir.
 *
 * No va al papel (`no-imprimir`). Las copias no se filtran en el servidor sino
 * que se ocultan aquí: las cuatro ya vienen renderizadas, así que marcar y
 * desmarcar es instantáneo y no vuelve a consultar la base. Ocultar es
 * suficiente porque `display: none` también saca la hoja del flujo de
 * paginación, y una hoja oculta no gasta papel.
 */
export function BarraImpresion({ copias }: { copias: CopiaElegible[] }) {
  const [activas, setActivas] = useState<string[]>(copias.map((c) => c.clave));

  function alternar(clave: string) {
    setActivas((previas) =>
      previas.includes(clave) ? previas.filter((c) => c !== clave) : [...previas, clave],
    );
  }

  return (
    <>
      {/*
       * Las hojas viven en el servidor; esto solo dice cuáles se ven. El
       * selector `.hoja[data-copia="x"]` se escribe aquí para no tener que
       * subir el estado hasta la página, que es un Server Component.
       */}
      <style>
        {copias
          .filter((c) => !activas.includes(c.clave))
          .map((c) => `.hoja[data-copia="${c.clave}"]{display:none}`)
          .join('')}
      </style>

      <div className="no-imprimir sticky top-0 z-10 mb-6 border-b border-zinc-300 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[216mm] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-900">Copias a imprimir</p>

          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {copias.map((c) => (
              <label
                key={c.clave}
                className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-700"
                title={c.para}
              >
                <input
                  type="checkbox"
                  checked={activas.includes(c.clave)}
                  onChange={() => alternar(c.clave)}
                  className="size-4 accent-indigo-600"
                />
                {c.titulo}
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={activas.length === 0}
            className="ml-auto flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <Printer className="size-4" />
            Imprimir {activas.length === copias.length ? 'las 4 copias' : `(${activas.length})`}
          </button>
        </div>
      </div>
    </>
  );
}
