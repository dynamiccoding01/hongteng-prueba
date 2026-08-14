'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { buscarArticulos } from '@/lib/inventario/buscar-articulos';
import { totalDisponible, unidadLegible, type ArticuloEncontrado } from '@/lib/inventario/articulo';
import { numero } from './ui';

/**
 * Selector de artículo que consulta la base mientras se escribe.
 *
 * Reemplaza a `SeleccionBuscable` en los formularios de inventario y ventas:
 * aquel recibía la lista ya cargada y la filtraba en el navegador, lo que
 * obligaba a traer el catálogo entero (y a cortarlo en 1.000). Aquí el filtro
 * lo hace PostgreSQL, así que da igual cuántos artículos haya.
 *
 * Además devuelve el artículo completo por `alElegir`, con sus existencias por
 * zona, para que el formulario pueda reaccionar: limitar las cajas al stock
 * disponible u ofrecer solo las zonas donde de verdad hay mercadería.
 *
 * Con `exigirExistencia` —ventas y traspasos, donde la mercadería sale de
 * bodega— los artículos sin stock aparecen pero no se pueden elegir. Aparecen
 * y no se ocultan a propósito: quien busca un código que sabe que existe tiene
 * que leer *por qué* no puede usarlo, no un «Sin resultados» que parece una
 * falla del buscador.
 */
export function SelectorArticulo({
  etiqueta = 'Artículo',
  nombre,
  requerido,
  alElegir,
  ancho,
  exigirExistencia,
}: {
  etiqueta?: string;
  nombre: string;
  requerido?: boolean;
  alElegir?: (articulo: ArticuloEncontrado | null) => void;
  ancho?: 'completo';
  /** La operación saca mercadería: sin existencia no hay nada que mover. */
  exigirExistencia?: boolean;
}) {
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState<ArticuloEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [elegido, setElegido] = useState<ArticuloEncontrado | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const idLista = useId();

  // Cierra al hacer clic fuera.
  useEffect(() => {
    function fuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  // Se espera a que la persona deje de escribir antes de consultar, y se
  // descarta el resultado si mientras tanto llegó otra búsqueda.
  useEffect(() => {
    if (!abierto) return;
    let vigente = true;
    setBuscando(true);
    const temporizador = setTimeout(() => {
      buscarArticulos(consulta)
        .then((filas) => {
          if (vigente) setResultados(filas);
        })
        .finally(() => {
          if (vigente) setBuscando(false);
        });
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [consulta, abierto]);

  function elegir(articulo: ArticuloEncontrado) {
    setElegido(articulo);
    setAbierto(false);
    setConsulta('');
    alElegir?.(articulo);
  }

  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho === 'completo' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">{etiqueta}</span>
      <div className="relative" ref={contenedor}>
        {/*
         * Un `<input type="hidden">` está excluido de la validación de
         * restricciones del navegador: su `required` no impide enviar el
         * formulario vacío. Este `<select>` invisible pero renderizado sí se
         * valida, así que el aviso sale al instante en vez de después de
         * consultar al servidor. La barrera real sigue siendo el Zod de
         * `acciones.ts`; esto es la comodidad que da cualquier `required`.
         */}
        <select
          name={nombre}
          value={elegido ? String(elegido.id) : ''}
          onChange={() => {}}
          required={requerido}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        >
          <option value="" />
          {/* Basta con representar «vacío» o «este artículo»: los resultados de
              la búsqueda cambian, pero el valor elegido es uno solo. */}
          {elegido ? <option value={String(elegido.id)} /> : null}
        </select>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={idLista}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 px-3 py-2 text-left outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className={`truncate ${elegido ? '' : 'text-zinc-400'}`}>
            {elegido
              ? `${elegido.codigo} — ${numero(elegido.unidadesPorCaja)} ${unidadLegible(elegido.unidad)} por caja`
              : 'Busque por código o descripción…'}
          </span>
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        </button>

        {abierto ? (
          <div
            id={idLista}
            className="absolute z-20 mt-1 w-full rounded-md border border-borde bg-superficie shadow-lg"
          >
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3 dark:border-zinc-700">
              <input
                autoFocus
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Código o descripción…"
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
              {buscando ? <Loader2 className="size-4 shrink-0 animate-spin text-zinc-400" /> : null}
            </div>

            <ul className="max-h-64 overflow-y-auto py-1">
              {resultados.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-400">
                  {buscando ? 'Buscando…' : 'Sin resultados'}
                </li>
              ) : (
                resultados.map((a) => {
                  const activo = elegido?.id === a.id;
                  const disponible = totalDisponible(a);
                  const bloqueado = exigirExistencia === true && disponible === 0;
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => elegir(a)}
                        disabled={bloqueado}
                        className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${
                          bloqueado
                            ? 'cursor-not-allowed opacity-55'
                            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        } ${activo ? 'text-acento' : ''}`}
                      >
                        <Check className={`mt-1 size-3.5 shrink-0 ${activo ? '' : 'invisible'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <code className="text-xs font-medium">{a.codigo}</code>
                            <span className="text-xs text-tenue">
                              {numero(a.unidadesPorCaja)} {unidadLegible(a.unidad)} por caja
                            </span>
                          </span>
                          {a.descripcion ? (
                            <span className="block truncate text-xs text-tenue">
                              {a.descripcion}
                            </span>
                          ) : null}
                          <span
                            className={`block text-xs ${
                              bloqueado
                                ? 'font-medium text-red-600 dark:text-red-400'
                                : 'text-tenue'
                            }`}
                          >
                            {disponible > 0
                              ? `${numero(disponible)} disponible en ${a.existencias.length} ${
                                  a.existencias.length === 1 ? 'zona' : 'zonas'
                                }`
                              : bloqueado
                                ? 'Sin existencia: no hay nada que sacar de bodega'
                                : 'sin existencia'}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </label>
  );
}
