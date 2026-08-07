'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FILAS_POR_PAGINA, clavesPaginacion, totalPaginas } from '@/lib/paginacion';
import { numero } from './ui';

/**
 * Controles de paginación de un listado.
 *
 * Escribe `pagina` y `filas` en la URL; la página es un Server Component que
 * los lee y consulta solo ese tramo. No recibe ni guarda las filas: solo mueve
 * los parámetros.
 */
export function Paginacion({
  total,
  pagina,
  porPagina,
  prefijo,
}: {
  total: number;
  pagina: number;
  porPagina: number;
  /** Para dos listados en la misma pantalla; ver `clavesPaginacion`. */
  prefijo?: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [pendiente, iniciarTransicion] = useTransition();

  const claves = clavesPaginacion(prefijo);
  const paginas = totalPaginas(total, porPagina);
  const primera = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const ultima = Math.min(pagina * porPagina, total);

  function ir(nuevaPagina: number, filas = porPagina) {
    const nuevos = new URLSearchParams(parametros.toString());
    nuevos.set(claves.filas, String(filas));
    if (nuevaPagina <= 1) nuevos.delete(claves.pagina);
    else nuevos.set(claves.pagina, String(nuevaPagina));
    iniciarTransicion(() => router.push(`?${nuevos.toString()}`));
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-tenue">Filas</span>
          <select
            value={porPagina}
            // Cambiar el tamaño vuelve a la página 1: la 7 puede no existir con
            // filas más grandes.
            onChange={(e) => ir(1, Number(e.target.value))}
            disabled={pendiente}
            className="rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {FILAS_POR_PAGINA.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <span className="text-tenue">
          {total === 0
            ? 'Sin resultados'
            : `${numero(primera)}–${numero(ultima)} de ${numero(total)}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => ir(pagina - 1)}
          disabled={pagina <= 1 || pendiente}
          aria-label="Página anterior"
          className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
        >
          <ChevronLeft className="size-4" />
          Anterior
        </button>

        <span className="text-tenue">
          {numero(pagina)} / {numero(paginas)}
        </span>

        <button
          type="button"
          onClick={() => ir(pagina + 1)}
          disabled={pagina >= paginas || pendiente}
          aria-label="Página siguiente"
          className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
        >
          Siguiente
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
