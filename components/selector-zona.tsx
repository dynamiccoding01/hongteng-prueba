'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { DistintivoBodega } from './color-bodega';
import { numero } from './ui';
import type { ExistenciaZona } from '@/lib/inventario/articulo';

/** Una zona elegible, con el color de su bodega. */
export interface ZonaOpcion {
  id: number;
  codigo: string;
  bodega: string;
  bodegaNombre: string | null;
  color: string;
}

/**
 * Selector de zona con el color de su bodega.
 *
 * Un `<select>` nativo no admite nada más que texto en sus opciones, así que
 * para mostrar el color hay que construir la lista a mano. A cambio se puede
 * hacer algo que el nativo tampoco permite: poner arriba las zonas donde el
 * artículo elegido **ya tiene existencia**, con cuánto hay en cada una.
 *
 * Esas son sugerencias, no un filtro: la lista completa sigue debajo, agrupada
 * por bodega, porque una importación bien puede llegar a una zona nueva.
 */
export function SelectorZona({
  etiqueta = 'Zona',
  nombre,
  zonas,
  valor,
  alCambiar,
  sugeridas = [],
  soloConExistencia,
  requerido,
  ayuda,
  ancho,
}: {
  etiqueta?: string;
  nombre: string;
  zonas: ZonaOpcion[];
  valor: string;
  alCambiar: (valor: string) => void;
  /** Zonas donde el artículo elegido ya tiene existencia. */
  sugeridas?: ExistenciaZona[];
  /**
   * Oculta el bloque «todas las zonas». Se usa cuando elegir otra no tiene
   * sentido —una venta solo puede salir de donde hay— y `zonas` ya trae
   * exactamente las mismas que `sugeridas`: sin esto saldrían repetidas.
   */
  soloConExistencia?: boolean;
  requerido?: boolean;
  ayuda?: string;
  ancho?: 'completo';
}) {
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const contenedor = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    function fuera(evento: MouseEvent) {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  /*
   * El formulario se dibuja dentro de un contenedor con scroll propio, así que
   * una lista desplegada cerca del borde queda cortada. Al abrirla se la trae a
   * la vista; `block: 'nearest'` mueve lo mínimo necesario.
   */
  useEffect(() => {
    if (!abierto) return;
    const id = window.setTimeout(
      () => lista.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      0,
    );
    return () => window.clearTimeout(id);
  }, [abierto]);

  const elegida = zonas.find((z) => String(z.id) === valor);
  const idsSugeridas = new Set(sugeridas.map((s) => s.zonaId));

  const texto = consulta.trim().toLowerCase();

  function coincide(codigo: string, bodega: string, bodegaNombre: string | null): boolean {
    if (!texto) return true;
    return (
      codigo.toLowerCase().includes(texto) ||
      bodega.toLowerCase().includes(texto) ||
      (bodegaNombre ?? '').toLowerCase().includes(texto)
    );
  }

  const sugeridasFiltradas = sugeridas.filter((s) => coincide(s.zona, s.bodega, s.bodegaNombre));

  const filtradas = useMemo(() => {
    if (soloConExistencia) return [];
    if (!texto) return zonas;
    return zonas.filter(
      (z) =>
        z.codigo.toLowerCase().includes(texto) ||
        z.bodega.toLowerCase().includes(texto) ||
        (z.bodegaNombre ?? '').toLowerCase().includes(texto),
    );
  }, [zonas, texto, soloConExistencia]);

  /** La lista completa, agrupada por bodega y conservando su orden. */
  const porBodega = useMemo(() => {
    const grupos = new Map<string, ZonaOpcion[]>();
    for (const z of filtradas) {
      const grupo = grupos.get(z.bodega) ?? [];
      grupo.push(z);
      grupos.set(z.bodega, grupo);
    }
    return [...grupos.entries()];
  }, [filtradas]);

  function elegir(id: number) {
    alCambiar(String(id));
    setAbierto(false);
    setConsulta('');
  }

  return (
    <label className={`flex flex-col gap-1 text-sm ${ancho === 'completo' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">{etiqueta}</span>
      <div className="relative" ref={contenedor}>
        {/*
         * Este `<select>` es el que viaja en el formulario, y existe por una
         * razón concreta: un `<input type="hidden">` está excluido de la
         * validación de restricciones del navegador, así que su `required` no
         * impide nada. Aquí es un control de verdad —invisible pero
         * renderizado, que es lo que exige la especificación para validarlo—,
         * de modo que el aviso sale al instante y no después de ir al servidor.
         *
         * Sigue sin ser la barrera: esa es el esquema Zod de `acciones.ts`.
         * Es la misma comodidad que da `required` en cualquier campo normal.
         */}
        <select
          name={nombre}
          value={valor}
          onChange={() => {}}
          required={requerido}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0"
        >
          <option value="" />
          {zonas.map((z) => (
            <option key={z.id} value={z.id} />
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={idLista}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 px-3 py-2 text-left outline-none focus-visible:border-acento focus-visible:ring-2 focus-visible:ring-acento/30 dark:border-zinc-700 dark:bg-zinc-900"
        >
          {elegida ? (
            <span className="flex min-w-0 items-center gap-2">
              <DistintivoBodega
                codigo={elegida.bodega}
                color={elegida.color}
                titulo={elegida.bodegaNombre}
              />
              <code className="truncate text-xs">{elegida.codigo}</code>
              {idsSugeridas.has(elegida.id) ? (
                <span className="text-xs text-tenue">· ya tiene existencia</span>
              ) : null}
            </span>
          ) : (
            <span className="text-zinc-400">Seleccione la zona…</span>
          )}
          <ChevronDown className="size-4 shrink-0 text-zinc-400" />
        </button>

        {abierto ? (
          <div
            id={idLista}
            ref={lista}
            className="absolute z-20 mt-1 w-full rounded-md border border-borde bg-superficie shadow-lg"
          >
            <div className="border-b border-zinc-200 px-3 dark:border-zinc-700">
              <input
                autoFocus
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
                placeholder="Bodega o zona…"
                className="w-full bg-transparent py-2 text-sm outline-none"
              />
            </div>

            <div className="max-h-56 overflow-y-auto py-1">
              {sugeridasFiltradas.length > 0 ? (
                <>
                  <p className="px-3 py-1 text-xs font-medium text-tenue">
                    {soloConExistencia ? 'Zonas con existencia' : 'Este artículo ya está en'}
                  </p>
                  {sugeridasFiltradas.map((s) => (
                    <Opcion
                      key={`s-${s.zonaId}`}
                      bodega={s.bodega}
                      bodegaNombre={s.bodegaNombre}
                      color={s.color}
                      codigo={s.zona}
                      detalle={`${numero(s.cantidad)} en existencia`}
                      activa={valor === String(s.zonaId)}
                      alElegir={() => elegir(s.zonaId)}
                    />
                  ))}
                  {soloConExistencia ? null : (
                    <p className="mt-1 border-t border-borde/60 px-3 pt-2 pb-1 text-xs font-medium text-tenue">
                      Todas las zonas
                    </p>
                  )}
                </>
              ) : null}

              {porBodega.length === 0 ? (
                sugeridasFiltradas.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-zinc-400">Sin resultados</p>
                ) : null
              ) : (
                porBodega.map(([bodega, delGrupo]) => (
                  <div key={bodega}>
                    {delGrupo.map((z) => (
                      <Opcion
                        key={z.id}
                        bodega={z.bodega}
                        bodegaNombre={z.bodegaNombre}
                        color={z.color}
                        codigo={z.codigo}
                        activa={valor === String(z.id)}
                        alElegir={() => elegir(z.id)}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
      {ayuda ? <span className="text-xs text-tenue">{ayuda}</span> : null}
    </label>
  );
}

function Opcion({
  bodega,
  bodegaNombre,
  color,
  codigo,
  detalle,
  activa,
  alElegir,
}: {
  bodega: string;
  bodegaNombre: string | null;
  color: string;
  codigo: string;
  detalle?: string;
  activa: boolean;
  alElegir: () => void;
}) {
  return (
    <button
      type="button"
      onClick={alElegir}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
        activa ? 'text-acento' : ''
      }`}
    >
      <Check className={`size-3.5 shrink-0 ${activa ? '' : 'invisible'}`} />
      <DistintivoBodega codigo={bodega} color={color} titulo={bodegaNombre} />
      <code className="text-xs">{codigo}</code>
      {detalle ? <span className="ml-auto text-xs text-tenue">{detalle}</span> : null}
    </button>
  );
}
