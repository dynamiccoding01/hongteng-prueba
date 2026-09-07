'use client';

import { useEffect, useState } from 'react';
import { CLASE_CONTROL } from './formulario';
import { CampoCantidad } from './campo-cantidad';
import { SelectorArticulo } from './selector-articulo';
import { DistintivoBodega } from './color-bodega';
import { numero } from './ui';
import type { ArticuloEncontrado, ExistenciaZona } from '@/lib/inventario/articulo';

/**
 * Campos que reaccionan al artículo elegido, para movimientos y traspasos.
 *
 * Están juntos en un Client Component porque dependen unos de otros: la zona
 * que se puede elegir y el máximo de cajas salen de las existencias del
 * artículo, y eso solo se sabe después de elegirlo.
 *
 * Las comprobaciones de aquí son comodidad, no la barrera: el sobregiro lo
 * impide `stock_cantidad_check` en la base, y una salida mayor que la
 * existencia hace fallar la transacción completa aunque alguien manipule el
 * formulario.
 */

// La forma de una zona elegible se define junto al selector que la pinta.
// Se reexporta para no romper a quien ya la importaba desde aquí.
export type { ZonaOpcion } from './selector-zona';
import type { ZonaOpcion } from './selector-zona';

/** Un `<select>` controlado con el mismo aspecto que los del formulario. */
function Selector({
  etiqueta,
  valor,
  alCambiar,
  requerido,
  deshabilitado,
  ayuda,
  children,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  requerido?: boolean;
  deshabilitado?: boolean;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{etiqueta}</span>
      <select
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        required={requerido}
        disabled={deshabilitado}
        className={`${CLASE_CONTROL} disabled:opacity-50`}
      >
        {children}
      </select>
      {ayuda ? <span className="text-xs text-tenue">{ayuda}</span> : null}
    </label>
  );
}

/** Texto de una zona en la lista: bodega, código y cuánto hay. */
function textoZona(e: ExistenciaZona): string {
  return `${e.bodega} · ${e.zona} — ${numero(e.cantidad)} disponible`;
}

/** Aviso con el color de la bodega, bajo el selector de zona. */
function Disponible({ e }: { e: ExistenciaZona }) {
  return (
    <p className="flex items-center gap-2 text-xs text-tenue sm:col-span-2">
      <DistintivoBodega codigo={e.bodega} color={e.color} titulo={e.bodegaNombre} />
      <span>
        Zona <code className="text-xs">{e.zona}</code> · disponible{' '}
        <strong>{numero(e.cantidad)}</strong>
      </span>
    </p>
  );
}

const TIPOS = [
  { valor: 'ENTRADA', texto: 'Entrada' },
  { valor: 'SALIDA', texto: 'Salida' },
  { valor: 'AJUSTE_POSITIVO', texto: 'Ajuste positivo' },
  { valor: 'AJUSTE_NEGATIVO', texto: 'Ajuste negativo' },
];

/** INV-02: artículo, tipo, zona y cajas, encadenados. */
export function CamposMovimiento({ zonas }: { zonas: ZonaOpcion[] }) {
  const [articulo, setArticulo] = useState<ArticuloEncontrado | null>(null);
  const [tipo, setTipo] = useState('');
  const [zonaId, setZonaId] = useState('');

  // Al cambiar de artículo o de tipo, la zona elegida puede dejar de tener
  // sentido: se limpia en vez de arrastrar una selección inválida.
  useEffect(() => setZonaId(''), [articulo, tipo]);

  const descuenta = tipo === 'SALIDA' || tipo === 'AJUSTE_NEGATIVO';
  const esAjuste = tipo.startsWith('AJUSTE');
  const existencias = articulo?.existencias ?? [];
  const elegida = existencias.find((e) => String(e.zonaId) === zonaId);
  const maximo = descuenta && elegida ? elegida.cantidad : undefined;

  return (
    <>
      <SelectorArticulo nombre="variante_id" requerido alElegir={setArticulo} ancho="completo" />

      <Selector etiqueta="Tipo" valor={tipo} alCambiar={setTipo} requerido>
        <option value="">—</option>
        {TIPOS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.texto}
          </option>
        ))}
      </Selector>
      <input type="hidden" name="tipo" value={tipo} />

      {/*
       * En una salida solo se ofrecen las zonas donde el artículo tiene
       * existencia: elegir una vacía solo lleva a un error después de guardar.
       * En una entrada sirve cualquier zona.
       */}
      <Selector
        etiqueta="Zona"
        valor={zonaId}
        alCambiar={setZonaId}
        requerido
        deshabilitado={!tipo || (descuenta && existencias.length === 0)}
        ayuda={
          !tipo
            ? 'Elija primero el tipo de movimiento'
            : descuenta
              ? existencias.length === 0
                ? 'Este artículo no tiene existencia en ninguna zona'
                : 'Solo las zonas donde hay existencia'
              : undefined
        }
      >
        <option value="">—</option>
        {descuenta
          ? existencias.map((e) => (
              <option key={e.zonaId} value={e.zonaId}>
                {textoZona(e)}
              </option>
            ))
          : zonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.bodega} · {z.codigo}
              </option>
            ))}
      </Selector>
      <input type="hidden" name="zona_id" value={zonaId} />

      <CampoCantidad
        unidadesPorCaja={articulo?.unidadesPorCaja ?? null}
        unidad={articulo?.unidad ?? null}
        maximo={maximo}
      />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          Motivo
          {esAjuste ? null : <span className="ml-1 text-zinc-400">(opcional)</span>}
        </span>
        <input
          name="motivo"
          type="text"
          required={esAjuste}
          maxLength={200}
          placeholder={esAjuste ? 'Obligatorio: justifica el descuadre' : ''}
          className={CLASE_CONTROL}
        />
      </label>

      {elegida ? <Disponible e={elegida} /> : null}
    </>
  );
}
