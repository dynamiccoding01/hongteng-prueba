'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Opcion {
  valor: string | number;
  texto: string;
}

/**
 * Selector con búsqueda: reemplazo directo de <Seleccion> para listas largas
 * (artículos, clientes, zonas), donde un <select> nativo con cientos de
 * opciones es inmanejable. Escribe y filtra al instante.
 *
 * Mantiene el envío por formulario: un <input hidden name={nombre}> lleva el
 * valor seleccionado, igual que haría el <select>, así el Server Action lo
 * recibe sin cambios. Los mismos props que <Seleccion>, para intercambiar
 * uno por otro con un solo cambio de nombre.
 */
const LIMITE_VISIBLE = 50;

export function SeleccionBuscable({
  etiqueta,
  nombre,
  valor,
  opciones,
  requerido,
}: {
  etiqueta: string;
  nombre: string;
  valor?: string | number | null;
  opciones: Opcion[];
  requerido?: boolean;
}) {
  const inicial = opciones.find((o) => String(o.valor) === String(valor ?? ''));
  const [seleccion, setSeleccion] = useState<Opcion | undefined>(inicial);
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
        setConsulta('');
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const coincidencias = consulta
    ? opciones.filter((o) => o.texto.toLowerCase().includes(consulta.toLowerCase()))
    : opciones;
  const mostradas = coincidencias.slice(0, LIMITE_VISIBLE);
  const ocultas = coincidencias.length - mostradas.length;

  function elegir(opcion: Opcion) {
    setSeleccion(opcion);
    setAbierto(false);
    setConsulta('');
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <div className="relative" ref={contenedor}>
        <input
          type="hidden"
          name={nombre}
          value={seleccion ? String(seleccion.valor) : ''}
          required={requerido}
        />
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 px-3 py-2 text-left outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <span className={`truncate ${seleccion ? '' : 'text-zinc-400'}`}>
            {seleccion ? seleccion.texto : 'Seleccione…'}
          </span>
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        </button>

        {abierto ? (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <input
              autoFocus
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              placeholder="Buscar…"
              className="w-full border-b border-zinc-200 bg-transparent px-3 py-2 text-sm outline-none dark:border-zinc-700"
            />
            <ul className="max-h-56 overflow-y-auto py-1">
              {mostradas.length === 0 ? (
                <li className="px-3 py-2 text-sm text-zinc-400">Sin resultados</li>
              ) : (
                mostradas.map((o) => {
                  const activa = seleccion?.valor === o.valor;
                  return (
                    <li key={o.valor}>
                      <button
                        type="button"
                        onClick={() => elegir(o)}
                        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                          activa ? 'font-medium text-acento' : ''
                        }`}
                      >
                        <Check className={`size-3.5 shrink-0 ${activa ? '' : 'invisible'}`} />
                        <span className="truncate">{o.texto}</span>
                      </button>
                    </li>
                  );
                })
              )}
              {ocultas > 0 ? (
                <li className="px-3 py-1.5 text-xs text-zinc-400">
                  y {ocultas} más… escriba para filtrar
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </label>
  );
}
